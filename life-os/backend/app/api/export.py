"""Data export API — 將所有用戶數據匯出為 JSON（用作備份）。"""

from datetime import date, datetime

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app.deps import CurrentUser, DbSession, current_user
from app.models.calendar_event import CalendarEvent
from app.models.expense import Expense
from app.models.idea import Idea
from app.models.note import Note
from app.models.project import Project
from app.models.todo import Todo
from app.models.vip import VipSender

router = APIRouter(dependencies=[Depends(current_user)])


def _serialize(obj) -> dict:
    """將 ORM object 嘅所有 column 轉成 JSON-safe dict。"""
    result = {}
    for col in obj.__table__.columns:
        val = getattr(obj, col.name)
        if isinstance(val, (datetime, date)):
            val = val.isoformat()
        result[col.name] = val
    return result


@router.get("")
async def export_all(user: CurrentUser, db: DbSession) -> JSONResponse:
    """匯出所有用戶數據為 JSON — 用作備份或遷移。"""
    data = {
        "exported_at": datetime.utcnow().isoformat(),
        "user": {"email": user.email, "name": user.name},
        "todos": [
            _serialize(t)
            for t in db.execute(
                select(Todo).where(Todo.user_id == user.id)
            ).scalars().all()
        ],
        "projects": [
            _serialize(p)
            for p in db.execute(
                select(Project).where(Project.user_id == user.id)
            ).scalars().all()
        ],
        "ideas": [
            _serialize(i)
            for i in db.execute(
                select(Idea).where(Idea.user_id == user.id)
            ).scalars().all()
        ],
        "notes": [
            _serialize(n)
            for n in db.execute(
                select(Note).where(Note.user_id == user.id)
            ).scalars().all()
        ],
        "expenses": [
            _serialize(e)
            for e in db.execute(
                select(Expense).where(Expense.user_id == user.id)
            ).scalars().all()
        ],
        "calendar_events": [
            _serialize(c)
            for c in db.execute(
                select(CalendarEvent).where(CalendarEvent.user_id == user.id)
            ).scalars().all()
        ],
        "vip_senders": [
            _serialize(v)
            for v in db.execute(
                select(VipSender).where(VipSender.user_id == user.id)
            ).scalars().all()
        ],
    }
    filename = f"lifeos-backup-{date.today().isoformat()}.json"
    return JSONResponse(
        content=data,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
