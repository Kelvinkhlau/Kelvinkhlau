"""Bank Account model — 銀行賬戶 / 信用卡 / 電子錢包 / 現金。"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class BankAccount(Base):
    """付款帳戶 — 銀行戶口、信用卡、電子錢包、現金等。"""

    __tablename__ = "bank_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    bank: Mapped[str] = mapped_column(String(100), nullable=False)  # 銀行名 / 機構名
    account_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="savings"
    )  # savings / current / credit / ewallet / brokerage / cash / other
    # 子帳戶 — 例如 IB 入面有多個 sub account，parent 係 IB 主戶口（display group only）
    parent_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="HKD")
    balance: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    icon: Mapped[str | None] = mapped_column(String(10), nullable=True)  # emoji icon
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)  # 顯示顏色
    last4: Mapped[str | None] = mapped_column(String(4), nullable=True)  # 卡 / 戶口尾 4 碼
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 信用卡循環週期（P2-13）
    # statement_day：每月結單日（1-31）；due_day：繳費到期日（1-31）
    statement_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    due_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    credit_limit: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
