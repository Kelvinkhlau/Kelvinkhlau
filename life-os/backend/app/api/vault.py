"""Vault API — 個人資料庫。

Endpoints：
- GET  /categories, POST /categories, PATCH/DELETE /categories/{id}
- GET  /tags, POST /tags, DELETE /tags/{id}
- GET  /files（list，支援 q/category_id/tag_id/include_deleted/expiring_within）
- POST /files（multipart upload）
- GET  /files/{id}（metadata）
- PATCH /files/{id}（改 filename / category / tags / notes / expiry）
- DELETE /files/{id}（軟刪除，requires step-up）
- POST /files/{id}/restore（從 trash 恢復）
- DELETE /files/{id}/permanent（永久刪除，requires step-up）
- GET  /files/{id}/download（下載，requires step-up）
- GET  /files/{id}/preview（inline，同一 tab iframe 用；唔 step-up，避免 iframe 折騰）
- GET  /summary（dashboard 用）

Step-up auth：
- JWT `iat` 必須喺最近 15 分鐘內（reuse 現有 passkey login flow）
- 舊 JWT → 401 detail="step_up_required" → frontend 彈 passkey prompt → 重新登入拎新 JWT
"""

from __future__ import annotations

import logging
import secrets
import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.deps import CurrentUser, DbSession, current_user
from app.models.vault import VaultCategory, VaultFile, VaultFileTag, VaultShare, VaultTag
from app.schemas.vault import (
    VaultCategoryCreate,
    VaultCategoryOut,
    VaultCategoryUpdate,
    VaultFileOut,
    VaultFileUpdate,
    VaultShareCreate,
    VaultShareOut,
    VaultSummary,
    VaultTagCreate,
    VaultTagOut,
    VaultTextEntryCreate,
)
from app.services import jwt_service, vault_storage
from app.services.audit import log_action

logger = logging.getLogger(__name__)

# 唔 set router-level auth dep — 每個 endpoint 各自用 `CurrentUser`，
# 令 `/preview` 可以 fallback 去 `?token=` query param（俾 <img> / <iframe> 用）
router = APIRouter()

# Step-up TTL — JWT iat 必須喺最近呢段時間內
STEP_UP_TTL_SECONDS = 15 * 60


# ─── Step-up auth dep ─────────────────────────────────────────────────────────


def require_recent_auth(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    """Sensitive ops：要求 JWT iat 喺最近 15 分鐘內。"""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization[7:].strip()
    payload = jwt_service.decode_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    iat = payload.get("iat")
    if not isinstance(iat, int):
        raise HTTPException(status_code=401, detail="step_up_required")
    age = int(datetime.now(tz=UTC).timestamp()) - iat
    if age > STEP_UP_TTL_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="step_up_required",
            headers={"X-Vault-Step-Up": "required"},
        )


# ─── Default categories seed ──────────────────────────────────────────────────

DEFAULT_CATEGORIES: list[tuple[str, str, int]] = [
    ("稅務財務", "🧾", 10),
    ("合同協議", "📜", 20),
    ("身份證件", "🆔", 30),
    ("健康醫療", "🏥", 40),
    ("物業資產", "🏠", 50),
    ("家庭紀錄", "👨‍👩‍👧", 60),
    ("工作", "💼", 70),
    ("車輛", "🚗", 80),
    ("教育", "🎓", 90),
    ("其他", "📦", 999),
]


def _ensure_default_categories(db: Session, user_id: int) -> None:
    existing = db.execute(
        select(VaultCategory).where(VaultCategory.user_id == user_id)
    ).scalars().all()
    if existing:
        return
    for name, icon, sort_order in DEFAULT_CATEGORIES:
        db.add(
            VaultCategory(
                user_id=user_id, name=name, icon=icon, sort_order=sort_order
            )
        )
    db.commit()


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _file_counts_by_category(db: Session, user_id: int) -> dict[int | None, int]:
    stmt = (
        select(VaultFile.category_id, func.count(VaultFile.id))
        .where(VaultFile.user_id == user_id, VaultFile.deleted_at.is_(None))
        .group_by(VaultFile.category_id)
    )
    return {row[0]: row[1] for row in db.execute(stmt).all()}


