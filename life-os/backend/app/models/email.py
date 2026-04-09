"""Email + classification models。"""

from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class EmailCategory(StrEnum):
    IMPORTANT = "important"
    NORMAL = "normal"
    PROMOTIONAL = "promotional"
    UNCLASSIFIED = "unclassified"


class Email(Base):
    """Email 本地副本（source of truth 喺本地）。"""

    __tablename__ = "emails"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)

    # Gmail message ID — 防止重複 sync
    gmail_message_id: Mapped[str] = mapped_column(
        String(100), unique=True, index=True, nullable=False
    )
    gmail_thread_id: Mapped[str] = mapped_column(String(100), index=True, nullable=False)

    # Email 內容
    subject: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    sender: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    sender_email: Mapped[str] = mapped_column(String(255), index=True, nullable=False, default="")
    recipients: Mapped[str] = mapped_column(Text, nullable=False, default="")  # JSON string
    snippet: Mapped[str] = mapped_column(Text, nullable=False, default="")
    body_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    body_html: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Metadata
    received_at: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    is_read: Mapped[bool] = mapped_column(default=False, nullable=False)
    has_attachment: Mapped[bool] = mapped_column(default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    classification: Mapped["EmailClassification | None"] = relationship(
        back_populates="email", uselist=False, cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_emails_user_received", "user_id", "received_at"),
    )


class EmailClassification(Base):
    """AI 分類結果。"""

    __tablename__ = "email_classifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email_id: Mapped[int] = mapped_column(
        ForeignKey("emails.id", ondelete="CASCADE"), unique=True, nullable=False
    )

    # AI 預測
    ai_category: Mapped[str] = mapped_column(String(50), nullable=False)
    ai_confidence: Mapped[float] = mapped_column(Float, nullable=False)
    ai_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_model: Mapped[str] = mapped_column(String(100), nullable=False)

    # 用戶修正
    user_category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    user_corrected_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    classified_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    email: Mapped[Email] = relationship(back_populates="classification")

    @property
    def final_category(self) -> str:
        """用戶 override 嘅優先，否則用 AI 嘅預測。"""
        return self.user_category or self.ai_category
