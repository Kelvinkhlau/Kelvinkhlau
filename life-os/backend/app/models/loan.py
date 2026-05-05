"""Loan model — 借貸追蹤（我借出 / 我欠人）。"""

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Loan(Base):
    """一筆借貸記錄。

    direction="lent"：我借出畀人（對方欠我）
    direction="borrowed"：我借入（我欠對方）
    """

    __tablename__ = "loans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )

    direction: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # "lent" | "borrowed"
    counterparty: Mapped[str] = mapped_column(String(200), nullable=False)  # 對方姓名
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="HKD")
    repaid_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)

    started_at: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    due_at: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    settled_at: Mapped[date | None] = mapped_column(Date, nullable=True)

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active", index=True
    )  # "active" | "settled" | "overdue"
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )


class LoanRepayment(Base):
    """還款記錄。"""

    __tablename__ = "loan_repayments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    loan_id: Mapped[int] = mapped_column(
        ForeignKey("loans.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )

    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    paid_at: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
