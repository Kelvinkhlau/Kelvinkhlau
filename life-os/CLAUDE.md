# CLAUDE.md — life-os project context

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
