/**
 * Keeps every copy of the SQLite databases (Vercel's /tmp copies, `next dev` on a laptop, the FastAPI
 * backend) in step through ONE row per database in Neon Postgres (`sqlite_snapshots`, the whole file).
 *
 * Model: Neon holds the current copy. Every server compares its copy with Neon before it reads or
 * writes, and pushes after a write only if Neon still holds the version it started from
 * (compare-and-set). Phone, browser, Vercel or a local server: whoever writes, the others see it.
 *
 *  - Read  (withNeonRead): pull Neon's copy if it is newer than ours (checked at most every 1.5 s).
 *  - Write (withNeonSync): pull, run the handler, compare-and-set push. If another server pushed in
 *    between, pull its copy and run the request again, so neither write is lost.
 *  - Offline: a write that cannot reach Neon is still applied to the local file and its request is
 *    QUEUED in the state file next to the DB (`<db>.sqlite3.sync.json`, an outbox). Once Neon answers
 *    again: if nobody else pushed meanwhile, our file is pushed as is; otherwise we take Neon's copy
 *    and re-send the queued requests on top of it (each through this same layer), in order.
 *  - A change made behind this process's back (git pull/checkout of the tracked DB, the sqlite3 CLI,
 *    the other backend) is detected by the file's size+mtime. That file is copied to
 *    backend/data/backups/ and Neon's copy wins (it is never pushed over newer data).
 *
 * Where it runs: on Vercel (DATABASE_URL), and on any machine whose .env has DATABASE_URL (local dev now
 * syncs too). Never on a test copy: LABNINJA_DB_DIR without LABNINJA_SYNC_REMOTE_DIR turns it off, and
 * LABNINJA_NEON_SYNC=off turns it off everywhere. LABNINJA_SYNC_REMOTE_DIR=<folder> replaces Neon with a
 * local folder (tests: two servers syncing, an `OFFLINE` / `OFFLINE-<LABNINJA_SYNC_TAG>` file simulates a
 * lost connection). Inspect the queue with `npm run sync:status` (frontend/).
 *
 * Python twin: backend/modules/common/neon_sync.py (same table, same state file format, same rules;
 * its state file is `<db>.sqlite3.sync-py.json`) — keep the two in sync.
 *
 * Known limit: the unit is the whole file, so a queued offline edit is re-applied AFTER edits that
 * reached Neon meanwhile (two edits of the same field: the one queued offline lands last).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Client } from '@neondatabase/serverless';
import { getWritablePath } from './sqliteReader';

type DbName = 'lab_ninja' | 'career_studio';

const DDL = `
CREATE TABLE IF NOT EXISTS sqlite_snapshots (
  db_name TEXT PRIMARY KEY,
  data BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
)
`;

/** How often a write that lost the compare-and-set is replayed on the newer copy. */
const MAX_WRITE_ATTEMPTS = 6;
/** Reads within this window reuse the last version check (a page load fires several GETs at once). */
const READ_CHECK_INTERVAL_MS = 1500;
/** A queued request is re-sent at most this often while Neon stays unreachable. */
const FLUSH_RETRY_MS = 15_000;
/** Request bodies bigger than this are not queued (a PDF upload); the write still lands locally. */
const MAX_QUEUED_BODY_BYTES = 8 * 1024 * 1024;
const MAX_BACKUPS = 8;
/** Header marking a request this layer re-sends from its queue. */
export const REPLAY_HEADER = 'x-labninja-sync-replay';

// ── Remote store: Neon, or a local folder standing in for it ───────────────────

interface Snapshot {
  data: Buffer;
  v: string;
}

interface RemoteStore {
  /** Neon's version of dbName, or null when nothing is stored yet. Throws when unreachable. */
  version(dbName: DbName): Promise<string | null>;
  fetch(dbName: DbName): Promise<Snapshot | null>;
  /** Store data if Neon still holds `base` (null = nothing stored yet). New version, or null on conflict. */
  put(dbName: DbName, data: Buffer, base: string | null, by: string): Promise<string | null>;
  /** Unconditional overwrite (the superadmin push). */
  forcePut(dbName: DbName, data: Buffer, by: string): Promise<string>;
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(process.env.DATABASE_URL);
  await client.connect();
  try {
    await client.query(DDL);
    return await fn(client);
  } finally {
    await client.end();
  }
}

