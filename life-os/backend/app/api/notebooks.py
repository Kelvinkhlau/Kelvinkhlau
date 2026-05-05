"""Notebook API routes — GoodNotes 風格嘅記事簿 + 頁面 CRUD + 搜尋 + OCR。"""

import logging
import mimetypes
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import desc, func, or_, select

from app.config import get_settings
from app.deps import CurrentUser, DbSession, current_user
from app.models.notebook import Notebook, NotebookPage
from app.schemas.notebook import (
    NotebookCreate,
    NotebookOut,
    NotebookPageCreate,
    NotebookPageOut,
    NotebookPageReorderPayload,
    NotebookPageSummary,
    NotebookPageUpdate,
    NotebookUpdate,
)
from app.services.audit import log_action
from app.services.notebook_ocr import extract_inline_tags, ocr_page_image

# 5 MB cap for notebook cover images
MAX_COVER_BYTES = 5 * 1024 * 1024
ALLOWED_COVER_MIMES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/gif",
}

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(current_user)])


# ─── Search (定義喺 /{notebook_id} 前，避免 path 衝突) ─────────────────────


class NotebookPageSearchHit(BaseModel):
    notebook_id: int
    notebook_title: str
    page_id: int
    page_number: int
    page_title: str | None
    snippet: str
    tags: str
    updated_at: str


@router.get("/search", response_model=list[NotebookPageSearchHit])
async def search_pages(
    user: CurrentUser,
    db: DbSession,
    q: str | None = Query(None, description="搜尋 text_content / page title / notebook title"),
    tag: str | None = Query(None, description="篩選 tag（substring）"),
    limit: int = Query(50, le=200),
) -> list[NotebookPageSearchHit]:
    """搜尋所有記事簿頁面（簡單 LIKE；之後可升級 FTS5）。"""
    stmt = (
        select(NotebookPage, Notebook)
        .join(Notebook, NotebookPage.notebook_id == Notebook.id)
        .where(Notebook.user_id == user.id)
        .order_by(desc(NotebookPage.updated_at))
        .limit(limit)
    )
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                NotebookPage.text_content.ilike(like),
                NotebookPage.title.ilike(like),
                Notebook.title.ilike(like),
            )
        )
    if tag:
        stmt = stmt.where(
            or_(
                NotebookPage.tags.contains(tag),
                Notebook.tags.contains(tag),
            )
        )

    results: list[NotebookPageSearchHit] = []
    for page, nb in db.execute(stmt).all():
        snippet = (page.text_content or "")[:200]
        if q and page.text_content:
            idx = page.text_content.lower().find(q.lower())
            if idx >= 0:
                start = max(0, idx - 50)
                snippet = page.text_content[start : start + 200]
        results.append(
            NotebookPageSearchHit(
                notebook_id=nb.id,
                notebook_title=nb.title,
                page_id=page.id,
                page_number=page.page_number,
                page_title=page.title,
                snippet=snippet,
                tags=page.tags,
                updated_at=page.updated_at.isoformat(),
            )
        )
    return results


# ─── Notebook CRUD ──────────────────────────────────────────────────────────


@router.get("", response_model=list[NotebookOut])
async def list_notebooks(
    user: CurrentUser,
    db: DbSession,
    archived: bool = Query(False),
    tag: str | None = Query(None),
    q: str | None = Query(None, description="搜尋 title / description"),
) -> list[NotebookOut]:
    """列出記事簿 — pinned 行先，再按 sort_order / updated_at。"""
    stmt = (
        select(
            Notebook,
            func.count(NotebookPage.id).label("page_count"),
        )
        .outerjoin(NotebookPage, NotebookPage.notebook_id == Notebook.id)
        .where(Notebook.user_id == user.id, Notebook.archived.is_(archived))
        .group_by(Notebook.id)
        .order_by(desc(Notebook.pinned), Notebook.sort_order, desc(Notebook.updated_at))
    )
    if tag:
        stmt = stmt.where(Notebook.tags.contains(tag))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Notebook.title.ilike(like) | Notebook.description.ilike(like))

    rows = db.execute(stmt).all()
    result: list[NotebookOut] = []
    for nb, page_count in rows:
        out = NotebookOut.model_validate(nb)
        out.page_count = int(page_count or 0)
        out.has_cover_image = bool(nb.cover_image_path)
        result.append(out)
    return result


