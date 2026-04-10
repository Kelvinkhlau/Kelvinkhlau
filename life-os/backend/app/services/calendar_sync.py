"""Calendar sync — 將 Google Calendar events 存入本地 SQLite。"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models.calendar_event import CalendarEvent
from app.models.user import User
from app.services.calendar_client import CalendarClient, ParsedEvent

logger = logging.getLogger(__name__)


def sync_calendar(
    db: Session,
    user: User,
    days_ahead: int = 30,
) -> dict[str, int]:
    """Sync Google Calendar events 到本地 DB。

    返回 {"fetched": N, "new": N, "updated": N}。
    """
    if not user.google_refresh_token:
        raise RuntimeError("Google not connected — 冇 refresh_token")

    client = CalendarClient(user.google_refresh_token)
    events = client.list_upcoming_events(days_ahead=days_ahead)

    stats = {"fetched": len(events), "new": 0, "updated": 0}

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
        "Calendar sync done: fetched=%d new=%d updated=%d",
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
