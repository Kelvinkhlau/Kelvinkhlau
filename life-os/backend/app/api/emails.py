"""Email API routes。"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import selectinload

from app.deps import DbSession, current_user
from app.models.email import Email, EmailClassification
from app.models.user import User
from app.schemas.email import CategoryUpdate, EmailDetail, EmailOut
from app.services import email_sync

# 所有 emails endpoints 都要 JWT auth
router = APIRouter(dependencies=[Depends(current_user)])


class SyncResponse(BaseModel):
    fetched: int
    new: int
    classified: int
    errors: list[str]


class EmailStats(BaseModel):
    total: int
    unread: int
    today_new: int
    by_category: dict[str, int]


@router.get("", response_model=list[EmailOut])
async def list_emails(
    db: DbSession,
    response: Response,
    category: str | None = Query(None, description="important / normal / promotional"),
    q: str | None = Query(None, description="搜尋 subject / sender / snippet / body"),
    unread_only: bool = Query(False),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
) -> list[Email]:
    """列出 emails — 可以按類別過濾同/或全文搜尋。

    Response header `X-Total-Count` 係過濾後嘅總數（俾前端做 pagination）。
    """
    base = select(Email).options(selectinload(Email.classification))

    if category:
        base = base.join(
            EmailClassification, EmailClassification.email_id == Email.id
        ).where(
            func.coalesce(EmailClassification.user_category, EmailClassification.ai_category)
            == category
        )

    if q:
        pattern = f"%{q}%"
        base = base.where(
            or_(
                Email.subject.ilike(pattern),
                Email.sender.ilike(pattern),
                Email.snippet.ilike(pattern),
                Email.body_text.ilike(pattern),
            )
        )

    if unread_only:
        base = base.where(Email.is_read.is_(False))

    # Count before pagination
    count_stmt = select(func.count()).select_from(base.subquery())
    total = db.execute(count_stmt).scalar_one()
    response.headers["X-Total-Count"] = str(total)

    stmt = base.order_by(desc(Email.received_at)).limit(limit).offset(offset)
    result = db.execute(stmt).scalars().all()
    return list(result)


@router.get("/stats", response_model=EmailStats)
async def email_stats(db: DbSession) -> EmailStats:
    """Dashboard 統計：總數、未讀、今日新、按分類 breakdown。"""
    total = db.execute(select(func.count()).select_from(Email)).scalar_one()
    unread = db.execute(
        select(func.count()).select_from(Email).where(Email.is_read.is_(False))
    ).scalar_one()

    # 今日（本地 00:00 — 為簡單 UTC cut-off）
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_new = db.execute(
        select(func.count())
        .select_from(Email)
        .where(Email.received_at >= today_start)
    ).scalar_one()

    # By category — coalesce user override 同 ai category
    category_col = func.coalesce(
        EmailClassification.user_category, EmailClassification.ai_category
    )
    rows = db.execute(
        select(category_col, func.count())
        .join(Email, Email.id == EmailClassification.email_id)
        .group_by(category_col)
    ).all()
    by_category = {str(cat): int(cnt) for cat, cnt in rows}

    return EmailStats(
        total=total,
        unread=unread,
        today_new=today_new,
        by_category=by_category,
    )


@router.get("/{email_id}", response_model=EmailDetail)
async def get_email(email_id: int, db: DbSession) -> Email:
    """睇 email 詳情。"""
    email = db.get(Email, email_id)
    if email is None:
        raise HTTPException(status_code=404, detail="Email not found")
    return email


@router.put("/{email_id}/read")
async def mark_read(email_id: int, db: DbSession, read: bool = True) -> dict:
    """標記 email 為已讀 / 未讀。"""
    email = db.get(Email, email_id)
    if email is None:
        raise HTTPException(status_code=404, detail="Email not found")
    email.is_read = read
    db.commit()
    return {"ok": True, "is_read": read}


@router.put("/{email_id}/category")
async def update_category(
    email_id: int, payload: CategoryUpdate, db: DbSession
) -> dict:
    """用戶修正 AI 分類。"""
    email = db.get(Email, email_id)
    if email is None:
        raise HTTPException(status_code=404, detail="Email not found")

    classification = email.classification
    if classification is None:
        # 冇 AI 分類都可以 override — 建立一個 manual record
        classification = EmailClassification(
            email_id=email.id,
            ai_category="unclassified",
            ai_confidence=0.0,
            ai_reason=None,
            ai_model="manual",
            user_category=payload.category,
            user_corrected_at=datetime.utcnow(),
        )
        db.add(classification)
    else:
        classification.user_category = payload.category
        classification.user_corrected_at = datetime.utcnow()

    db.commit()
    return {"ok": True, "final_category": payload.category}


@router.post("/sync", response_model=SyncResponse)
async def trigger_sync(
    db: DbSession,
    limit: int = Query(50, ge=1, le=500),
    classify: bool = Query(True),
    use_history: bool = Query(True),
) -> SyncResponse:
    """手動觸發 email sync。

    用法：
    - `POST /api/emails/sync?limit=100&classify=true`
    - 第一次用（冇 history_id）會拉最近 `limit` 封
    - 之後會 incremental sync
    """
    user = db.execute(select(User).limit(1)).scalar_one_or_none()
    if user is None or not user.gmail_refresh_token:
        raise HTTPException(
            status_code=400,
            detail="Gmail 仲未連接 — 請先去 /api/auth/gmail/authorize",
        )

    result = email_sync.sync_for_user(
        db, user, limit=limit, use_history=use_history, classify=classify
    )
    return SyncResponse(
        fetched=result.fetched,
        new=result.new,
        classified=result.classified,
        errors=result.errors,
    )
