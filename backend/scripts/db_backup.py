"""CLI wrapper around modules/common/neon_sync.py's two blob operations, for a dev
machine (not the deployed app) to back up or restore the lab_ninja.sqlite3 snapshot
stored in Neon. Needs DATABASE_URL in the environment (e.g. backend/.env) -- the same
connection string the deployed app uses.

Usage:
  uv run python scripts/db_backup.py pull [--out PATH]
    Downloads the current Neon snapshot to a timestamped file under
    backend/data/backups/ (or --out PATH if given). Fails if Neon has no snapshot yet.

  uv run python scripts/db_backup.py push --file PATH
    Uploads the sqlite file at PATH to Neon as the new latest snapshot, overwriting
    whatever was there. Defaults to backend/data/lab_ninja.sqlite3 if --file is omitted.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from modules.common.neon_sync import download_snapshot, upload_snapshot  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_LOCAL_DB = BACKEND_DIR / "data" / "lab_ninja.sqlite3"
BACKUPS_DIR = BACKEND_DIR / "data" / "backups"


def do_pull(out_path: Path | None) -> int:
    snapshot = download_snapshot("lab_ninja")
    if snapshot is None:
        print("No snapshot found -- is DATABASE_URL set, and has anything been pushed yet?", file=sys.stderr)
        return 1

    if out_path is None:
        BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        out_path = BACKUPS_DIR / f"lab_ninja-{stamp}.sqlite3"

    out_path.write_bytes(snapshot)
    print(f"Wrote {len(snapshot):,} bytes to {out_path}")
    return 0


def do_push(file_path: Path) -> int:
    if not file_path.exists():
        print(f"No such file: {file_path}", file=sys.stderr)
        return 1
    ok = upload_snapshot("lab_ninja", str(file_path), updated_by="cli-backup")
    if not ok:
        print("Push failed -- is DATABASE_URL set? Check the error above.", file=sys.stderr)
        return 1
    print(f"Pushed {file_path} to Neon as the latest lab_ninja snapshot.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    pull_p = sub.add_parser("pull", help="Download Neon's current snapshot to a local file")
    pull_p.add_argument("--out", type=Path, default=None, help="Destination path (default: timestamped file under data/backups/)")

    push_p = sub.add_parser("push", help="Upload a local sqlite file to Neon as the new snapshot")
    push_p.add_argument("--file", type=Path, default=DEFAULT_LOCAL_DB, help=f"Source file (default: {DEFAULT_LOCAL_DB})")

    args = parser.parse_args()
    if args.command == "pull":
        return do_pull(args.out)
    return do_push(args.file)


if __name__ == "__main__":
    raise SystemExit(main())
