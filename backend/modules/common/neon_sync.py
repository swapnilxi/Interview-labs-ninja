"""Keeps every copy of the SQLite databases (Vercel /tmp copies, `next dev`, this FastAPI backend) in step
through ONE row per database in Neon Postgres (`sqlite_snapshots`, the whole file).

TypeScript twin: frontend/src/lib/server/neonSync.ts -- same table, same rules, same state-file format,
same stand-in folder layout. Keep the two in sync. Summary of the rules:

- Neon holds the current copy. Before a request, a server pulls Neon's copy if it is newer than its own
  (reads check at most every 1.5 s). After a write it pushes with a compare-and-set on `updated_at`; if
  another server pushed in between, it pulls that copy and runs the request again (here: the buffered
  ASGI request is re-run; the response sent is the one of the final run).
- Offline: a write that cannot reach Neon is applied to the local file and the request is QUEUED in
  `<db>.sqlite3.sync-py.json` next to the file. Once Neon answers: if nobody pushed meanwhile our file goes
  up as is; otherwise we take Neon's copy and re-run the queued requests on top of it, in order.
- A file changed behind our back (git checkout of the tracked DB, sqlite3 CLI, the Next.js server) is
  detected by size+mtime; it is copied to backend/data/backups/ and Neon's copy wins.

Enabled when DATABASE_URL is set (any machine, Vercel included), or LABNINJA_SYNC_REMOTE_DIR=<folder>
(a folder standing in for Neon, for tests). Off for test copies (LABNINJA_TEST_DB_PATH / LABNINJA_DB_DIR /
CAREER_STUDIO_DB_PATH without a remote folder) and with LABNINJA_NEON_SYNC=off.
Inspect the queue: `cd frontend && npm run sync:status`.
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import hashlib
import json
import os
import re
import secrets
import shutil
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from starlette.types import ASGIApp, Message, Receive, Scope, Send

_DDL = """
CREATE TABLE IF NOT EXISTS sqlite_snapshots (
    db_name TEXT PRIMARY KEY,
    data BYTEA NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT
)
"""

REPLAY_HEADER = "x-labninja-sync-replay"
MAX_WRITE_ATTEMPTS = 6
READ_CHECK_INTERVAL_S = 1.5
FLUSH_RETRY_S = 15.0
MAX_QUEUED_BODY_BYTES = 8 * 1024 * 1024
MAX_BACKUPS = 8
DB_NAMES = ("lab_ninja", "career_studio")


def _database_url() -> str | None:
    return os.environ.get("DATABASE_URL") or None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# ── Remote stores ─────────────────────────────────────────────────────────────────

class _NeonStore:
    def _connect(self):
        import psycopg

        conn = psycopg.connect(_database_url(), connect_timeout=10)
        conn.execute(_DDL)
        return conn

    def version(self, db: str) -> Optional[str]:
        with self._connect() as conn:
            row = conn.execute("SELECT updated_at::text FROM sqlite_snapshots WHERE db_name = %s", (db,)).fetchone()
            return row[0] if row else None

    def fetch(self, db: str) -> Optional[Tuple[bytes, str]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT data, updated_at::text FROM sqlite_snapshots WHERE db_name = %s", (db,)
            ).fetchone()
            return (bytes(row[0]), row[1]) if row else None

    def put(self, db: str, data: bytes, base: Optional[str], by: str) -> Optional[str]:
        with self._connect() as conn:
            if base is None:
                row = conn.execute(
                    """INSERT INTO sqlite_snapshots (db_name, data, updated_at, updated_by)
                       VALUES (%s, %s, clock_timestamp(), %s)
                       ON CONFLICT (db_name) DO NOTHING RETURNING updated_at::text""",
                    (db, data, by),
                ).fetchone()
            else:
                row = conn.execute(
                    """UPDATE sqlite_snapshots SET data = %s, updated_at = clock_timestamp(), updated_by = %s
                       WHERE db_name = %s AND updated_at::text = %s RETURNING updated_at::text""",
                    (data, by, db, base),
                ).fetchone()
            conn.commit()
            return row[0] if row else None

    def force_put(self, db: str, data: bytes, by: str) -> str:
        with self._connect() as conn:
            row = conn.execute(
                """INSERT INTO sqlite_snapshots (db_name, data, updated_at, updated_by)
                   VALUES (%s, %s, clock_timestamp(), %s)
                   ON CONFLICT (db_name) DO UPDATE
                   SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
                   RETURNING updated_at::text""",
                (db, data, by),
            ).fetchone()
            conn.commit()
            return row[0]


class _FolderStore:
    """<dir>/<db>.sqlite3 + <db>.version; an OFFLINE / OFFLINE-<LABNINJA_SYNC_TAG> file = unreachable."""

    def __init__(self, folder: str) -> None:
        self.dir = Path(folder)
        self.dir.mkdir(parents=True, exist_ok=True)

    def _check(self) -> None:
        tag = os.environ.get("LABNINJA_SYNC_TAG")
        if (self.dir / "OFFLINE").exists() or (tag and (self.dir / f"OFFLINE-{tag}").exists()):
            raise ConnectionError("sync remote unreachable (OFFLINE flag)")

    def _v(self, db: str) -> Optional[str]:
        p = self.dir / f"{db}.version"
        return p.read_text().strip() if p.exists() else None

    def _locked(self, fn: Callable[[], Any]) -> Any:
        lock = self.dir / ".lock"
        for i in range(10_000):
            try:
                lock.mkdir()
                break
            except FileExistsError:
                if i > 400:
                    shutil.rmtree(lock, ignore_errors=True)
                time.sleep(0.005)
        try:
            return fn()
        finally:
            shutil.rmtree(lock, ignore_errors=True)

    def _write(self, db: str, data: bytes) -> str:
        v = f"{_now_iso()}#{secrets.token_hex(4)}"
        _write_atomic(self.dir / f"{db}.sqlite3", data)
        _write_atomic(self.dir / f"{db}.version", v.encode())
        # Who wrote which version: a test aid (this store only exists for tests).
        with open(self.dir / "history.log", "a") as log:
            log.write(f"{v} {db} py:{os.environ.get('LABNINJA_SYNC_TAG') or os.getpid()}\n")
        return v

    def version(self, db: str) -> Optional[str]:
        self._check()
        return self._v(db)

    def fetch(self, db: str) -> Optional[Tuple[bytes, str]]:
        self._check()

        def read():
            v = self._v(db)
            return None if v is None else ((self.dir / f"{db}.sqlite3").read_bytes(), v)

        return self._locked(read)

    def put(self, db: str, data: bytes, base: Optional[str], by: str) -> Optional[str]:
        self._check()
        return self._locked(lambda: self._write(db, data) if self._v(db) == base else None)

    def force_put(self, db: str, data: bytes, by: str) -> str:
        self._check()
        return self._locked(lambda: self._write(db, data))


def _remote():
    if os.environ.get("LABNINJA_NEON_SYNC") == "off":
        return None
    folder = os.environ.get("LABNINJA_SYNC_REMOTE_DIR")
    if folder:
        return _FolderStore(folder)
    if not _database_url():
        return None
    test_copy = any(os.environ.get(k) for k in ("LABNINJA_TEST_DB_PATH", "LABNINJA_DB_DIR", "CAREER_STUDIO_DB_PATH"))
    if test_copy and not os.environ.get("VERCEL"):
        return None  # a test copy must never sync with production
    return _NeonStore()


def sync_enabled() -> bool:
    return _remote() is not None


# ── Local state ───────────────────────────────────────────────────────────────────

def _db_file(db: str) -> Path:
    if db == "career_studio":
        from modules.career_studio.shared.db import get_career_db_path

        return Path(get_career_db_path())
    from modules.common.db import get_db_path

    return Path(get_db_path())


def _state_path(db: str) -> Path:
    return Path(f"{_db_file(db)}.sync-py.json")


_MISSING = object()


def _load(db: str) -> Dict[str, Any]:
    try:
        st = json.loads(_state_path(db).read_text())
    except (OSError, ValueError):
        st = {}
    st.setdefault("outbox", [])
    st.setdefault("failed", [])
    return st


def _save(db: str, st: Dict[str, Any]) -> None:
    try:
        _write_atomic(_state_path(db), json.dumps(st, indent=1).encode())
    except OSError as exc:
        print(f"[neon_sync] could not save {_state_path(db)}: {exc}")


def _update(db: str, **changes: Any) -> None:
    st = _load(db)
    for k, v in changes.items():
        if v is _MISSING:
            st.pop(k, None)
        else:
            st[k] = v
    _save(db, st)


def _sha1(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()


def _read_local(db: str) -> Optional[bytes]:
    try:
        return _db_file(db).read_bytes()
    except OSError:
        return None


# Lock shared by every process on this machine using the same file (FastAPI + next dev in local dev): a directory
# next to the DB holding the owner's pid (same protocol as neonSync.ts). Held for each pull and each write + push.
def _lock_dir(db: str) -> Path:
    return Path(f"{_db_file(db)}.lock.d")


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except PermissionError:
        return True
    except OSError:
        return False


async def _acquire_file_lock(db: str) -> None:
    d = _lock_dir(db)
    i = 0
    while True:
        try:
            d.mkdir()
            (d / "owner").write_text(str(os.getpid()))
            return
        except FileExistsError:
            try:
                owner = int((d / "owner").read_text() or 0)
            except (OSError, ValueError):
                owner = 0
            if (owner and not _pid_alive(owner)) or (not owner and i > 500):
                shutil.rmtree(d, ignore_errors=True)  # left behind by a process that died
                continue
            i += 1
            await asyncio.sleep(0.01)


@contextlib.asynccontextmanager
async def _locked(db: str):
    async with _write_lock():
        await _acquire_file_lock(db)
        try:
            yield
        finally:
            shutil.rmtree(_lock_dir(db), ignore_errors=True)


# Requests of this process running right now (see the TS twin's handlersRunning): while any runs, a size/mtime change
# is taken for our own write (a class-folder reconcile, a migration), not for an edit behind our back.
_running = 0


def _changed_outside(st: Dict[str, Any], db: str) -> bool:
    return "fp" in st and st["fp"] != _fingerprint(db) and _running == 0


async def _run(awaitable):
    global _running
    _running += 1
    try:
        return await awaitable
    finally:
        _running -= 1


def _fingerprint(db: str) -> str:
    try:
        s = _db_file(db).stat()
        return f"{s.st_size}:{s.st_mtime_ns // 1_000_000}"
    except OSError:
        return "missing"


def _write_atomic(path: Path, data: bytes) -> None:
    tmp = Path(f"{path}.part-{os.getpid()}-{secrets.token_hex(3)}")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def _backup_local(db: str, reason: str) -> None:
    if os.environ.get("VERCEL"):
        return
    f = _db_file(db)
    if not f.exists():
        return
    try:
        bdir = f.parent / "backups"
        bdir.mkdir(parents=True, exist_ok=True)
        stamp = _now_iso().replace(":", "-").replace(".", "-")
        shutil.copyfile(f, bdir / f"{db}-{stamp}-{reason}.sqlite3")
        mine = sorted(p for p in bdir.iterdir() if p.name.startswith(f"{db}-") and p.suffix == ".sqlite3")
        for old in mine[: max(0, len(mine) - MAX_BACKUPS)]:
            old.unlink()
    except OSError as exc:
        print(f"[neon_sync] backup before pull failed: {exc}")


# ── Sync steps (blocking; run in a thread under the process write lock) ───────────

def sync_down(db: str, force: bool = False) -> str:
    """'ok' or 'offline'. Never overwrites a file holding queued writes."""
    store = _remote()
    if store is None:
        return "ok"
    st = _load(db)
    try:
        v = store.version(db)
        foreign = _changed_outside(st, db)
        if v is None:
            if "held" not in st:
                _update(db, held=None, fp=_fingerprint(db))
            return "ok"
        if v == st.get("held", _MISSING) and not foreign and not force:
            return "ok"
        if st["outbox"]:
            return "ok"
        snap = store.fetch(db)
        if snap is None:
            return "ok"
        local = _read_local(db)
        remote_hash = _sha1(snap[0])
        if local is None or _sha1(local) != remote_hash:
            # Keep a copy only of content that never reached Neon (not of a copy we pulled or pushed ourselves).
            if ("held" not in st or foreign) and local is not None and _sha1(local) != st.get("hash"):
                _backup_local(db, "changed-outside-sync" if foreign else "first-sync")
            _write_atomic(_db_file(db), snap[0])
        _update(db, held=snap[1], hash=remote_hash, fp=_fingerprint(db), lastSyncAt=_now_iso(), lastError=_MISSING)
        return "ok"
    except Exception as exc:  # network/driver errors: serve the local copy
        _update(db, lastError=str(exc))
        print(f"[neon_sync] {db}: Neon unreachable ({exc})")
        return "offline"


def push_up(db: str, by: str = "auto-write") -> str:
    """'pushed', 'conflict' or 'failed'."""
    store = _remote()
    if store is None:
        return "pushed"
    st = _load(db)
    if "held" not in st:
        return "failed"
    data = _db_file(db).read_bytes()
    digest = _sha1(data)
    if st.get("hash") == digest:
        # Neon already holds exactly these bytes: pushing would only move its version and make others pull.
        _update(db, fp=_fingerprint(db))
        return "pushed"
    for attempt in range(2):
        try:
            v = store.put(db, data, st["held"], by)
            if v is None:
                return "conflict"
            _update(db, held=v, hash=digest, fp=_fingerprint(db), lastSyncAt=_now_iso(), lastError=_MISSING)
            return "pushed"
        except Exception as exc:
            _update(db, lastError=str(exc))
            if attempt == 0:
                time.sleep(0.5)
    return "failed"


def _enqueue(db: str, entry: Optional[Dict[str, Any]]) -> None:
    st = _load(db)
    # The same request queued twice (a self-synced endpoint's claim and commit) is sent once.
    same = lambda e: e["method"] == entry["method"] and e["url"] == entry["url"] and e["body"] == entry["body"]  # noqa: E731
    if entry is None:
        print("[neon_sync] a write too large to queue stays in this server's file only")
    elif not any(same(e) for e in st["outbox"]):
        st["outbox"].append(entry)
    st["fp"] = _fingerprint(db)
    _save(db, st)


# ── Public helpers kept for scripts/db_backup.py and the admin push/pull ──────────

def download_snapshot(db_name: str) -> bytes | None:
    store = _remote() or (_NeonStore() if _database_url() else None)
    if store is None:
        return None
    try:
        snap = store.fetch(db_name)
        return snap[0] if snap else None
    except Exception as exc:  # pragma: no cover - network/driver errors, never fatal
        print(f"[neon_sync] download_snapshot({db_name!r}) failed: {exc}")
        return None


def upload_snapshot(db_name: str, file_path: str, updated_by: str = "auto-write") -> bool:
    """Unconditional overwrite of Neon's copy (the explicit admin/CLI push). Never raises."""
    store = _remote() or (_NeonStore() if _database_url() else None)
    if store is None:
        return False
    try:
        with open(file_path, "rb") as f:
            data = f.read()
        v = store.force_put(db_name, data, updated_by)
        if Path(file_path).resolve() == _db_file(db_name).resolve():
            _update(db_name, held=v, hash=_sha1(data), fp=_fingerprint(db_name), outbox=[])
        return True
    except Exception as exc:  # pragma: no cover
        print(f"[neon_sync] upload_snapshot({db_name!r}) failed: {exc}")
        return False