@router.post("", response_model=NotebookOut, status_code=201)
async def create_notebook(
    payload: NotebookCreate, user: CurrentUser, db: DbSession
) -> NotebookOut:
    nb = Notebook(
        user_id=user.id,
        title=payload.title.strip(),
        description=(payload.description or None),
        cover_color=payload.cover_color,
        icon=payload.icon,
        default_template=payload.default_template,
        tags=payload.tags.strip(),
    )
    db.add(nb)
    db.flush()  # get id

    # 自動建第一頁（空白）
    first_page = NotebookPage(
        notebook_id=nb.id,
        page_number=1,
        title=None,
        canvas_json="",
        text_content="",
        template=payload.default_template,
    )
    db.add(first_page)
    db.commit()
    db.refresh(nb)

    log_action(
        db,
        action="create",
        user_id=user.id,
        resource_type="notebook",
        resource_id=nb.id,
        detail=nb.title,
    )
    out = NotebookOut.model_validate(nb)
    out.page_count = 1
    out.has_cover_image = bool(nb.cover_image_path)
    return out


@router.get("/{notebook_id}", response_model=NotebookOut)
async def get_notebook(
    notebook_id: int, user: CurrentUser, db: DbSession
) -> NotebookOut:
    nb = db.get(Notebook, notebook_id)
    if nb is None or nb.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notebook not found")
    page_count = db.execute(
        select(func.count(NotebookPage.id)).where(NotebookPage.notebook_id == nb.id)
    ).scalar() or 0
    out = NotebookOut.model_validate(nb)
    out.page_count = int(page_count)
    out.has_cover_image = bool(nb.cover_image_path)
    return out


@router.patch("/{notebook_id}", response_model=NotebookOut)
async def update_notebook(
    notebook_id: int,
    payload: NotebookUpdate,
    user: CurrentUser,
    db: DbSession,
) -> NotebookOut:
    nb = db.get(Notebook, notebook_id)
    if nb is None or nb.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notebook not found")

    for field in payload.model_fields_set:
        value = getattr(payload, field)
        if field in ("title", "tags") and isinstance(value, str):
            value = value.strip()
        setattr(nb, field, value)

    db.commit()
    db.refresh(nb)
    page_count = db.execute(
        select(func.count(NotebookPage.id)).where(NotebookPage.notebook_id == nb.id)
    ).scalar() or 0
    out = NotebookOut.model_validate(nb)
    out.page_count = int(page_count)
    out.has_cover_image = bool(nb.cover_image_path)
    return out


@router.delete("/{notebook_id}", status_code=204)
async def delete_notebook(
    notebook_id: int, user: CurrentUser, db: DbSession
) -> None:
    nb = db.get(Notebook, notebook_id)
    if nb is None or nb.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notebook not found")
    title = nb.title
    db.delete(nb)  # cascade → pages
    db.commit()
    log_action(
        db,
        action="delete",
        user_id=user.id,
        resource_type="notebook",
        resource_id=notebook_id,
        detail=title,
    )


# ─── Cover image ────────────────────────────────────────────────────────────


