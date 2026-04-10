"""Email sync service — 拉 Gmail 郵件入本地 SQLite，並 trigger AI 分類。"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.vip import is_vip
from app.db import SessionLocal
from app.models.email import Email, EmailClassification
from app.models.user import User
from app.services import ai_classifier
from app.services.gmail_client import GmailClient, ParsedMessage
from app.services.ws_manager import manager as ws_manager

logger = logging.getLogger(__name__)


@dataclass
class SyncResult:
    fetched: int
    new: int
    classified: int
    errors: list[str]


def sync_for_user(
    db: Session,
    user: User,
    *,
    limit: int = 50,
    use_history: bool = True,
    classify: bool = True,
) -> SyncResult:
    """同步一個 user 嘅 Gmail inbox。

    - `limit`：fallback 模式嘅最大封數（冇 history_id 時）
    - `use_history`：用 Gmail History API 做 incremental sync（如果有 history_id）
    - `classify`：每封新 email 係咪 call Claude 分類
    """
    if not user.gmail_refresh_token:
        return SyncResult(fetched=0, new=0, classified=0, errors=["User not connected to Gmail"])

    client = GmailClient(refresh_token=user.gmail_refresh_token)
    errors: list[str] = []

    # 決定要 fetch 邊啲 message IDs
    if use_history and user.gmail_history_id:
        message_ids = client.get_history_since(user.gmail_history_id)
    else:
        message_ids = client.list_recent_message_ids(max_results=limit)

    new_count = 0
    classified_count = 0
    new_emails: list[Email] = []

    for msg_id in message_ids:
        # 避免重複寫
        existing = db.execute(
            select(Email).where(Email.gmail_message_id == msg_id)
        ).scalar_one_or_none()
        if existing is not None:
            continue

        try:
            parsed: ParsedMessage = client.get_message(msg_id)
        except Exception as e:
            errors.append(f"get_message {msg_id}: {e}")
            continue

        email = Email(
            user_id=user.id,
            gmail_message_id=parsed.gmail_message_id,
            gmail_thread_id=parsed.gmail_thread_id,
            subject=parsed.subject,
            sender=parsed.sender,
            sender_email=parsed.sender_email,
            recipients=parsed.recipients,
            snippet=parsed.snippet,
            body_text=parsed.body_text,
            body_html=parsed.body_html,
            received_at=parsed.received_at,
            has_attachment=parsed.has_attachment,
        )
        db.add(email)
        db.flush()  # 攞返 email.id
        new_count += 1
        new_emails.append(email)

        # 分類：VIP → 直接 "important"；否則用 AI
        if classify:
            try:
                if is_vip(db, user.id, parsed.sender_email):
                    classification = EmailClassification(
                        email_id=email.id,
                        ai_category="important",
                        ai_confidence=1.0,
                        ai_reason="VIP 白名單",
                        ai_model="vip-rule",
                    )
                else:
                    result = ai_classifier.classify_email(
                        subject=parsed.subject,
                        sender=parsed.sender,
                        snippet=parsed.snippet or parsed.body_text[:500],
                    )
                    classification = EmailClassification(
                        email_id=email.id,
                        ai_category=result.category,
                        ai_confidence=result.confidence,
                        ai_reason=result.reason,
                        ai_model=result.model,
                    )
                db.add(classification)
                classified_count += 1
            except Exception as e:
                errors.append(f"classify {msg_id}: {e}")
                logger.exception("classify failed for %s", msg_id)

    # Update history_id
    try:
        user.gmail_history_id = client.get_profile_history_id()
    except Exception as e:
        errors.append(f"get_profile_history_id: {e}")

    db.commit()

    # Broadcast 新 email 事件俾連住嘅 WS clients
    for email in new_emails:
        try:
            db.refresh(email)
            payload = {
                "type": "email.new",
                "email": {
                    "id": email.id,
                    "subject": email.subject,
                    "sender": email.sender,
                    "sender_email": email.sender_email,
                    "snippet": email.snippet,
                    "received_at": email.received_at.isoformat()
                    if email.received_at
                    else None,
                    "is_read": email.is_read,
                    "has_attachment": email.has_attachment,
                    "classification": {
                        "ai_category": email.classification.ai_category,
                        "ai_confidence": email.classification.ai_confidence,
                        "ai_reason": email.classification.ai_reason,
                        "user_category": email.classification.user_category,
                        "final_category": email.classification.final_category,
                    }
                    if email.classification
                    else None,
                },
            }
            ws_manager.broadcast_threadsafe(payload)
        except Exception:
            logger.exception("broadcast new email failed")

    if new_count > 0 or classified_count > 0:
        ws_manager.broadcast_threadsafe(
            {
                "type": "sync.done",
                "new": new_count,
                "classified": classified_count,
            }
        )

    return SyncResult(
        fetched=len(message_ids),
        new=new_count,
        classified=classified_count,
        errors=errors,
    )


def sync_gmail_inbox() -> None:
    """APScheduler 每 5 分鐘 call — 同步所有 users（單用戶系統通常只有一個）。"""
    db = SessionLocal()
    try:
        users = db.execute(
            select(User).where(User.gmail_refresh_token.is_not(None))
        ).scalars().all()
        for user in users:
            try:
                result = sync_for_user(db, user, limit=50, use_history=True)
                logger.info(
                    "Synced user %s: fetched=%d new=%d classified=%d errors=%d",
                    user.email,
                    result.fetched,
                    result.new,
                    result.classified,
                    len(result.errors),
                )
            except Exception:
                logger.exception("Background sync failed for user %s", user.email)
    finally:
        db.close()