def mark_pulled(db_name: str) -> None:
    _update(db_name, held=_MISSING, fp=_MISSING, hash=_MISSING, outbox=[])


def sync_status(db: str) -> Dict[str, Any]:
    st = _load(db)
    keep = ("id", "at", "method", "url", "attempts", "status", "error")
    return {
        "enabled": sync_enabled(),
        "file": str(_db_file(db)),
        "held": st.get("held"),
        "lastSyncAt": st.get("lastSyncAt"),
        "lastError": st.get("lastError"),
        "pending": [{k: e.get(k) for k in keep} for e in st["outbox"]],
        "failed": [{k: e.get(k) for k in keep} for e in st["failed"]],
    }


# ── Write lock shared by the middleware and synced_write ─────────────────────────

_locks: Dict[int, asyncio.Lock] = {}


def _write_lock() -> asyncio.Lock:
    """One write at a time per process (per event loop)."""
    loop = asyncio.get_running_loop()
    lock = _locks.get(id(loop))
    if lock is None:
        lock = _locks[id(loop)] = asyncio.Lock()
    return lock


# Endpoints that sync their own short writes (an AI call sits between them; replaying the whole request on a
# compare-and-set conflict would run the AI again). The middleware only pulls before them.
SELF_SYNCED = re.compile(r"^/api/lms/projects/[^/]+/question-topics/?$")


