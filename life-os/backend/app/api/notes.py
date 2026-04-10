"""Note API routes — 知識管理 CRUD + search + folders。"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, distinct, select

from app.deps import CurrentUser, DbSession, current_user
from app.models.note import Note
from app.schemas.note import NoteCreate, NoteOut, NoteUpdate
from app.services.audit import log_action

router = APIRouter(dependencies=[Depends(current_user)])


@router.get("", response_model=list[NoteOut])
async def list_notes(
    user: CurrentUser,
    db: DbSession,
    archived: bool = Query(False),
    folder: str | None = Query(None, description="篩選 folder"),
    tag: str | None = Query(None, description="篩選 tag（substring）"),
    q: str | None = Query(None, description="搜尋 title / content"),
    limit: int = Query(200, le=500),
    offset: int = Query(0, ge=0),
) -> list[Note]:
    """列出筆記 — pinned 行先，按 updated_at 排序。"""
    stmt = (
        select(Note)
        .where(Note.user_id == user.id, Note.archived.is_(archived))
        .order_by(desc(Note.pinned), desc(Note.updated_at))
        .limit(limit)
        .offset(offset)
    )
    if folder is not None:
        stmt = stmt.where(Note.folder == folder)
    if tag:
        stmt = stmt.where(Note.tags.contains(tag))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Note.title.ilike(like) | Note.content.ilike(like))
    return list(db.execute(stmt).scalars().all())


@router.get("/folders", response_model=list[str])
async def list_folders(user: CurrentUser, db: DbSession) -> list[str]:
    """列出所有用過嘅 folder 名。"""
    stmt = (
        select(distinct(Note.folder))
        .where(Note.user_id == user.id, Note.folder != "")
        .order_by(Note.folder)
    )
    return list(db.execute(stmt).scalars().all())


@router.post("", response_model=NoteOut, status_code=201)
async def create_note(
    payload: NoteCreate, user: CurrentUser, db: DbSession
) -> Note:
    note = Note(
        user_id=user.id,
        title=payload.title.strip(),
        content=payload.content,
        folder=payload.folder.strip(),
        tags=payload.tags.strip(),
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    log_action(db, action="create", user_id=user.id, resource_type="note", resource_id=note.id, detail=note.title)
    return note


@router.get("/{note_id}", response_model=NoteOut)
async def get_note(note_id: int, user: CurrentUser, db: DbSession) -> Note:
    note = db.get(Note, note_id)
    if note is None or note.user_id != user.id:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@router.patch("/{note_id}", response_model=NoteOut)
async def update_note(
    note_id: int, payload: NoteUpdate, user: CurrentUser, db: DbSession
) -> Note:
    note = db.get(Note, note_id)
    if note is None or note.user_id != user.id:
        raise HTTPException(status_code=404, detail="Note not found")

    for field in payload.model_fields_set:
        value = getattr(payload, field)
        if field in ("title", "folder", "tags") and isinstance(value, str):
            value = value.strip()
        setattr(note, field, value)

    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=204)
async def delete_note(
    note_id: int, user: CurrentUser, db: DbSession
) -> None:
    note = db.get(Note, note_id)
    if note is None or note.user_id != user.id:
        raise HTTPException(status_code=404, detail="Note not found")
    title = note.title
    db.delete(note)
    db.commit()
    log_action(db, action="delete", user_id=user.id, resource_type="note", resource_id=note_id, detail=title)
