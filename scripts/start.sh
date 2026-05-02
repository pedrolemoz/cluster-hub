#!/usr/bin/env bash
# Start Cluster Hub (dev mode) — runs backend and frontend in parallel
# Usage: bash scripts/start.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo ""
echo "=== Cluster Hub ==="
echo ""
echo "Starting backend  (go run)    -> http://localhost:3001"
echo "Starting frontend (npm run dev) -> http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both."
echo ""

cleanup() {
  echo ""
  echo "Stopping..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
  echo "Done."
}
trap cleanup EXIT INT TERM

cd "$BACKEND_DIR"
go mod tidy
go run main.go &
BACKEND_PID=$!

cd "$FRONTEND_DIR"
npm install
npm run dev &
FRONTEND_PID=$!

wait "$BACKEND_PID" "$FRONTEND_PID"
