#!/usr/bin/env bash
# 每日備份 SQLite database（用 sqlite .backup command，safe 唔會破壞 live DB）。
#
# 用法：
#   scripts/backup.sh                    # 一次過 run
#   launchctl load deployment/...backup.plist  # 每日自動 run
#
# 備份位置：~/.life-os/backups/lifeos-YYYYMMDD-HHMMSS.db.gz
# 保留：預設 30 份，舊嘅會自動清走。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${LIFEOS_DB:-$ROOT/backend/data/lifeos.db}"
BACKUP_DIR="${LIFEOS_BACKUP_DIR:-$HOME/.life-os/backups}"
KEEP="${LIFEOS_BACKUP_KEEP:-30}"
DATE=$(date +%Y%m%d-%H%M%S)
LOG="$BACKUP_DIR/backup.log"

mkdir -p "$BACKUP_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"
}

if [[ ! -f "$DB" ]]; then
  log "ERROR: database not found: $DB"
  exit 1
fi

TMP="$BACKUP_DIR/lifeos-$DATE.db"
OUT="$TMP.gz"

log "backup start: $DB -> $OUT"

# SQLite online backup — safe 俾 live connection
if ! sqlite3 "$DB" ".backup '$TMP'"; then
  log "ERROR: sqlite backup failed"
  rm -f "$TMP"
  exit 2
fi

# 壓縮
if ! gzip -f "$TMP"; then
  log "ERROR: gzip failed"
  rm -f "$TMP" "$OUT"
  exit 3
fi

SIZE=$(du -h "$OUT" | cut -f1)
log "backup ok: $OUT ($SIZE)"

# 保留最近 $KEEP 份
# shellcheck disable=SC2012
ls -t "$BACKUP_DIR"/lifeos-*.db.gz 2>/dev/null | tail -n "+$((KEEP + 1))" \
  | while read -r old; do
      log "prune: $old"
      rm -f -- "$old"
    done

log "done"
