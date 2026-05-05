"""DailyFocus model — 每日起跑點。

設計原則：
  - 每日「最多幾件要搞掂」嘅 todos pinned 到 Today view
  - 只 link 到 Todo（MVP 簡化 scope — 如果之後要加 events / ideas，用
    polymorphic `Relation` 就夠）
  - (user_id, focus_date, todo_id) unique — 同一個 todo 每日最多 pin 一次
  - CASCADE delete：todo 被刪 → focus 自動清走
  - position：同一日 focus 之間嘅顯示順序（0, 1, 2…）
"""

from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class DailyFocus(Base):
    """Pin 咗嘅 focus item（單日）。"""

    __tablename__ = "daily_focus"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )
    focus_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    todo_id: Mapped[int] = mapped_column(
        ForeignKey("todos.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    # 方便 join query — 唔會 eager load（keep light）
    todo = relationship("Todo")

    __table_args__ = (
        UniqueConstraint(
            "user_id", "focus_date", "todo_id", name="uq_daily_focus_user_date_todo"
        ),
        Index("ix_daily_focus_user_date", "user_id", "focus_date"),
    )
