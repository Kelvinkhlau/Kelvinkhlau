"""Calendar API routes — list + sync + CRUD（盡量同步 Google Calendar，失敗就 local-only）。

Local-first 原則：用戶 create/update/delete 永遠唔會因為 Google API 失敗而 block。
- Google 成功 → google_event_id = Google 嗰邊回傳嘅 ID
- Google 失敗 / 未連接 → google_event_id = "local-{uuid}"（純本機 event）
- 之後手動 Sync 時可以再嘗試 push 上 Google（將來功能）
"""

import logging
import uuid
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select

from app.deps import CurrentUser, DbSession, current_user
from app.models.calendar_event import CalendarEvent
from app.schemas.calendar_event import (
    CalendarEventCreate,
    CalendarEventOut,
    CalendarEventUpdate,
    CalendarSyncResult,
)

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(current_user)])


def _is_local_only(google_event_id: str | None) -> bool:
    """判斷一個 event 係咪 local-only（未同步去 Google）。"""
    return not google_event_id or google_event_id.startswith("local-")


def _new_local_id() -> str:
    return f"local-{uuid.uuid4().hex}"


@router.get("", response_model=list[CalendarEventOut])
async def list_events(
    user: CurrentUser,
    db: DbSession,
    days: int = Query(30, ge=1, le=365, description="顯示未來幾日（無 date_from/date_to 時用）"),
    date_from: date | None = Query(None, description="開始日期"),
    date_to: date | None = Query(None, description="結束日期"),
    limit: int = Query(200, le=500),
) -> list[CalendarEvent]:
    """列出 calendar events — 支援日期範圍或未來 N 日。"""
    if date_from and date_to:
        start = datetime(date_from.year, date_from.month, date_from.day, tzinfo=UTC)
        end = datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=UTC)
    else:
        start = datetime.now(tz=UTC)
        end = start + timedelta(days=days)

    stmt = (
        select(CalendarEvent)
        .where(
            CalendarEvent.user_id == user.id,
            CalendarEvent.start_at >= start,
            CalendarEvent.start_at <= end,
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


def _try_get_calendar_client(user):
    """嘗試攞 CalendarClient — 冇 token 或 init 失敗就回 None（唔 raise）。"""
    if not user.gmail_refresh_token:
        return None
    try:
        from app.services.calendar_client import CalendarClient
        return CalendarClient(user.gmail_refresh_token)
    except Exception as e:
        logger.warning("CalendarClient init failed: %s", e)
        return None


@router.post("", response_model=CalendarEventOut, status_code=201)
async def create_event(
    payload: CalendarEventCreate, user: CurrentUser, db: DbSession
) -> CalendarEvent:
    """建立新 event — 嘗試同步去 Google，失敗就 save local-only。"""
    google_event_id: str | None = None
    google_calendar_id = "primary"
    parsed_status = "confirmed"

    client = _try_get_calendar_client(user)
    if client is not None:
        try:
            parsed = client.create_event(
                title=payload.title,
                start_at=payload.start_at,
                end_at=payload.end_at,
                all_day=payload.all_day,
                description=payload.description,
                location=payload.location,
            )
            google_event_id = parsed.google_event_id
            google_calendar_id = parsed.google_calendar_id
            parsed_status = parsed.status
        except Exception as e:
            logger.warning(
                "Google Calendar create failed (saving locally only): %s", e
            )

    if not google_event_id:
        google_event_id = _new_local_id()

    event = CalendarEvent(
        user_id=user.id,
        google_event_id=google_event_id,
        google_calendar_id=google_calendar_id,
        title=payload.title,
        description=payload.description,
        location=payload.location,
        start_at=payload.start_at,
        end_at=payload.end_at,
        all_day=payload.all_day,
        status=parsed_status,
        category=payload.category,
        color=payload.color,
        recurrence=payload.recurrence,
        visibility=payload.visibility,
        busy=payload.busy,
        reminders=payload.reminders,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.patch("/{event_id}", response_model=CalendarEventOut)
async def update_event(
    event_id: int, payload: CalendarEventUpdate, user: CurrentUser, db: DbSession
) -> CalendarEvent:
    """更新 event — 盡量同步去 Google，失敗就只更新 local。"""
    event = db.get(CalendarEvent, event_id)
    if event is None or event.user_id != user.id:
        raise HTTPException(status_code=404, detail="Event not found")

    # 只有非 local-only event 先嘗試去 Google
    if not _is_local_only(event.google_event_id):
        client = _try_get_calendar_client(user)
        if client is not None:
            try:
                client.update_event(
                    event.google_event_id,
                    title=payload.title,
                    start_at=payload.start_at,
                    end_at=payload.end_at,
                    all_day=payload.all_day,
                    description=payload.description
                    if payload.description is not None
                    else ...,
                    location=payload.location
                    if payload.location is not None
                    else ...,
                )
            except Exception as e:
                logger.warning(
                    "Google Calendar update failed for %s (updating locally only): %s",
                    event.google_event_id,
                    e,
                )

    # 永遠都更新本地
    if payload.title is not None:
        event.title = payload.title
    if payload.description is not None:
        event.description = payload.description
    if payload.location is not None:
        event.location = payload.location
    if payload.start_at is not None:
        event.start_at = payload.start_at
    if payload.end_at is not None:
        event.end_at = payload.end_at
    if payload.all_day is not None:
        event.all_day = payload.all_day
    if payload.category is not None:
        event.category = payload.category
    if payload.color is not None:
        event.color = payload.color
    if payload.recurrence is not None:
        event.recurrence = payload.recurrence
    if payload.visibility is not None:
        event.visibility = payload.visibility
    if payload.busy is not None:
        event.busy = payload.busy
    if payload.reminders is not None:
        event.reminders = payload.reminders
    db.commit()
    db.refresh(event)
    return event


@router.delete("/{event_id}", status_code=204)
async def delete_event(
    event_id: int, user: CurrentUser, db: DbSession
) -> None:
    """刪除 event — 盡量同步刪除 Google，失敗就只刪除 local。"""
    event = db.get(CalendarEvent, event_id)
    if event is None or event.user_id != user.id:
        raise HTTPException(status_code=404, detail="Event not found")

    if not _is_local_only(event.google_event_id):
        client = _try_get_calendar_client(user)
        if client is not None:
            try:
                client.delete_event(event.google_event_id)
            except Exception as e:
                logger.warning(
                    "Google Calendar delete failed for %s (removing locally): %s",
                    event.google_event_id,
                    e,
                )

    db.delete(event)
    db.commit()
