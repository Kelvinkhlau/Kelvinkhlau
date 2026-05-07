"""Calendar API routes — list + sync + CRUD（iCloud CalDAV backend）。

Local-first 原則：用戶 create/update/delete 永遠唔會因為 iCloud API 失敗而 block。
- iCloud 成功 → external_id = iCal UID，source = "icloud"
- iCloud 失敗 / 未設定 → external_id = "local-{uuid}"，source = "local"
- 之後手動 Sync 時可以再嘗試 push 上 iCloud（將來功能）
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


def _is_local_only(source: str | None, external_id: str | None) -> bool:
    return source == "local" or (external_id or "").startswith("local-")


def _new_local_id() -> str:
    return f"local-{uuid.uuid4().hex}"


def _try_get_icloud_client():
    """嘗試攞 ICloudCalendarClient — 設定缺失就回 None。"""
    try:
        from app.services.icloud_calendar_client import ICloudCalendarClient
        return ICloudCalendarClient()
    except RuntimeError as e:
        logger.warning("iCloud client init failed: %s", e)
        return None


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
    days: int = Query(60, ge=1, le=365),
) -> dict[str, int]:
    """手動 trigger iCloud calendar sync。"""
    from app.services.icloud_calendar_sync import sync_icloud_calendar

    try:
        return sync_icloud_calendar(db, user, days_ahead=days)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"iCloud calendar sync failed: {e}"
        ) from e


@router.get("/calendars")
async def list_icloud_calendars(user: CurrentUser):
    """列出 iCloud sub-calendars (個人 / 家庭 / 訂閱等)。"""
    client = _try_get_icloud_client()
    if client is None:
        raise HTTPException(status_code=400, detail="iCloud 未設定")
    try:
        cals = client.list_calendars()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"iCloud 連接失敗: {e}") from e
    return [{"name": c.name, "url": c.url} for c in cals]


@router.post("", response_model=CalendarEventOut, status_code=201)
async def create_event(
    payload: CalendarEventCreate, user: CurrentUser, db: DbSession
) -> CalendarEvent:
    """建立新 event — 嘗試同步去 iCloud，失敗就 save local-only。"""
    external_id: str | None = None
    external_calendar_id = ""
    calendar_name = ""
    source = "local"
    parsed_status = "confirmed"

    client = _try_get_icloud_client()
    if client is not None:
        try:
            cals = client.list_calendars()
            # 揀 default calendar — 通常係「個人」或第一個（命名啦 Apple）
            target = next(
                (c for c in cals if "個人" in c.name or "Personal" in c.name.lower()),
                cals[0] if cals else None,
            )
            if target is None:
                raise RuntimeError("冇 iCloud calendar")
            parsed = client.create_event(
                calendar_url=target.url,
                title=payload.title,
                start_at=payload.start_at,
                end_at=payload.end_at,
                all_day=payload.all_day,
                description=payload.description,
                location=payload.location,
            )
            external_id = parsed.icloud_uid
            external_calendar_id = parsed.calendar_url
            calendar_name = parsed.calendar_name
            source = "icloud"
            parsed_status = parsed.status
        except Exception as e:
            logger.warning(
                "iCloud calendar create failed (saving locally only): %s", e
            )

    if not external_id:
        external_id = _new_local_id()

    event = CalendarEvent(
        user_id=user.id,
        source=source,
        external_id=external_id,
        external_calendar_id=external_calendar_id,
        calendar_name=calendar_name,
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
    """更新 event — local-only 直接更新；iCloud 嘅暫只更新 local（push 去 iCloud 留 future feature）。"""
    event = db.get(CalendarEvent, event_id)
    if event is None or event.user_id != user.id:
        raise HTTPException(status_code=404, detail="Event not found")

    # TODO: implement iCloud push update via caldav (next iteration)

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
async def delete_event(event_id: int, user: CurrentUser, db: DbSession) -> None:
    """刪除 event — iCloud event 同時 push delete，local 純 DB 刪除。"""
    event = db.get(CalendarEvent, event_id)
    if event is None or event.user_id != user.id:
        raise HTTPException(status_code=404, detail="Event not found")

    if event.source == "icloud" and not _is_local_only(event.source, event.external_id):
        client = _try_get_icloud_client()
        if client is not None:
            try:
                client.delete_event(event.external_calendar_id, event.external_id)
            except Exception as e:
                logger.warning(
                    "iCloud delete failed for %s (removing locally): %s",
                    event.external_id, e,
                )

    db.delete(event)
    db.commit()
