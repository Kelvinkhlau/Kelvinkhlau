"""Calendar API routes — read-only list + manual sync。"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select

from app.deps import CurrentUser, DbSession, current_user
from app.models.calendar_event import CalendarEvent
from app.schemas.calendar_event import CalendarEventOut, CalendarSyncResult

router = APIRouter(dependencies=[Depends(current_user)])


@router.get("", response_model=list[CalendarEventOut])
async def list_events(
    user: CurrentUser,
    db: DbSession,
    days: int = Query(30, ge=1, le=365, description="顯示未來幾日"),
    limit: int = Query(200, le=500),
) -> list[CalendarEvent]:
    """列出未來 N 日嘅 calendar events。"""
    now = datetime.now(tz=UTC)
    until = now + timedelta(days=days)
    stmt = (
        select(CalendarEvent)
        .where(
            CalendarEvent.user_id == user.id,
            CalendarEvent.start_at >= now,
            CalendarEvent.start_at <= until,
            CalendarEvent.status != "cancelled",
        )
        .order_by(CalendarEvent.start_at)
        .limit(limit)
    )
    return list(db.execute(stmt).scalars().all())


@router.get("/today", response_model=list[CalendarEventOut])
async def today_events(
    user: CurrentUser,
    db: DbSession,
) -> list[CalendarEvent]:
    """只列今日嘅 events。"""
    now = datetime.now(tz=UTC)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)
    stmt = (
        select(CalendarEvent)
        .where(
            CalendarEvent.user_id == user.id,
            CalendarEvent.start_at >= start_of_day,
            CalendarEvent.start_at < end_of_day,
            CalendarEvent.status != "cancelled",
        )
        .order_by(CalendarEvent.start_at)
    )
    return list(db.execute(stmt).scalars().all())


@router.post("/sync", response_model=CalendarSyncResult)
async def trigger_sync(
    user: CurrentUser,
    db: DbSession,
    days: int = Query(30, ge=1, le=365),
) -> dict[str, int]:
    """手動 trigger calendar sync（用 user 嘅 Google OAuth token）。"""
    from app.services.calendar_sync import sync_calendar

    try:
        return sync_calendar(db, user, days_ahead=days)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"Calendar sync failed: {e}"
        ) from e
