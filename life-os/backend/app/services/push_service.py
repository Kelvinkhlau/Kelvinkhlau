"""Web Push (VAPID) — 發送 browser push notifications。

用 pywebpush library。每次 send 失敗如果 endpoint 410 (Gone) 就自動
刪咗個 subscription（browser 已 unsubscribe）。

用法：
    push_service.send_to_user(db, user_id, title="...", body="...", url="/inbox")
"""

import json
import logging

from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.push_subscription import PushSubscription

logger = logging.getLogger(__name__)


def _vapid_claims() -> dict:
    settings = get_settings()
    return {"sub": settings.vapid_email}


def is_configured() -> bool:
    s = get_settings()
    return bool(s.vapid_public_key and s.vapid_private_key)


def send_to_user(
    db: Session,
    user_id: int,
    *,
    title: str,
    body: str,
    url: str = "/",
    tag: str | None = None,
) -> int:
    """發送 push notification 俾一個 user 嘅所有 subscriptions。

    返回成功發送嘅 subscription 數量。
    """
    if not is_configured():
        logger.debug("VAPID keys not configured — skipping push")
        return 0

    settings = get_settings()
    subs = list(
        db.execute(
            select(PushSubscription).where(
                PushSubscription.user_id == user_id,
                PushSubscription.enabled.is_(True),
            )
        ).scalars()
    )
    if not subs:
        return 0

    payload = json.dumps(
        {
            "title": title,
            "body": body,
            "url": url,
            "tag": tag or "lifeos-notification",
        }
    )

    sent = 0
    stale_ids: list[int] = []
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {
                        "p256dh": sub.p256dh_key,
                        "auth": sub.auth_key,
                    },
                },
                data=payload,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims=_vapid_claims(),
            )
            sent += 1
        except WebPushException as exc:
            status = getattr(exc.response, "status_code", None) if exc.response else None
            if status in (404, 410):
                # Subscription is gone — clean up
                stale_ids.append(sub.id)
                logger.info(
                    "Removing stale push subscription %s (HTTP %s)", sub.id, status
                )
            else:
                logger.warning(
                    "Push to sub %s failed (status=%s): %s", sub.id, status, exc
                )
        except Exception as exc:  # pragma: no cover — defensive
            logger.warning("Unexpected push error on sub %s: %s", sub.id, exc)

    if stale_ids:
        for sid in stale_ids:
            stale = db.get(PushSubscription, sid)
            if stale is not None:
                db.delete(stale)
        db.commit()

    return sent
