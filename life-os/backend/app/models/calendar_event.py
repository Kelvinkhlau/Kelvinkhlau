"""CalendarEvent model — 本地 calendar event 副本（iCloud / local）。"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CalendarEvent(Base):
    """一個 calendar event。

    Source 標識來源（'icloud' / 'local'）。`external_id` + `source` 一齊唯一識別
    一個 sync 過嚟嘅 event：
    - source='icloud' → external_id = iCal UID, external_calendar_id = CalDAV URL
    - source='local'  → external_id = "local-{uuid}"
    """

    __tablename__ = "calendar_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )

    # Source identification
    source: Mapped[str] = mapped_column(
        String(20), nullable=False, default="icloud", index=True
    )  # icloud / local
    external_id: Mapped[str] = mapped_column(
        String(500), unique=True, index=True, nullable=False
    )  # iCal UID for iCloud, "local-{uuid}" for local-only
    external_calendar_id: Mapped[str] = mapped_column(
        String(500), nullable=False, default=""
    )  # CalDAV URL for iCloud, "" for local
    calendar_name: Mapped[str] = mapped_column(
        String(200), nullable=False, default=""
    )  # display name (個人 / 家庭 / etc.)

    # Event 內容
    title: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # 時間
    start_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    all_day: Mapped[bool] = mapped_column(default=False, nullable=False)

    # 分類 + 顏色
    category: Mapped[str] = mapped_column(
        String(20), nullable=False, default="personal"
    )  # personal / work / family / friends / other
    color: Mapped[str] = mapped_column(
        String(20), nullable=False, default="#3b82f6"
    )  # hex color

    # 重複
    recurrence: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # none / daily / weekly / monthly / yearly / weekdays / custom RRULE

    # 可見度 + 忙碌
    visibility: Mapped[str] = mapped_column(
        String(20), nullable=False, default="default"
    )  # default / public / private
    busy: Mapped[bool] = mapped_column(default=True, nullable=False)

    # 提醒（分鐘數，逗號分隔，例如 "10,30"）
    reminders: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Google Meet / 會議連結
    conference_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

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
