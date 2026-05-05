"""Calendar sync — 將 Google Calendar events 存入本地 SQLite。"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.calendar_event import CalendarEvent
from app.models.user import User
from app.services.calendar_client import CalendarClient, ParsedEvent

logger = logging.getLogger(__name__)


def _get_calendar_ids() -> list[str]:
    """返回要 sync 嘅所有 calendar IDs（primary + 額外嘅）。"""
    settings = get_settings()
    ids = ["primary"]
    if settings.extra_calendar_ids:
        for cid in settings.extra_calendar_ids.split(","):
            cid = cid.strip()
            if cid and cid not in ids:
                ids.append(cid)
    return ids


def sync_calendar(
    db: Session,
    user: User,
    days_ahead: int = 30,
) -> dict[str, int]:
    """Sync Google Calendar events 到本地 DB。

    會 sync primary calendar + config 入面嘅 extra_calendar_ids。
    返回 {"fetched": N, "new": N, "updated": N}。
    """
    if not user.gmail_refresh_token:
        raise RuntimeError("Google not connected — 冇 refresh_token")

    client = CalendarClient(user.gmail_refresh_token)
    calendar_ids = _get_calendar_ids()

    stats = {"fetched": 0, "new": 0, "updated": 0}

    for cal_id in calendar_ids:
        try:
            events = client.list_upcoming_events(
                days_ahead=days_ahead, calendar_id=cal_id
            )
        except Exception as e:
            logger.warning("Failed to sync calendar %s: %s", cal_id, e)
            continue

        stats["fetched"] += len(events)

        for parsed in events:
            existing = (
                db.query(CalendarEvent)
                .filter_by(google_event_id=parsed.google_event_id)
                .first()
            )

            if existing:
                _update_event(existing, parsed)
                stats["updated"] += 1
            else:
                _create_event(db, user.id, parsed)
                stats["new"] += 1

    db.commit()
    logger.info(
        "Calendar sync done (%d calendars): fetched=%d new=%d updated=%d",
        len(calendar_ids),
        stats["fetched"],
        stats["new"],
        stats["updated"],
    )
    return stats


def _create_event(db: Session, user_id: int, parsed: ParsedEvent) -> CalendarEvent:
    event = CalendarEvent(
        user_id=user_id,
        google_event_id=parsed.google_event_id,
        google_calendar_id=parsed.google_calendar_id,
        title=parsed.title,
        description=parsed.description,
        location=parsed.location,
        start_at=parsed.start_at,
        end_at=parsed.end_at,
        all_day=parsed.all_day,
        status=parsed.status,
        color=parsed.color,
        recurrence=parsed.recurrence,
        visibility=parsed.visibility,
        busy=parsed.busy,
        reminders=parsed.reminders,
        conference_url=parsed.conference_url,
    )
    db.add(event)
    return event


def _update_event(event: CalendarEvent, parsed: ParsedEvent) -> None:
    event.title = parsed.title
    event.description = parsed.description
    event.location = parsed.location
    event.start_at = parsed.start_at
    event.end_at = parsed.end_at
    event.all_day = parsed.all_day
    event.status = parsed.status
    event.color = parsed.color
    event.recurrence = parsed.recurrence
    event.visibility = parsed.visibility
    event.busy = parsed.busy
    event.reminders = parsed.reminders
    event.conference_url = parsed.conference_url
