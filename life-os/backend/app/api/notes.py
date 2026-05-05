"""Note API routes — 知識管理 CRUD + search + folders + AI 相關推薦 + 附件。"""

import logging
import mimetypes
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import desc, distinct, select

from app.config import get_settings
from app.deps import CurrentUser, DbSession, current_user
from app.models.note import Note
from app.models.note_attachment import NoteAttachment
from app.schemas.note import NoteAttachmentOut, NoteCreate, NoteOut, NoteUpdate
from app.services.audit import log_action
from app.services.note_recommender import find_related_notes

# Upload constraints
MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024  # 25 MB
ALLOWED_MIME_PREFIXES = ("image/", "application/pdf", "text/", "application/json")
ALLOWED_MIME_EXACT = {
    "application/zip",
    "application/x-zip-compressed",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _is_allowed_mime(mime: str) -> bool:
    if any(mime.startswith(p) for p in ALLOWED_MIME_PREFIXES):
        return True
    return mime in ALLOWED_MIME_EXACT

logger = logging.getLogger(__name__)

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


def _validate_encryption_payload(
    is_encrypted: bool | None,
    encrypted_payload: str | None,
    encryption_iv: str | None,
) -> None:
    """加密筆記必須同時有 payload + iv；非加密筆記唔可以有呢啲欄位。"""
    if is_encrypted:
        if not encrypted_payload or not encryption_iv:
            raise HTTPException(
                status_code=400,
                detail="Encrypted notes must include encrypted_payload and encryption_iv",
            )


@router.post("", response_model=NoteOut, status_code=201)
async def create_note(
    payload: NoteCreate, user: CurrentUser, db: DbSession
) -> Note:
    _validate_encryption_payload(
        payload.is_encrypted, payload.encrypted_payload, payload.encryption_iv
    )
    note = Note(
        user_id=user.id,
        title=payload.title.strip(),
        content=payload.content,
        content_format=payload.content_format,
        folder=payload.folder.strip(),
        tags=payload.tags.strip(),
        is_encrypted=payload.is_encrypted,
        encrypted_payload=payload.encrypted_payload if payload.is_encrypted else None,
        encryption_iv=payload.encryption_iv if payload.is_encrypted else None,
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

    # Project final encryption state to validate consistency
    final_is_encrypted = (
        payload.is_encrypted if payload.is_encrypted is not None else note.is_encrypted
    )
    final_payload = (
        payload.encrypted_payload
        if "encrypted_payload" in payload.model_fields_set
        else note.encrypted_payload
    )
    final_iv = (
        payload.encryption_iv
        if "encryption_iv" in payload.model_fields_set
        else note.encryption_iv
    )
    _validate_encryption_payload(final_is_encrypted, final_payload, final_iv)

    for field in payload.model_fields_set:
        value = getattr(payload, field)
        if field in ("title", "folder", "tags") and isinstance(value, str):
            value = value.strip()
        setattr(note, field, value)

    # 如果由加密變做非加密，清走加密 payload
    if payload.is_encrypted is False:
        note.encrypted_payload = None
        note.encryption_iv = None

    db.commit()
    db.refresh(note)
    return note


class RelatedNotesResponse(BaseModel):
    related: list[NoteOut]


@router.get("/{note_id}/related", response_model=RelatedNotesResponse)
async def related_notes(
    note_id: int, user: CurrentUser, db: DbSession
) -> dict:
    """用 AI 搵出相關筆記。"""
    note = db.get(Note, note_id)
    if note is None or note.user_id != user.id:
        raise HTTPException(status_code=404, detail="Note not found")

    # Get all other notes as candidates
    stmt = (
        select(Note)
        .where(Note.user_id == user.id, Note.id != note_id, Note.archived.is_(False))
        .limit(100)
    )
    all_notes = list(db.execute(stmt).scalars().all())
    if not all_notes:
        return {"related": []}

    candidates = [
        {"id": n.id, "title": n.title, "tags": n.tags, "folder": n.folder}
        for n in all_notes
    ]

    related_ids = find_related_notes(
        note_title=note.title,
        note_content=note.content or "",
        note_tags=note.tags or "",
        note_folder=note.folder or "",
        candidates=candidates,
    )

    # Preserve AI ranking order
    note_map = {n.id: n for n in all_notes}
    related = [note_map[nid] for nid in related_ids if nid in note_map]
    return {"related": related}


@router.delete("/{note_id}", status_code=204)
async def delete_note(
    note_id: int, user: CurrentUser, db: DbSession
) -> None:
    note = db.get(Note, note_id)
    if note is None or note.user_id != user.id:
        raise HTTPException(status_code=404, detail="Note not found")
    title = note.title

    # Best-effort cleanup of attachment files before row cascade delete
    settings = get_settings()
    for att in list(note.attachments):
        try:
            (settings.data_dir / att.storage_path).unlink(missing_ok=True)
        except OSError as exc:
            logger.warning("Failed to unlink attachment %s: %s", att.storage_path, exc)

    db.delete(note)
    db.commit()
    log_action(db, action="delete", user_id=user.id, resource_type="note", resource_id=note_id, detail=title)


# ─── Attachments ────────────────────────────────────────────────────────────


@router.post(
    "/{note_id}/attachments",
    response_model=NoteAttachmentOut,
    status_code=201,
)
async def upload_attachment(
    note_id: int,
    user: CurrentUser,
    db: DbSession,
    file: UploadFile,
) -> NoteAttachment:
    """上載附件到 note。檔案儲存喺 data_dir/attachments/<user_id>/<uuid>.<ext>。"""
    note = db.get(Note, note_id)
    if note is None or note.user_id != user.id:
        raise HTTPException(status_code=404, detail="Note not found")

    # Read body once (FastAPI streams through SpooledTemporaryFile)
    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {MAX_ATTACHMENT_BYTES // (1024 * 1024)} MB)",
        )

    # Resolve mime type (client-provided → guessed → fallback)
    mime = (file.content_type or "").lower()
    if not mime or mime == "application/octet-stream":
        guessed, _ = mimetypes.guess_type(file.filename or "")
        if guessed:
            mime = guessed
    if not mime:
        mime = "application/octet-stream"

    if not _is_allowed_mime(mime):
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {mime}")

    # Build storage path
    settings = get_settings()
    ext = ""
    if file.filename and "." in file.filename:
        ext = "." + file.filename.rsplit(".", 1)[-1].lower()[:10]
    # Sanitize ext — only alnum
    ext = "".join(c for c in ext if c.isalnum() or c == ".")
    file_uuid = uuid.uuid4().hex
    rel_path = Path("attachments") / str(user.id) / f"{file_uuid}{ext}"
    abs_path = settings.data_dir / rel_path
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(data)

    att = NoteAttachment(
        note_id=note.id,
        user_id=user.id,
        filename=(file.filename or "file")[:500],
        mime_type=mime[:100],
        size_bytes=len(data),
        storage_path=str(rel_path),
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    log_action(
        db,
        action="create",
        user_id=user.id,
        resource_type="note_attachment",
        resource_id=att.id,
        detail=att.filename,
    )
    return att


@router.get("/{note_id}/attachments/{att_id}")
async def download_attachment(
    note_id: int, att_id: int, user: CurrentUser, db: DbSession
) -> FileResponse:
    """下載附件檔案。"""
    att = db.get(NoteAttachment, att_id)
    if att is None or att.user_id != user.id or att.note_id != note_id:
        raise HTTPException(status_code=404, detail="Attachment not found")

    settings = get_settings()
    abs_path = settings.data_dir / att.storage_path
    if not abs_path.exists():
        raise HTTPException(status_code=404, detail="File missing on disk")

    return FileResponse(
        path=abs_path,
        media_type=att.mime_type or "application/octet-stream",
        filename=att.filename,
    )


@router.delete("/{note_id}/attachments/{att_id}", status_code=204)
async def delete_attachment(
    note_id: int, att_id: int, user: CurrentUser, db: DbSession
) -> None:
    att = db.get(NoteAttachment, att_id)
    if att is None or att.user_id != user.id or att.note_id != note_id:
        raise HTTPException(status_code=404, detail="Attachment not found")

    settings = get_settings()
    abs_path = settings.data_dir / att.storage_path
    try:
        abs_path.unlink(missing_ok=True)
    except OSError as exc:
        logger.warning("Failed to unlink attachment %s: %s", att.storage_path, exc)

    filename = att.filename
    db.delete(att)
    db.commit()
    log_action(
        db,
        action="delete",
        user_id=user.id,
        resource_type="note_attachment",
        resource_id=att_id,
        detail=filename,
    )
