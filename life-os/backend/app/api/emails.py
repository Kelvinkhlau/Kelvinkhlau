"""Email API routes。"""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.orm import selectinload

from app.deps import DbSession
from app.models.email import Email, EmailClassification
from app.models.user import User
from app.schemas.email import CategoryUpdate, EmailDetail, EmailOut
from app.services import email_sync

router = APIRouter()


class SyncResponse(BaseModel):
    fetched: int
    new: int
    classified: int
    errors: list[str]


@router.get("", response_model=list[EmailOut])
async def list_emails(
    db: DbSession,
    category: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
) -> list[Email]:
    """列出 emails，可以按類別過濾。"""
    stmt = (
        select(Email)
        .options(selectinload(Email.classification))
        .order_by(desc(Email.received_at))
        .limit(limit)
        .offset(offset)
    )
    if category:
        stmt = stmt.join(EmailClassification, EmailClassification.email_id == Email.id).where(
            func.coalesce(EmailClassification.user_category, EmailClassification.ai_category)
            == category
        )
    result = db.execute(stmt).scalars().all()
    return list(result)


@router.get("/{email_id}", response_model=EmailDetail)
async def get_email(email_id: int, db: DbSession) -> Email:
    """睇 email 詳情。"""
    email = db.get(Email, email_id)
    if email is None:
        raise HTTPException(status_code=404, detail="Email not found")
    return email


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