const neonStore: RemoteStore = {
  version: (dbName) =>
    withClient(async (c) => {
      const res = await c.query(
        'SELECT updated_at::text AS v FROM sqlite_snapshots WHERE db_name = $1',
        [dbName]
      );
      return res.rows.length ? (res.rows[0].v as string) : null;
    }),
  fetch: (dbName) =>
    withClient(async (c) => {
      const res = await c.query(
        'SELECT data, updated_at::text AS v FROM sqlite_snapshots WHERE db_name = $1',
        [dbName]
      );
      return res.rows.length
        ? { data: res.rows[0].data as Buffer, v: res.rows[0].v as string }
        : null;
    }),
  put: (dbName, data, base, by) =>
    withClient(async (c) => {
      const res =
        base === null
          ? await c.query(
              `INSERT INTO sqlite_snapshots (db_name, data, updated_at, updated_by)
               VALUES ($1, $2, clock_timestamp(), $3)
               ON CONFLICT (db_name) DO NOTHING
               RETURNING updated_at::text AS v`,
              [dbName, data, by]
            )
          : await c.query(
              `UPDATE sqlite_snapshots
               SET data = $2, updated_at = clock_timestamp(), updated_by = $3
               WHERE db_name = $1 AND updated_at::text = $4
               RETURNING updated_at::text AS v`,
              [dbName, data, by, base]
            );
      return res.rows.length ? (res.rows[0].v as string) : null;
    }),
  forcePut: (dbName, data, by) =>
    withClient(async (c) => {
      const res = await c.query(
        `INSERT INTO sqlite_snapshots (db_name, data, updated_at, updated_by)
         VALUES ($1, $2, clock_timestamp(), $3)
         ON CONFLICT (db_name) DO UPDATE
         SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
         RETURNING updated_at::text AS v`,
        [dbName, data, by]
      );
      return res.rows[0].v as string;
    }),
};

/** A folder standing in for Neon: <dir>/<db>.sqlite3 + <db>.version. Same layout as the Python twin. */
function folderStore(dir: string): RemoteStore {
  const offline = () => {
    const tag = process.env.LABNINJA_SYNC_TAG;
    if (
      fs.existsSync(path.join(dir, 'OFFLINE')) ||
      (tag && fs.existsSync(path.join(dir, `OFFLINE-${tag}`)))
    ) {
      throw new Error('sync remote unreachable (OFFLINE flag)');
    }
  };
  const vPath = (db: DbName) => path.join(dir, `${db}.version`);
  const dPath = (db: DbName) => path.join(dir, `${db}.sqlite3`);
  const readV = (db: DbName) =>
    fs.existsSync(vPath(db)) ? fs.readFileSync(vPath(db), 'utf8').trim() : null;
  const locked = async <T>(fn: () => T): Promise<T> => {
    const lock = path.join(dir, '.lock');
    for (let i = 0; ; i++) {
      try {
        fs.mkdirSync(lock);
        break;
      } catch {
        if (i > 400) fs.rmSync(lock, { recursive: true, force: true });
        await sleep(5);
      }
    }
    try {
      return fn();
    } finally {
      fs.rmSync(lock, { recursive: true, force: true });
    }
  };
  const write = (db: DbName, data: Buffer) => {
    const v = `${new Date().toISOString()}#${crypto.randomBytes(4).toString('hex')}`;
    writeFileAtomic(dPath(db), data);
    writeFileAtomic(vPath(db), Buffer.from(v));
    // Who wrote which version: a test aid (this store only exists for tests).
    fs.appendFileSync(path.join(dir, 'history.log'), `${v} ${db} next:${process.env.LABNINJA_SYNC_TAG || process.pid}\n`);
    return v;
  };
  fs.mkdirSync(dir, { recursive: true });
  return {
    version: async (db) => (offline(), readV(db)),
    fetch: async (db) => {
      offline();
      return locked(() => {
        const v = readV(db);
        return v === null ? null : { data: fs.readFileSync(dPath(db)), v };
      });
    },
    put: async (db, data, base) => {
      offline();
      return locked(() => (readV(db) === base ? write(db, data) : null));
    },
    forcePut: async (db, data) => {
      offline();
      return locked(() => write(db, data));
    },
  };
}

