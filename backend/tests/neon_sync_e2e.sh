#!/usr/bin/env bash
# End-to-end check of the SQLite <-> Neon sync layer (frontend/src/lib/server/neonSync.ts and its Python twin
# backend/modules/common/neon_sync.py), without Neon: a folder stands in for it (LABNINJA_SYNC_REMOTE_DIR).
#
#   backend/tests/neon_sync_e2e.sh      (from the repo root; needs node, sqlite3, and a Python with starlette +
#                                        uvicorn: PYTHON="uv run python" by default)
#
#   A = next dev :4031, B = next dev :4032, each on its own COPY of the database; C = the real Python
#   NeonSyncMiddleware around a small app (neon_sync_test_app.py) :4033 on a third copy. backend/data is never touched.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/../.." && pwd)
PY=${PYTHON:-"uv run python"}
WORK=$(mktemp -d -t sync-e2e-XXXX)
SECRET=dev-secret-lab-ninja-key
PIDS=()
cp "$REPO/frontend/tsconfig.json" "$WORK/tsconfig.json.bak"
cleanup() {
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null || true; done
  pkill -f "next dev -p 403[12]" 2>/dev/null || true
  pkill -f "uvicorn neon_sync_test_app:app" 2>/dev/null || true
  cp "$WORK/tsconfig.json.bak" "$REPO/frontend/tsconfig.json"
  echo "scratch folder kept for inspection: $WORK"
}
trap cleanup EXIT
for port in 4031 4032 4033; do
  if lsof -nP -iTCP:$port -sTCP:LISTEN >/dev/null 2>&1; then echo "port $port is busy"; exit 1; fi
done

mkdir -p "$WORK"/{remote,A,B,C,classes}
cp "$REPO/backend/data/lab_ninja.sqlite3" "$WORK/remote/" && printf seed > "$WORK/remote/lab_ninja.version"
for d in A B C; do cp "$REPO/backend/data/lab_ninja.sqlite3" "$REPO/backend/data/career_studio.sqlite3" "$WORK/$d/"; done

for spec in "A 4031 .next-sync-a" "B 4032 .next-sync-b"; do
  set -- $spec
  (cd "$REPO/frontend" && exec env -u DATABASE_URL LABNINJA_SYNC_REMOTE_DIR="$WORK/remote" LABNINJA_SYNC_TAG=$1 \
    LABNINJA_JWT_SECRET=$SECRET LABNINJA_DB_DIR="$WORK/$1" LMS_CLASSES_DIR="$WORK/classes" DIST_DIR=$3 \
    NEXT_PUBLIC_BACKEND_MODE=nextjs-api npx next dev -p $2 > "$WORK/$1.log" 2>&1) & PIDS+=($!)
done
(cd "$REPO/backend/tests" && exec env -u DATABASE_URL LABNINJA_SYNC_REMOTE_DIR="$WORK/remote" LABNINJA_SYNC_TAG=C \
  LABNINJA_DB_DIR="$WORK/C" $PY -m uvicorn neon_sync_test_app:app --port 4033 > "$WORK/C.log" 2>&1) & PIDS+=($!)
for i in $(seq 1 120); do
  grep -q Ready "$WORK/A.log" 2>/dev/null && grep -q Ready "$WORK/B.log" 2>/dev/null && grep -q "Uvicorn running" "$WORK/C.log" 2>/dev/null && break
  sleep 1
done
cp "$WORK/tsconfig.json.bak" "$REPO/frontend/tsconfig.json"

status=0
for t in next stress python; do
  echo "== neon_sync_e2e_$t"
  WORK="$WORK" SECRET=$SECRET node "$REPO/backend/tests/neon_sync_e2e_$t.mjs" || status=1
done
exit $status
