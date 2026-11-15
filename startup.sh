#!/bin/bash

# ==============================================================================
# HOW TO RUN THIS SCRIPT:
# 
# 1. Make the script executable:
#    chmod +x startup.sh
# 
# 2. Run the script:
#    ./startup.sh
# ==============================================================================

# Exit immediately if any command fails
set -e

# Get the absolute path of the workspace root directory where this script is located
WORKSPACE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Define cleanup function to gracefully stop both services on Ctrl+C (SIGINT/SIGTERM)
cleanup() {
    echo ""
    echo "Stopping frontend and backend services..."
    if [ -n "$FE_PID" ]; then
        kill "$FE_PID" 2>/dev/null || true
    fi
    if [ -n "$BE_PID" ]; then
        kill "$BE_PID" 2>/dev/null || true
    fi
    exit 0
}

# Trap INT and TERM signals to run the cleanup function
trap cleanup INT TERM

# Ports used by the backend and frontend
BACKEND_PORT=8082
FRONTEND_PORT=4028

# Kill whatever is already listening on a given port (from a previous run, crash, etc.)
free_port() {
    local port="$1"
    local pids
    pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
    if [ -n "$pids" ]; then
        echo "Port $port is in use (PID(s): $pids). Stopping existing process(es)..."
        kill -9 $pids 2>/dev/null || true
        sleep 1
    fi
}

echo "----------------------------------------"
echo "Freeing ports (backend: $BACKEND_PORT, frontend: $FRONTEND_PORT, auxiliary: 3002)..."
echo "----------------------------------------"
free_port "$BACKEND_PORT"
free_port "$FRONTEND_PORT"
free_port "3002"

# Ensure Python output is not buffered, so Uvicorn startup logs are visible immediately
export PYTHONUNBUFFERED=1

# The backend needs Python >= 3.11 and the packages in backend/pyproject.toml (pinned in uv.lock). `uv` provides
# both: `uv sync` builds backend/.venv from uv.lock (downloading a matching Python if the machine has none) and keeps
# it current. Without uv, fall back to python3/python, which only works if that interpreter already has the
# backend's packages: a bare system python3 does not, and the backend used to die on `import fastapi` while the
# frontend kept running in offline mode.
# If the backend can't be set up, the frontend still starts (it shows its offline mode) and the reason is printed.
cd "$WORKSPACE_DIR/backend"
BACKEND_CMD=()
if command -v uv &> /dev/null; then
    echo "----------------------------------------"
    echo "Syncing backend dependencies (uv sync)..."
    echo "----------------------------------------"
    if uv sync --quiet; then
        BACKEND_CMD=(uv run --no-sync python main.py)
    else
        echo "Warning: 'uv sync' failed (network?), so the backend is skipped. Run this again once it can download." >&2
    fi
else
    PYTHON_CMD=""
    if command -v python3 &> /dev/null; then
        PYTHON_CMD="python3"
    elif command -v python &> /dev/null; then
        PYTHON_CMD="python"
    fi
    if [ -n "$PYTHON_CMD" ] && "$PYTHON_CMD" -c "import fastapi, uvicorn" &> /dev/null; then
        BACKEND_CMD=("$PYTHON_CMD" main.py)
    else
        echo "Warning: no Python with fastapi/uvicorn found, so the backend is skipped (the app runs in offline mode)." >&2
        echo "Fix: install uv (brew install uv) and run this again; it sets up backend/.venv from uv.lock." >&2
    fi
fi

BE_PID=""
if [ ${#BACKEND_CMD[@]} -gt 0 ]; then
    echo "----------------------------------------"
    echo "Starting Backend (${BACKEND_CMD[*]})..."
    echo "----------------------------------------"
    PORT="$BACKEND_PORT" "${BACKEND_CMD[@]}" &
    BE_PID=$!
fi

echo "----------------------------------------"
echo "Starting Frontend (npm run dev)..."
echo "----------------------------------------"
cd "$WORKSPACE_DIR/frontend"
npm run dev &
FE_PID=$!

# `next dev` compiles a route on its first request (6-9 s for the first one) and then rewrites the
# shared layout chunk in place. A browser that opens in that window can download a truncated chunk and
# never hydrate (dead "Log in" button / endless spinner until a manual reload). Pre-compile the landing
# routes in the background so the first real page load is warm.
(
    for _ in $(seq 1 60); do
        curl -s -o /dev/null "http://localhost:$FRONTEND_PORT/" && break
        sleep 1
    done
    for route in "/daily-session" "/ai-todo?tab=quick"; do
        curl -s -m 120 -o /dev/null "http://localhost:$FRONTEND_PORT$route" || true
    done
) &

echo "----------------------------------------"
echo "Services are starting up..."
echo "  Backend URL:  http://localhost:$BACKEND_PORT"
echo "  Frontend URL: http://localhost:$FRONTEND_PORT"
echo "  Backend PID:  $BE_PID"
echo "  Frontend PID: $FE_PID"
echo "  Press Ctrl+C to stop both."
echo "----------------------------------------"

# Wait for background processes to finish
wait $BE_PID $FE_PID

