#!/usr/bin/env bash
#
# VOXSHIFT — start the CPU engine and the Studio together.
#
#   ./scripts/dev.sh            # engine on :8000, studio on :3000
#   ENGINE_PORT=8010 ./scripts/dev.sh
#
# The Studio talks to the engine through the Next.js `/engine` rewrite, so both
# servers stay on the same origin in the browser (no CORS, no proxy surprises in
# hosted previews). Stop everything with Ctrl-C.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE_PORT="${ENGINE_PORT:-8000}"
STUDIO_PORT="${STUDIO_PORT:-3000}"
HOST="${HOST:-0.0.0.0}"
ENGINE_URL="${ENGINE_URL:-http://127.0.0.1:${ENGINE_PORT}}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required." >&2
  exit 1
fi
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "Installing frontend dependencies (first run)…"
  (cd "$ROOT/frontend" && npm install --no-fund --no-audit)
fi

python3 - <<'PY' || { echo "The engine needs numpy and fastapi: python3 -m pip install -r backend/requirements.txt" >&2; exit 1; }
import importlib
for module in ("numpy", "fastapi", "uvicorn"):
    importlib.import_module(module)
PY

PIDS=()
cleanup() {
  echo
  echo "Stopping…"
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "▶ engine  http://127.0.0.1:${ENGINE_PORT}  (docs at /docs)"
(cd "$ROOT/backend" && python3 -m uvicorn app.main:app --host "$HOST" --port "$ENGINE_PORT") &
PIDS+=($!)

echo "▶ studio  http://127.0.0.1:${STUDIO_PORT}"
# PORT and the bind address come from the npm script (which already passes
# --hostname); only the port needs overriding.
(cd "$ROOT/frontend" && ENGINE_URL="$ENGINE_URL" PORT="$STUDIO_PORT" npm run dev) &
PIDS+=($!)

wait -n "${PIDS[@]}"
