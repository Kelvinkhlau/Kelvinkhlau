# life-os

個人生活整合管理系統 — 喺 Mac mini 上運作，可以喺 iPhone / iPad / MacBook 上用嘅 PWA。

## 功能（規劃）

### MVP（Email 智能助手）
- Gmail OAuth2 連接 + 背景同步
- 本地 SQLite 儲存（local-first、加密）
- Claude AI 自動分類（重要 / 一般 / 廣告）
- Passkey（Face ID / Touch ID）登入
- PWA 跨 device 體驗

### Phase 1（核心功能）
Email 升級、Project / Todo / Idea / Card / Calendar / AI 助手

### Phase 2（新增功能）
財務消費 / 知識管理 / 廣東話語音 / 智能日報 / 隱私安全

詳見 [`docs/plan.md`](./docs/plan.md)。

## 架構

```
Mac mini (server)
├─ Backend: FastAPI + SQLite + APScheduler
├─ Frontend: Next.js 14 PWA
└─ Tailscale → iPhone / iPad / MacBook
```

技術棧詳情見 [`docs/architecture.md`](./docs/architecture.md)。

## 開發

### Prerequisites
- Python 3.11+
- Node.js 20+ / pnpm
- uv（Python package manager）

### 開機跑起
```bash
# Backend
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
pnpm install
pnpm dev
```

或者一次過：
```bash
./scripts/dev.sh
```

## 部署到 Mac mini

見 [`docs/setup-mac-mini.md`](./docs/setup-mac-mini.md)。

## 目錄結構

```
life-os/
├── backend/        # FastAPI + SQLite
├── frontend/       # Next.js PWA
├── scripts/        # 開發 / 部署 script
├── deployment/     # launchd plist / Caddyfile
└── docs/           # 架構同部署文檔
```