@router.post("/{notebook_id}/cover", response_model=NotebookOut)
async def upload_notebook_cover(
    notebook_id: int,
    user: CurrentUser,
    db: DbSession,
    file: UploadFile,
) -> NotebookOut:
    """上載相片做封面。舊檔案自動刪除。"""
    nb = db.get(Notebook, notebook_id)
    if nb is None or nb.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notebook not found")

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_COVER_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {MAX_COVER_BYTES // (1024 * 1024)} MB)",
        )

    mime = (file.content_type or "").lower()
    if not mime or mime == "application/octet-stream":
        guessed, _ = mimetypes.guess_type(file.filename or "")
        if guessed:
            mime = guessed
    if mime not in ALLOWED_COVER_MIMES:
        raise HTTPException(
            status_code=415, detail=f"Unsupported image type: {mime or 'unknown'}"
        )

    ext = ""
    if file.filename and "." in file.filename:
        ext = "." + file.filename.rsplit(".", 1)[-1].lower()[:10]
    ext = "".join(c for c in ext if c.isalnum() or c == ".") or ".jpg"

    settings = get_settings()
    file_uuid = uuid.uuid4().hex
    rel_path = Path("notebook_covers") / str(user.id) / f"{file_uuid}{ext}"
    abs_path = settings.data_dir / rel_path
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(data)

    # 刪舊封面檔案
    old_rel = nb.cover_image_path
    if old_rel:
        try:
            old_abs = settings.data_dir / old_rel
            if old_abs.is_file():
                old_abs.unlink()
        except OSError:
            logger.warning("Failed to delete old cover %s", old_rel)

    nb.cover_image_path = str(rel_path)
    db.commit()
    db.refresh(nb)

    log_action(
        db,
        action="update",
        user_id=user.id,
        resource_type="notebook",
        resource_id=nb.id,
        detail=f"cover uploaded: {file.filename}",
    )

    page_count = db.execute(
        select(func.count(NotebookPage.id)).where(NotebookPage.notebook_id == nb.id)
    ).scalar() or 0
    out = NotebookOut.model_validate(nb)
    out.page_count = int(page_count)
    out.has_cover_image = True
    return out


