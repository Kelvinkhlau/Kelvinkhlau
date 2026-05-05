"""Today API schemas — aggregated daily snapshot。"""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.calendar_event import CalendarEventOut
from app.schemas.todo import TodoOut


class DailyFocusOut(BaseModel):
    """一個 pinned focus item。"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    focus_date: date
    todo_id: int
    position: int
    created_at: datetime
    todo: TodoOut | None = None


class DailyFocusCreate(BaseModel):
    """Pin 一個 todo 到某日。"""

    todo_id: int
    focus_date: date | None = None  # None = today
    position: int | None = None  # None = append to end


class DailyFocusReorder(BaseModel):
    """Reorder focus items（前端 drag-drop 後 send）。"""

    focus_date: date | None = None  # None = today
    focus_ids: list[int] = Field(..., min_length=1)  # 按新順序嘅 id list


class EmailBrief(BaseModel):
    """Today 用嘅簡化 email。"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    subject: str
    sender: str
    received_at: datetime
    snippet: str


class TodayStats(BaseModel):
    """每日小 metrics。"""

    todos_done_today: int = 0
    todos_open_total: int = 0
    todos_overdue: int = 0
    unread_important: int = 0
    events_today: int = 0
    # 連續做嘢 streak（連續幾多日有完成 todo）
    streak_days: int = 0


class TodayResponse(BaseModel):
    """`/api/today` aggregated payload。"""

    today: date
    focuses: list[DailyFocusOut]
    events: list[CalendarEventOut]
    important_emails: list[EmailBrief]
    suggested_todos: list[TodoOut]  # due today + overdue open todos（未 pin）
    stats: TodayStats