async def synced_write(db: str, fn: Callable[[], Any], replay: Optional[Dict[str, Any]] = None) -> Any:
    """Run one short, re-runnable, idempotent write `fn` (blocking) under the sync rules: pull, run, compare-and-set
    push, re-run on conflict. Offline: run it locally and queue `replay` (a request entry built with
    request_entry()) so the write reaches Neon later."""
    if not sync_enabled():
        return await asyncio.to_thread(fn)
    async with _locked(db):
        if _load(db)["outbox"]:
            result = await _run(asyncio.to_thread(fn))
            _enqueue(db, replay)
            return result
        force = False
        result: Any = None
        for attempt in range(1, MAX_WRITE_ATTEMPTS + 1):
            if await asyncio.to_thread(sync_down, db, force) == "offline":
                result = await _run(asyncio.to_thread(fn))
                _enqueue(db, replay)
                return result
            result = await _run(asyncio.to_thread(fn))
            pushed = await asyncio.to_thread(push_up, db)
            if pushed == "pushed":
                return result
            if pushed == "failed":
                _enqueue(db, replay)
                return result
            force = True
            await asyncio.sleep((40 * attempt + secrets.randbelow(120)) / 1000)
        _enqueue(db, replay)
        return result


def request_entry(method: str, path: str, headers: Dict[str, str], body: bytes) -> Optional[Dict[str, Any]]:
    """A queue entry for synced_write(replay=...)."""
    if len(body) > MAX_QUEUED_BODY_BYTES:
        return None
    skip = {"host", "content-length", "connection", "accept-encoding", REPLAY_HEADER}
    return {
        "id": str(uuid.uuid4()),
        "at": _now_iso(),
        "method": method,
        "url": f"http://fastapi{path}",
        "headers": {k.lower(): v for k, v in headers.items() if k.lower() not in skip},
        "body": base64.b64encode(body).decode(),
        "attempts": 0,
    }