function remote(): RemoteStore | null {
  if (process.env.LABNINJA_NEON_SYNC === 'off') return null;
  const folder = process.env.LABNINJA_SYNC_REMOTE_DIR;
  if (folder) return folderStore(folder);
  if (!process.env.DATABASE_URL) return null;
  // A test copy (CLAUDE.md: LABNINJA_DB_DIR) must never sync with production.
  if (process.env.LABNINJA_DB_DIR && !process.env.VERCEL) return null;
  return neonStore;
}

function syncEnabled(): boolean {
  return remote() !== null;
}

const onVercel = () => Boolean(process.env.VERCEL);

// ── Local state: what this process last synced, and its queue ───────────────────

interface QueuedRequest {
  id: string;
  at: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  /** base64 */
  body: string;
  attempts: number;
  status?: number;
  error?: string;
}

interface SyncState {
  /** Neon version our file was last pulled from / pushed as. Absent = never synced. null = Neon empty. */
  held?: string | null;
  /** size:mtime of our file right after we last touched it; a mismatch = changed behind our back. */
  fp?: string;
  /** sha1 of the bytes last pulled from / pushed to Neon: identical bytes are never pushed or written again. */
  hash?: string;
  outbox: QueuedRequest[];
  /** Queued requests the server refused when re-sent (kept for inspection, never retried on their own). */
  failed: QueuedRequest[];
  lastSyncAt?: string;
  lastError?: string;
}

const dbFile = (dbName: DbName) => getWritablePath(dbName);
const statePath = (dbName: DbName) => `${dbFile(dbName)}.sync.json`;

function loadState(dbName: DbName): SyncState {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath(dbName), 'utf8'));
    return { outbox: [], failed: [], ...raw };
  } catch {
    return { outbox: [], failed: [] };
  }
}

function saveState(dbName: DbName, st: SyncState): void {
  try {
    writeFileAtomic(statePath(dbName), Buffer.from(JSON.stringify(st, null, 1)));
  } catch (err) {
    console.error(`[neonSync] could not save ${statePath(dbName)}:`, err);
  }
}

function fingerprint(dbName: DbName): string {
  try {
    const s = fs.statSync(dbFile(dbName));
    return `${s.size}:${Math.floor(s.mtimeMs)}`;
  } catch {
    return 'missing';
  }
}

const sha1 = (data: Buffer) => crypto.createHash('sha1').update(data).digest('hex');

function readLocal(dbName: DbName): Buffer | null {
  try {
    return fs.readFileSync(dbFile(dbName));
  } catch {
    return null;
  }
}

// ── Lock shared by every process on this machine using the same file (next dev + FastAPI in local dev) ──
// A directory next to the DB holding the owner's pid (same protocol as neon_sync.py). Held for each pull and for
// each write + push, so one server can never pull Neon's copy over another's write that is not pushed yet.
const lockDir = (dbName: DbName) => `${dbFile(dbName)}.lock.d`;

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function acquireFileLock(dbName: DbName): Promise<void> {
  const dir = lockDir(dbName);
  for (let i = 0; ; i++) {
    try {
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'owner'), String(process.pid));
      return;
    } catch {
      let owner = 0;
      try {
        owner = Number(fs.readFileSync(path.join(dir, 'owner'), 'utf8'));
      } catch {
        /* the owner is between mkdir and writing its pid */
      }
      if ((owner && !pidAlive(owner)) || (!owner && i > 500)) {
        fs.rmSync(dir, { recursive: true, force: true }); // left behind by a process that died
        continue;
      }
      await sleep(10);
    }
  }
}

function releaseFileLock(dbName: DbName): void {
  fs.rmSync(lockDir(dbName), { recursive: true, force: true });
}

