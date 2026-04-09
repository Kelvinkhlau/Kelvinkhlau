"""Email API routes。"""

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import desc, select

from app.deps import DbSession
from app.models.email import Email
from app.schemas.email import CategoryUpdate, EmailDetail, EmailOut

router = APIRouter()


@router.get("", response_model=list[EmailOut])
async def list_emails(
    db: DbSession,
    category: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
) -> list[Email]:
    """列出 emails，可以按類別過濾。"""
    stmt = select(Email).order_by(desc(Email.received_at)).limit(limit).offset(offset)
    # TODO: 加 category filter（join classification）
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
async def update_category(email_id: int, payload: CategoryUpdate, db: DbSession) -> dict:
    """修正 AI 分類。"""
    # TODO: MVP Week 3 實作
    raise HTTPException(status_code=501, detail="MVP Week 3 implementation")
