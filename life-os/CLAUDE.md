# CLAUDE.md — life-os project context

> 本檔案俾 Claude Code 自動讀取，記住 project 背景 + 硬性規則。

---

## 🔒 部署 URL 政策（用戶 2026-04-24 核准 — 不得擅自改動）

### 本系統永久 URL

**life-os**：`https://kelvin-moltbotmac-mini.tailba8477.ts.net:9443/`（透過 Caddy → `127.0.0.1:3101` uvicorn）

### 三系統 URL 分配（mini 上共存）

| 系統 | 永久 URL |
|---|---|
| **SignalTech** | `https://kelvin-moltbotmac-mini.tailba8477.ts.net/` |
| **賽馬系統 (HorseRacing)** | `https://kelvin-moltbotmac-mini.tailba8477.ts.net:8443/` |
| **life-os** | `https://kelvin-moltbotmac-mini.tailba8477.ts.net:9443/` |

### 硬性規則

1. 呢三條 URL **係永久固定**，用戶 Kelvin 已正式確認（2026-04-24）。
2. **任何 AI agent / Claude Code session 不得改動** URL、Caddyfile、Tailscale Serve、或任何會影響上述 URL 嘅 infra 設定，**除非再次得到 Kelvin 明確同意**。
3. 若用戶指示要改 URL，必須：
   - **停手**，唔好即刻執行
   - 顯示現時 URL 分配
   - 確認 Kelvin 係咪真係要覆蓋 2026-04-24 決定
   - 得到明確「yes」先動手
4. 規限範圍包括但不限於：
   - CORS allowed origins
   - Cookie `domain` / `SameSite` / `Secure`
   - OAuth redirect URIs（Gmail OAuth、Google Calendar 等）
   - Env vars：`NEXT_PUBLIC_BASE_URL`、`ALLOWED_HOSTS`、`PUBLIC_URL`、frontend API base
   - WebAuthn RP ID / origin
   - launchd plist 嘅 port 設定
   - 任何 reverse proxy 配置

### Infrastructure 依賴（life-os repo 管理 Caddyfile，其他兩個 project 共用）

- **Caddyfile**: `deployment/Caddyfile`（life-os repo 內，但 serve 埋 SignalTech + HorseRacing 嘅 vhost）
- **TLS certs**: `deployment/certs/tailscale.crt` + `tailscale.key`，由 `tailscale cert kelvin-moltbotmac-mini.tailba8477.ts.net` 產生
- **Tailscale Serve**: **必須關閉** (`tailscale serve status` 應顯示「No serve config」)。如果有人用 `tailscale serve ...` 再啟用，會 mask Caddy 嘅 :443 vhost

### 歷史

- **2026-04-24**：移除 Tailscale Serve `/ → :8080` rule + Caddyfile swap — 由「:443 = life-os、:9443 = SignalTech」改為「:443 = SignalTech、:9443 = life-os」。備份喺 `deployment/Caddyfile.bak.<timestamp>`。

---


呢個檔案俾 Claude Code 讀，令 AI assistant 知道個 project 嘅背景。

## Project 簡介

**life-os** 係一個個人生活整合管理系統：
- 喺 Mac mini 上 self-host
- PWA 前端（Next.js）跨 iPhone / iPad / MacBook
- Local-first，所有資料喺本地 SQLite（加密）
- 用 Claude API + OpenAI API 做 AI 分類 / 摘要 / 語音

## 技術棧

- **Backend**: FastAPI + Python 3.11+ + SQLAlchemy 2.0 + Alembic
- **Database**: SQLite (+ SQLCipher 加密)
- **Background**: APScheduler（內嵌 FastAPI）
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
- **State**: TanStack Query + Zustand
- **AI**: Anthropic Claude API（haiku-4-5 / sonnet-4-6）+ OpenAI（GPT-4o / Whisper）
- **Auth**: WebAuthn / Passkey（Face ID / Touch ID）+ JWT
- **Package managers**: `uv`（Python）、`pnpm`（Node）
- **部署**: launchd + Caddy + Tailscale

## 開發原則

