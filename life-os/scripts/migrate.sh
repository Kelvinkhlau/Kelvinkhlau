#!/usr/bin/env bash
# 安全 Alembic migration wrapper。
#
# 每次升級前自動做 pre-migration snapshot 到
#   $ROOT/backend/data/migration-snapshots/lifeos-YYYYMMDD-HHMMSS-<rev>.db
# 升級後 verify 冇出錯，否則自動 restore。
#
# 用法：
#   scripts/migrate.sh                     # upgrade head（默認）
#   scripts/migrate.sh upgrade head
#   scripts/migrate.sh downgrade -1
#   scripts/migrate.sh current             # 無 snapshot（純讀）
#
# 恢復：
#   scripts/restore-from-backup.sh <snapshot-file>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${LIFEOS_DB:-$ROOT/backend/data/lifeos.db}"
SNAP_DIR="$ROOT/backend/data/migration-snapshots"

cd "$ROOT/backend"

# 只對會改 schema / data 嘅 command 做 snapshot
NEEDS_SNAPSHOT=0
case "${1:-upgrade}" in
  upgrade|downgrade|stamp)
    NEEDS_SNAPSHOT=1
    ;;
esac

if [[ "$NEEDS_SNAPSHOT" -eq 1 ]]; then
  if [[ ! -f "$DB" ]]; then
    echo "[migrate] DB not found: $DB"
    exit 1
  fi

  mkdir -p "$SNAP_DIR"
  REV_BEFORE=$(uv run alembic current 2>/dev/null | tail -1 | awk '{print $1}' | tr -d '()' || echo "unknown")
  DATE=$(date +%Y%m%d-%H%M%S)
  SNAP="$SNAP_DIR/lifeos-${DATE}-${REV_BEFORE}.db"

  echo "[migrate] pre-snapshot: $SNAP"
  sqlite3 "$DB" ".backup '$SNAP'"

  # 保留最近 20 份 migration snapshot
  # shellcheck disable=SC2012
  ls -t "$SNAP_DIR"/lifeos-*.db 2>/dev/null | tail -n +21 | xargs -I {} rm -f -- {} 2>/dev/null || true
fi

# Run alembic
CMD=("${@:-upgrade head}")
if [[ $# -eq 0 ]]; then
  CMD=(upgrade head)
fi

echo "[migrate] alembic ${CMD[*]}"
if uv run alembic "${CMD[@]}"; then
  echo "[migrate] OK"
  if [[ "$NEEDS_SNAPSHOT" -eq 1 ]]; then
    echo "[migrate] snapshot kept at: $SNAP"
    echo "[migrate] 如 app 行為異常可 restore:"
    echo "           cp \"$SNAP\" \"$DB\""
  fi
else
  STATUS=$?
  echo "[migrate] FAILED (exit $STATUS)"
  if [[ "$NEEDS_SNAPSHOT" -eq 1 ]]; then
    echo "[migrate] 自動 rollback 去 snapshot..."
    cp "$SNAP" "$DB"
    echo "[migrate] DB restored from: $SNAP"
  fi
  exit $STATUS
fi
