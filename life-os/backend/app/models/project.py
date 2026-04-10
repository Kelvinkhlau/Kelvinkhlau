"""Project model — Phase 1 第二個 feature（用嚟 group Todos）。"""

from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class ProjectStatus(StrEnum):
    ACTIVE = "active"
    PAUSED = "paused"
    DONE = "done"
    ARCHIVED = "archived"


class Project(Base):
    """一個 project — 可以裝多個 Todos。"""

    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        String(20),
        default=ProjectStatus.ACTIVE.value,
        nullable=False,
        index=True,
    )
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)  # hex / tailwind token

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    todos: Mapped[list["Todo"]] = relationship(  # noqa: F821
        back_populates="project",
        cascade="save-update, merge",
        passive_deletes=True,
    )
