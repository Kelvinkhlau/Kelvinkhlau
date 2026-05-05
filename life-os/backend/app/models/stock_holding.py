"""Stock Holding model — 證券戶口持倉。

每個 row 代表一隻股票（symbol）喺一個 brokerage account 入面嘅持有量。
Quote 會由 background scheduler 自動 refresh，更新 last_price + last_price_at。
Account 嘅 `balance` 會即時同步 = sum(quantity × last_price)。
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class StockHolding(Base):
    """單一持倉記錄 — 一個 BankAccount(brokerage) 可以有多個 holding。"""

    __tablename__ = "stock_holdings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # Yahoo Finance symbol — 例如 "0700.HK", "AAPL", "VOO"
    symbol: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    quantity: Mapped[float] = mapped_column(Numeric(18, 6), nullable=False, default=0)
    avg_cost: Mapped[float | None] = mapped_column(Numeric(18, 6), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="HKD")

    last_price: Mapped[float | None] = mapped_column(Numeric(18, 6), nullable=True)
    last_price_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    account = relationship("BankAccount", backref="stock_holdings")
