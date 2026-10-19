#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-8765}"
echo "Starting TWENTY Rubik's Cube Solver at http://${HOST}:${PORT}"
echo "(First run may take ~10s while solver tables build.)"
exec python3 backend/server.py
