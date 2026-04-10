# CLAUDE.md — life-os project context

呢個檔案俾 Claude Code 讀，令 AI assistant 知道個 project 嘅背景。

## Project 簡介

**life-os** 係一個個人生活整合管理系統：
- 喺 Mac mini 上 self-host
- PWA 前端（Next.js）跨 iPhone / iPad / MacBook
- Local-first，所有資料喺本地 SQLite（加密）
- 用 Claude API 做 AI 分類 / 摘要

## 技術棧

- **Backend**: FastAPI + Python 3.11+ + SQLAlchemy 2.0 + Alembic
- **Database**: SQLite (+ SQLCipher 加密)
- **Background**: APScheduler（內嵌 FastAPI）
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
- **State**: TanStack Query + Zustand
- **AI**: Anthropic Claude API（haiku-4-5 / sonnet-4-6）+ OpenAI Whisper（語音）
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
│   │   ├── main.py       # entry
│   │   ├── config.py     # pydantic-settings
│   │   ├── db.py         # SQLAlchemy
│   │   ├── models/       # ORM
│   │   ├── schemas/      # Pydantic
│   │   ├── api/          # routes
│   │   ├── services/     # 業務邏輯
│   │   ├── ai/           # Claude 封裝
│   │   └── workers/      # APScheduler jobs
│   └── alembic/    DB migrations
├── frontend/       Next.js PWA
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

## MVP 進度（Email 智能助手）

- [x] Repo scaffold
- [x] FastAPI hello world
- [x] SQLAlchemy + Alembic 初始 migration
- [x] Next.js + Tailwind scaffold
- [x] Gmail OAuth2 flow
- [x] Background email sync (APScheduler)
- [x] Email list / detail UI + search + pagination
- [x] Claude AI 分類 + 「建議」chip
- [x] WebAuthn / Passkey 登入 + JWT 保護
- [x] WebSocket real-time push
- [x] Todo module（bonus）
- [x] Project module（group todos、進度追蹤）
- [x] Idea / Card module（快速記 idea、tags、pin/archive）
- [x] Daily backup（launchd plist）
- [x] Mac mini 部署 (launchd + Caddy + Tailscale) 文檔

## 完整計劃

詳見 [`docs/plan.md`](./docs/plan.md)。
