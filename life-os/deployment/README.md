# Mac mini 部署

呢個 folder 入面：

- `com.kelvin.lifeos.plist` — launchd service definition（FastAPI backend），
  由 `scripts/install-launchd.sh` 安裝。`__PROJECT_ROOT__` 會被自動替換。
- `com.kelvin.lifeos.backup.plist` — launchd job，每日 03:30 備份 SQLite database。
  安裝方式見 [`../docs/setup-mac-mini.md`](../docs/setup-mac-mini.md) 嘅「每日備份」section。
- `Caddyfile` — Caddy reverse proxy 配置（記得改 Tailscale hostname）。
  已配置 WebSocket upgrade + security headers。

詳細設置步驟見 [`../docs/setup-mac-mini.md`](../docs/setup-mac-mini.md)。
