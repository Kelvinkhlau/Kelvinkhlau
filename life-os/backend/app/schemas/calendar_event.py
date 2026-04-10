"""CalendarEvent API schemas。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


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
    status: str
    created_at: datetime
    updated_at: datetime


class CalendarSyncResult(BaseModel):
    fetched: int
    new: int
    updated: int
