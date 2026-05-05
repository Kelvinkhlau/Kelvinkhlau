"""Expense model — 消費記錄追蹤。"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Expense(Base):
    """一筆消費記錄。"""

    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )

    txn_type: Mapped[str] = mapped_column(
        String(10), nullable=False, default="expense", index=True,
    )  # "expense" | "income"
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="HKD")
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    subcategory: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    merchant: Mapped[str | None] = mapped_column(String(200), nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    payment_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    spent_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)

    # 來源追蹤 — email 自動提取時填入
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)  # "manual" | "email" | "subscription"
    source_email_id: Mapped[int | None] = mapped_column(
        ForeignKey("emails.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # 多帳本：屬於邊個 ledger（P3-14）
    ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # 自動由 subscription 產生（P3-16）
    subscription_id: Mapped[int | None] = mapped_column(
        ForeignKey("subscriptions.id", ondelete="SET NULL"), nullable=True, index=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
