#!/usr/bin/env bash
# Build frontend → 放入 backend/app/static
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "→ Build frontend"
cd "$ROOT/frontend"
pnpm install --frozen-lockfile
pnpm build

echo "→ Copy out/ → backend/app/static/"
rm -rf "$ROOT/backend/app/static"
cp -R out "$ROOT/backend/app/static"

echo "→ Run backend migrations"
cd "$ROOT/backend"
uv sync
uv run alembic upgrade head

echo "✓ Build complete. Start with: cd backend && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"
