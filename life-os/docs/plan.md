# 個人生活整合管理系統（life-os）— 開發規劃

## Context（為什麼要做）

用戶想喺 Mac mini 上建立一個個人生活整合管理系統（背景：你份規劃文檔列出 Email 智能助手、Project/Todo、Idea/Card、AI 助手、Calendar、財務消費追蹤、知識管理、廣東話語音輸入等十幾個 feature），可以喺 iPhone / iPad / MacBook 上用。

**現況**：`kelvinkhlau/kelvinkhlau` 係 GitHub profile README 專用 repo，冇 application code。需要由零開始 scaffold 一個新 repo `life-os`，定立架構，做出可運作嘅 MVP。

**目標**：唔再寫第二份規劃文檔 —— 而係輸出一個**實際可以執行嘅開發路線圖**，先做一個小但完整嘅垂直切片證明架構行得通，再 incrementally 加 feature。

---

## 用戶已確認嘅關鍵決策

| 決策 | 選擇 |
|---|---|
| 前端 | **PWA（Next.js + Tailwind + shadcn/ui）** |
| MVP 起手 feature | **Email 智能助手** |
| Repo | **新開 `kelvinkhlau/life-os`** |
| 遠端訪問 | **Tailscale**（家用 LAN + 出街 VPN）|

---

## 整體架構

```
┌──────────────────────────────────────────────────┐
│                  Mac mini (Server)                │
│                                                   │
│  ┌────────────────────────────────────────────┐  │
│  │  Backend: FastAPI + Python 3.11+           │  │
│  │  ├─ REST API + WebSocket                   │  │
│  │  ├─ SQLite + SQLCipher（加密）              │  │
│  │  ├─ APScheduler（背景 email sync）          │  │
│  │  └─ Claude API（AI 分類）                   │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │  Frontend: Next.js（PWA）                   │  │
│  │  build 後由 FastAPI serve（同一個 origin）  │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  launchd service → 開機自動啟動                   │
│  Caddy reverse proxy → 自動 HTTPS                 │
│  Tailscale → 跨 device 安全連線                   │
└──────────────────────┬───────────────────────────┘
                       │ Tailscale (100.x.x.x)
        ┌──────────────┼──────────────┐
        │              │              │
   ┌────▼────┐   ┌─────▼────┐   ┌─────▼─────┐
   │ iPhone  │   │   iPad   │   │  MacBook  │
   │  PWA    │   │   PWA    │   │  Browser  │
   └─────────┘   └──────────┘   └───────────┘
```

### 技術棧

| 層 | 選擇 |
|---|---|
| Backend framework | **FastAPI**（Python 3.11+） |
| Package manager | **uv**（快、現代）|
| ORM / Migration | **SQLAlchemy 2.0** + **Alembic** |
| Database | **SQLite + SQLCipher**（local-first、加密）|
| 認證 | **JWT + WebAuthn / Passkey**（Face ID / Touch ID）|
| 背景任務 | **APScheduler**（內嵌 FastAPI、零外部依賴）|
| AI（分類 / 摘要） | **Anthropic Claude API**（claude-haiku-4-5 cost-effective、claude-sonnet-4-6 複雜任務）|
| AI（語音） | **OpenAI Whisper API**（廣東話）|
| Email | Gmail：**Gmail API（OAuth2）**；iCloud：**IMAP**（將來）|
| Frontend | **Next.js 14（App Router）** + **TypeScript** |
| UI | **Tailwind CSS** + **shadcn/ui** |
| State / Data | **TanStack Query** + **Zustand** |
| PWA | **next-pwa** + manifest.json |
| 反向代理 | **Caddy**（自動 HTTPS、輕量）|
| Process 管理 | **launchd**（macOS 原生）|
| 遠端訪問 | **Tailscale**（MagicDNS：`lifeos.tail-xxx.ts.net`）|

---

## Repo 結構（life-os）

