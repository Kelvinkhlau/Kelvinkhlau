"""Brokerage Cash Balance model — 證券戶口入面嘅多幣種閒置現金。

一個 brokerage BankAccount 可以同時持有 USD / HKD / CAD / AUD / GBP / JPY... 等多種貨幣
嘅閒置資金。每個 (account_id, currency) 對應一行記錄。
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class BrokerageCashBalance(Base):
    """券商戶口閒置現金 — 一行一個幣種。"""

    __tablename__ = "brokerage_cash_balances"
    __table_args__ = (
        UniqueConstraint("account_id", "currency", name="uq_brokerage_cash_account_currency"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
