# Feature 01：Email 智能助手（MVP）

## 目標

由 Mac mini 背景拉 Gmail 郵件，存喺本地，用 Claude AI 自動分類，喺 PWA 上俾用戶睇 / 搜尋 / 修正分類。

## 使用流程

1. 用戶喺 PWA 撳「連接 Gmail」
2. OAuth2 同意之後，refresh_token 存喺 SQLite
3. 背景每 5 分鐘 sync 一次
4. 新郵件即時 push 到 PWA（WebSocket）
5. 每封郵件自動歸類為 **重要 / 一般 / 廣告**
6. 用戶可以 confirm / 修正分類

## 數據 model

### `users`
- `gmail_refresh_token` — OAuth2
- `gmail_history_id` — 上次 sync 到邊

### `emails`
- 一行 = 一封 Gmail message
- `gmail_message_id` 唯一 index 防重複

### `email_classifications`
- 一對一 with `emails`
- AI 預測 + confidence + 原因
- 用戶 override（可選）

詳細 schema 見 `backend/app/models/email.py`。

## API 端點

| Method | Path | 功能 |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/auth/gmail/authorize` | 開始 OAuth2 |
| GET | `/api/auth/gmail/callback` | OAuth2 回呼 |
| GET | `/api/emails` | List emails（query: category, limit, offset） |
| GET | `/api/emails/{id}` | Detail |
| PUT | `/api/emails/{id}/category` | 修正分類 |

## AI 分類流程

```
sync_gmail_inbox() → 對每封新 email：
  ├─→ 提取 subject / from / snippet
  ├─→ classify_email() → call Claude haiku
  │      system prompt 喺 backend/app/ai/prompts/classify_email.md
  │      返回 {category, confidence, reason}
  ├─→ 信心 > 0.85：直接歸類
  ├─→ 0.5 - 0.85：標記「建議」（UI 顯示淡色 chip）
  └─→ < 0.5：unclassified（極少數）
```

成本估算：
- Claude haiku 4.5：~$0.0001 / 封
- 每日 100 封：~$0.01 / 日，~$0.30 / 月

## 開發 milestones

### Week 1：基礎 ✅ 完成
- [x] Repo scaffold
- [x] FastAPI hello world
- [x] SQLAlchemy + Alembic 設置
- [x] Email models
- [x] Next.js + Tailwind scaffold
- [x] Inbox page UI
- [x] Alembic 第一個 migration（生成 tables）
- [x] Gmail OAuth2 flow（authorize + callback）
- [x] 手動 sync endpoint `POST /api/emails/sync`
- [x] Frontend 「連接 Gmail」按鈕 + callback page

### Week 2：背景同步 ✅ 完成
- [x] APScheduler job（每 5 min）
- [x] Gmail History API（incremental sync）
- [x] `GmailClient` + `email_sync.sync_for_user()`
- [x] AI classifier（Claude haiku）
- [x] Category filter（`?category=important`）
- [x] WebSocket endpoint 同 frontend connect（real-time push）
- [x] Inbox search / 全文搜尋（subject / sender / snippet / body）
- [x] Email detail page

### Week 3：Auth ✅ 完成
- [x] WebAuthn / Passkey 註冊 + login
- [x] JWT issue
- [x] Protected routes（`current_user` dependency，`/api/emails/*` 全部 gated）
- [x] WebSocket token auth（`?token=<jwt>` query string）
- [ ] JWT refresh（留到 Phase 1）

### Week 4：穩定 + 部署 ✅ 完成
- [x] Email 列表 stats + mark-read + pagination
- [x] 分類「建議」chip（confidence < 0.85 顯示淡色 italic）
- [x] 錯誤處理 + retry（Gmail / Claude API exponential backoff）
- [x] launchd plist + `install-launchd.sh`
- [x] Caddyfile（reverse proxy + WebSocket + security headers）
- [x] Tailscale 設置文檔
- [x] 每日備份：`scripts/backup.sh` + `com.kelvin.lifeos.backup.plist`
- [x] 完整 Mac mini 部署指南 `docs/setup-mac-mini.md`

## 驗收標準

1. ✅ 喺 iPhone PWA 撳 icon → Face ID → 5 秒入到 inbox
2. ✅ 新 email 5 分鐘內喺 PWA 顯示
3. ✅ AI 分類 ≥ 80% 準確（手動驗 100 封 sample）
4. ✅ 用戶喺 iPad 修正分類，iPhone / MacBook 即時同步
5. ✅ Mac mini 重啟後 service 自動 start，data 完整
