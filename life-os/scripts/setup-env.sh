#!/usr/bin/env bash
# 一次過設置 life-os 嘅 .env：
#   - 自動搵 ~/Downloads/ 入面 Google OAuth client JSON
#   - 自動抽 client_id / client_secret
#   - 自動生成 APP_SECRET_KEY
#   - 提醒你仲要補咩
#
# 用法：
#   ./scripts/setup-env.sh                       # 自動搵 Downloads
#   ./scripts/setup-env.sh path/to/client.json   # 指定 JSON path

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

color() { printf "\033[%sm%s\033[0m\n" "$1" "$2"; }
info()  { color "1;34" "→ $*"; }
ok()    { color "1;32" "✓ $*"; }
warn()  { color "1;33" "⚠ $*"; }
err()   { color "1;31" "✗ $*" >&2; }

# ─── 1. 搵 OAuth JSON ───────────────────────────────────────────
JSON="${1:-}"
if [[ -z "$JSON" ]]; then
  info "喺 ~/Downloads/ 搵 Google OAuth client JSON..."
  # 試多個 pattern（macOS bash 3.2 glob 有時唔 work）：
  #   client_secret_*.json  — Google 默認命名
  #   *googleusercontent.com.json  — 保險
  #   *client_secret*.json  — rename 過都捉到
  shopt -s nullglob 2>/dev/null || true
  candidates=(
    "$HOME/Downloads"/client_secret_*.json
    "$HOME/Downloads"/*googleusercontent.com.json
    "$HOME/Downloads"/*client_secret*.json
  )
  # 揀最新嗰個
  latest=""
  latest_mtime=0
  for f in "${candidates[@]}"; do
    [[ -f "$f" ]] || continue
    mtime=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0)
    if (( mtime > latest_mtime )); then
      latest_mtime=$mtime
      latest="$f"
    fi
  done
  JSON="$latest"
fi

if [[ -z "$JSON" || ! -f "$JSON" ]]; then
  err "搵唔到 OAuth client JSON。"
  echo ""
  echo "  請先去 https://console.cloud.google.com/apis/credentials 下載，"
  echo "  或者用參數指定 path：./scripts/setup-env.sh /path/to/client.json"
  exit 1
fi

ok "搵到 JSON：$JSON"

# ─── 2. Parse JSON（python3 係 macOS built-in） ──────────────────
if ! command -v python3 >/dev/null 2>&1; then
  err "需要 python3（macOS 通常預裝咗）"
  exit 1
fi

PARSED=$(python3 <<PY
import json, sys
with open("$JSON") as f:
    d = json.load(f)
key = "installed" if "installed" in d else ("web" if "web" in d else None)
if key is None:
    print("ERROR: JSON 入面冇 'installed' 或 'web' key", file=sys.stderr)
    sys.exit(2)
c = d[key]
print(key)
print(c["client_id"])
print(c["client_secret"])
print(",".join(c.get("redirect_uris", [])))
PY
)

TYPE=$(sed -n '1p' <<<"$PARSED")
CLIENT_ID=$(sed -n '2p' <<<"$PARSED")
CLIENT_SECRET=$(sed -n '3p' <<<"$PARSED")
REDIRECTS=$(sed -n '4p' <<<"$PARSED")

ok "OAuth type: $TYPE"
ok "Client ID: ${CLIENT_ID:0:20}...（已讀）"
ok "Redirect URIs: ${REDIRECTS:-<none>}"

# ─── 3. Warn 如果 type 係 installed ─────────────────────────────
if [[ "$TYPE" == "installed" ]]; then
  warn "你個 OAuth client 係 'Desktop app' type。"
  echo "  life-os 用 server-side redirect flow，建議改用 'Web application' type："
  echo "    1. 開 https://console.cloud.google.com/apis/credentials"
  echo "    2. CREATE CREDENTIALS → OAuth client ID"
  echo "    3. Application type: Web application"
  echo "    4. Authorized redirect URIs 加 http://localhost:8000/api/auth/gmail/callback"
  echo "    5. 下載新 JSON，再跑一次：./scripts/setup-env.sh"
  echo ""
  read -rp "  暫時用住 'installed' type 繼續？(y/N) " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# ─── 4. 檢查 redirect URI ───────────────────────────────────────
EXPECTED="http://localhost:8000/api/auth/gmail/callback"
if [[ ",$REDIRECTS," != *",$EXPECTED,"* ]]; then
  warn "個 OAuth client 嘅 redirect URIs 冇 $EXPECTED"
  echo "  → 入 https://console.cloud.google.com/apis/credentials 加返佢。"
  echo "  OAuth flow 會 fail 如果個 URI 唔 match。"
  echo ""
fi

# ─── 5. Setup .env ──────────────────────────────────────────────
if [[ ! -f .env ]]; then
  info "copy .env.example → .env"
  cp .env.example .env
fi

# 用 python3 改 .env，避免 sed 喺 macOS/BSD 同 GNU 嘅語法差別
python3 <<PY
import os, re, secrets

path = ".env"
with open(path) as f:
    content = f.read()

def set_var(content, key, value):
    pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
    line = f"{key}={value}"
    if pattern.search(content):
        return pattern.sub(line, content)
    else:
        return content.rstrip() + "\n" + line + "\n"

content = set_var(content, "GOOGLE_CLIENT_ID", "$CLIENT_ID")
content = set_var(content, "GOOGLE_CLIENT_SECRET", "$CLIENT_SECRET")
content = set_var(content, "GOOGLE_REDIRECT_URI", "$EXPECTED")

# 只有當 APP_SECRET_KEY 仲係 template value 先覆蓋
if re.search(r"^APP_SECRET_KEY=請用", content, re.MULTILINE) or \
   re.search(r"^APP_SECRET_KEY=$", content, re.MULTILINE):
    content = set_var(content, "APP_SECRET_KEY", secrets.token_hex(32))
    print("  APP_SECRET_KEY 已自動生成")
else:
    print("  APP_SECRET_KEY 保留原值（已設置過）")

with open(path, "w") as f:
    f.write(content)
PY

ok ".env 已更新"
echo ""

# ─── 6. 顯示剩低要填咩 ──────────────────────────────────────────
info "以下 keys 仲要你自己填入 .env："

python3 <<'PY'
import re
missing = []
placeholders = {
    "ANTHROPIC_API_KEY": ["sk-ant-xxxxx", ""],
    "OWNER_EMAIL": ["you@example.com", ""],
    "OWNER_NAME": ["Kelvin", ""],  # Kelvin 係預設值都當需要確認
}
with open(".env") as f:
    content = f.read()
for key, placeholder_vals in placeholders.items():
    m = re.search(rf"^{key}=(.*)$", content, re.MULTILINE)
    if not m:
        missing.append((key, "(唔存在)"))
    elif m.group(1) in placeholder_vals or m.group(1).startswith("sk-ant-xxx"):
        missing.append((key, m.group(1) or "(空)"))

if not missing:
    print("  (冇，全部填晒)")
else:
    for key, cur in missing:
        print(f"  • {key}  — 目前：{cur}")
PY

echo ""
info "之後步驟："
echo "  1. 編輯 .env 填埋上面啲 keys（至少 ANTHROPIC_API_KEY 同 OWNER_EMAIL）"
echo "  2. cd backend && uv sync && uv run alembic upgrade head"
echo "  3. ./scripts/dev.sh         # 同時起 backend + frontend"
echo "  4. 開 http://localhost:3000 → 註冊 Passkey → 連接 Gmail"
echo ""
ok "setup-env 完成"
