"""Google Calendar API client wrapper。

用同一個 Google OAuth refresh_token（同 Gmail 共用）。
只做 read-only sync — Google Calendar 係 source of truth。
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
    )