# ── Middleware ────────────────────────────────────────────────────────────────────

def _db_for_path(path: str) -> str:
    return "career_studio" if path.startswith("/career") else "lab_ninja"


class NeonSyncMiddleware:
    """Pure ASGI middleware applying the rules above to every request (see the module docstring)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self._last_read: Dict[str, float] = {}
        self._last_flush: Dict[str, float] = {}
        self._flushing: Dict[str, asyncio.Task] = {}
        self._timer: Optional[asyncio.Task] = None

    # -- helpers --
    def _start_timer(self) -> None:
        if self._timer is not None or os.environ.get("VERCEL"):
            return

        async def loop() -> None:
            while True:
                await asyncio.sleep(FLUSH_RETRY_S)
                for db in DB_NAMES:
                    try:
                        await self._flush(db)
                    except Exception as exc:  # pragma: no cover
                        print(f"[neon_sync] flush failed: {exc}")

        self._timer = asyncio.get_running_loop().create_task(loop())

    async def _run_app(self, scope: Scope, body: bytes, send: Optional[Send]) -> Tuple[int, List[Message], bool]:
        """Run the app on a buffered request. Responses are buffered (so a replay can replace them),
        except an event stream, which is forwarded live. Returns (status, messages, streamed)."""
        sent_body = False

        async def receive() -> Message:
            nonlocal sent_body
            if not sent_body:
                sent_body = True
                return {"type": "http.request", "body": body, "more_body": False}
            await asyncio.sleep(3600)
            return {"type": "http.disconnect"}

        messages: List[Message] = []
        state = {"status": 0, "stream": False}

        async def capture(message: Message) -> None:
            if message["type"] == "http.response.start":
                state["status"] = message["status"]
                ctype = dict(message.get("headers") or []).get(b"content-type", b"")
                state["stream"] = ctype.startswith(b"text/event-stream") and send is not None
            if state["stream"] and send is not None:
                for m in messages:
                    await send(m)
                messages.clear()
                await send(message)
            else:
                messages.append(message)

        await _run(self.app(scope, receive, capture))
        return state["status"], messages, state["stream"]

    @staticmethod
    def _entry(scope: Scope, body: bytes) -> Optional[Dict[str, Any]]:
        if len(body) > MAX_QUEUED_BODY_BYTES:
            return None
        skip = {b"host", b"content-length", b"connection", b"accept-encoding", REPLAY_HEADER.encode()}
        headers = {k.decode("latin-1"): v.decode("latin-1") for k, v in scope.get("headers") or [] if k not in skip}
        qs = scope.get("query_string", b"").decode()
        return {
            "id": str(uuid.uuid4()),
            "at": _now_iso(),
            "method": scope["method"],
            "url": f"http://fastapi{scope['path']}{'?' + qs if qs else ''}",
            "headers": headers,
            "body": base64.b64encode(body).decode(),
            "attempts": 0,
        }

    async def _flush(self, db: str, force: bool = False) -> None:
        if not sync_enabled() or not _load(db)["outbox"]:
            return
        running = self._flushing.get(db)
        if running is not None:
            await running
            return
        now = time.monotonic()
        if not force and now - self._last_flush.get(db, 0) < FLUSH_RETRY_S:
            return
        self._last_flush[db] = now
        task = asyncio.get_running_loop().create_task(self._flush_now(db))
        self._flushing[db] = task
        try:
            await task
        finally:
            self._flushing.pop(db, None)

    async def _flush_now(self, db: str) -> None:
        def step1() -> str:
            store = _remote()
            st = _load(db)
            try:
                v = store.version(db)
            except Exception:
                return "offline"
            foreign = _changed_outside(st, db)
            if "held" in st and v == st["held"] and not foreign:
                pushed = push_up(db, "queued-writes")
                if pushed == "pushed":
                    _update(db, outbox=[])
                    return "done"
                if pushed == "failed":
                    return "offline"
            try:
                snap = store.fetch(db)
            except Exception:
                return "offline"
            _backup_local(db, "before-replay")
            if snap is not None:
                _write_atomic(_db_file(db), snap[0])
            _update(db, held=snap[1] if snap else None, hash=_sha1(snap[0]) if snap else _MISSING, fp=_fingerprint(db))
            return "replay"

        async with _locked(db):
            step = await asyncio.to_thread(step1)
        if step != "replay":
            return
        while True:
            st = _load(db)
            if not st["outbox"]:
                return
            entry = st["outbox"][0]
            st["outbox"] = st["outbox"][1:]
            _save(db, st)
            path_qs = entry["url"].split("://", 1)[-1].split("/", 1)[-1]
            path, _, qs = ("/" + path_qs).partition("?")
            headers = [(k.encode("latin-1"), v.encode("latin-1")) for k, v in entry["headers"].items()]
            headers.append((REPLAY_HEADER.encode(), entry["id"].encode()))
            scope: Scope = {
                "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": entry["method"],
                "scheme": "http", "path": path, "raw_path": path.encode(), "query_string": qs.encode(),
                "root_path": "", "headers": headers, "client": ("127.0.0.1", 0), "server": ("127.0.0.1", 80),
            }
            status, error = 0, ""
            try:
                status, messages = await self._call_buffered(scope, base64.b64decode(entry["body"]))
                if status >= 400:
                    error = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")[:500].decode("utf-8", "replace")
            except Exception as exc:
                error = str(exc)
            if status == 0 or status >= 500:
                cur = _load(db)
                cur["outbox"] = [{**entry, "attempts": entry["attempts"] + 1, "status": status, "error": error}] + cur["outbox"]
                _save(db, cur)
                return
            if status >= 400:
                cur = _load(db)
                cur["failed"].append({**entry, "attempts": entry["attempts"] + 1, "status": status, "error": error})
                _save(db, cur)
                print(f"[neon_sync] queued {entry['method']} {path} was refused on replay ({status})")

    async def _call_buffered(self, scope: Scope, body: bytes) -> Tuple[int, List[Message]]:
        """Send a request through this middleware (so it syncs like any other) and collect the response."""
        messages: List[Message] = []
        sent = False

        async def receive() -> Message:
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": body, "more_body": False}
            await asyncio.sleep(3600)
            return {"type": "http.disconnect"}

        async def collect(message: Message) -> None:
            messages.append(message)

        await self(scope, receive, collect)
        status = next((m["status"] for m in messages if m["type"] == "http.response.start"), 0)
        return status, messages

    # -- entry point --
    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not sync_enabled():
            await self.app(scope, receive, send)
            return
        self._start_timer()
        db = _db_for_path(scope["path"])

        if scope["method"] in ("GET", "HEAD", "OPTIONS"):
            now = time.monotonic()
            if not _write_lock().locked() and now - self._last_read.get(db, 0) >= READ_CHECK_INTERVAL_S:
                self._last_read[db] = now
                if _load(db)["outbox"]:
                    await self._flush(db)
                else:
                    async with _locked(db):
                        await asyncio.to_thread(sync_down, db)
            before = _fingerprint(db)
            await _run(self.app(scope, receive, send))
            if _fingerprint(db) != before and not _write_lock().locked():
                async with _locked(db):
                    _update(db, fp=_fingerprint(db))
                    if not _load(db)["outbox"]:
                        await asyncio.to_thread(push_up, db)
            return

        if SELF_SYNCED.match(scope["path"]):
            # The endpoint syncs its own short writes (synced_write); just bring the file up to date first.
            if not any(k == REPLAY_HEADER.encode() for k, _ in scope.get("headers") or []):
                await self._flush(db)
            if not _load(db)["outbox"]:
                async with _locked(db):
                    await asyncio.to_thread(sync_down, db)
            before = _fingerprint(db)
            await _run(self.app(scope, receive, send))
            # Writes made after the endpoint's own synced writes (the class-folder reconcile) go up too.
            if _fingerprint(db) != before:
                async with _locked(db):
                    _update(db, fp=_fingerprint(db))
                    if not _load(db)["outbox"]:
                        await asyncio.to_thread(push_up, db)
            return

        chunks: List[bytes] = []
        while True:
            message = await receive()
            if message["type"] != "http.request":
                break
            chunks.append(message.get("body", b""))
            if not message.get("more_body"):
                break
        body = b"".join(chunks)
        is_replay = any(k == REPLAY_HEADER.encode() for k, _ in scope.get("headers") or [])
        if not is_replay:
            await self._flush(db)

        async def emit(messages: List[Message]) -> None:
            for m in messages:
                await send(m)

        async with _locked(db):
            async def queue_and_run() -> None:
                _status, messages, _streamed = await self._run_app(scope, body, send)
                _enqueue(db, self._entry(scope, body))
                await emit(messages)

            if _load(db)["outbox"]:
                await queue_and_run()
                return
            force = False
            messages: List[Message] = []
            streamed = False
            for attempt in range(1, MAX_WRITE_ATTEMPTS + 1):
                if await asyncio.to_thread(sync_down, db, force) == "offline":
                    if streamed:
                        return
                    await queue_and_run()
                    return
                # After a streamed first run the client already has its answer: later runs only re-apply the write.
                _status, messages, streamed_now = await self._run_app(scope, body, None if streamed else send)
                streamed = streamed or streamed_now
                pushed = await asyncio.to_thread(push_up, db)
                if pushed == "pushed":
                    break
                if pushed == "failed":
                    _enqueue(db, self._entry(scope, body))
                    break
                print(f"[neon_sync] another server pushed first; replaying the write (attempt {attempt + 1})")
                force = True
                # Jittered backoff so two busy servers stop colliding in lockstep.
                await asyncio.sleep((40 * attempt + secrets.randbelow(120)) / 1000)
            else:
                # Still losing the race: never drop the write. It is in our file; queue it, so the next
                # flush takes Neon's copy and re-runs it on top (the client already got its answer).
                print("[neon_sync] write still conflicting after retries; queued for the next flush")
                _enqueue(db, self._entry(scope, body))
                self._last_flush[db] = 0
            if not streamed:
                await emit(messages)
