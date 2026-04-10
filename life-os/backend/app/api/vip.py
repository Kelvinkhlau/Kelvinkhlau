"""VIP sender API — 管理白名單。"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.deps import CurrentUser, DbSession, current_user
from app.models.vip import VipSender
from app.schemas.vip import VipCreate, VipOut, VipUpdate

router = APIRouter(dependencies=[Depends(current_user)])


@router.get("", response_model=list[VipOut])
async def list_vips(user: CurrentUser, db: DbSession) -> list[VipSender]:
    stmt = (
        select(VipSender)
        .where(VipSender.user_id == user.id)
        .order_by(VipSender.email)
    )
    return list(db.execute(stmt).scalars().all())


@router.post("", response_model=VipOut, status_code=201)
async def add_vip(
    payload: VipCreate, user: CurrentUser, db: DbSession
) -> VipSender:
    # 防止重複
    existing = (
        db.execute(
            select(VipSender).where(
                VipSender.user_id == user.id,
                VipSender.email == payload.email.lower(),
            )
        )
        .scalars()
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="已經喺 VIP 名單入面")

    vip = VipSender(
        user_id=user.id,
        email=payload.email.lower(),
        name=payload.name.strip(),
        note=payload.note,
    )
    db.add(vip)
    db.commit()
    db.refresh(vip)
    return vip


@router.patch("/{vip_id}", response_model=VipOut)
async def update_vip(
    vip_id: int, payload: VipUpdate, user: CurrentUser, db: DbSession
) -> VipSender:
    vip = db.get(VipSender, vip_id)
    if vip is None or vip.user_id != user.id:
        raise HTTPException(status_code=404, detail="VIP not found")
    if payload.name is not None:
        vip.name = payload.name.strip()
    if payload.note is not None:
        vip.note = payload.note
    db.commit()
    db.refresh(vip)
    return vip


@router.delete("/{vip_id}", status_code=204)
async def remove_vip(
    vip_id: int, user: CurrentUser, db: DbSession
) -> None:
    vip = db.get(VipSender, vip_id)
    if vip is None or vip.user_id != user.id:
        raise HTTPException(status_code=404, detail="VIP not found")
    db.delete(vip)
    db.commit()


def is_vip(db, user_id: int, sender_email: str) -> bool:
    """快速 check 一個 email 係咪 VIP。"""
    return (
        db.execute(
            select(VipSender.id).where(
                VipSender.user_id == user_id,
                VipSender.email == sender_email.lower(),
            )
        )
        .scalars()
        .first()
        is not None
    )