@router.get("/{notebook_id}/cover")
async def get_notebook_cover(
    notebook_id: int, user: CurrentUser, db: DbSession
) -> FileResponse:
    """下載 / 顯示封面相片。"""
    nb = db.get(Notebook, notebook_id)
    if nb is None or nb.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if not nb.cover_image_path:
        raise HTTPException(status_code=404, detail="No cover image")

    settings = get_settings()
    abs_path = settings.data_dir / nb.cover_image_path
    if not abs_path.is_file():
        raise HTTPException(status_code=404, detail="Cover file missing on disk")

    mime, _ = mimetypes.guess_type(str(abs_path))
    return FileResponse(
        abs_path,
        media_type=mime or "image/jpeg",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.delete("/{notebook_id}/cover", response_model=NotebookOut)
async def delete_notebook_cover(
    notebook_id: int, user: CurrentUser, db: DbSession
) -> NotebookOut:
    nb = db.get(Notebook, notebook_id)
    if nb is None or nb.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notebook not found")

    if nb.cover_image_path:
        settings = get_settings()
        try:
            abs_path = settings.data_dir / nb.cover_image_path
            if abs_path.is_file():
                abs_path.unlink()
        except OSError:
            logger.warning("Failed to delete cover file %s", nb.cover_image_path)
        nb.cover_image_path = None
        db.commit()
        db.refresh(nb)

    page_count = db.execute(
        select(func.count(NotebookPage.id)).where(NotebookPage.notebook_id == nb.id)
    ).scalar() or 0
    out = NotebookOut.model_validate(nb)
    out.page_count = int(page_count)
    out.has_cover_image = False
    return out


# ─── Page CRUD ──────────────────────────────────────────────────────────────


def _ensure_notebook_access(
    notebook_id: int, user_id: int, db
) -> Notebook:
    nb = db.get(Notebook, notebook_id)
    if nb is None or nb.user_id != user_id:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return nb


@router.get("/{notebook_id}/pages", response_model=list[NotebookPageSummary])
async def list_pages(
    notebook_id: int, user: CurrentUser, db: DbSession
) -> list[NotebookPage]:
    _ensure_notebook_access(notebook_id, user.id, db)
    stmt = (
        select(NotebookPage)
        .where(NotebookPage.notebook_id == notebook_id)
        .order_by(NotebookPage.page_number)
    )
    return list(db.execute(stmt).scalars().all())


@router.post("/{notebook_id}/pages", response_model=NotebookPageOut, status_code=201)
async def create_page(
    notebook_id: int,
    payload: NotebookPageCreate,
    user: CurrentUser,
    db: DbSession,
) -> NotebookPage:
    nb = _ensure_notebook_access(notebook_id, user.id, db)

    max_page_num = (
        db.execute(
            select(func.max(NotebookPage.page_number)).where(
                NotebookPage.notebook_id == notebook_id
            )
        ).scalar()
        or 0
    )
    page_number = payload.page_number or (max_page_num + 1)

    page = NotebookPage(
        notebook_id=nb.id,
        page_number=page_number,
        title=payload.title,
        canvas_json=payload.canvas_json,
        text_content=payload.text_content,
        tags=payload.tags,
        template=payload.template,
    )
    db.add(page)
    db.commit()
    db.refresh(page)
    return page


@router.get("/{notebook_id}/pages/{page_id}", response_model=NotebookPageOut)
async def get_page(
    notebook_id: int, page_id: int, user: CurrentUser, db: DbSession
) -> NotebookPage:
    _ensure_notebook_access(notebook_id, user.id, db)
    page = db.get(NotebookPage, page_id)
    if page is None or page.notebook_id != notebook_id:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.patch("/{notebook_id}/pages/{page_id}", response_model=NotebookPageOut)
async def update_page(
    notebook_id: int,
    page_id: int,
    payload: NotebookPageUpdate,
    user: CurrentUser,
    db: DbSession,
) -> NotebookPage:
    _ensure_notebook_access(notebook_id, user.id, db)
    page = db.get(NotebookPage, page_id)
    if page is None or page.notebook_id != notebook_id:
        raise HTTPException(status_code=404, detail="Page not found")

    for field in payload.model_fields_set:
        setattr(page, field, getattr(payload, field))

    db.commit()
    db.refresh(page)
    return page


@router.delete("/{notebook_id}/pages/{page_id}", status_code=204)
async def delete_page(
    notebook_id: int, page_id: int, user: CurrentUser, db: DbSession
) -> None:
    _ensure_notebook_access(notebook_id, user.id, db)
    page = db.get(NotebookPage, page_id)
    if page is None or page.notebook_id != notebook_id:
        raise HTTPException(status_code=404, detail="Page not found")

    # 防止刪掉最後一頁
    total = db.execute(
        select(func.count(NotebookPage.id)).where(
            NotebookPage.notebook_id == notebook_id
        )
    ).scalar() or 0
    if total <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last page")

    db.delete(page)
    db.commit()


@router.post("/{notebook_id}/pages/reorder", status_code=204)
async def reorder_pages(
    notebook_id: int,
    payload: NotebookPageReorderPayload,
    user: CurrentUser,
    db: DbSession,
) -> None:
    _ensure_notebook_access(notebook_id, user.id, db)
    id_to_num = {item.id: item.page_number for item in payload.pages}

    pages = list(
        db.execute(
            select(NotebookPage).where(NotebookPage.notebook_id == notebook_id)
        ).scalars()
    )
    for p in pages:
        if p.id in id_to_num:
            p.page_number = id_to_num[p.id]
    db.commit()


# ─── OCR ────────────────────────────────────────────────────────────────────


class OcrPayload(BaseModel):
    image: str  # data URL (data:image/png;base64,...)


class OcrResponse(BaseModel):
    text: str
    tags: list[str]


@router.post("/{notebook_id}/pages/{page_id}/ocr", response_model=OcrResponse)
async def ocr_page(
    notebook_id: int,
    page_id: int,
    payload: OcrPayload,
    user: CurrentUser,
    db: DbSession,
) -> OcrResponse:
    """對 page PNG 做 OCR，並將 text + #tag 寫返入 page 記錄。"""
    _ensure_notebook_access(notebook_id, user.id, db)
    page = db.get(NotebookPage, page_id)
    if page is None or page.notebook_id != notebook_id:
        raise HTTPException(status_code=404, detail="Page not found")

    try:
        text = ocr_page_image(payload.image)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    tags = extract_inline_tags(text)

    # 將 OCR 文字 merge 入 text_content（替換，因為 tldraw text shapes 已另外 extract）
    page.text_content = text
    # #tag 合併入 tags（避免重複）
    existing = {t.strip() for t in (page.tags or "").split(",") if t.strip()}
    existing.update(tags)
    page.tags = ",".join(sorted(existing))
    db.commit()

    return OcrResponse(text=text, tags=tags)


