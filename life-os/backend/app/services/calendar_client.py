"""Google Calendar API client wrapper。

用同一個 Google OAuth refresh_token（同 Gmail 共用）。
支援雙向 sync — 讀取 + 建立 / 更新 / 刪除 events。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.config import get_settings
from app.services.gmail_client import _credentials_from_refresh_token
from app.utils.retry import retry_call

logger = logging.getLogger(__name__)


def _gcal_is_transient(exc: BaseException) -> bool:
    if isinstance(exc, HttpError):
        status = getattr(exc.resp, "status", 0) or 0
        return status == 429 or status >= 500
    return True


# Google Calendar colorId → hex 色碼 mapping
GOOGLE_COLOR_MAP: dict[str, str] = {
    "1": "#7986cb",   # Lavender
    "2": "#33b679",   # Sage
    "3": "#8e24aa",   # Grape
    "4": "#e67c73",   # Flamingo
    "5": "#f6bf26",   # Banana
    "6": "#f4511e",   # Tangerine
    "7": "#039be5",   # Peacock
    "8": "#616161",   # Graphite
    "9": "#3f51b5",   # Blueberry
    "10": "#0b8043",  # Basil
    "11": "#d50000",  # Tomato
}


@dataclass
class ParsedEvent:
    """由 Google Calendar API 解析出嚟嘅 event。"""

    google_event_id: str
    google_calendar_id: str
    title: str
    description: str | None
    location: str | None
    start_at: datetime
    end_at: datetime
    all_day: bool
    status: str  # confirmed / tentative / cancelled
    color: str  # hex color
    recurrence: str | None
    visibility: str
    busy: bool
    reminders: str | None  # comma-separated minutes
    conference_url: str | None


class CalendarClient:
    """Google Calendar API wrapper — 用 user 嘅 refresh_token 初始化。"""

    def __init__(self, refresh_token: str):
        creds = _credentials_from_refresh_token(refresh_token)
        self.service = build(
            "calendar", "v3", credentials=creds, cache_discovery=False
        )

    def list_upcoming_events(
        self,
        days_ahead: int = 30,
        calendar_id: str = "primary",
        max_results: int = 200,
    ) -> list[ParsedEvent]:
        """攞未來 N 日嘅 events。"""
        now = datetime.now(tz=UTC)
        time_min = now.isoformat()
        time_max = (now + timedelta(days=days_ahead)).isoformat()

        resp = retry_call(
            lambda: self.service.events()
            .list(
                calendarId=calendar_id,
                timeMin=time_min,
                timeMax=time_max,
                maxResults=max_results,
                singleEvents=True,
                orderBy="startTime",
            )
            .execute(),
            should_retry=_gcal_is_transient,
            label="calendar.events.list",
        )

        events: list[ParsedEvent] = []
        for item in resp.get("items", []):
            parsed = _parse_event(item, calendar_id)
            if parsed:
                events.append(parsed)
        return events

    def create_event(
        self,
        title: str,
        start_at: datetime,
        end_at: datetime,
        *,
        all_day: bool = False,
        description: str | None = None,
        location: str | None = None,
        calendar_id: str = "primary",
    ) -> ParsedEvent:
        """建立新 event 喺 Google Calendar。"""
        body: dict[str, Any] = {"summary": title}
        if description:
            body["description"] = description
        if location:
            body["location"] = location

        if all_day:
            body["start"] = {"date": start_at.strftime("%Y-%m-%d")}
            body["end"] = {"date": end_at.strftime("%Y-%m-%d")}
        else:
            body["start"] = {"dateTime": start_at.isoformat(), "timeZone": "Asia/Hong_Kong"}
            body["end"] = {"dateTime": end_at.isoformat(), "timeZone": "Asia/Hong_Kong"}

        result = retry_call(
            lambda: self.service.events()
            .insert(calendarId=calendar_id, body=body)
            .execute(),
            should_retry=_gcal_is_transient,
            label="calendar.events.insert",
        )
        return _parse_event(result, calendar_id)  # type: ignore[return-value]

    def update_event(
        self,
        google_event_id: str,
        *,
        title: str | None = None,
        start_at: datetime | None = None,
        end_at: datetime | None = None,
        all_day: bool | None = None,
        description: str | None = ...,  # type: ignore[assignment]
        location: str | None = ...,  # type: ignore[assignment]
        calendar_id: str = "primary",
    ) -> ParsedEvent:
        """更新現有 event。只更新提供咗嘅欄位。"""
        # 先攞現有 event
        existing = retry_call(
            lambda: self.service.events()
            .get(calendarId=calendar_id, eventId=google_event_id)
            .execute(),
            should_retry=_gcal_is_transient,
            label="calendar.events.get",
        )

        if title is not None:
            existing["summary"] = title
        if description is not ...:
            existing["description"] = description or ""
        if location is not ...:
            existing["location"] = location or ""

        if start_at is not None or end_at is not None or all_day is not None:
            is_all_day = all_day if all_day is not None else ("date" in existing.get("start", {}))
            s = start_at or datetime.fromisoformat(existing["start"].get("dateTime", existing["start"].get("date", "")))
            e = end_at or datetime.fromisoformat(existing["end"].get("dateTime", existing["end"].get("date", "")))
            if is_all_day:
                existing["start"] = {"date": s.strftime("%Y-%m-%d")}
                existing["end"] = {"date": e.strftime("%Y-%m-%d")}
            else:
                existing["start"] = {"dateTime": s.isoformat(), "timeZone": "Asia/Hong_Kong"}
                existing["end"] = {"dateTime": e.isoformat(), "timeZone": "Asia/Hong_Kong"}

        result = retry_call(
            lambda: self.service.events()
            .update(calendarId=calendar_id, eventId=google_event_id, body=existing)
            .execute(),
            should_retry=_gcal_is_transient,
            label="calendar.events.update",
        )
        return _parse_event(result, calendar_id)  # type: ignore[return-value]

    def delete_event(
        self, google_event_id: str, calendar_id: str = "primary"
    ) -> None:
        """刪除 event。"""
        retry_call(
            lambda: self.service.events()
            .delete(calendarId=calendar_id, eventId=google_event_id)
            .execute(),
            should_retry=_gcal_is_transient,
            label="calendar.events.delete",
        )


def _parse_event(item: dict[str, Any], calendar_id: str) -> ParsedEvent | None:
    """將 Google Calendar API 嘅 raw event 解析成 ParsedEvent。"""
    event_id = item.get("id")
    if not event_id:
        return None

    start_raw = item.get("start", {})
    end_raw = item.get("end", {})

    # All-day events 用 "date"，timed events 用 "dateTime"
    all_day = "date" in start_raw and "dateTime" not in start_raw

    if all_day:
        start_at = datetime.fromisoformat(start_raw["date"]).replace(tzinfo=UTC)
        end_at = datetime.fromisoformat(end_raw.get("date", start_raw["date"])).replace(
            tzinfo=UTC
        )
    else:
        start_str = start_raw.get("dateTime", "")
        end_str = end_raw.get("dateTime", start_str)
        if not start_str:
            return None
        start_at = datetime.fromisoformat(start_str)
        end_at = datetime.fromisoformat(end_str)

    # Color
    color_id = item.get("colorId", "")
    color = GOOGLE_COLOR_MAP.get(color_id, "#3b82f6")

    # Recurrence
    recurrence_list = item.get("recurrence", [])
    recurrence = recurrence_list[0] if recurrence_list else None

    # Visibility
    visibility = item.get("visibility", "default")

    # Busy/Free (transparency: "opaque" = busy, "transparent" = free)
    busy = item.get("transparency", "opaque") != "transparent"

    # Reminders
    reminders_data = item.get("reminders", {})
    reminder_str = None
    if reminders_data.get("useDefault") is False:
        overrides = reminders_data.get("overrides", [])
        if overrides:
            reminder_str = ",".join(str(r.get("minutes", 10)) for r in overrides)

    # Conference URL (Google Meet etc)
    conference_url = None
    conf_data = item.get("conferenceData")
    if conf_data:
        for ep in conf_data.get("entryPoints", []):
            if ep.get("entryPointType") == "video":
                conference_url = ep.get("uri")
                break

    return ParsedEvent(
        google_event_id=event_id,
        google_calendar_id=calendar_id,
        title=item.get("summary", ""),
        description=item.get("description"),
        location=item.get("location"),
        start_at=start_at,
        end_at=end_at,
        all_day=all_day,
        status=item.get("status", "confirmed"),
        color=color,
        recurrence=recurrence,
        visibility=visibility,
        busy=busy,
        reminders=reminder_str,
        conference_url=conference_url,
    )
