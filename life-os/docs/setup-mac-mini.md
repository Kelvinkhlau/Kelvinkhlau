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
4. 應該見到首頁

## 每日備份

加入 cron 或者 launchd plist：

```bash
# 每日凌晨 3 點備份
crontab -e
# 加：
0 3 * * * /Users/kelvin/Developer/life-os/scripts/backup.sh
```

備份會儲喺 `~/.life-os/backups/`，保留最近 30 個。

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