/** Replace the local file without ever leaving a half-written one behind. */
function writeFileAtomic(filePath: string, data: Buffer): void {
  const tmp = `${filePath}.part-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, filePath);
}

/** Keep a copy of a local file that is about to be replaced by Neon's (local machines only). */
function backupLocal(dbName: DbName, reason: string): void {
  if (onVercel()) return;
  const file = dbFile(dbName);
  if (!fs.existsSync(file)) return;
  try {
    const dir = path.join(path.dirname(file), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(file, path.join(dir, `${dbName}-${stamp}-${reason}.sqlite3`));
    const mine = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(`${dbName}-`) && f.endsWith('.sqlite3'))
      .sort();
    for (const old of mine.slice(0, Math.max(0, mine.length - MAX_BACKUPS)))
      fs.rmSync(path.join(dir, old));
  } catch (err) {
    console.error('[neonSync] backup before pull failed:', err);
  }
}

// ── Sync steps (always run inside `serialized`) ─────────────────────────────────

/** One sync step (pull, or a whole write + push) at a time per process. */
let chain: Promise<unknown> = Promise.resolve();
let writesInFlight = 0;
/**
 * Handlers of this process running right now. Their writes (a class-folder reconcile, a schema migration) can land
 * while another request checks the file, so a size/mtime change only counts as "changed behind our back" while
 * none is running; each handler records its own writes when it ends.
 */
let handlersRunning = 0;

async function runHandler<T>(fn: () => T | Promise<T>): Promise<T> {
  handlersRunning += 1;
  try {
    return await fn();
  } finally {
    handlersRunning -= 1;
  }
}

const changedOutside = (st: SyncState, dbName: DbName) =>
  st.fp !== undefined && st.fp !== fingerprint(dbName) && handlersRunning === 0;

function serialized<T>(fn: () => Promise<T>, dbName: DbName): Promise<T> {
  const locked = async () => {
    await acquireFileLock(dbName);
    try {
      return await fn();
    } finally {
      releaseFileLock(dbName);
    }
  };
  const run = chain.then(locked, locked);
  chain = run.catch(() => undefined);
  return run;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type DownResult = 'ok' | 'offline';

/**
 * Bring the local file up to Neon's copy when Neon moved or the file was changed behind our back.
 * Never overwrites a file holding queued (unpushed) writes: flushQueue handles those.
 */
async function syncDown(dbName: DbName, force = false): Promise<DownResult> {
  const store = remote();
  if (!store) return 'ok';
  const st = loadState(dbName);
  try {
    const v = await store.version(dbName);
    const foreign = changedOutside(st, dbName);
    if (v === null) {
      // Neon is empty: our file becomes the first snapshot on the next push.
      if (st.held === undefined) saveState(dbName, { ...st, held: null, fp: fingerprint(dbName) });
      return 'ok';
    }
    if (v === st.held && !foreign && !force) return 'ok';
    if (st.outbox.length) return 'ok';
    const snap = await store.fetch(dbName);
    if (!snap) return 'ok';
    const local = readLocal(dbName);
    const remoteHash = sha1(snap.data);
    if (!local || sha1(local) !== remoteHash) {
      // Keep a copy only of content that never reached Neon (not of a copy we pulled or pushed ourselves).
      if ((st.held === undefined || foreign) && local && sha1(local) !== st.hash) {
        backupLocal(dbName, foreign ? 'changed-outside-sync' : 'first-sync');
      }
      writeFileAtomic(dbFile(dbName), snap.data);
    }
    saveState(dbName, {
      ...loadState(dbName),
      held: snap.v,
      hash: remoteHash,
      fp: fingerprint(dbName),
      lastSyncAt: new Date().toISOString(),
      lastError: undefined,
    });
    return 'ok';
  } catch (err) {
    saveState(dbName, {
      ...loadState(dbName),
      lastError: String(err instanceof Error ? err.message : err),
    });
    console.error(
      `[neonSync] ${dbName}: Neon unreachable (${err instanceof Error ? err.message : err})`
    );
    return 'offline';
  }
}

type PushResult = 'pushed' | 'conflict' | 'failed';

/** Push our file only if Neon still holds the version we are based on. */
async function pushUp(dbName: DbName, by = 'auto-write'): Promise<PushResult> {
  const store = remote();
  if (!store) return 'pushed';
  const st = loadState(dbName);
  if (st.held === undefined) return 'failed';
  const data = fs.readFileSync(dbFile(dbName));
  const hash = sha1(data);
  if (st.hash === hash) {
    // Neon already holds exactly these bytes: pushing would only move its version and make others pull.
    saveState(dbName, { ...st, fp: fingerprint(dbName) });
    return 'pushed';
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const v = await store.put(dbName, data, st.held, by);
      if (v === null) return 'conflict';
      saveState(dbName, {
        ...loadState(dbName),
        held: v,
        hash,
        fp: fingerprint(dbName),
        lastSyncAt: new Date().toISOString(),
        lastError: undefined,
      });
      return 'pushed';
    } catch (err) {
      saveState(dbName, {
        ...loadState(dbName),
        lastError: String(err instanceof Error ? err.message : err),
      });
      if (attempt === 0) await sleep(500);
    }
  }
  return 'failed';
}

/** Our own write landed in the file: remember the new fingerprint so it is not taken for a foreign change. */
function noteOwnWrite(dbName: DbName): void {
  saveState(dbName, { ...loadState(dbName), fp: fingerprint(dbName) });
}

async function snapshotRequest(req: Request): Promise<QueuedRequest | null> {
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length > MAX_QUEUED_BODY_BYTES) return null;
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    if (!['host', 'content-length', 'connection', 'accept-encoding', REPLAY_HEADER].includes(key)) {
      headers[key] = value;
    }
  });
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    method: req.method,
    url: req.url,
    headers,
    body: body.toString('base64'),
    attempts: 0,
  };
}

function enqueue(dbName: DbName, entry: QueuedRequest | null, what: string): void {
  const st = loadState(dbName);
  // The same request queued twice (a self-synced handler's claim and commit) is sent once.
  const dup = (e: QueuedRequest) =>
    entry !== null && e.method === entry.method && e.url === entry.url && e.body === entry.body;
  if (!entry) {
    console.error(`[neonSync] ${what} is too large to queue; it stays in this server's file only`);
  } else if (!st.outbox.some(dup)) {
    st.outbox.push(entry);
  }
  st.fp = fingerprint(dbName);
  saveState(dbName, st);
}

