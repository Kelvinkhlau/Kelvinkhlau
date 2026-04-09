#!/usr/bin/env bash
# 每日備份 SQLite database
# 用法：可以加入 cron 或者 launchd plist
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="$ROOT/backend/data/lifeos.db"
BACKUP_DIR="$HOME/.life-os/backups"
DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"

if [[ ! -f "$DB" ]]; then
  echo "Database not found: $DB"
  exit 1
fi

# 用 SQLite .backup command（safe，會 lock 住一下）
sqlite3 "$DB" ".backup '$BACKUP_DIR/lifeos-$DATE.db'"

# 保留最近 30 個
ls -t "$BACKUP_DIR"/lifeos-*.db | tail -n +31 | xargs -I {} rm -- {} 2>/dev/null || true

echo "✓ Backup saved: $BACKUP_DIR/lifeos-$DATE.db"