def _file_count_by_tag(db: Session, user_id: int) -> dict[int, int]:
    stmt = (
        select(VaultFileTag.tag_id, func.count(VaultFileTag.file_id))
        .join(VaultFile, VaultFile.id == VaultFileTag.file_id)
        .where(VaultFile.user_id == user_id, VaultFile.deleted_at.is_(None))
        .group_by(VaultFileTag.tag_id)
    )
    return {row[0]: row[1] for row in db.execute(stmt).all()}


def _serialize_file(f: VaultFile) -> VaultFileOut:
    today = date.today()
    days_until = None
    if f.expiry_date:
        days_until = (f.expiry_date - today).days
    return VaultFileOut(
        id=f.id,
        title=f.title,
        filename=f.filename,
        original_filename=f.original_filename,
        mime_type=f.mime_type,
        size_bytes=f.size_bytes,
        sha256=f.sha256,
        category_id=f.category_id,
        category_name=f.category.name if f.category else None,
        category_icon=f.category.icon if f.category else None,
        notes=f.notes,
        expiry_date=f.expiry_date,
        reminder_days_before=f.reminder_days_before,
        days_until_expiry=days_until,
        tag_ids=[t.id for t in f.tags],
        tag_names=[t.name for t in f.tags],
        uploaded_at=f.uploaded_at,
        updated_at=f.updated_at,
        deleted_at=f.deleted_at,
    )


# ─── Categories ──────────────────────────────────────────────────────────────


@router.get("/categories", response_model=list[VaultCategoryOut])
async def list_categories(user: CurrentUser, db: DbSession) -> list[VaultCategoryOut]:
    _ensure_default_categories(db, user.id)
    cats = db.execute(
        select(VaultCategory)
        .where(VaultCategory.user_id == user.id)
        .order_by(VaultCategory.sort_order, VaultCategory.id)
    ).scalars().all()
    counts = _file_counts_by_category(db, user.id)
    return [
        VaultCategoryOut(
            id=c.id,
            name=c.name,
            icon=c.icon,
            sort_order=c.sort_order,
            file_count=counts.get(c.id, 0),
        )
        for c in cats
    ]