// ── Queue flush: push or re-send what was written while Neon was unreachable ────

const flushing: Partial<Record<DbName, Promise<void>>> = {};
const lastFlushTry: Partial<Record<DbName, number>> = {};

function flushQueue(dbName: DbName, force = false): Promise<void> {
  if (!syncEnabled() || !loadState(dbName).outbox.length) return Promise.resolve();
  const running = flushing[dbName];
  if (running) return running;
  const now = Date.now();
  if (!force && now - (lastFlushTry[dbName] ?? 0) < FLUSH_RETRY_MS) return Promise.resolve();
  lastFlushTry[dbName] = now;
  const run = (async () => {
    // Step 1: if nobody pushed while we were offline, our file (with the queued writes) simply goes up.
    const step = await serialized(async (): Promise<'done' | 'offline' | 'replay'> => {
      const store = remote()!;
      const st = loadState(dbName);
      let v: string | null;
      try {
        v = await store.version(dbName);
      } catch {
        return 'offline';
      }
      const foreign = changedOutside(st, dbName);
      if (st.held !== undefined && v === st.held && !foreign) {
        const pushed = await pushUp(dbName, 'queued-writes');
        if (pushed === 'pushed') {
          saveState(dbName, { ...loadState(dbName), outbox: [] });
          return 'done';
        }
        if (pushed === 'failed') return 'offline';
      }
      // Someone else pushed (or our file was replaced): take Neon's copy, re-send our requests on top.
      const snap = await store.fetch(dbName).catch(() => undefined);
      if (snap === undefined) return 'offline';
      backupLocal(dbName, 'before-replay');
      if (snap) writeFileAtomic(dbFile(dbName), snap.data);
      saveState(dbName, {
        ...loadState(dbName),
        hash: snap ? sha1(snap.data) : undefined,
        held: snap ? snap.v : null,
        fp: fingerprint(dbName),
      });
      return 'replay';
    }, dbName);
    if (step !== 'replay') return;

    // Step 2: re-send each queued request through the normal route (and so through withNeonSync again).
    for (;;) {
      const st = loadState(dbName);
      const entry = st.outbox[0];
      if (!entry) return;
      // Off the queue BEFORE sending: if this push fails again, the replay queues itself anew.
      saveState(dbName, { ...st, outbox: st.outbox.slice(1) });
      let status = 0;
      let error = '';
      try {
        const res = await fetch(entry.url, {
          method: entry.method,
          headers: { ...entry.headers, [REPLAY_HEADER]: entry.id },
          body: ['GET', 'HEAD'].includes(entry.method)
            ? undefined
            : Buffer.from(entry.body, 'base64'),
        });
        status = res.status;
        if (status >= 400) error = (await res.text()).slice(0, 500);
      } catch (err) {
        error = String(err instanceof Error ? err.message : err);
      }
      if (status === 0 || status >= 500) {
        // Could not run it (server stopping, or failed): put it back at the front and retry later.
        const cur = loadState(dbName);
        saveState(dbName, {
          ...cur,
          outbox: [{ ...entry, attempts: entry.attempts + 1, status, error }, ...cur.outbox],
        });
        return;
      }
      if (status >= 400) {
        const cur = loadState(dbName);
        saveState(dbName, {
          ...cur,
          failed: [...cur.failed, { ...entry, attempts: entry.attempts + 1, status, error }],
        });
        console.error(
          `[neonSync] queued ${entry.method} ${entry.url} was refused on replay (${status})`
        );
      }
    }
  })().finally(() => {
    delete flushing[dbName];
  });
  flushing[dbName] = run;
  return run;
}