```
life-os/
├── README.md
├── CLAUDE.md                       # Claude Code project context
├── .gitignore
├── .env.example                    # 範例（OAuth secrets / API keys）
├── docker-compose.yml              # 開發環境
│
├── backend/
│   ├── pyproject.toml              # uv 管理
│   ├── alembic.ini
│   ├── alembic/
│   │   └── versions/
│   ├── app/
│   │   ├── main.py                 # FastAPI entry
│   │   ├── config.py               # pydantic-settings
│   │   ├── db.py                   # SQLAlchemy engine + session
│   │   ├── deps.py                 # Dependency injection
│   │   ├── models/                 # ORM
│   │   │   ├── user.py
│   │   │   ├── email.py
│   │   │   └── classification.py
│   │   ├── schemas/                # Pydantic
│   │   ├── api/
│   │   │   ├── auth.py             # WebAuthn / Passkey
│   │   │   ├── emails.py
│   │   │   └── settings.py
│   │   ├── services/
│   │   │   ├── gmail_client.py     # Gmail API wrapper
│   │   │   ├── email_sync.py       # 背景 sync 邏輯
│   │   │   └── ai_classifier.py    # Claude classification
│   │   ├── ai/
│   │   │   └── prompts/            # System prompts（可版本控制）
│   │   └── workers/
│   │       └── scheduler.py        # APScheduler jobs
│   └── tests/
│
├── frontend/
│   ├── package.json
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   ├── public/
│   │   ├── manifest.json           # PWA manifest
│   │   └── icons/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                # 首頁（dashboard）
│   │   ├── login/
│   │   │   └── page.tsx            # Passkey 登入
│   │   └── inbox/
│   │       └── page.tsx            # Email list
│   ├── components/
│   │   ├── ui/                     # shadcn/ui
│   │   ├── EmailList.tsx
│   │   └── EmailDetail.tsx
│   └── lib/
│       ├── api.ts                  # API client
│       └── auth.ts
│
├── scripts/
│   ├── dev.sh                      # 同時跑 backend + frontend
│   ├── build.sh                    # build frontend、copy 入 backend static
│   ├── install-launchd.sh          # 安裝 macOS service
│   └── backup.sh                   # 每日備份
│
├── deployment/
│   ├── com.kelvin.lifeos.plist     # launchd
│   ├── Caddyfile                   # reverse proxy
│   └── README.md                   # Mac mini 部署指南
│
└── docs/
    ├── architecture.md
    ├── setup-mac-mini.md           # Mac mini 安裝教學
    ├── setup-tailscale.md
    └── features/
        └── 01-email-assistant.md
```

---

## MVP 範圍（Email 智能助手）

### 為咗令 MVP 唔會無底深潭，明確劃線

**MVP 包含**：
- ✅ Gmail OAuth2 登入（單帳戶）
- ✅ 背景每 5 分鐘 fetch 新郵件
- ✅ 儲存到本地 SQLite（subject / from / to / body / received_at）
- ✅ Frontend：inbox 列表、搜尋、睇詳細
- ✅ Claude AI 自動分類（3 個類別開始：**重要 / 一般 / 廣告**），帶 confidence score
- ✅ 用戶可以 confirm / 修正分類
- ✅ Passkey（Face ID / Touch ID）登入
- ✅ Mac mini 部署（launchd + Caddy + Tailscale）
- ✅ PWA 安裝到 iPhone / iPad

**MVP 唔包含**（留俾 Phase 2）：
- ❌ iCloud Mail / IMAP（先做 Gmail）
- ❌ VIP 白名單
- ❌ 發票自動歸檔
- ❌ Reply / send 功能（先做 read-only）
- ❌ 其他模組（Project / Todo / Calendar）

### MVP 開發步驟（建議順序）

**Week 1：基礎設施 + Gmail 連接**
1. 建立 `life-os` repo，scaffold 上面嘅目錄結構
2. Backend：FastAPI hello world、SQLAlchemy + Alembic 初始 migration、user model
3. Frontend：Next.js 14 + Tailwind + shadcn/ui scaffold、首頁、login page
4. Gmail OAuth2 flow（可以參考 Google `google-auth-oauthlib` 範例）
5. 第一次 manual 拉 100 封郵件入 SQLite，確認可行

**Week 2：背景同步 + UI**
1. APScheduler 背景 job：每 5 分鐘 fetch incremental（用 Gmail History API）
2. WebSocket：新郵件 push 通知 frontend
3. Frontend：inbox list、search、detail view
4. Mac mini 本地部署測試（Caddy + launchd）

**Week 3：AI 分類 + Passkey**
1. Claude API 整合：寫 system prompt，每封新 email call Claude haiku 分類
2. 三層信心：>0.85 自動歸類；0.5–0.85 顯示「建議」；<0.5 keep unclassified
3. UI：分類 chip、修正按鈕、修正後 update DB（將來可以用嚟 fine-tune prompt）
4. WebAuthn / Passkey 註冊 + 登入流程
5. Tailscale 設置 + iPhone PWA 安裝測試

**Week 4：穩定性 + 部署文檔**
1. 錯誤處理、retry、log
2. 每日備份 cron job
3. 寫 `setup-mac-mini.md`（一步步點裝）
4. 端到端測試：iPhone → Face ID → 睇 inbox → AI 分類 → 修正

---

## 重要設計決定

### 1. 為咗 local-first，**單用戶系統**
唔需要 multi-tenancy，code 簡單好多。`User` table 仍然存在，但只會有一個 record。

