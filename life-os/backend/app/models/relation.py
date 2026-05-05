"""Relation model — polymorphic 跨模組連結。

設計：
- 任何兩個 entity（email / todo / note / idea / project / event / expense）
  都可以互相 link
- 關係方向性：source → target，但 API 層會「雙向查詢」（無論係 source 定 target，
  都會返到相關連結）
- 單一 user 系統：user_id 直接屬於 Relation（唔繼承 source entity）
- 去重：(source_type, source_id, target_type, target_id) 加 unique constraint
- 刪除：entity 被刪時，用戶應用層 cascade 清 relation（小系統唔值得用 polymorphic
  FK），如果 relation 指向唔存在嘅 entity，API 會 skip 唔 expand

支援嘅 entity type：
- "email", "todo", "note", "idea", "project", "event", "expense"
"""

from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

# 支援嘅 entity type — keep in sync with RELATION_ENTITY_TYPES in api/relations.py
RELATION_ENTITY_TYPES: frozenset[str] = frozenset(
    {"email", "todo", "note", "idea", "project", "event", "expense"}
)


class Relation(Base):
    """兩個 entity 之間嘅 link。"""

    __tablename__ = "relations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )

    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_id: Mapped[int] = mapped_column(Integer, nullable=False)

    target_type: Mapped[str] = mapped_column(String(32), nullable=False)
    target_id: Mapped[int] = mapped_column(Integer, nullable=False)

    # 關係類型（optional label）— 例如 "extracted-from" / "references" / "related"
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="related")

    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "source_type",
            "source_id",
            "target_type",
            "target_id",
            name="uq_relation_source_target",
        ),
        Index(
            "ix_relation_source_lookup",
            "user_id",
            "source_type",
            "source_id",
        ),
        Index(
            "ix_relation_target_lookup",
            "user_id",
            "target_type",
            "target_id",
        ),
    )
