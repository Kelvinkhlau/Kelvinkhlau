"""Web Push subscription routes — 用戶瀏覽器 subscribe / unsubscribe / 管理。"""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.config import get_settings
from app.deps import CurrentUser, DbSession, current_user
from app.models.push_subscription import PushSubscription
from app.services import push_service

logger = logging.getLogger(__name__)

router = APIRouter()


class SubscriptionKeys(BaseModel):
    p256dh: str = Field(..., min_length=1)
    auth: str = Field(..., min_length=1)


class SubscriptionPayload(BaseModel):
    endpoint: str = Field(..., min_length=1)
    keys: SubscriptionKeys
    user_agent: str | None = None
    label: str | None = None


class VapidPublicKeyResponse(BaseModel):
    public_key: str | None
    configured: bool


class SubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    user_agent: str
    enabled: bool
    created_at: datetime
    is_current: bool = False


class SubscriptionUpdate(BaseModel):
    label: str | None = Field(None, max_length=100)
    enabled: bool | None = None


@router.get("/push/vapid-public-key", response_model=VapidPublicKeyResponse)
async def vapid_public_key() -> VapidPublicKeyResponse:
    """公開 endpoint — 俾 frontend 攞 VAPID public key 做 subscribe。"""
    settings = get_settings()
    return VapidPublicKeyResponse(
        public_key=settings.vapid_public_key,
        configured=push_service.is_configured(),
    )


@router.post(
    "/push/subscribe",
    response_model=SubscriptionOut,
    status_code=201,
    dependencies=[Depends(current_user)],
)
async def subscribe_push(
    payload: SubscriptionPayload, user: CurrentUser, db: DbSession
) -> PushSubscription:
    if not push_service.is_configured():
        raise HTTPException(status_code=503, detail="Push service not configured")

    # Upsert by endpoint (同一 browser 再 subscribe 會更新 keys)
    existing = db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint)
    ).scalar_one_or_none()

    ua = (payload.user_agent or "")[:500]
    label = (payload.label or "").strip()[:100]

    if existing is not None:
        existing.user_id = user.id
        existing.p256dh_key = payload.keys.p256dh
        existing.auth_key = payload.keys.auth
        existing.user_agent = ua
        # Only overwrite label if caller provided one (preserve prior custom name)
        if label:
            existing.label = label
        existing.enabled = True
        sub = existing
    else:
        sub = PushSubscription(
            user_id=user.id,
            endpoint=payload.endpoint,
            p256dh_key=payload.keys.p256dh,
            auth_key=payload.keys.auth,
            user_agent=ua,
            label=label,
            enabled=True,
        )
        db.add(sub)

    db.commit()
    db.refresh(sub)
    return sub


class UnsubscribePayload(BaseModel):
    endpoint: str = Field(..., min_length=1)


@router.post(
    "/push/unsubscribe",
    status_code=204,
    dependencies=[Depends(current_user)],
)
async def unsubscribe_push(
    payload: UnsubscribePayload, user: CurrentUser, db: DbSession
) -> None:
    sub = db.execute(
        select(PushSubscription).where(
            PushSubscription.endpoint == payload.endpoint,
            PushSubscription.user_id == user.id,
        )
    ).scalar_one_or_none()
    if sub is not None:
        db.delete(sub)
        db.commit()


@router.get(
    "/push/subscriptions",
    response_model=list[SubscriptionOut],
    dependencies=[Depends(current_user)],
)
async def list_subscriptions(
    user: CurrentUser,
    db: DbSession,
    current_endpoint: str | None = None,
) -> list[SubscriptionOut]:
    """列出當前用戶所有 push 訂閱（裝置清單）。

    `current_endpoint` — 由 frontend 傳入本機 endpoint，用嚟標示「呢部機」。
    """
    stmt = (
        select(PushSubscription)
        .where(PushSubscription.user_id == user.id)
        .order_by(PushSubscription.created_at.desc())
    )
    subs = list(db.execute(stmt).scalars())
    return [
        SubscriptionOut(
            id=s.id,
            label=s.label,
            user_agent=s.user_agent,
            enabled=s.enabled,
            created_at=s.created_at,
            is_current=(current_endpoint is not None and s.endpoint == current_endpoint),
        )
        for s in subs
    ]


@router.patch(
    "/push/subscriptions/{sub_id}",
    response_model=SubscriptionOut,
    dependencies=[Depends(current_user)],
)
async def update_subscription(
    sub_id: int,
    payload: SubscriptionUpdate,
    user: CurrentUser,
    db: DbSession,
) -> PushSubscription:
    sub = db.get(PushSubscription, sub_id)
    if sub is None or sub.user_id != user.id:
        raise HTTPException(status_code=404, detail="Subscription not found")

    if payload.label is not None:
        sub.label = payload.label.strip()[:100]
    if payload.enabled is not None:
        sub.enabled = payload.enabled

    db.commit()
    db.refresh(sub)
    return sub


@router.delete(
    "/push/subscriptions/{sub_id}",
    status_code=204,
    dependencies=[Depends(current_user)],
)
async def delete_subscription(
    sub_id: int, user: CurrentUser, db: DbSession
) -> None:
    sub = db.get(PushSubscription, sub_id)
    if sub is None or sub.user_id != user.id:
        raise HTTPException(status_code=404, detail="Subscription not found")
    db.delete(sub)
    db.commit()


@router.post(
    "/push/test",
    dependencies=[Depends(current_user)],
)
async def test_push(user: CurrentUser, db: DbSession) -> dict:
    """Dev / debug — 發一條測試 push 到用戶所有 enabled subscriptions。"""
    if not push_service.is_configured():
        raise HTTPException(status_code=503, detail="Push service not configured")
    sent = push_service.send_to_user(
        db,
        user.id,
        title="life-os 測試通知",
        body="呢條係測試推送 — 如果你見到呢個就 OK 啦！",
        url="/",
        tag="lifeos-test",
    )
    return {"sent": sent}