### 2. **同一個 origin** serve 前後端
Build 完 Next.js 之後 export 為 static，由 FastAPI `StaticFiles` serve。咁就：
- 唔需要 CORS 處理
- 一個 Caddy 規則搞掂
- 一個 Tailscale URL 搞掂

### 3. **Claude API 而唔係 self-hosted LLM**
Mac mini（特別係 M2 / M4 base 版）跑本地 LLM 分類郵件會慢同食 RAM。Claude haiku 一個分類大概 $0.0001，1000 封郵件得幾毫子。

### 4. **Email 永遠喺本地儲低**
Gmail API 只係 sync source，本地 SQLite 係 source of truth（包括 AI 分類結果）。咁樣即使 Gmail 掛咗都用得。

### 5. **API key / OAuth secrets 點儲**
- 開發：`.env`（gitignored）
- 部署：macOS Keychain，FastAPI startup 時讀

---

## 部署（Mac mini）

### 一次性設置
```bash
# 1. 安裝必需 tools
brew install uv pnpm caddy sqlcipher
brew install --cask tailscale

# 2. Clone repo
cd ~/Developer
git clone https://github.com/kelvinkhlau/life-os.git
cd life-os

# 3. Backend 依賴
cd backend && uv sync

# 4. Frontend build
cd ../frontend && pnpm install && pnpm build

# 5. 安裝 launchd service
sudo cp deployment/com.kelvin.lifeos.plist /Library/LaunchDaemons/
sudo launchctl load /Library/LaunchDaemons/com.kelvin.lifeos.plist

# 6. 啟動 Caddy
caddy run --config deployment/Caddyfile

# 7. Tailscale up
tailscale up
# 之後 iPhone 上開 Tailscale app、登入同一個帳戶
# 用 https://mac-mini.tail-xxxx.ts.net 訪問
```

### 跨 device 安裝 PWA
1. iPhone Safari 打開 `https://mac-mini.tail-xxxx.ts.net`
2. Share → Add to Home Screen
3. App icon 出現，下次直接撳 icon、Face ID、入到 inbox

---

## 驗收標準（MVP done = 以下全部行得通）

1. ✅ Mac mini 重啟後 service 自動起，瀏覽器開到首頁
2. ✅ iPhone PWA 撳 icon → Face ID 登入 → 5 秒入到 inbox
3. ✅ 新 email 喺 Gmail 收到 5 分鐘內喺 PWA 顯示
4. ✅ AI 自動分類 ≥80% 準確（手動驗 100 封 sample）
5. ✅ 用戶喺 iPad 修正分類，iPhone / MacBook 即時 sync 更新
6. ✅ Tailscale 出街用 4G 都 access 到
7. ✅ Mac mini 重啟後備份檔案完整，可以還原

---

## Phase 1（MVP 之後 8-10 週）

**順序按依賴關係**：
1. **Todo 管理**（簡單、為其他 module 做基礎）
2. **Project 管理**（依賴 Todo）
3. **Idea + Card 系統**
4. **Calendar 同步**（Google Calendar API）
5. **Email VIP 白名單 + 發票歸檔**（升級 MVP 嘅 email module）
6. **AI 助手層**（自然語言 → 分類到正確 module）
7. **備份恢復**完善

## Phase 2（之後 3-4 週）

按你份規劃文檔嘅優先級：
1. 財務消費管理
2. 知識管理系統
3. 廣東話語音輸入
4. 智能日報
5. 隱私安全升級（敏感數據加密、審計 log）

---

## 你而家可以做嘅 next step

1. **GitHub 上新開** `kelvinkhlau/life-os`（public 或 private 都得）
2. **本機裝 Claude Code CLI**（之前討論過 — `npm i -g @anthropic-ai/claude-code` 或 installer），喺 Mac mini 或 MacBook 用
3. **將呢個 plan 文件 copy** 到新 repo 嘅 `docs/plan.md`
4. **開一個新 Claude Code session**，喺 `life-os` repo 度叫我（或者 Claude）按 plan scaffold 整個 repo

---

## 假設 / 需要日後確認

呢啲我冇問你，先做咗合理假設，將來開發過程可以調整：

- **Mac mini 規格**：假設 M-series（M1/M2/M3/M4）、≥16GB RAM、能裝 Tailscale
- **Gmail 帳戶數**：MVP 先支援單個 Gmail 帳戶
- **語言**：UI 用繁體中文（按你打字習慣）
- **時區**：Asia/Hong_Kong
- **AI provider**：Anthropic Claude（你可以用 Max plan 同個 API key）
- **單用戶**：只有你自己用，唔需要 multi-user
