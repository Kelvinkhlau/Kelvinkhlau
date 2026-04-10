"""Email API routes。"""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import selectinload

from app.deps import DbSession, current_user
from app.models.email import Email, EmailClassification
from app.models.user import User
from app.schemas.email import CategoryUpdate, EmailOut
from app.services import ai_classifier, email_sync

logger = logging.getLogger(__name__)

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
    base = select(Email).options(selectinload(Email.classification)).where(
        Email.is_archived.is_(False)
    )

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


@router.get("/{email_id}")
async def get_email(email_id: int, db: DbSession) -> dict:
    """睇 email 詳情 — 包含 prev_id / next_id 方便前後導航。"""
    email = db.get(Email, email_id)
    if email is None:
        raise HTTPException(status_code=404, detail="Email not found")

    # 上一封（時間較新）
    prev_row = db.execute(
        select(Email.id)
        .where(Email.is_archived.is_(False), Email.received_at > email.received_at)
        .order_by(Email.received_at.asc())
        .limit(1)
    ).scalar_one_or_none()

    # 下一封（時間較舊）
    next_row = db.execute(
        select(Email.id)
        .where(Email.is_archived.is_(False), Email.received_at < email.received_at)
        .order_by(Email.received_at.desc())
        .limit(1)
    ).scalar_one_or_none()

    # Serialize classification
    cls_data = None
    if email.classification:
        cls_data = {
            "ai_category": email.classification.ai_category,
            "ai_confidence": email.classification.ai_confidence,
            "ai_reason": email.classification.ai_reason,
            "user_category": email.classification.user_category,
            "final_category": email.classification.final_category,
        }

    return {
        "id": email.id,
        "subject": email.subject,
        "sender": email.sender,
        "sender_email": email.sender_email,
        "snippet": email.snippet,
        "received_at": email.received_at.isoformat() if email.received_at else None,
        "is_read": email.is_read,
        "is_archived": email.is_archived,
        "has_attachment": email.has_attachment,
        "classification": cls_data,
        "body_text": email.body_text,
        "body_html": email.body_html,
        "recipients": email.recipients,
        "prev_id": prev_row,
        "next_id": next_row,
    }


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


@router.put("/{email_id}/archive")
async def archive_email(email_id: int, db: DbSession, archive: bool = True) -> dict:
    """Archive / un-archive 一封 email。"""
    email = db.get(Email, email_id)
    if email is None:
        raise HTTPException(status_code=404, detail="Email not found")
    email.is_archived = archive
    db.commit()
    return {"ok": True, "is_archived": archive}


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


class AiTestResponse(BaseModel):
    ok: bool
    provider: str
    model: str | None = None
    result: dict | None = None
    error: str | None = None


@router.get("/ai-test", response_model=AiTestResponse)
async def ai_test() -> AiTestResponse:
    """測試 AI 分類 API 連線是否正常。

    用一封假 email 做測試 — 唔會寫入 DB。
    """
    from app.config import get_settings

    settings = get_settings()
    provider = (settings.ai_provider or "auto").lower()

    try:
        result = ai_classifier.classify_email(
            subject="Test: 50% off all items today only!",
            sender="promo@testshop.com",
            snippet="Don't miss our biggest sale of the year. Use code SAVE50 at checkout.",
        )
        return AiTestResponse(
            ok=True,
            provider=provider,
            model=result.model,
            result={
                "category": result.category,
                "confidence": result.confidence,
                "reason": result.reason,
            },
        )
    except Exception as e:
        logger.exception("AI test failed")
        return AiTestResponse(
            ok=False,
            provider=provider,
            error=str(e),
        )


class ClassifyAllResponse(BaseModel):
    total_unclassified: int
    classified: int
    errors: list[str]


@router.post("/classify-all", response_model=ClassifyAllResponse)
async def classify_all(
    db: DbSession,
    limit: int = Query(50, ge=1, le=500),
) -> ClassifyAllResponse:
    """批量分類所有未分類嘅 emails。

    修好 AI API key 之後用呢個 endpoint 補返之前漏咗嘅分類。
    """
    # 搵所有冇 classification 嘅 email
    subq = select(EmailClassification.email_id)
    stmt = (
        select(Email)
        .where(Email.id.notin_(subq))
        .order_by(desc(Email.received_at))
        .limit(limit)
    )
    emails = db.execute(stmt).scalars().all()
    total = len(emails)

    if total == 0:
        return ClassifyAllResponse(total_unclassified=0, classified=0, errors=[])

    # 撈 few-shot examples
    examples = email_sync._get_recent_corrections(db, limit=5)

    classified = 0
    errors: list[str] = []

    for email in emails:
        try:
            # Check VIP / muted rules first
            from app.api.muted import is_muted
            from app.api.vip import is_vip

            user_id = email.user_id

            if is_vip(db, user_id, email.sender_email):
                cls = EmailClassification(
                    email_id=email.id,
                    ai_category="important",
                    ai_confidence=1.0,
                    ai_reason="VIP 白名單",
                    ai_model="vip-rule",
                )
            elif is_muted(db, user_id, email.sender_email):
                cls = EmailClassification(
                    email_id=email.id,
                    ai_category="promotional",
                    ai_confidence=1.0,
                    ai_reason="封鎖寄件者",
                    ai_model="muted-rule",
                )
                email.is_archived = True
            else:
                result = ai_classifier.classify_email(
                    subject=email.subject,
                    sender=email.sender,
                    snippet=email.snippet or (email.body_text or "")[:500],
                    examples=examples,
                )
                cls = EmailClassification(
                    email_id=email.id,
                    ai_category=result.category,
                    ai_confidence=result.confidence,
                    ai_reason=result.reason,
                    ai_model=result.model,
                )
                # 廣告高信心 → 自動 archive
                if result.category == "promotional" and result.confidence >= 0.75:
                    email.is_archived = True
            db.add(cls)
            classified += 1
        except Exception as e:
            errors.append(f"email {email.id} ({email.subject[:30]}): {e}")
            logger.exception("classify-all failed for email %d", email.id)

    db.commit()
    return ClassifyAllResponse(
        total_unclassified=total,
        classified=classified,
        errors=errors,
    )
