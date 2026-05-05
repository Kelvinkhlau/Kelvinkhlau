"""應用設定 — 由 .env 讀取。"""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """全局設定。所有設定透過環境變數或 .env 讀取。"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # 基本
    app_env: str = "development"
    app_host: str = "127.0.0.1"
    app_port: int = 8000
    # Production 時必須 override（至少 32 char）
    app_secret_key: str = Field(
        default="dev-insecure-secret-key-change-in-production-32",
        min_length=32,
    )

    # Database
    database_url: str = "sqlite:///./data/lifeos.db"
    database_encryption_key: str | None = None

    # AI provider — "anthropic"（預設）、"openai"、或 "auto"（anthropic 行先，失敗 fallback openai）
    ai_provider: str = "auto"

    # Anthropic
    anthropic_api_key: str | None = None
    claude_model_fast: str = "claude-haiku-4-5"
    claude_model_smart: str = "claude-sonnet-4-6"

    # OpenAI
    openai_api_key: str | None = None
    openai_model_fast: str = "gpt-4o-mini"
    openai_model_smart: str = "gpt-4o"

    # Gmail OAuth2
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:3100/api/auth/gmail/callback"

    # iCloud Mail (IMAP)
    icloud_email: str | None = None
    icloud_app_password: str | None = None

    # Google Calendar — 額外要 sync 嘅 calendar IDs（逗號分隔）
    extra_calendar_ids: str = ""

    # 用戶
    owner_email: str = "owner@example.com"
    owner_name: str = "Owner"

    # Backend 公開 URL（部署時係 Tailscale URL）
    public_base_url: str = "http://localhost:3100"
    # Frontend URL（static export 同 backend 同一個 origin）
    frontend_url: str = "http://localhost:3100"
    # Dev 用：CORS 允許嘅 origin（逗號分隔），production 唔用 CORS（同 origin）
    cors_origins: str = "http://localhost:3000,http://localhost:3100,http://127.0.0.1:3000,http://127.0.0.1:3100"

    # WebAuthn / Passkey
    # rp_id 必須係 frontend domain（冇 scheme / port），例如 "localhost" 或 "lifeos.tail-xxx.ts.net"
    webauthn_rp_id: str = "localhost"
    webauthn_rp_name: str = "life-os"
    # JWT
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 30  # 30 日

    # Web Push (VAPID) — 用 `python scripts/generate_vapid_keys.py` 產生一次，放喺 .env
    vapid_public_key: str | None = None
    vapid_private_key: str | None = None
    vapid_email: str = "mailto:owner@example.com"

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def data_dir(self) -> Path:
        path = Path(self.database_url.replace("sqlite:///", "")).parent
        path.mkdir(parents=True, exist_ok=True)
        return path


@lru_cache
def get_settings() -> Settings:
    """快取嘅 Settings instance（避免每次重讀 .env）。"""
    return Settings()  # type: ignore[call-arg]
