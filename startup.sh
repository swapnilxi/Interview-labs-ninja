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

# Ensure Python output is not buffered, so Uvicorn startup logs are visible immediately
export PYTHONUNBUFFERED=1

# Find python executable (prefer python3, fallback to python)
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "Error: Python is not installed or not in PATH." >&2
    exit 1
fi

echo "----------------------------------------"
echo "Starting Backend ($PYTHON_CMD main.py)..."
echo "----------------------------------------"
cd "$WORKSPACE_DIR/backend"
$PYTHON_CMD main.py &
BE_PID=$!

echo "----------------------------------------"
echo "Starting Frontend (npm run dev)..."
echo "----------------------------------------"
cd "$WORKSPACE_DIR/frontend"
npm run dev &
FE_PID=$!

echo "----------------------------------------"
echo "Services are starting up..."
echo "  Backend URL:  http://localhost:8000"
echo "  Frontend URL: http://localhost:4028"
echo "  Backend PID:  $BE_PID"
echo "  Frontend PID: $FE_PID"
echo "  Press Ctrl+C to stop both."
echo "----------------------------------------"

# Wait for background processes to finish
wait $BE_PID $FE_PID