// Local machines: keep trying to send queued writes while idle (Vercel instances flush on their next request).
let flushTimer: ReturnType<typeof setInterval> | null = null;
function startFlushTimer(): void {
  if (flushTimer || onVercel() || !syncEnabled()) return;
  flushTimer = setInterval(() => {
    for (const db of ['lab_ninja', 'career_studio'] as DbName[]) {
      void flushQueue(db).catch((err) => console.error('[neonSync] flush failed:', err));
    }
  }, FLUSH_RETRY_MS);
  flushTimer.unref?.();
}

// ── Public API ──────────────────────────────────────────────────────────────────

/** Latest stored bytes for dbName, or null if Neon isn't configured or holds nothing yet. */
export async function downloadSnapshot(dbName: DbName): Promise<Buffer | null> {
  const store = remote() ?? (process.env.DATABASE_URL ? neonStore : null);
  if (!store) return null;
  try {
    return (await store.fetch(dbName))?.data ?? null;
  } catch (err) {
    console.error(`[neonSync] downloadSnapshot(${dbName}) failed:`, err);
    return null;
  }
}

/** Boot hook (src/instrumentation.ts): take Neon's copy, send anything queued, start the idle flush. */
export async function ensureSeededFromNeon(dbName: DbName): Promise<void> {
  if (!syncEnabled()) return;
  startFlushTimer();
  if (loadState(dbName).outbox.length) {
    await flushQueue(dbName, true).catch(() => undefined);
    return;
  }
  await serialized(() => syncDown(dbName), dbName);
}

/** Unconditional push of filePath's bytes (the superadmin "push"). Overwrites Neon on purpose. */
export async function uploadSnapshot(
  dbName: DbName,
  filePath: string,
  updatedBy = 'auto-write'
): Promise<boolean> {
  const store = remote() ?? (process.env.DATABASE_URL ? neonStore : null);
  if (!store) return false;
  try {
    const data = fs.readFileSync(filePath);
    const v = await store.forcePut(dbName, data, updatedBy);
    if (filePath === dbFile(dbName)) {
      saveState(dbName, {
        ...loadState(dbName),
        held: v,
        hash: sha1(data),
        fp: fingerprint(dbName),
        outbox: [],
      });
    }
    return true;
  } catch (err) {
    console.error(`[neonSync] uploadSnapshot(${dbName}) failed:`, err);
    return false;
  }
}

/** After the superadmin "pull" wrote Neon's bytes over the local file. */
export function markPulled(dbName: DbName): void {
  saveState(dbName, {
    ...loadState(dbName),
    held: undefined,
    fp: undefined,
    hash: undefined,
    outbox: [],
  });
}

