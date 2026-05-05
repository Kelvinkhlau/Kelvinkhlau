#!/usr/bin/env bash
# 每星期完整備份 — SQLite DB + vault 所有檔案。
#
# 用法：
#   scripts/backup.sh                    # 一次過 run
#   launchctl load deployment/...backup.plist  # 每星期日 04:00 自動 run
#
# 輸出：~/.life-os/backups/lifeos-full-YYYYMMDD-HHMMSS.tar.gz
# 保留：預設 12 份（約 3 個月 weekly），舊嘅會自動清走。
#
# Env overrides:
#   LIFEOS_DB=/path/to/lifeos.db
#   LIFEOS_DATA_DIR=/path/to/data        # data_dir，包住 vault/ 等子目錄
#   LIFEOS_BACKUP_DIR=/path/to/backups
#   LIFEOS_BACKUP_KEEP=12
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${LIFEOS_DB:-$ROOT/backend/data/lifeos.db}"
DATA_DIR="${LIFEOS_DATA_DIR:-$ROOT/backend/data}"
BACKUP_DIR="${LIFEOS_BACKUP_DIR:-$HOME/.life-os/backups}"
KEEP="${LIFEOS_BACKUP_KEEP:-12}"
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

TMP_DIR=$(mktemp -d)
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

DB_SNAPSHOT="$TMP_DIR/lifeos.db"
OUT="$BACKUP_DIR/lifeos-full-$DATE.tar.gz"

log "full backup start → $OUT"

# SQLite online backup — safe，唔會鎖 live connection
if ! sqlite3 "$DB" ".backup '$DB_SNAPSHOT'"; then
  log "ERROR: sqlite backup failed"
  exit 2
fi

# 打包 DB snapshot + vault/notes 目錄（如果存在）
TAR_ARGS=(-czf "$OUT" -C "$TMP_DIR" "lifeos.db")

for sub in vault notes; do
  if [[ -d "$DATA_DIR/$sub" ]]; then
    TAR_ARGS+=(-C "$DATA_DIR" "$sub")
  fi
done

# 包埋 .env（API keys / secrets）— rename 入 tarball 做 env/backend.env 同 env/root.env
ENV_STAGE="$TMP_DIR/env"
mkdir -p "$ENV_STAGE"
BACKEND_ENV="$ROOT/backend/.env"
ROOT_ENV="$ROOT/.env"
if [[ -f "$BACKEND_ENV" ]]; then
  cp "$BACKEND_ENV" "$ENV_STAGE/backend.env"
fi
if [[ -f "$ROOT_ENV" ]]; then
  cp "$ROOT_ENV" "$ENV_STAGE/root.env"
fi
if [[ -n "$(ls -A "$ENV_STAGE" 2>/dev/null)" ]]; then
  TAR_ARGS+=(-C "$TMP_DIR" "env")
fi

if ! tar "${TAR_ARGS[@]}"; then
  log "ERROR: tar failed"
  exit 3
fi

SIZE=$(du -h "$OUT" | cut -f1)
log "full backup ok: $OUT ($SIZE)"

# Mirror 去 iCloud Drive（best-effort，失敗唔 fail 成個 backup）
ICLOUD_DIR="${LIFEOS_ICLOUD_BACKUP_DIR:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/life-os-backups}"
if [[ -d "$(dirname "$ICLOUD_DIR")" ]]; then
  mkdir -p "$ICLOUD_DIR"
  if cp "$OUT" "$ICLOUD_DIR/" 2>>"$LOG"; then
    log "mirrored to iCloud: $ICLOUD_DIR/$(basename "$OUT")"
    # shellcheck disable=SC2012
    ls -t "$ICLOUD_DIR"/lifeos-full-*.tar.gz 2>/dev/null | tail -n "+$((KEEP + 1))" \
      | while read -r old; do
          log "prune icloud: $old"
          rm -f -- "$old"
        done
  else
    log "WARN: iCloud mirror failed (non-fatal)"
  fi
else
  log "iCloud Drive not available, skip mirror"
fi

# 保留最近 $KEEP 份
# shellcheck disable=SC2012
ls -t "$BACKUP_DIR"/lifeos-full-*.tar.gz 2>/dev/null | tail -n "+$((KEEP + 1))" \
  | while read -r old; do
      log "prune: $old"
      rm -f -- "$old"
    done

# 舊格式 .db.gz 一齊清走（legacy）
# shellcheck disable=SC2012
ls -t "$BACKUP_DIR"/lifeos-*.db.gz 2>/dev/null | while read -r old; do
  log "prune legacy: $old"
  rm -f -- "$old"
done

log "done"
