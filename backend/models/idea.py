"""Idea model — captured inspirations that can convert into tasks."""

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class Idea(Base):
    __tablename__ = "ideas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)

    # Associations
    project_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), index=True, nullable=True
    )
    sub_project_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("sub_projects.id", ondelete="SET NULL"), index=True, nullable=True
    )

    # Tags (comma-separated, e.g. "#feature,#design")
    tags: Mapped[Optional[str]] = mapped_column(String(500))

    # Lifecycle
    status: Mapped[str] = mapped_column(String(32), default="new")  # new/in_use/used/deleted

    # Attachments (JSON-encoded list of paths)
    attachments: Mapped[Optional[str]] = mapped_column(Text)

    # Conversion tracking
    converted_task_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
