"""CalendarEvent API schemas。"""

from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field, field_serializer


class CalendarEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    google_event_id: str
    google_calendar_id: str
    title: str
    description: str | None
    location: str | None
    start_at: datetime
    end_at: datetime
    all_day: bool
    category: str
    color: str
    recurrence: str | None
    visibility: str
    busy: bool
    reminders: str | None
    conference_url: str | None
    status: str
    created_at: datetime
    updated_at: datetime

    @field_serializer("start_at", "end_at", "created_at", "updated_at")
    def _serialize_dt(self, dt: datetime) -> str:
        """強制以 UTC ISO 序列化（DB 存 naive UTC，要俾前端 new Date() 識得當 UTC 解）。"""
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt.isoformat()


class CalendarSyncResult(BaseModel):
    fetched: int
    new: int
    updated: int


class CalendarEventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    location: str | None = None
    start_at: datetime
    end_at: datetime
    all_day: bool = False
    category: str = "personal"
    color: str = "#3b82f6"
    recurrence: str | None = None
    visibility: str = "default"
    busy: bool = True
    reminders: str | None = None


class CalendarEventUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    description: str | None = None
    location: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    all_day: bool | None = None
    category: str | None = None
    color: str | None = None
    recurrence: str | None = None
    visibility: str | None = None
    busy: bool | None = None
    reminders: str | None = None
