"""Data export + import API — JSON 備份 / 還原。"""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.deps import CurrentUser, DbSession, current_user
from app.models.calendar_event import CalendarEvent
from app.models.expense import Expense
from app.models.idea import Idea
from app.models.note import Note
from app.models.project import Project
from app.models.todo import Todo
from app.models.vip import VipSender
from app.services.audit import log_action

router = APIRouter(dependencies=[Depends(current_user)])

# Model mapping for import
_IMPORT_MODELS = {
    "todos": Todo,
    "projects": Project,
    "ideas": Idea,
    "notes": Note,
    "expenses": Expense,
    "vip_senders": VipSender,
}

# Fields to skip during import (auto-generated or user-specific)
_SKIP_FIELDS = {"id", "user_id", "created_at", "updated_at"}


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


class ImportResult(BaseModel):
    imported: dict[str, int]
    skipped: dict[str, int]


@router.post("/import", response_model=ImportResult)
async def import_data(
    file: UploadFile, user: CurrentUser, db: DbSession
) -> ImportResult:
    """匯入 JSON 備份 — 將數據還原到當前用戶。

    注意：唔會刪除現有數據，只會新增。重複數據需要手動處理。
    """
    import json

    if not file.content_type or "json" not in file.content_type:
        raise HTTPException(status_code=400, detail="只接受 JSON 檔案")

    raw = await file.read()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"JSON 解析失敗：{e}") from e

    imported: dict[str, int] = {}
    skipped: dict[str, int] = {}

    for key, model_cls in _IMPORT_MODELS.items():
        items = data.get(key, [])
        if not isinstance(items, list):
            continue
        count = 0
        skip = 0
        columns = {c.name for c in model_cls.__table__.columns}
        for item in items:
            if not isinstance(item, dict):
                skip += 1
                continue
            fields = {
                k: v for k, v in item.items()
                if k in columns and k not in _SKIP_FIELDS
            }
            fields["user_id"] = user.id
            try:
                obj = model_cls(**fields)
                db.add(obj)
                count += 1
            except Exception:
                skip += 1
        imported[key] = count
        skipped[key] = skip

    db.commit()
    log_action(
        db, action="import", user_id=user.id,
        detail=f"Imported: {imported}",
    )
    return ImportResult(imported=imported, skipped=skipped)
