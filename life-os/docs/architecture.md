# 架構文檔

## 設計原則

1. **Local-first**：所有用戶資料喺 Mac mini 本地儲存（SQLite + SQLCipher 加密）。雲端服務（Gmail / Calendar / Claude API）只做 sync source 同 AI 處理，唔會儲低你嘅 personal data。
2. **單用戶系統**：為咗 code 簡單，假設只有一個 user。`User` table 存在但永遠只有一行。
3. **同一個 origin**：Build 完 Next.js export 為 static，由 FastAPI `StaticFiles` serve。咁就唔需要 CORS、一個 Caddy 規則、一個 URL 搞掂。
4. **Incremental development**：每個 feature 都要 end-to-end 行得通先做下一個。MVP 完成之前唔加新嘢。

## 系統圖

```
┌────────────────────────────────────────────────────┐
│                   Mac mini (M-series)               │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  Caddy（reverse proxy + 自動 HTTPS）          │  │
│  └────────────────┬─────────────────────────────┘  │
│                   │                                 │
│  ┌────────────────▼─────────────────────────────┐  │
│  │  FastAPI (uvicorn, port 8000)                │  │
│  │  ┌────────────┐  ┌────────────┐              │  │
│  │  │ /api/*     │  │ /static/*  │              │  │
│  │  │ (REST/WS)  │  │ (Next.js)  │              │  │
│  │  └─────┬──────┘  └────────────┘              │  │
│  │        │                                      │  │
│  │  ┌─────▼──────────────────────────┐          │  │
│  │  │ services/                       │          │  │
│  │  │ ├─ gmail_client.py              │          │  │
│  │  │ ├─ email_sync.py                │          │  │
│  │  │ └─ ai_classifier.py (Claude)    │          │  │
│  │  └─────┬──────────────────────────┘          │  │
│  │        │                                      │  │
│  │  ┌─────▼──────────────────────────┐          │  │
│  │  │ SQLAlchemy ORM                  │          │  │
│  │  └─────┬──────────────────────────┘          │  │
│  └────────┼──────────────────────────────────────┘  │
│           │                                          │
│  ┌────────▼─────────┐    ┌──────────────────────┐  │
│  │ SQLite +         │    │ APScheduler          │  │
│  │ SQLCipher 加密    │    │ (背景每 5 min sync)  │  │
│  └──────────────────┘    └──────────┬───────────┘  │
│                                     │               │
│                          ┌──────────▼──────────┐    │
│                          │ External APIs       │    │
│                          │ ├─ Gmail API        │    │
│                          │ ├─ Claude API       │    │
│                          │ └─ OpenAI Whisper   │    │
│                          └─────────────────────┘    │
│                                                     │
│  launchd → 開機自動 start                            │
│  Tailscale → 安全跨 device VPN                       │
└─────────────────────────────────────────────────────┘
                       ▲
                       │ HTTPS (Tailscale)
        ┌──────────────┼──────────────┐
        │              │              │
   ┌────▼────┐   ┌─────▼────┐   ┌─────▼─────┐
   │ iPhone  │   │   iPad   │   │  MacBook  │
   │  PWA    │   │   PWA    │   │  Browser  │
   └─────────┘   └──────────┘   └───────────┘
```

## Backend layer 分工

| Layer | 責任 |
|---|---|
| `api/` | HTTP routes，只做 request validation 同 response serialization |
| `services/` | 業務邏輯。可以 call 其他 service、access db |
| `models/` | SQLAlchemy ORM models |
| `schemas/` | Pydantic models（API request/response）|
| `ai/` | Claude / OpenAI API 封裝 + system prompts |
| `workers/` | 背景任務（APScheduler jobs）|
| `db.py` | SQLAlchemy engine + session |
| `config.py` | pydantic-settings |

**規則**：
- `api/` 唔好直接 query db，透過 `services/`
- `services/` 唔好 import FastAPI，可以獨立 unit test
- ORM model 放 `models/`、API schema 放 `schemas/`，唔好混用

## Email sync 流程（MVP）

```
APScheduler（每 5 min）
    │
    ▼
sync_gmail_inbox()
    │
    ├─→ 讀 user.gmail_history_id
    │
    ├─→ GmailClient.get_history_since(history_id)
    │   返回 [{message_id, action: added}]
    │
    ├─→ 對每個新 message_id：
    │     ├─→ GmailClient.get_message(id) → 內容
    │     ├─→ Email model 寫 SQLite
    │     ├─→ ai_classifier.classify_email(...) → Claude API
    │     └─→ EmailClassification 寫 SQLite
    │
    ├─→ WebSocket push 通知所有 connected client
    │
    └─→ update user.gmail_history_id = new_history_id
```

## 安全模型

| 威脅 | 對策 |
|---|---|
| 數據洩漏 | SQLite 用 SQLCipher 加密；備份用 age 加密 |
| 公網被攻擊 | 唔開 public port，全部走 Tailscale VPN |
| 帳號被盜 | Passkey（Face ID / Touch ID），唔用密碼 |
| API key 洩漏 | `.env` gitignored；部署時用 macOS Keychain |
| 中間人攻擊 | Tailscale 自動 mTLS；Caddy 自動 HTTPS |
| 用戶 device 失竊 | PWA 每次都要 Face ID；本地 db 加密 |

## 將來會點擴展

每加一個新 module（Project / Todo / Idea / 財務 / 知識管理），架構保持一致：

1. `models/<module>.py` — 加 ORM
2. `schemas/<module>.py` — 加 Pydantic
3. `api/<module>.py` — 加 router
4. `services/<module>_service.py` — 業務邏輯
5. `frontend/app/<module>/page.tsx` — UI
6. Alembic migration

唔需要改現有 module。
