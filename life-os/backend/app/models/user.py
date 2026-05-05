"""User model — 單用戶系統，但仍然有 user table 為咗將來擴展。

Passkey credentials 而家獨立成 PasskeyCredential table — 一個 user 可以有多個 device。
"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    # Gmail OAuth2 token (refresh token，access token 喺 memory)
    gmail_refresh_token: Mapped[str | None] = mapped_column(String, nullable=True)
    gmail_history_id: Mapped[str | None] = mapped_column(String, nullable=True)

    # ─── E2E Encryption master password metadata ────────────────────────
    # 第一次 set master password 時產生，後續驗證就用呢兩條嘢。
    # Password 本身永遠唔會 send 去 server（E2E）。
    encryption_salt: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 已知明文「lifeos-verify-v1」用 derived key encrypt 嘅結果
    # Client 解密成功 = password 啱
    encryption_verifier: Mapped[str | None] = mapped_column(String(255), nullable=True)
    encryption_verifier_iv: Mapped[str | None] = mapped_column(
        String(32), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
