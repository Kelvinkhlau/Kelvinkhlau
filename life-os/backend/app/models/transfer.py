"""Transfer model — 戶口之間轉賬記錄（包括還卡數）。"""

from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Transfer(Base):
    """戶口轉賬 — 由 from_account 扣數、to_account 加數。

    轉賬唔係消費記錄，唔計入 expense stats / budgets / AI summary。
    兩邊戶口 balance 會自動更新。
    """

    __tablename__ = "transfers"
    __table_args__ = (
        CheckConstraint("from_account_id != to_account_id", name="transfer_diff_accounts"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )

    from_account_id: Mapped[int] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    to_account_id: Mapped[int] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="HKD")

    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    transferred_at: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
