"""Subscription API routes — 定期訂閱管理。"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select

from app.deps import CurrentUser, DbSession, current_user
from app.models.subscription import Subscription
from app.schemas.subscription import SubscriptionCreate, SubscriptionOut, SubscriptionUpdate

router = APIRouter(dependencies=[Depends(current_user)])


@router.get("", response_model=list[SubscriptionOut])
async def list_subscriptions(
    user: CurrentUser, db: DbSession, active_only: bool = True
) -> list[Subscription]:
    stmt = select(Subscription).where(Subscription.user_id == user.id)
    if active_only:
        stmt = stmt.where(Subscription.active.is_(True))
    return list(db.execute(stmt.order_by(Subscription.next_billing)).scalars().all())


@router.post("", response_model=SubscriptionOut, status_code=201)
async def create_subscription(
    payload: SubscriptionCreate, user: CurrentUser, db: DbSession
) -> Subscription:
    sub = Subscription(user_id=user.id, **payload.model_dump())
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


@router.patch("/{sub_id}", response_model=SubscriptionOut)
async def update_subscription(
    sub_id: int, payload: SubscriptionUpdate, user: CurrentUser, db: DbSession
) -> Subscription:
    sub = db.get(Subscription, sub_id)
    if sub is None or sub.user_id != user.id:
        raise HTTPException(status_code=404, detail="Subscription not found")
    for field in payload.model_fields_set:
        setattr(sub, field, getattr(payload, field))
    db.commit()
    db.refresh(sub)
    return sub


@router.delete("/{sub_id}", status_code=204)
async def delete_subscription(
    sub_id: int, user: CurrentUser, db: DbSession
) -> None:
    sub = db.get(Subscription, sub_id)
    if sub is None or sub.user_id != user.id:
        raise HTTPException(status_code=404, detail="Subscription not found")
    db.delete(sub)
    db.commit()
