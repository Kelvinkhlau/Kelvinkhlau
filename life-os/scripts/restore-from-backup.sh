#!/usr/bin/env bash
# 由 backup archive 或 migration snapshot restore lifeos.db。
#
# 用法：
#   scripts/restore-from-backup.sh                           # 列出可用 backups
#   scripts/restore-from-backup.sh <path-to-tar.gz>          # 由 full tarball restore
#   scripts/restore-from-backup.sh <path-to-.db>             # 由 snapshot 直接 restore
#   scripts/restore-from-backup.sh --latest                  # 用最新 iCloud full backup
#
# Restore 前自動將現有 DB rename 做 lifeos.db.pre-restore-YYYYMMDD-HHMMSS
# 並 kickstart backend service 重讀新 DB。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${LIFEOS_DB:-$ROOT/backend/data/lifeos.db}"
LOCAL_BACKUP_DIR="${LIFEOS_BACKUP_DIR:-$HOME/.life-os/backups}"
ICLOUD_DIR="${LIFEOS_ICLOUD_BACKUP_DIR:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/life-os-backups}"
SNAP_DIR="$ROOT/backend/data/migration-snapshots"

list_backups() {
  echo "=== iCloud full backups ==="
  ls -lht "$ICLOUD_DIR"/lifeos-full-*.tar.gz 2>/dev/null | head -10 || echo "  (none)"
  echo
  echo "=== Local full backups ==="
  ls -lht "$LOCAL_BACKUP_DIR"/lifeos-full-*.tar.gz 2>/dev/null | head -10 || echo "  (none)"
  echo
  echo "=== Migration snapshots ==="
  ls -lht "$SNAP_DIR"/lifeos-*.db 2>/dev/null | head -10 || echo "  (none)"
  echo
  echo "用法: $0 <path>   或   $0 --latest"
}

if [[ $# -eq 0 ]]; then
  list_backups
  exit 0
fi

ARG="$1"

if [[ "$ARG" == "--latest" ]]; then
  # shellcheck disable=SC2012
  LATEST=$(ls -t "$ICLOUD_DIR"/lifeos-full-*.tar.gz 2>/dev/null | head -1)
  if [[ -z "$LATEST" ]]; then
    LATEST=$(ls -t "$LOCAL_BACKUP_DIR"/lifeos-full-*.tar.gz 2>/dev/null | head -1)
  fi
  if [[ -z "$LATEST" ]]; then
    echo "[restore] 搵唔到任何 full backup"
    exit 1
  fi
  ARG="$LATEST"
  echo "[restore] 用最新 backup: $ARG"
fi

if [[ ! -f "$ARG" ]]; then
  echo "[restore] file not found: $ARG"
  exit 1
fi

# Backup 現有 DB
if [[ -f "$DB" ]]; then
  DATE=$(date +%Y%m%d-%H%M%S)
  PRE="$DB.pre-restore-$DATE"
  echo "[restore] 現有 DB 備份去: $PRE"
  cp "$DB" "$PRE"
fi

# Detect file type
case "$ARG" in
  *.tar.gz)
    TMP=$(mktemp -d)
    trap 'rm -rf "$TMP"' EXIT
    echo "[restore] 解壓 tarball → $TMP"
    tar -xzf "$ARG" -C "$TMP"
    if [[ -f "$TMP/lifeos.db" ]]; then
      cp "$TMP/lifeos.db" "$DB"
    else
      echo "[restore] tarball 入面搵唔到 lifeos.db"
      exit 2
    fi
    ;;
  *.db)
    cp "$ARG" "$DB"
    ;;
  *)
    echo "[restore] 唔識咁嘅 file type: $ARG"
    exit 2
    ;;
esac

echo "[restore] DB 已 restore 自: $ARG"

# Reload backend 令佢重讀新 DB
if launchctl list | grep -q com.lifeos.backend; then
  echo "[restore] kickstart backend..."
  launchctl kickstart -k "gui/$(id -u)/com.lifeos.backend" 2>/dev/null || true
  sleep 2
  if curl -sSf http://127.0.0.1:"${APP_PORT:-3101}"/api/health >/dev/null 2>&1; then
    echo "[restore] backend healthy ✓"
  else
    echo "[restore] WARN: backend 未 respond，check /tmp/lifeos-backend.err"
  fi
else
  echo "[restore] backend 冇由 launchd 管住，如有 dev server 跑住記得重啟"
fi

echo "[restore] done"
