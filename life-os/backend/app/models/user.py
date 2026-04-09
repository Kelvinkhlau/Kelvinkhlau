"""User model — 單用戶系統，但仍然有 user table 為咗將來擴展。"""

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

    # WebAuthn / Passkey credential ID
    passkey_credential_id: Mapped[str | None] = mapped_column(String, nullable=True)
    passkey_public_key: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
