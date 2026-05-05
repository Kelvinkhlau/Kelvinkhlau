#!/usr/bin/env bash
# 跑 backend (:3100) — frontend 用 static export 由 backend serve
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cleanup() {
  echo ""
  echo "停 dev servers..."
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Backend
(
  cd "$ROOT/backend"
  if [[ ! -d .venv ]]; then
    echo "[backend] uv sync..."
    uv sync
  fi
  PORT="${APP_PORT:-3100}"
  echo "[backend] starting on http://0.0.0.0:$PORT"
  uv run uvicorn app.main:app --reload --host 0.0.0.0 --port "$PORT"
) &

# Frontend
(
  cd "$ROOT/frontend"
  if [[ ! -d node_modules ]]; then
    echo "[frontend] pnpm install..."
    pnpm install
  fi
  echo "[frontend] starting on http://0.0.0.0:5200"
  pnpm exec next dev -p 5200 -H 0.0.0.0
) &

wait
