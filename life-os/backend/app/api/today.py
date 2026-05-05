"""Today API — 每日起跑點 aggregated snapshot。

Endpoints:
  GET    /api/today?focus_date=YYYY-MM-DD
           → TodayResponse: focuses + events + important emails + stats
  POST   /api/today/focus
           → Pin 一個 todo 到某日
  DELETE /api/today/focus/{focus_id}
           → Unpin
  POST   /api/today/focus/reorder
           → Reorder focus items（drag-drop）

設計：
  - focus_date 預設今日（user local date — 用 server date 簡化 MVP）
  - focuses 同 position 排序
  - suggested_todos = 未 pin + open + (overdue OR due today)
  - important_emails = 最新未讀、category=important、未 archive / 未 deleted
  - streak_days：連續幾多日有完成 todo（睇 completed_at）
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, select

from app.deps import CurrentUser, DbSession, current_user
from app.models.calendar_event import CalendarEvent
from app.models.daily_focus import DailyFocus
from app.models.email import Email, EmailClassification
from app.models.todo import Todo
from app.schemas.calendar_event import CalendarEventOut
from app.schemas.todo import TodoOut
from app.schemas.today import (
    DailyFocusCreate,
    DailyFocusOut,
    DailyFocusReorder,
    EmailBrief,
    TodayResponse,
    TodayStats,
)

router = APIRouter(dependencies=[Depends(current_user)])


def _today() -> date:
    return datetime.now().date()


def _day_bounds(d: date) -> tuple[datetime, datetime]:
    """該日 [00:00, 翌日 00:00)。"""
    start = datetime.combine(d, datetime.min.time())
    end = start + timedelta(days=1)
    return start, end


def _compute_streak(db, user_id: int, today: date) -> int:
    """連續完成日數 — 由今日（或最近一日有完成）向前數。"""
    # 拎過去 60 日每日完成 count
    since = datetime.combine(today - timedelta(days=60), datetime.min.time())
    rows = db.execute(
        select(func.date(Todo.completed_at).label("d"), func.count(Todo.id))
        .where(
            Todo.user_id == user_id,
            Todo.completed_at.is_not(None),
            Todo.completed_at >= since,
        )
        .group_by("d")
    ).all()
    days_with_work = {row[0] for row in rows if row[0]}
    # 同 SQLAlchemy/SQLite 之間 row[0] 可能係 str — normalize 成 date
    normalized: set[date] = set()
    for d in days_with_work:
        if isinstance(d, date):
            normalized.add(d)
        elif isinstance(d, str):
            try:
                normalized.add(date.fromisoformat(d))
            except ValueError:
                continue

    # 由今日向前數 — 容忍「今日仲未做嘢」（由最近一日有做起計）
    streak = 0
    cursor = today
    if cursor not in normalized:
        # 如果今日冇做，由噚日起
        cursor -= timedelta(days=1)
    while cursor in normalized:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _focus_with_todo(fr: DailyFocus) -> DailyFocusOut:
    return DailyFocusOut(
        id=fr.id,
        focus_date=fr.focus_date,
        todo_id=fr.todo_id,
        position=fr.position,
        created_at=fr.created_at,
        todo=TodoOut.model_validate(fr.todo) if fr.todo else None,
    )


@router.get("", response_model=TodayResponse)
async def get_today(
    user: CurrentUser,
    db: DbSession,
    focus_date: date | None = Query(None, description="預設今日"),
) -> TodayResponse:
    """聚合每日 snapshot。"""
    day = focus_date or _today()
    day_start, day_end = _day_bounds(day)

    # ─ Focuses (eager load todo) ──────────────────────────────
    focus_rows = (
        db.execute(
            select(DailyFocus)
            .where(
                DailyFocus.user_id == user.id,
                DailyFocus.focus_date == day,
            )
            .order_by(DailyFocus.position.asc(), DailyFocus.id.asc())
        )
        .scalars()
        .all()
    )
    # 清走 dangling focus（如果 todo 已經被刪但 CASCADE 冇 trigger — 例如
    # SQLite 冇著 FK pragma）
    live_focuses: list[DailyFocus] = []
    for fr in focus_rows:
        if fr.todo is None:
            db.delete(fr)
        else:
            live_focuses.append(fr)
    if len(live_focuses) != len(focus_rows):
        db.commit()

    focuses = [_focus_with_todo(fr) for fr in live_focuses]
    pinned_todo_ids = {fr.todo_id for fr in live_focuses}

    # ─ Events today ──────────────────────────────────────────
    event_rows = (
        db.execute(
            select(CalendarEvent)
            .where(
                CalendarEvent.user_id == user.id,
                CalendarEvent.start_at < day_end,
                CalendarEvent.end_at > day_start,
                CalendarEvent.status != "cancelled",
            )
            .order_by(CalendarEvent.start_at.asc())
        )
        .scalars()
        .all()
    )
    events = [CalendarEventOut.model_validate(e) for e in event_rows]

    # ─ Unread important emails ───────────────────────────────
    email_rows = (
        db.execute(
            select(Email)
            .join(EmailClassification, EmailClassification.email_id == Email.id)
            .where(
                Email.user_id == user.id,
                Email.is_read.is_(False),
                Email.is_archived.is_(False),
                Email.deleted_at.is_(None),
                EmailClassification.ai_category == "important",
            )
            .order_by(Email.received_at.desc())
            .limit(10)
        )
        .scalars()
        .all()
    )
    important_emails = [
        EmailBrief(
            id=e.id,
            subject=e.subject or "(無主題)",
            sender=e.sender or "",
            received_at=e.received_at,
            snippet=e.snippet or "",
        )
        for e in email_rows
    ]

    # ─ Suggested todos (due today or overdue, open, not pinned) ─
    now = datetime.now()
    suggested_rows = (
        db.execute(
            select(Todo)
            .where(
                Todo.user_id == user.id,
                Todo.done.is_(False),
                Todo.due_at.is_not(None),
                Todo.due_at < day_end,  # due today or earlier
            )
            .order_by(Todo.due_at.asc())
            .limit(20)
        )
        .scalars()
        .all()
    )
    suggested_todos = [
        TodoOut.model_validate(t) for t in suggested_rows if t.id not in pinned_todo_ids
    ][:10]

    # ─ Stats ─────────────────────────────────────────────────
    todos_done_today = db.execute(
        select(func.count(Todo.id)).where(
            Todo.user_id == user.id,
            Todo.completed_at.is_not(None),
            Todo.completed_at >= day_start,
            Todo.completed_at < day_end,
        )
    ).scalar_one()
    todos_open_total = db.execute(
        select(func.count(Todo.id)).where(
            Todo.user_id == user.id,
            Todo.done.is_(False),
        )
    ).scalar_one()
    todos_overdue = db.execute(
        select(func.count(Todo.id)).where(
            Todo.user_id == user.id,
            Todo.done.is_(False),
            Todo.due_at.is_not(None),
            Todo.due_at < day_start,
        )
    ).scalar_one()
    unread_important = db.execute(
        select(func.count(Email.id))
        .join(EmailClassification, EmailClassification.email_id == Email.id)
        .where(
            Email.user_id == user.id,
            Email.is_read.is_(False),
            Email.is_archived.is_(False),
            Email.deleted_at.is_(None),
            EmailClassification.ai_category == "important",
        )
    ).scalar_one()
    streak_days = _compute_streak(db, user.id, day)

    stats = TodayStats(
        todos_done_today=int(todos_done_today or 0),
        todos_open_total=int(todos_open_total or 0),
        todos_overdue=int(todos_overdue or 0),
        unread_important=int(unread_important or 0),
        events_today=len(events),
        streak_days=streak_days,
    )

    return TodayResponse(
        today=day,
        focuses=focuses,
        events=events,
        important_emails=important_emails,
        suggested_todos=suggested_todos,
        stats=stats,
    )


@router.post("/focus", response_model=DailyFocusOut)
async def add_focus(
    payload: DailyFocusCreate,
    user: CurrentUser,
    db: DbSession,
) -> DailyFocusOut:
    """Pin 一個 todo 到某日。"""
    day = payload.focus_date or _today()

    # 驗證 todo 屬 user
    todo = db.get(Todo, payload.todo_id)
    if todo is None or todo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Todo not found")

    # Dedupe — 已經 pin 咗就 return 返個
    existing = db.execute(
        select(DailyFocus).where(
            DailyFocus.user_id == user.id,
            DailyFocus.focus_date == day,
            DailyFocus.todo_id == payload.todo_id,
        )
    ).scalar_one_or_none()
    if existing is not None:
        existing.todo = todo  # 確保 eager
        return _focus_with_todo(existing)

    # Position — 如果冇俾，append 到最後
    if payload.position is None:
        max_pos = db.execute(
            select(func.max(DailyFocus.position)).where(
                DailyFocus.user_id == user.id,
                DailyFocus.focus_date == day,
            )
        ).scalar()
        position = (int(max_pos) + 1) if max_pos is not None else 0
    else:
        position = payload.position

    fr = DailyFocus(
        user_id=user.id,
        focus_date=day,
        todo_id=payload.todo_id,
        position=position,
    )
    db.add(fr)
    db.commit()
    db.refresh(fr)
    fr.todo = todo
    return _focus_with_todo(fr)


@router.delete("/focus/{focus_id}", status_code=204)
async def remove_focus(
    focus_id: int,
    user: CurrentUser,
    db: DbSession,
) -> None:
    """Unpin。"""
    fr = db.get(DailyFocus, focus_id)
    if fr is None or fr.user_id != user.id:
        raise HTTPException(status_code=404, detail="Focus not found")
    db.delete(fr)
    db.commit()


@router.post("/focus/reorder", response_model=list[DailyFocusOut])
async def reorder_focus(
    payload: DailyFocusReorder,
    user: CurrentUser,
    db: DbSession,
) -> list[DailyFocusOut]:
    """Drag-drop reorder — 客戶端送整個新 order 嘅 focus_ids。"""
    day = payload.focus_date or _today()

    rows = (
        db.execute(
            select(DailyFocus).where(
                DailyFocus.user_id == user.id,
                DailyFocus.focus_date == day,
                DailyFocus.id.in_(payload.focus_ids),
            )
        )
        .scalars()
        .all()
    )
    by_id = {r.id: r for r in rows}
    if len(by_id) != len(payload.focus_ids):
        raise HTTPException(status_code=400, detail="某啲 focus_id 唔屬於你或日期")

    for position, fid in enumerate(payload.focus_ids):
        by_id[fid].position = position

    db.commit()
    # Return 新 order
    refreshed = (
        db.execute(
            select(DailyFocus)
            .where(
                DailyFocus.user_id == user.id,
                DailyFocus.focus_date == day,
            )
            .order_by(DailyFocus.position.asc(), DailyFocus.id.asc())
        )
        .scalars()
        .all()
    )
    return [_focus_with_todo(fr) for fr in refreshed]
