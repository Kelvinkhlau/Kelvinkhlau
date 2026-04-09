#!/usr/bin/env bash
# 安裝 life-os launchd service 到 Mac mini
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_NAME="com.kelvin.lifeos.plist"
TARGET="$HOME/Library/LaunchAgents/$PLIST_NAME"

mkdir -p "$HOME/Library/LaunchAgents"

# Substitute project root path
sed "s|__PROJECT_ROOT__|$ROOT|g" "$ROOT/deployment/$PLIST_NAME" > "$TARGET"

launchctl unload "$TARGET" 2>/dev/null || true
launchctl load "$TARGET"

echo "✓ life-os service installed at $TARGET"
echo "  Status: launchctl list | grep lifeos"
echo "  Logs:   ~/Library/Logs/lifeos.{out,err}.log"
