"""Muted sender API — 管理封鎖寄件者名單。

封鎖咗嘅寄件者：
- 現有 email 標記為 archived
- 日後新 email 自動 archived（唔會出現喺 inbox）
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update

from app.deps import CurrentUser, DbSession, current_user
from app.models.email import Email
from app.models.muted_sender import MutedSender
from app.schemas.muted import MutedCreate, MutedOut, MutedUpdate

router = APIRouter(dependencies=[Depends(current_user)])


@router.get("", response_model=list[MutedOut])
async def list_muted(user: CurrentUser, db: DbSession) -> list[MutedSender]:
    stmt = (
        select(MutedSender)
        .where(MutedSender.user_id == user.id)
        .order_by(MutedSender.email)
    )
    return list(db.execute(stmt).scalars().all())


@router.post("", response_model=MutedOut, status_code=201)
async def add_muted(
    payload: MutedCreate, user: CurrentUser, db: DbSession
) -> MutedSender:
    sender_email = payload.email.lower().strip()

    # 已經封鎖 — 直接返回現有記錄
    existing = db.execute(
        select(MutedSender).where(
            MutedSender.user_id == user.id,
            MutedSender.email == sender_email,
        )
    ).scalars().first()
    if existing:
        return existing

    muted = MutedSender(
        user_id=user.id,
        email=sender_email,
        name=payload.name.strip(),
        reason=payload.reason,
    )
    db.add(muted)

    # 同時 archive 呢個寄件者嘅所有現有 email
    db.execute(
        update(Email)
        .where(Email.user_id == user.id, Email.sender_email == sender_email)
        .values(is_archived=True)
    )

    db.commit()
    db.refresh(muted)
    return muted


@router.delete("/{muted_id}", status_code=204)
async def remove_muted(
    muted_id: int, user: CurrentUser, db: DbSession
) -> None:
    muted = db.get(MutedSender, muted_id)
    if muted is None or muted.user_id != user.id:
        raise HTTPException(status_code=404, detail="Muted sender not found")

    # 解除封鎖：un-archive 呢個寄件者嘅 email
    db.execute(
        update(Email)
        .where(Email.user_id == user.id, Email.sender_email == muted.email)
        .values(is_archived=False)
    )

    db.delete(muted)
    db.commit()


def is_muted(db, user_id: int, sender_email: str) -> bool:
    """快速 check 一個 email 係咪被封鎖。"""
    return (
        db.execute(
            select(MutedSender.id).where(
                MutedSender.user_id == user_id,
                MutedSender.email == sender_email.lower(),
            )
        )
        .scalars()
        .first()
        is not None
    )