/** What `npm run sync:status` and the admin page show. */
export function syncStatus(dbName: DbName) {
  const st = loadState(dbName);
  return {
    enabled: syncEnabled(),
    remote: process.env.LABNINJA_SYNC_REMOTE_DIR
      ? 'folder'
      : process.env.DATABASE_URL
        ? 'neon'
        : 'none',
    file: dbFile(dbName),
    held: st.held ?? null,
    lastSyncAt: st.lastSyncAt ?? null,
    lastError: st.lastError ?? null,
    pending: st.outbox.map(({ id, at, method, url, attempts, status, error }) => ({
      id,
      at,
      method,
      url,
      attempts,
      status,
      error,
    })),
    failed: st.failed.map(({ id, at, method, url, status, error }) => ({
      id,
      at,
      method,
      url,
      status,
      error,
    })),
  };
}

const lastReadCheck: Partial<Record<DbName, number>> = {};

/**
 * Wrap a read-only /api/* handler: pull Neon's copy first if another server pushed since we last
 * synced, so a phone and a desktop see the same data. A read that wrote (a schema migration, a
 * "last viewed" stamp) is pushed afterwards.
 */
export function withNeonRead<A extends unknown[], R>(
  handler: (...args: A) => Promise<R>,
  dbName: DbName = 'lab_ninja'
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    if (!syncEnabled()) return handler(...args);
    startFlushTimer();
    const now = Date.now();
    if (writesInFlight === 0 && now - (lastReadCheck[dbName] ?? 0) >= READ_CHECK_INTERVAL_MS) {
      lastReadCheck[dbName] = now;
      if (loadState(dbName).outbox.length) await flushQueue(dbName).catch(() => undefined);
      else await serialized(() => syncDown(dbName), dbName); // a failed check is not fatal for a read
    }
    const before = fingerprint(dbName);
    const result = await runHandler(() => handler(...args));
    if (fingerprint(dbName) !== before && writesInFlight === 0) {
      void serialized(async () => {
        noteOwnWrite(dbName);
        if (!loadState(dbName).outbox.length) await pushUp(dbName);
      }, dbName);
    }
    return result;
  };
}

function unavailable(): Response {
  return Response.json(
    {
      detail: "Couldn't reach the database just now, so nothing was saved. Try again in a moment.",
    },
    { status: 503 }
  );
}

/**
 * Wrap a mutating /api/* handler: pull the newest copy, run the handler, compare-and-set push. If
 * another server pushed in between, pull its copy and run the request again (replayed from a clone).
 * If Neon cannot be reached, the write lands locally and its request is queued (see flushQueue).
 * Writes in one process run one at a time.
 */
export function withNeonSync<A extends unknown[], R>(
  handler: (...args: A) => Promise<R>,
  dbName: DbName = 'lab_ninja'
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    if (!syncEnabled()) return handler(...args);
    startFlushTimer();
    const original = args[0] instanceof Request ? args[0] : null;
    const isReplay = Boolean(original?.headers.get(REPLAY_HEADER));
    const pristine = original ? original.clone() : null;
    // Queued writes go first, so this one lands after them (skipped for a replay: it IS the flush).
    if (!isReplay) await flushQueue(dbName).catch(() => undefined);

    writesInFlight += 1;
    try {
      return await serialized(async () => {
        const queueAndRun = async (): Promise<R> => {
          const entry = pristine ? await snapshotRequest(pristine.clone()) : null;
          const result = await runHandler(() => handler(...args));
          enqueue(dbName, entry, original ? `${original.method} ${original.url}` : 'a write');
          return result;
        };

        // Still offline with writes queued: keep the order, queue this one behind them.
        if (loadState(dbName).outbox.length) return queueAndRun();

        let result!: R;
        let forcePull = false;
        for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
          const down = await syncDown(dbName, forcePull);
          if (down === 'offline') {
            if (onVercel() && loadState(dbName).held === undefined) {
              // This instance never saw Neon's copy (its file is the stale git one): refuse visibly.
              return unavailable() as R;
            }
            return queueAndRun();
          }
          const callArgs = (
            attempt === 1 || !pristine ? args : [pristine.clone(), ...args.slice(1)]
          ) as A;
          result = await runHandler(() => handler(...callArgs));
          const pushed = await pushUp(dbName);
          if (pushed === 'pushed') return result;
          if (pushed === 'failed') {
            // Applied locally, Neon unreachable: queue the request so it reaches Neon later.
            enqueue(dbName, pristine ? await snapshotRequest(pristine.clone()) : null, 'a write');
            return result;
          }
          if (!pristine) {
            console.warn(
              '[neonSync] write lost a race and could not be replayed; keeping the newer copy'
            );
            await syncDown(dbName, true);
            return result;
          }
          console.warn(
            `[neonSync] another server pushed first; replaying the write (attempt ${attempt + 1})`
          );
          // Our file now holds a write Neon never accepted: take Neon's copy before running it again.
          forcePull = true;
          // Jittered backoff so two busy servers stop colliding in lockstep.
          await sleep(40 * attempt + Math.floor(Math.random() * 120));
        }
        // Still losing the race: never drop the write. It is in our file; queue it, so the next flush
        // takes Neon's copy and re-sends it on top (the client already got its answer).
        console.warn('[neonSync] write still conflicting after retries; queued for the next flush');
        enqueue(dbName, pristine ? await snapshotRequest(pristine.clone()) : null, 'a write');
        lastFlushTry[dbName] = 0;
        return result;
      }, dbName);
    } finally {
      writesInFlight -= 1;
    }
  };
}

