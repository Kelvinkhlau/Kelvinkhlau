"""iCloud Calendar sync — 將 iCloud CalDAV events 存入本地 SQLite。

跨所有 sub-calendar（個人、家庭、訂閱嘅生日等）。
Identifier：external_id (iCal UID) 跨 sync 穩定，唔會重複。
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models.calendar_event import CalendarEvent
from app.models.user import User
from app.services.icloud_calendar_client import (
    ICloudCalendarClient,
    ParsedICloudEvent,
)

logger = logging.getLogger(__name__)


def sync_icloud_calendar(
    db: Session,
    user: User,
    days_ahead: int = 60,
) -> dict[str, int]:
    """Sync iCloud CalDAV events 到本地 DB。

    跨所有 sub-calendar 拉。返回 {"fetched": N, "new": N, "updated": N}。
    """
    client = ICloudCalendarClient()
    events = client.list_upcoming_events(days_ahead=days_ahead)

    stats = {"fetched": len(events), "new": 0, "updated": 0}

    for parsed in events:
        existing = (
            db.query(CalendarEvent)
            .filter_by(source="icloud", external_id=parsed.icloud_uid)
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
        "iCloud calendar sync done: fetched=%d new=%d updated=%d",
        stats["fetched"],
        stats["new"],
        stats["updated"],
    )
    return stats


def _create_event(
    db: Session, user_id: int, parsed: ParsedICloudEvent
) -> CalendarEvent:
    event = CalendarEvent(
        user_id=user_id,
        source="icloud",
        external_id=parsed.icloud_uid,
        external_calendar_id=parsed.calendar_url,
        calendar_name=parsed.calendar_name,
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


def _update_event(event: CalendarEvent, parsed: ParsedICloudEvent) -> None:
    event.title = parsed.title
    event.description = parsed.description
    event.location = parsed.location
    event.start_at = parsed.start_at
    event.end_at = parsed.end_at
    event.all_day = parsed.all_day
    event.status = parsed.status
    event.calendar_name = parsed.calendar_name
    event.external_calendar_id = parsed.calendar_url
