"""Smart Labels API — 智能標籤管理。"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import selectinload

from app.deps import CurrentUser, DbSession, current_user
from app.models.email import Email
from app.models.smart_label import SmartLabel
from app.schemas.email import EmailOut
from app.services.audit import log_action

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(current_user)])


class SmartLabelCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    color: str = Field("blue", max_length=20)
    match_patterns: str = Field(..., min_length=1, description="每行一個 pattern")


class SmartLabelUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=50)
    color: str | None = Field(None, max_length=20)
    match_patterns: str | None = None


class SmartLabelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    color: str
    match_patterns: str
    email_count: int = 0


@router.get("", response_model=list[SmartLabelOut])
async def list_labels(user: CurrentUser, db: DbSession) -> list[dict]:
    """列出所有智能標籤（包含匹配郵件數）。"""
    labels = (
        db.execute(
            select(SmartLabel)
            .where(SmartLabel.user_id == user.id)
            .order_by(SmartLabel.name)
        )
        .scalars()
        .all()
    )

    result = []
    for label in labels:
        # 用 smart_label_id 計數（已歸檔嘅）
        count = (
            db.execute(
                select(func.count(Email.id)).where(
                    Email.user_id == user.id,
                    Email.smart_label_id == label.id,
                )
            ).scalar()
            or 0
        )
        # 如果冇歸檔紀錄，fallback 用 pattern match 計數
        if count == 0:
            patterns = [p.strip() for p in label.match_patterns.split("\n") if p.strip()]
            if patterns:
                conditions = [Email.sender_email.contains(p) for p in patterns]
                count = (
                    db.execute(
                        select(func.count(Email.id)).where(
                            Email.user_id == user.id,
                            or_(*conditions),
                        )
                    ).scalar()
                    or 0
                )
        result.append(
            {
                "id": label.id,
                "name": label.name,
                "color": label.color,
                "match_patterns": label.match_patterns,
                "email_count": count,
            }
        )
    return result


@router.post("", response_model=SmartLabelOut, status_code=201)
async def create_label(
    payload: SmartLabelCreate, user: CurrentUser, db: DbSession
) -> dict:
    """建立新智能標籤。"""
    label = SmartLabel(
        user_id=user.id,
        name=payload.name,
        color=payload.color,
        match_patterns=payload.match_patterns,
    )
    db.add(label)
    db.commit()
    db.refresh(label)
    log_action(
        db,
        action="create",
        user_id=user.id,
        resource_type="smart_label",
        resource_id=label.id,
        detail=label.name,
    )
    return {
        "id": label.id,
        "name": label.name,
        "color": label.color,
        "match_patterns": label.match_patterns,
        "email_count": 0,
    }


@router.patch("/{label_id}", response_model=SmartLabelOut)
async def update_label(
    label_id: int, payload: SmartLabelUpdate, user: CurrentUser, db: DbSession
) -> dict:
    """更新智能標籤。"""
    label = db.get(SmartLabel, label_id)
    if not label or label.user_id != user.id:
        raise HTTPException(status_code=404, detail="Label not found")
    for field in payload.model_fields_set:
        setattr(label, field, getattr(payload, field))
    db.commit()
    db.refresh(label)
    return {
        "id": label.id,
        "name": label.name,
        "color": label.color,
        "match_patterns": label.match_patterns,
        "email_count": 0,
    }


@router.delete("/{label_id}", status_code=204)
async def delete_label(label_id: int, user: CurrentUser, db: DbSession) -> None:
    """刪除智能標籤。"""
    label = db.get(SmartLabel, label_id)
    if not label or label.user_id != user.id:
        raise HTTPException(status_code=404, detail="Label not found")
    db.delete(label)
    db.commit()
    log_action(
        db,
        action="delete",
        user_id=user.id,
        resource_type="smart_label",
        resource_id=label_id,
        detail=label.name,
    )


@router.get("/emails/{label_id}", response_model=list[EmailOut])
async def emails_by_label(
    label_id: int,
    user: CurrentUser,
    db: DbSession,
    q: str | None = Query(None, description="搜尋關鍵字"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
) -> list[Email]:
    """列出已歸檔到某標籤嘅郵件（用 smart_label_id 查，fallback 用 pattern match）。"""
    label = db.get(SmartLabel, label_id)
    if not label or label.user_id != user.id:
        raise HTTPException(status_code=404, detail="Label not found")

    # 用 smart_label_id 直接查
    stmt = (
        select(Email)
        .where(Email.user_id == user.id, Email.smart_label_id == label_id)
        .options(selectinload(Email.classification))
    )

    if q:
        keyword = f"%{q}%"
        stmt = stmt.where(
            or_(
                Email.subject.ilike(keyword),
                Email.sender.ilike(keyword),
                Email.snippet.ilike(keyword),
            )
        )

    stmt = stmt.order_by(desc(Email.received_at)).limit(limit).offset(offset)
    results = list(db.execute(stmt).scalars().all())

    # Fallback: 如果 smart_label_id 冇結果且冇搜尋，用 pattern match（向後兼容）
    if not results and not q:
        patterns = [p.strip() for p in label.match_patterns.split("\n") if p.strip()]
        if patterns:
            conditions = [Email.sender_email.contains(p) for p in patterns]
            fallback_stmt = (
                select(Email)
                .where(Email.user_id == user.id, or_(*conditions))
                .options(selectinload(Email.classification))
                .order_by(desc(Email.received_at))
                .limit(limit)
                .offset(offset)
            )
            results = list(db.execute(fallback_stmt).scalars().all())

    return results


@router.post("/match-all")
async def match_all_emails(user: CurrentUser, db: DbSession) -> dict:
    """批量配對所有未標記嘅郵件到智能標籤。"""
    from app.services.label_matcher import auto_label_batch
    count = auto_label_batch(db, user.id)
    return {"matched": count}
