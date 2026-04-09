# Mac mini 部署指南

呢份文檔教你由零開始將 life-os 部署到 Mac mini，並透過 Tailscale 喺手機 / iPad / MacBook 上 access。

## 預備

- Mac mini（M-series，推薦 ≥16GB RAM）
- macOS 14+ Sonoma 或以上
- 一個 Anthropic Claude API key
- 一個 Google Cloud project（用嚟 Gmail OAuth2）
- Tailscale account（免費）

## 一次性安裝

### 1. 安裝必需 tools（用 Homebrew）

```bash
# Homebrew（如果未裝）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 必需 packages
brew install uv pnpm caddy sqlite3
brew install --cask tailscale
```

### 2. Clone repo

```bash
mkdir -p ~/Developer && cd ~/Developer
git clone https://github.com/kelvinkhlau/life-os.git
cd life-os
```

### 3. 設置 .env

```bash
cp .env.example .env
# 用你鍾意嘅 editor 改返啲 secrets
nano .env
```

需要填嘅 keys：
- `APP_SECRET_KEY` — 用 `openssl rand -hex 32` 生成
- `ANTHROPIC_API_KEY` — 由 console.anthropic.com 攞
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — 由 console.cloud.google.com 攞
  - 開新 project → 啟用 Gmail API → Create OAuth client（Desktop application）
- `OWNER_EMAIL` / `OWNER_NAME` — 你自己

### 4. Build frontend + 跑 migrations

```bash
./scripts/build.sh
```

呢個 script 會：
- `pnpm install && pnpm build`（frontend）
- copy `frontend/out/` → `backend/app/static/`
- `uv sync`（backend）
- `alembic upgrade head`（DB migration）

### 5. 試吓 backend 行唔行得通

```bash
cd backend
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

開瀏覽器去 `http://localhost:8000/api/health`，應該見到 `{"status":"ok","env":"production"}`。

按 `Ctrl+C` 停先。

### 6. 安裝 launchd service（開機自動 start）

```bash
./scripts/install-launchd.sh
```

個 script 會將 `deployment/com.kelvin.lifeos.plist` 入面嘅
`__PROJECT_ROOT__` 換成真實路徑，寫到 `~/Library/LaunchAgents/`，
再 `launchctl load`。

驗證：
```bash
launchctl list | grep lifeos
```

Logs 會喺 `~/Library/Logs/lifeos.{out,err}.log`。

### 7. 設置 Tailscale

```bash
# 開 Tailscale.app，登入你嘅帳戶
tailscale up

# 攞 Mac mini 嘅 Tailscale hostname
tailscale status
# 通常係 macmini.tail-xxxx.ts.net
```

喺 Tailscale admin console 啟用 **MagicDNS** 同 **HTTPS certificates**：
https://login.tailscale.com/admin/dns

### 8. 啟動 Caddy

改 `deployment/Caddyfile`，將 `lifeos.your-tailnet.ts.net` 換成你嘅 hostname。

```bash
sudo caddy run --config deployment/Caddyfile
```

或者用 launchd 開機跑：
```bash
sudo brew services start caddy
```

### 9. 喺其他 device 安裝 Tailscale

- iPhone：App Store 下載 Tailscale → 登入同一個帳戶
- iPad：同上
- MacBook：`brew install --cask tailscale` → 登入

## 試 PWA

1. iPhone Safari 打開 `https://macmini.tail-xxxx.ts.net`
2. Share → **Add to Home Screen**
3. App icon 出現，撳入去
4. 首次用要撳「登入」→ **註冊 Passkey**，令 iPhone 用 Face ID
   記住呢個 credential。之後每次開 app 都係用 Face ID 一撳搞掂。
5. 註冊完之後就可以撳「連接 Gmail」，完成 OAuth2 授權，
   之後背景 sync 自動每 5 分鐘拉新郵件。

> **第一次 register Passkey 建議喺 MacBook Safari 做**，
> 因為 iCloud Keychain 會自動同步畀 iPhone / iPad。咁樣你
> 一次註冊全部 device 都用得。

## 每日備份

備份 job 已經有埋 launchd plist，一併安裝：

```bash
# 複製 + 編輯 template path
ROOT="$(pwd)"  # 確保喺 life-os repo 根目錄
sed "s|__PROJECT_ROOT__|$ROOT|g" \
  deployment/com.kelvin.lifeos.backup.plist \
  > ~/Library/LaunchAgents/com.kelvin.lifeos.backup.plist

launchctl load ~/Library/LaunchAgents/com.kelvin.lifeos.backup.plist
```

預設每日 03:30 跑一次（Mac 睡咗會等 wake 之後補跑），
備份儲喺 `~/.life-os/backups/lifeos-YYYYMMDD-HHMMSS.db.gz`，
預設保留最近 30 份，舊嘅會自動刪。

手動觸發一次：
```bash
launchctl start com.kelvin.lifeos.backup
# 或者直接 run script
./scripts/backup.sh
```

Log：`~/Library/Logs/lifeos-backup.{out,err}.log`
同埋 `~/.life-os/backups/backup.log`。

### 還原備份

```bash
# 停 service
launchctl unload ~/Library/LaunchAgents/com.kelvin.lifeos.plist

# 解壓 + 覆蓋
gunzip -c ~/.life-os/backups/lifeos-20260101-033000.db.gz \
  > backend/data/lifeos.db

# 重新 load
launchctl load ~/Library/LaunchAgents/com.kelvin.lifeos.plist
```

## Troubleshooting

### Service 起唔到
```bash
tail -f ~/Library/Logs/lifeos.err.log
```

### Tailscale 連唔到
```bash
tailscale status
tailscale ping macmini
```

### Caddy 攞唔到 cert
- 確認 Tailscale admin console 啟用咗 HTTPS
- 確認 `deployment/Caddyfile` 嘅 hostname 同 `tailscale status` 一樣

### Database 鎖住
SQLite 同時寫嘅時候會 lock。如果係：
```bash
# 停 service
launchctl unload ~/Library/LaunchAgents/com.kelvin.lifeos.plist
# 等 5 秒再 load
launchctl load ~/Library/LaunchAgents/com.kelvin.lifeos.plist
```

### Passkey 登入失敗（`401 Invalid or expired token`）
- 可能 token 過咗 30 日期限 — 登出再重新用 Face ID 登入就得
- iPhone / iPad 冇顯示 Passkey 選項：檢查 iCloud Keychain 有冇開
- 完全重置：喺 Safari `Settings → Passwords` 搵 lifeos 那個
  credential 刪咗，再重新註冊

### WebSocket 連唔到
- Browser DevTools Console 睇 `wss://.../ws/emails` 嘅錯誤
- 確認 Caddyfile 入面有 `@websocket` + `reverse_proxy @websocket ...`
- 確認 frontend 已經登入（WebSocket 要 JWT query param）

### AI 分類冇跑 / 永遠 unclassified
- 睇 `~/Library/Logs/lifeos.err.log` 有冇 `claude.messages.create` 錯
- 確認 `.env` 入面 `ANTHROPIC_API_KEY` 有填且有效
- 測試：`POST /api/emails/sync?classify=true` 強制重新分類
- retry 會自動跑 3 次（exponential backoff），但 4xx 唔會 retry
