"""Task (Todo) model."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class Task(Base):
    __tablename__ = "tasks"

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
    parent_task_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), index=True, nullable=True
    )

    # Priority
    priority: Mapped[str] = mapped_column(String(16), default="medium")  # high/medium/low
    ai_priority_score: Mapped[float] = mapped_column(Float, default=0.0)

    # Time
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime)
    scheduled_date: Mapped[Optional[datetime]] = mapped_column(DateTime)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    # Progress
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending/in_progress/completed
    progress: Mapped[float] = mapped_column(Float, default=0.0)

    # AI metadata
    is_subtask: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_suggestion: Mapped[Optional[str]] = mapped_column(Text)

    # Postpone tracking
    postpone_count: Mapped[int] = mapped_column(Integer, default=0)
    last_postponed: Mapped[Optional[datetime]] = mapped_column(DateTime)

    # Tags (comma-separated)
    tags: Mapped[Optional[str]] = mapped_column(String(500))