/** Thrown by runSyncedWrite on a Vercel instance that never reached Neon (its file is the stale git copy). */
export class SyncUnavailableError extends Error {
  constructor() {
    super("Couldn't reach the database just now, so nothing was saved. Try again in a moment.");
  }
}

/**
 * Run one short, re-runnable, idempotent write under the sync rules (pull, run, compare-and-set push, re-run on
 * conflict), for a handler that must not hold the sync lock for its whole duration (an AI call between two writes).
 * Offline: the write runs locally and `replay` (an untouched clone of the request) is queued to reach Neon later.
 * Python twin: neon_sync.synced_write.
 */
export async function runSyncedWrite<R>(
  fn: () => R | Promise<R>,
  opts: { dbName?: DbName; replay?: Request | null } = {}
): Promise<R> {
  const dbName = opts.dbName ?? 'lab_ninja';
  if (!syncEnabled()) return fn();
  startFlushTimer();
  writesInFlight += 1;
  try {
    return await serialized(async () => {
      const queued = async (): Promise<R> => {
        const entry = opts.replay ? await snapshotRequest(opts.replay.clone()) : null;
        const result = await runHandler(fn);
        enqueue(dbName, entry, 'a write');
        return result;
      };
      if (loadState(dbName).outbox.length) return queued();
      let result!: R;
      let force = false;
      for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
        if ((await syncDown(dbName, force)) === 'offline') {
          if (onVercel() && loadState(dbName).held === undefined) throw new SyncUnavailableError();
          return queued();
        }
        result = await runHandler(fn);
        const pushed = await pushUp(dbName);
        if (pushed === 'pushed') return result;
        if (pushed === 'failed') {
          enqueue(
            dbName,
            opts.replay ? await snapshotRequest(opts.replay.clone()) : null,
            'a write'
          );
          return result;
        }
        force = true;
        await sleep(40 * attempt + Math.floor(Math.random() * 120));
      }
      enqueue(dbName, opts.replay ? await snapshotRequest(opts.replay.clone()) : null, 'a write');
      lastFlushTry[dbName] = 0;
      return result;
    }, dbName);
  } finally {
    writesInFlight -= 1;
  }
}

/**
 * Push a write a read handler made on its own (e.g. GET /todo/routines creating the Dailies group).
 * Call it right after that write, inside the same request.
 */
export async function pushLocalWrite(dbName: DbName = 'lab_ninja'): Promise<void> {
  if (!syncEnabled()) return;
  await serialized(async () => {
    noteOwnWrite(dbName);
    if (loadState(dbName).outbox.length) return;
    const pushed = await pushUp(dbName);
    if (pushed === 'conflict') await syncDown(dbName, true);
  }, dbName);
}