1. **Local-first**：所有資料喺本地優先儲存，雲端只做 sync source
2. **單用戶系統**：只有一個 user，唔需要 multi-tenancy
3. **同一個 origin**：FastAPI serve frontend static，避免 CORS
4. **Incremental**：每個 feature 都要 end-to-end 行得通先做下一個
5. **不過度工程化**：MVP 只做核心，高級功能留俾後期
6. **繁體中文 UI**：用戶習慣繁體中文 + 廣東話

## Repo 結構

```
life-os/
├── backend/        FastAPI app
│   ├── app/
│   │   ├── main.py       # entry (15 routers)
│   │   ├── config.py     # pydantic-settings
│   │   ├── db.py         # SQLAlchemy
│   │   ├── models/       # ORM (10 models)
│   │   ├── schemas/      # Pydantic
│   │   ├── api/          # routes (15 modules)
│   │   ├── services/     # 業務邏輯
│   │   ├── ai/           # Claude / OpenAI 封裝
│   │   └── workers/      # APScheduler jobs
│   ├── alembic/    DB migrations (0001-0010)
│   └── tests/      pytest (111+ tests)
├── frontend/       Next.js PWA (19 pages)
├── scripts/        dev / build / install scripts
├── deployment/     launchd / Caddy
└── docs/           plan / architecture / setup
```

## 開發 commands

```bash
# Backend dev server
cd backend && uv run uvicorn app.main:app --reload --port 8000

# Frontend dev server
cd frontend && pnpm dev

# 一齊跑
./scripts/dev.sh

# DB migration
cd backend && uv run alembic revision --autogenerate -m "msg"
cd backend && uv run alembic upgrade head

# 測試
cd backend && uv run pytest
cd frontend && pnpm test
```

## 完成進度

### MVP（Email 智能助手）— 全部完成
- [x] Repo scaffold + FastAPI + SQLAlchemy + Alembic
- [x] Next.js + Tailwind scaffold
- [x] Gmail OAuth2 flow
- [x] Background email sync (APScheduler)
- [x] Email list / detail UI + search + pagination
- [x] Claude AI 分類 + 「建議」chip
- [x] WebAuthn / Passkey 登入 + JWT 保護
- [x] WebSocket real-time push

### Phase 1 — 全部完成
- [x] Todo module（CRUD + priority + due date）
- [x] Project module（group todos、進度追蹤）
- [x] Idea / Card module（快速記 idea、tags、pin/archive）
- [x] Calendar 同步（Google Calendar API readonly sync）
- [x] VIP 白名單（auto-mark important、skip AI）
- [x] AI 助手（自然語言 → 建 todo/idea/project）
- [x] Daily backup（launchd plist）

### Phase 2 — 全部完成
- [x] 財務消費管理（Expense CRUD + 分類統計 + 月度圖表）
- [x] 知識管理系統（Note + folder + tags + search）
- [x] 廣東話語音輸入（OpenAI Whisper API + MediaRecorder）
- [x] 智能日報（彙總 todos/calendar/email/expenses）
- [x] 隱私安全升級（AuditLog + 全操作記錄）

### 系統完善
- [x] Dark mode（三段切換：淺色/深色/跟系統）
- [x] Audit log 整合（login + CRUD 自動記錄）
- [x] 數據匯出（JSON backup endpoint）
- [x] PWA manifest + icons

## API 模組一覽

| Module | Prefix | 功能 |
|--------|--------|------|
| auth | /api/auth | Passkey + Gmail OAuth2 |
| emails | /api/emails | Email CRUD + sync + stats |
| todos | /api/todos | Todo CRUD |
| projects | /api/projects | Project CRUD + todo counts |
| ideas | /api/ideas | Idea CRUD + pin/archive |
| calendar | /api/calendar | Calendar sync + events |
| vip | /api/vip | VIP sender management |
| assistant | /api/assistant | AI chat → actions |
| expenses | /api/expenses | Expense CRUD + stats |
| notes | /api/notes | Note CRUD + folders |
| voice | /api/voice | Whisper transcription |
| report | /api/report | Daily report aggregation |
| audit | /api/audit | Audit log query |
| export | /api/export | Data backup (JSON) |
| ws | /ws | WebSocket real-time |

## 完整計劃

詳見 [`docs/plan.md`](./docs/plan.md)。
