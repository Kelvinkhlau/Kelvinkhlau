"""Family member model — 分帳用嘅家庭/朋友成員。"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class FamilyMember(Base):
    """一個成員（家人、伴侶、朋友），用嚟分帳。"""

    __tablename__ = "family_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    relation: Mapped[str | None] = mapped_column(String(50), nullable=True)  # 配偶 / 子女 / 朋友
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )


class ExpenseSplit(Base):
    """一筆 Expense 嘅分帳記錄。

    同一 expense 可以有多條 split，每條表示某個成員（包括 user 自己）嘅分攤額。
    """

    __tablename__ = "expense_splits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    expense_id: Mapped[int] = mapped_column(
        ForeignKey("expenses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # member_id NULL = user 自己
    member_id: Mapped[int | None] = mapped_column(
        ForeignKey("family_members.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    is_paid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # 對方還咗未（只針對非 user 嘅 split）

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
