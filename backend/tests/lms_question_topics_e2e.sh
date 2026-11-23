#!/usr/bin/env bash
# End-to-end check of project question topics across FastAPI, two Next.js servers and the sync layer.
#
#   backend/tests/lms_question_topics_e2e.sh            (from the repo root; needs node, and a Python with the
#                                                        backend's deps: PYTHON="uv run python" by default)
#
# Never touches backend/data: every server works on a scratch COPY, a folder stands in for Neon
# (LABNINJA_SYNC_REMOTE_DIR) and a mock AI provider answers instead of a real one (no keys needed).
#   desktop  = FastAPI :8091 + Next.js A :4031 sharing one database file (like local dev)
#   phone    = Next.js B :4032 with its own copy (like a Vercel instance)
# Test data: the "LCB GrowthAI" project (test data only), see seed below. Scenarios: lms_question_topics_e2e.mjs.
set -euo pipefail

REPO=$(cd "$(dirname "$0")/../.." && pwd)
PY=${PYTHON:-"uv run python"}
WORK=$(mktemp -d -t qt-e2e-XXXX)
SECRET=dev-secret-lab-ninja-key
PIDS=()
cp "$REPO/frontend/tsconfig.json" "$WORK/tsconfig.json.bak"

cleanup() {
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null || true; done
  pkill -f "next dev -p 403[12]" 2>/dev/null || true
  pkill -f "uvicorn main:app --port 8091" 2>/dev/null || true
  cp "$WORK/tsconfig.json.bak" "$REPO/frontend/tsconfig.json"
  echo "scratch folder kept for inspection: $WORK"
}
trap cleanup EXIT

for port in 8091 4031 4032 4099; do
  if lsof -nP -iTCP:$port -sTCP:LISTEN >/dev/null 2>&1; then echo "port $port is busy"; exit 1; fi
done

# ── Seed: scratch copies of the real DB + the test projects ──────────────────────
mkdir -p "$WORK"/{remote,A,B,classes-A,classes-B}
cp "$REPO/backend/data/lab_ninja.sqlite3" "$WORK/base.sqlite3"
python3 - "$WORK/base.sqlite3" <<'PYSEED'
import json, sqlite3, sys
db = sqlite3.connect(sys.argv[1])
now = "2026-11-23T00:00:00.000Z"
for cid, slug, name, owner in [("cls-lcb", "lcb-growth", "LCB Growth Bootcamp", 25), ("cls-other", "other-class", "Other Class", None)]:
    db.execute("DELETE FROM lms_classes WHERE id = ? OR slug = ?", (cid, slug))
    db.execute("INSERT INTO lms_classes (id, name, slug, description, ai_context, icon, is_system, created_at, updated_at, owner_id) VALUES (?, ?, ?, '', '', 'BookmarkIcon', 0, ?, ?, ?)", (cid, name, slug, now, now, owner))
legacy_plan = [  # stored the old way: no ids, so derived ids are exercised
    {"title": "Customer Intelligence", "focus": "Segmentation, RFM, repeat-purchase prediction", "lesson_id": None,
     "sublessons": [{"title": "RFM segmentation", "focus": "", "lesson_id": None, "sublessons": []}]},
    {"title": "Referral Engine", "focus": "Referral codes and rewards", "lesson_id": None, "sublessons": []},
    {"title": "Checkout & Payments", "focus": "", "lesson_id": None, "sublessons": []},
]
readme = ("LCB GrowthAI is a multi-tenant e-commerce growth platform. First customer: LCB Fertilizers, whose flagship "
          "product is Navyakosh. Features: customer intelligence (segments, repeat-purchase prediction from purchase "
          "history), referral engine, checkout. Stack: Next.js, FastAPI, SQLite/Neon Postgres.")
for sid, cid, slug, name, plan in [
    ("prj-lcb", "cls-lcb", "lcb-growthai", "LCB GrowthAI", legacy_plan),
    ("prj-empty", "cls-lcb", "lcb-empty", "LCB Empty Project", []),
    ("prj-other", "cls-other", "other-project", "Other Project", [{"title": "Other Section", "focus": "", "lesson_id": None, "sublessons": []}]),
]:
    db.execute(
        "INSERT INTO lms_subjects (id, class_id, name, slug, description, ai_context, created_at, updated_at, kind, project_context, project_plan) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'project', ?, ?)",
        (sid, cid, name, slug, "Multi-tenant e-commerce growth project; first customer LCB Fertilizers.",
         "Learning goals: build growth features while learning applied ML.", now, now, readme, json.dumps(plan)),
    )
db.commit()
PYSEED
cp "$WORK/base.sqlite3" "$WORK/remote/lab_ninja.sqlite3" && printf seed > "$WORK/remote/lab_ninja.version"
for d in A B; do cp "$WORK/base.sqlite3" "$WORK/$d/lab_ninja.sqlite3"; cp "$REPO/backend/data/career_studio.sqlite3" "$WORK/$d/"; done

# ── Servers ───────────────────────────────────────────────────────────────────
node "$REPO/backend/tests/mock_ai_provider.mjs" 4099 > "$WORK/mock.log" 2>&1 & PIDS+=($!)
common=(LABNINJA_SYNC_REMOTE_DIR="$WORK/remote" LABNINJA_JWT_SECRET=$SECRET)
(cd "$REPO/backend" && exec env -u DATABASE_URL "${common[@]}" LABNINJA_DB_DIR="$WORK/A" LABNINJA_SYNC_TAG=F \
  LMS_CLASSES_DIR="$WORK/classes-A" $PY -m uvicorn main:app --port 8091 > "$WORK/fastapi.log" 2>&1) & PIDS+=($!)
for spec in "A 4031 .next-qt-a" "B 4032 .next-qt-b"; do
  set -- $spec
  (cd "$REPO/frontend" && exec env -u DATABASE_URL "${common[@]}" LABNINJA_DB_DIR="$WORK/$1" LABNINJA_SYNC_TAG=$1 \
    LMS_CLASSES_DIR="$WORK/classes-$1" DIST_DIR=$3 NEXT_PUBLIC_BACKEND_MODE=nextjs-api npx next dev -p $2 > "$WORK/next-$1.log" 2>&1) & PIDS+=($!)
done
for i in $(seq 1 120); do
  if grep -q Ready "$WORK/next-A.log" 2>/dev/null && grep -q Ready "$WORK/next-B.log" 2>/dev/null \
    && curl -s -o /dev/null http://127.0.0.1:8091/health; then break; fi
  sleep 1
done
cp "$WORK/tsconfig.json.bak" "$REPO/frontend/tsconfig.json"   # next dev appends its dist dir to tsconfig

FASTAPI=http://127.0.0.1:8091 NEXT_A=http://localhost:4031 NEXT_B=http://localhost:4032 MOCK=http://127.0.0.1:4099 \
  WORK="$WORK" SECRET=$SECRET node "$REPO/backend/tests/lms_question_topics_e2e.mjs"
