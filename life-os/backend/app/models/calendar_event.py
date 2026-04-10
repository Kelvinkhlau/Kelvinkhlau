"""CalendarEvent model — Google Calendar 本地副本。"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CalendarEvent(Base):
    """一個 calendar event（source of truth 喺 Google Calendar）。"""

    __tablename__ = "calendar_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )

    # Google Calendar IDs — 防止重複 sync
    google_event_id: Mapped[str] = mapped_column(
        String(200), unique=True, index=True, nullable=False
    )
    google_calendar_id: Mapped[str] = mapped_column(
        String(200), nullable=False, default="primary"
    )

    # Event 內容
    title: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # 時間
    start_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    all_day: Mapped[bool] = mapped_column(default=False, nullable=False)

    # 狀態
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="confirmed"
    )  # confirmed / tentative / cancelled

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_calendar_events_user_start", "user_id", "start_at"),
    )