@router.post("/categories", response_model=VaultCategoryOut, status_code=201)
async def create_category(
    payload: VaultCategoryCreate, user: CurrentUser, db: DbSession
) -> VaultCategoryOut:
    existing = db.execute(
        select(VaultCategory).where(
            VaultCategory.user_id == user.id, VaultCategory.name == payload.name.strip()
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Category with this name already exists")
    c = VaultCategory(
        user_id=user.id,
        name=payload.name.strip(),
        icon=payload.icon or "📁",
        sort_order=payload.sort_order,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    log_action(
        db, action="create", user_id=user.id,
        resource_type="vault_category", resource_id=c.id, detail=c.name,
    )
    return VaultCategoryOut(
        id=c.id, name=c.name, icon=c.icon, sort_order=c.sort_order, file_count=0
    )


@router.patch("/categories/{cat_id}", response_model=VaultCategoryOut)
async def update_category(
    cat_id: int, payload: VaultCategoryUpdate, user: CurrentUser, db: DbSession
) -> VaultCategoryOut:
    c = db.get(VaultCategory, cat_id)
    if c is None or c.user_id != user.id:
        raise HTTPException(status_code=404, detail="Category not found")
    if payload.name is not None:
        c.name = payload.name.strip()
    if payload.icon is not None:
        c.icon = payload.icon
    if payload.sort_order is not None:
        c.sort_order = payload.sort_order
    db.commit()
    db.refresh(c)
    counts = _file_counts_by_category(db, user.id)
    return VaultCategoryOut(
        id=c.id, name=c.name, icon=c.icon, sort_order=c.sort_order,
        file_count=counts.get(c.id, 0),
    )


@router.delete("/categories/{cat_id}", status_code=204)
async def delete_category(
    cat_id: int, user: CurrentUser, db: DbSession
) -> None:
    c = db.get(VaultCategory, cat_id)
    if c is None or c.user_id != user.id:
        raise HTTPException(status_code=404, detail="Category not found")
    # Files 會 SET NULL（migration 定咗）
    db.delete(c)
    db.commit()
    log_action(
        db, action="delete", user_id=user.id,
        resource_type="vault_category", resource_id=cat_id, detail=c.name,
    )


# ─── Tags ────────────────────────────────────────────────────────────────────


@router.get("/tags", response_model=list[VaultTagOut])
async def list_tags(user: CurrentUser, db: DbSession) -> list[VaultTagOut]:
    tags = db.execute(
        select(VaultTag).where(VaultTag.user_id == user.id).order_by(VaultTag.name)
    ).scalars().all()
    counts = _file_count_by_tag(db, user.id)
    return [
        VaultTagOut(
            id=t.id, name=t.name, color=t.color, file_count=counts.get(t.id, 0)
        )
        for t in tags
    ]


@router.post("/tags", response_model=VaultTagOut, status_code=201)
async def create_tag(
    payload: VaultTagCreate, user: CurrentUser, db: DbSession
) -> VaultTagOut:
    name = payload.name.strip()
    existing = db.execute(
        select(VaultTag).where(VaultTag.user_id == user.id, VaultTag.name == name)
    ).scalar_one_or_none()
    if existing is not None:
        # 唔報錯，直接返
        return VaultTagOut(
            id=existing.id, name=existing.name, color=existing.color, file_count=0
        )
    t = VaultTag(user_id=user.id, name=name, color=payload.color or "#6b7280")
    db.add(t)
    db.commit()
    db.refresh(t)
    return VaultTagOut(id=t.id, name=t.name, color=t.color, file_count=0)


@router.delete("/tags/{tag_id}", status_code=204)
async def delete_tag(tag_id: int, user: CurrentUser, db: DbSession) -> None:
    t = db.get(VaultTag, tag_id)
    if t is None or t.user_id != user.id:
        raise HTTPException(status_code=404, detail="Tag not found")
    db.delete(t)
    db.commit()


# ─── Files — list / get ──────────────────────────────────────────────────────


@router.get("/files", response_model=list[VaultFileOut])
async def list_files(
    user: CurrentUser,
    db: DbSession,
    q: str | None = Query(None, description="搜尋 filename / notes"),
    category_id: int | None = Query(None),
    tag_id: int | None = Query(None),
    include_deleted: bool = Query(False, description="True = 只顯示 trash"),
    expiring_within_days: int | None = Query(
        None, ge=0, le=365, description="只顯示 N 日內到期"
    ),
    limit: int = Query(200, le=500),
    offset: int = Query(0, ge=0),
) -> list[VaultFileOut]:
    conds = [VaultFile.user_id == user.id]
    if include_deleted:
        conds.append(VaultFile.deleted_at.is_not(None))
    else:
        conds.append(VaultFile.deleted_at.is_(None))
    if category_id is not None:
        conds.append(VaultFile.category_id == category_id)
    if q:
        like = f"%{q}%"
        conds.append(
            or_(
                VaultFile.title.ilike(like),
                VaultFile.filename.ilike(like),
                VaultFile.notes.ilike(like),
            )
        )
    if expiring_within_days is not None:
        cutoff = date.today() + timedelta(days=expiring_within_days)
        conds.append(VaultFile.expiry_date.is_not(None))
        conds.append(VaultFile.expiry_date <= cutoff)

    stmt = select(VaultFile).where(and_(*conds))
    if tag_id is not None:
        stmt = stmt.join(VaultFileTag, VaultFileTag.file_id == VaultFile.id).where(
            VaultFileTag.tag_id == tag_id
        )
    stmt = stmt.order_by(desc(VaultFile.uploaded_at)).limit(limit).offset(offset)

    files = db.execute(stmt).unique().scalars().all()
    return [_serialize_file(f) for f in files]


@router.get("/files/{file_id}", response_model=VaultFileOut)
async def get_file(file_id: int, user: CurrentUser, db: DbSession) -> VaultFileOut:
    f = db.get(VaultFile, file_id)
    if f is None or f.user_id != user.id:
        raise HTTPException(status_code=404, detail="File not found")
    return _serialize_file(f)


# ─── Files — upload ──────────────────────────────────────────────────────────


@router.post("/files", response_model=VaultFileOut, status_code=201)
async def upload_file(
    user: CurrentUser,
    db: DbSession,
    file: UploadFile,
    category_id: int | None = None,
    title: str | None = None,
    filename: str | None = None,
    notes: str | None = None,
    expiry_date: date | None = None,
    reminder_days_before: int | None = None,
) -> VaultFileOut:
    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > vault_storage.MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {vault_storage.MAX_FILE_BYTES // (1024 * 1024)} MB)",
        )

    mime = vault_storage.detect_mime(data, file.content_type, file.filename)
    if not vault_storage.is_allowed_mime(mime):
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {mime}")

    # Optional category validation
    if category_id is not None:
        cat = db.get(VaultCategory, category_id)
        if cat is None or cat.user_id != user.id:
            raise HTTPException(status_code=400, detail="Invalid category_id")

    settings = get_settings()
    ext = vault_storage.extract_ext(file.filename)
    rel_path = vault_storage.build_storage_path(user.id, ext)
    vault_storage.write_file(settings.data_dir, rel_path, data)

    display_name = (filename or file.filename or "file").strip()[:500]
    title_value = (title or "").strip()[:300] or None
    f = VaultFile(
        user_id=user.id,
        category_id=category_id,
        title=title_value,
        filename=display_name,
        original_filename=(file.filename or display_name)[:500],
        mime_type=mime[:100],
        size_bytes=len(data),
        sha256=vault_storage.sha256_hex(data),
        storage_path=str(rel_path),
        notes=(notes or "").strip(),
        expiry_date=expiry_date,
        reminder_days_before=reminder_days_before,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    log_action(
        db, action="upload", user_id=user.id,
        resource_type="vault_file", resource_id=f.id, detail=f.filename,
    )
    return _serialize_file(f)


# ─── Files — text-only entry (no file upload) ────────────────────────────────


@router.post("/files/text", response_model=VaultFileOut, status_code=201)
async def create_text_entry(
    payload: VaultTextEntryCreate,
    user: CurrentUser,
    db: DbSession,
) -> VaultFileOut:
    """純文字記錄 — 例：API key / 密碼提示 / 序號。

    內部會將 content 存成 `.txt` 檔，所以可以重用現有 download / preview / share 機制。
    """
    title = payload.title.strip()
    content = payload.content
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    if not content:
        raise HTTPException(status_code=400, detail="Content is required")

    data = content.encode("utf-8")
    if len(data) > vault_storage.MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Content too large (max {vault_storage.MAX_FILE_BYTES // (1024 * 1024)} MB)",
        )

    # Optional category validation
    if payload.category_id is not None:
        cat = db.get(VaultCategory, payload.category_id)
        if cat is None or cat.user_id != user.id:
            raise HTTPException(status_code=400, detail="Invalid category_id")

    # 用 title 做 base filename，加 .txt 後綴
    safe_base = title[:200] or "note"
    display_filename = f"{safe_base}.txt"

    settings = get_settings()
    rel_path = vault_storage.build_storage_path(user.id, ".txt")
    vault_storage.write_file(settings.data_dir, rel_path, data)

    f = VaultFile(
        user_id=user.id,
        category_id=payload.category_id,
        title=title[:300],
        filename=display_filename[:500],
        original_filename=display_filename[:500],
        mime_type="text/plain",
        size_bytes=len(data),
        sha256=vault_storage.sha256_hex(data),
        storage_path=str(rel_path),
        notes=(payload.notes or "").strip(),
        expiry_date=payload.expiry_date,
        reminder_days_before=payload.reminder_days_before,
    )
    db.add(f)
    db.commit()
    db.refresh(f)

    # Tags（如果有）
    for tid in payload.tag_ids:
        tag = db.get(VaultTag, tid)
        if tag is None or tag.user_id != user.id:
            continue
        db.add(VaultFileTag(file_id=f.id, tag_id=tid))
    if payload.tag_ids:
        db.commit()
        db.refresh(f)

    log_action(
        db, action="create_text", user_id=user.id,
        resource_type="vault_file", resource_id=f.id, detail=f.title or f.filename,
    )
    return _serialize_file(f)


# ─── Files — update / delete / restore ───────────────────────────────────────


@router.patch("/files/{file_id}", response_model=VaultFileOut)
async def update_file(
    file_id: int,
    payload: VaultFileUpdate,
    user: CurrentUser,
    db: DbSession,
) -> VaultFileOut:
    f = db.get(VaultFile, file_id)
    if f is None or f.user_id != user.id:
        raise HTTPException(status_code=404, detail="File not found")

    if payload.title is not None:
        new_title = payload.title.strip()[:300]
        f.title = new_title or None
    if payload.clear_title:
        f.title = None
    if payload.filename is not None:
        f.filename = payload.filename.strip()[:500]
    if payload.category_id is not None:
        if payload.category_id == 0:
            f.category_id = None
        else:
            cat = db.get(VaultCategory, payload.category_id)
            if cat is None or cat.user_id != user.id:
                raise HTTPException(status_code=400, detail="Invalid category_id")
            f.category_id = payload.category_id
    if payload.notes is not None:
        f.notes = payload.notes
    if payload.expiry_date is not None:
        f.expiry_date = payload.expiry_date
    if payload.clear_expiry:
        f.expiry_date = None
        f.reminder_days_before = None  # 冇 expiry，reminder 亦無意義
    if payload.reminder_days_before is not None:
        f.reminder_days_before = payload.reminder_days_before
    if payload.clear_reminder:
        f.reminder_days_before = None
    if payload.tag_ids is not None:
        # Replace all tags
        db.execute(
            VaultFileTag.__table__.delete().where(VaultFileTag.file_id == f.id)
        )
        for tid in payload.tag_ids:
            tag = db.get(VaultTag, tid)
            if tag is None or tag.user_id != user.id:
                continue
            db.add(VaultFileTag(file_id=f.id, tag_id=tid))

    db.commit()
    db.refresh(f)
    log_action(
        db, action="update", user_id=user.id,
        resource_type="vault_file", resource_id=f.id, detail=f.filename,
    )
    return _serialize_file(f)


@router.delete(
    "/files/{file_id}",
    status_code=204,
    dependencies=[Depends(require_recent_auth)],
)
async def soft_delete_file(file_id: int, user: CurrentUser, db: DbSession) -> None:
    """軟刪除（入 trash）— 30 日後 cron 永久清除。"""
    f = db.get(VaultFile, file_id)
    if f is None or f.user_id != user.id:
        raise HTTPException(status_code=404, detail="File not found")
    f.deleted_at = datetime.now(tz=UTC).replace(tzinfo=None)
    db.commit()
    log_action(
        db, action="soft_delete", user_id=user.id,
        resource_type="vault_file", resource_id=f.id, detail=f.filename,
    )


@router.post("/files/{file_id}/restore", response_model=VaultFileOut)
async def restore_file(file_id: int, user: CurrentUser, db: DbSession) -> VaultFileOut:
    f = db.get(VaultFile, file_id)
    if f is None or f.user_id != user.id:
        raise HTTPException(status_code=404, detail="File not found")
    f.deleted_at = None
    db.commit()
    db.refresh(f)
    log_action(
        db, action="restore", user_id=user.id,
        resource_type="vault_file", resource_id=f.id, detail=f.filename,
    )
    return _serialize_file(f)


@router.delete(
    "/files/{file_id}/permanent",
    status_code=204,
    dependencies=[Depends(require_recent_auth)],
)
async def permanent_delete_file(
    file_id: int, user: CurrentUser, db: DbSession
) -> None:
    f = db.get(VaultFile, file_id)
    if f is None or f.user_id != user.id:
        raise HTTPException(status_code=404, detail="File not found")
    settings = get_settings()
    vault_storage.delete_file(settings.data_dir, f.storage_path)
    filename = f.filename
    db.delete(f)
    db.commit()
    log_action(
        db, action="permanent_delete", user_id=user.id,
        resource_type="vault_file", resource_id=file_id, detail=filename,
    )


# ─── Files — download / preview ──────────────────────────────────────────────


@router.get(
    "/files/{file_id}/download",
    dependencies=[Depends(require_recent_auth)],
)
async def download_file(
    file_id: int, user: CurrentUser, db: DbSession
) -> FileResponse:
    f = db.get(VaultFile, file_id)
    if f is None or f.user_id != user.id:
        raise HTTPException(status_code=404, detail="File not found")
    settings = get_settings()
    p = vault_storage.abs_path(settings.data_dir, f.storage_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="File missing on disk")
    log_action(
        db, action="download", user_id=user.id,
        resource_type="vault_file", resource_id=f.id, detail=f.filename,
    )
    return FileResponse(
        path=p,
        media_type=f.mime_type or "application/octet-stream",
        filename=f.original_filename,
    )


@router.get("/files/{file_id}/preview")
async def preview_file(
    file_id: int,
    db: DbSession,
    authorization: Annotated[str | None, Header()] = None,
    token: str | None = Query(
        None, description="JWT 當 token — 俾 <img>/<iframe> 冇 Authorization header 時用"
    ),
) -> FileResponse:
    """Inline preview — 俾 iframe / img 用，唔 step-up。

    呢個 endpoint **唔用** router-level auth dep，因為 browser `<img>` / `<iframe>`
    冇辦法加 Authorization header。Auth 兩種方法：
    1. Authorization: Bearer <jwt>  （fetch 調用時用）
    2. `?token=<jwt>`  （<img src> / <iframe src> 用）
    """
    from app.models.user import User

    # Resolve JWT：header 優先、然之後 query param
    jwt_token: str | None = None
    if authorization and authorization.lower().startswith("bearer "):
        jwt_token = authorization[7:].strip()
    elif token:
        jwt_token = token.strip()

    if not jwt_token:
        raise HTTPException(status_code=401, detail="Missing auth token")

    payload = jwt_service.decode_token(jwt_token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    try:
        user_id = int(payload.get("sub", ""))
    except (TypeError, ValueError) as e:
        raise HTTPException(status_code=401, detail="Malformed token") from e

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    f = db.get(VaultFile, file_id)
    if f is None or f.user_id != user.id:
        raise HTTPException(status_code=404, detail="File not found")
    settings = get_settings()
    p = vault_storage.abs_path(settings.data_dir, f.storage_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="File missing on disk")
    log_action(
        db, action="preview", user_id=user.id,
        resource_type="vault_file", resource_id=f.id, detail=f.filename,
    )
    return FileResponse(
        path=p,
        media_type=f.mime_type or "application/octet-stream",
        # 無 filename → browser inline display（iframe-friendly）
    )


# ─── Summary ─────────────────────────────────────────────────────────────────


@router.get("/summary", response_model=VaultSummary)
async def get_summary(user: CurrentUser, db: DbSession) -> VaultSummary:
    _ensure_default_categories(db, user.id)
    cats = db.execute(
        select(VaultCategory)
        .where(VaultCategory.user_id == user.id)
        .order_by(VaultCategory.sort_order, VaultCategory.id)
    ).scalars().all()
    counts = _file_counts_by_category(db, user.id)

    total_files = db.execute(
        select(func.count(VaultFile.id)).where(
            VaultFile.user_id == user.id, VaultFile.deleted_at.is_(None)
        )
    ).scalar_one()
    total_size = db.execute(
        select(func.coalesce(func.sum(VaultFile.size_bytes), 0)).where(
            VaultFile.user_id == user.id, VaultFile.deleted_at.is_(None)
        )
    ).scalar_one()
    cutoff = date.today() + timedelta(days=30)
    expiring = db.execute(
        select(func.count(VaultFile.id)).where(
            VaultFile.user_id == user.id,
            VaultFile.deleted_at.is_(None),
            VaultFile.expiry_date.is_not(None),
            VaultFile.expiry_date <= cutoff,
        )
    ).scalar_one()
    trashed = db.execute(
        select(func.count(VaultFile.id)).where(
            VaultFile.user_id == user.id, VaultFile.deleted_at.is_not(None)
        )
    ).scalar_one()

    return VaultSummary(
        total_files=int(total_files),
        total_size_bytes=int(total_size),
        categories=[
            VaultCategoryOut(
                id=c.id, name=c.name, icon=c.icon, sort_order=c.sort_order,
                file_count=counts.get(c.id, 0),
            )
            for c in cats
        ],
        expiring_soon=int(expiring),
        trashed=int(trashed),
    )


# ─── External share links ────────────────────────────────────────────────────


def _share_is_active(s: VaultShare, now: datetime) -> bool:
    if s.revoked_at is not None:
        return False
    if s.expires_at is not None and s.expires_at < now:
        return False
    if s.max_downloads is not None and s.download_count >= s.max_downloads:
        return False
    return True


def _build_share_url(token: str) -> str:
    settings = get_settings()
    base = settings.public_base_url.rstrip("/")
    return f"{base}/api/vault/public/{token}"


def _serialize_share(s: VaultShare) -> VaultShareOut:
    return VaultShareOut(
        id=s.id,
        file_id=s.file_id,
        token=s.token,
        label=s.label,
        expires_at=s.expires_at,
        max_downloads=s.max_downloads,
        download_count=s.download_count,
        allow_download=s.allow_download,
        created_at=s.created_at,
        revoked_at=s.revoked_at,
        url=_build_share_url(s.token),
    )


@router.post(
    "/files/{file_id}/shares",
    response_model=VaultShareOut,
    status_code=201,
    dependencies=[Depends(require_recent_auth)],
)
async def create_share(
    file_id: int,
    payload: VaultShareCreate,
    user: CurrentUser,
    db: DbSession,
) -> VaultShareOut:
    """建立外部分享 link — 要 step-up auth。"""
    f = db.get(VaultFile, file_id)
    if f is None or f.user_id != user.id:
        raise HTTPException(status_code=404, detail="File not found")
    if f.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Cannot share a deleted file")

    expires_at: datetime | None = None
    if payload.expires_in_hours is not None:
        expires_at = (
            datetime.now(tz=UTC).replace(tzinfo=None)
            + timedelta(hours=payload.expires_in_hours)
        )

    token = secrets.token_urlsafe(32)
    s = VaultShare(
        file_id=f.id,
        user_id=user.id,
        token=token,
        label=(payload.label or "").strip()[:200] or None,
        expires_at=expires_at,
        max_downloads=payload.max_downloads,
        allow_download=payload.allow_download,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    log_action(
        db, action="share_create", user_id=user.id,
        resource_type="vault_file", resource_id=f.id,
        detail=f"share={s.id} label={s.label or ''}",
    )
    return _serialize_share(s)


@router.get("/files/{file_id}/shares", response_model=list[VaultShareOut])
async def list_shares(
    file_id: int, user: CurrentUser, db: DbSession
) -> list[VaultShareOut]:
    f = db.get(VaultFile, file_id)
    if f is None or f.user_id != user.id:
        raise HTTPException(status_code=404, detail="File not found")
    shares = db.execute(
        select(VaultShare)
        .where(VaultShare.file_id == f.id, VaultShare.user_id == user.id)
        .order_by(desc(VaultShare.created_at))
    ).scalars().all()
    return [_serialize_share(s) for s in shares]


@router.delete(
    "/shares/{share_id}",
    status_code=204,
    dependencies=[Depends(require_recent_auth)],
)
async def revoke_share(
    share_id: int, user: CurrentUser, db: DbSession
) -> None:
    s = db.get(VaultShare, share_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(status_code=404, detail="Share not found")
    if s.revoked_at is None:
        s.revoked_at = datetime.now(tz=UTC).replace(tzinfo=None)
        db.commit()
    log_action(
        db, action="share_revoke", user_id=user.id,
        resource_type="vault_file", resource_id=s.file_id,
        detail=f"share={s.id}",
    )


@router.get("/public/{token}")
async def public_share(
    token: str,
    request: Request,
    db: DbSession,
    download: bool = Query(False, description="1 = attachment disposition，0 = inline"),
) -> FileResponse:
    """**Public** endpoint — 冇 auth，靠 token 做 capability。

    - 檢查 token 存在 / 未 revoke / 未過期 / 未達下載上限
    - log audit（帶 client IP / UA）
    - 每次 hit +1 download_count
    """
    s = db.execute(
        select(VaultShare).where(VaultShare.token == token)
    ).scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=404, detail="Share link not found")

    now = datetime.now(tz=UTC).replace(tzinfo=None)
    if not _share_is_active(s, now):
        raise HTTPException(status_code=410, detail="Share link no longer valid")

    if not s.allow_download and download:
        raise HTTPException(status_code=403, detail="Download disabled for this share")

    f = db.get(VaultFile, s.file_id)
    if f is None or f.deleted_at is not None:
        raise HTTPException(status_code=404, detail="File no longer available")

    settings = get_settings()
    p = vault_storage.abs_path(settings.data_dir, f.storage_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="File missing on disk")

    s.download_count += 1
    db.commit()

    ip = request.client.host if request.client else "?"
    ua = (request.headers.get("user-agent") or "")[:120]
    log_action(
        db, action="share_access", user_id=s.user_id,
        resource_type="vault_file", resource_id=f.id,
        detail=f"share={s.id} ip={ip} ua={ua}",
    )

    return FileResponse(
        path=p,
        media_type=f.mime_type or "application/octet-stream",
        filename=(f.original_filename if download else None),
    )
