"""Email-related models: EmailAccount, Email, EmailRule, EmailVIPList."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class EmailAccount(Base):
    __tablename__ = "email_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_type: Mapped[str] = mapped_column(String(32))  # gmail / icloud
    email_address: Mapped[str] = mapped_column(String(200), unique=True)
    access_token: Mapped[Optional[str]] = mapped_column(Text)
    refresh_token: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    emails: Mapped[list["Email"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )


class Email(Base):
    __tablename__ = "emails"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("email_accounts.id", ondelete="CASCADE"), index=True
    )
    external_id: Mapped[str] = mapped_column(String(200), index=True)
    from_email: Mapped[str] = mapped_column(String(300))
    subject: Mapped[Optional[str]] = mapped_column(String(500))
    snippet: Mapped[Optional[str]] = mapped_column(Text)
    body: Mapped[Optional[str]] = mapped_column(Text)

    # Classification
    category: Mapped[Optional[str]] = mapped_column(String(32))  # important/spam/promotional/general
    confidence_score: Mapped[float] = mapped_column(Float, default=0.0)
    ai_suggestion: Mapped[Optional[str]] = mapped_column(String(32))  # keep/delete/review

    # Feedback for learning
    user_feedback: Mapped[Optional[str]] = mapped_column(String(32))  # useful/spam/important
    is_processed: Mapped[bool] = mapped_column(Boolean, default=False)

    # Time
    received_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Archive
    archived_path: Mapped[Optional[str]] = mapped_column(String(500))
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)

    account: Mapped["EmailAccount"] = relationship(back_populates="emails")


class EmailRule(Base):
    __tablename__ = "email_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("email_accounts.id", ondelete="CASCADE"), index=True, nullable=True
    )
    rule_type: Mapped[str] = mapped_column(String(32))  # sender/subject/body
    pattern: Mapped[str] = mapped_column(String(500))
    action: Mapped[str] = mapped_column(String(32))  # delete/archive/tag
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class EmailVIPList(Base):
    __tablename__ = "email_vip_list"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("email_accounts.id", ondelete="CASCADE"), index=True, nullable=True
    )
    sender_email: Mapped[str] = mapped_column(String(300), index=True)
    rule_name: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
