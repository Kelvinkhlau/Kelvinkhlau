#!/usr/bin/env bash
# 同時跑 backend (8000) + frontend (3000)
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
  echo "[backend] starting on http://localhost:8000"
  uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
) &

# Frontend
(
  cd "$ROOT/frontend"
  if [[ ! -d node_modules ]]; then
    echo "[frontend] pnpm install..."
    pnpm install
  fi
  echo "[frontend] starting on http://localhost:3000"
  pnpm dev
) &

wait
