"""PasskeyCredential model — 一個 user 可以有多個 passkey（每部 device 一個）。"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class PasskeyCredential(Base):
    __tablename__ = "passkey_credentials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # WebAuthn credential ID（base64url 編碼）— globally unique
    credential_id: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    # COSE public key（base64url 編碼）
    public_key: Mapped[str] = mapped_column(String, nullable=False)
    sign_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # 用戶幫呢部 device 起嘅名（可選，例如 "Mac mini"、"iPhone"）
    device_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user = relationship("User", backref="passkey_credentials")
