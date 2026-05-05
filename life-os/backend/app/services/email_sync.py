"""Email sync service — 拉 Gmail / iCloud 郵件入本地 SQLite，並 trigger AI 分類。

共用 pipeline：process_new_emails() 負責所有 post-sync 處理：
  AI 分類 → VIP / 封鎖規則 → 自動 archive → 發票提取 → 訂閱偵測
  → WebSocket 廣播 → Push 通知

Gmail / iCloud 嘅 sync 邏輯各自負責 fetch + dedup + insert，
然後都 call process_new_emails() 完成剩餘步驟。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.muted import is_muted
from app.api.vip import is_vip
from app.db import SessionLocal
from app.models.email import Email, EmailClassification
from app.models.email_attachment import EmailAttachment
from app.models.expense import Expense
from app.models.user import User
from app.services import ai_classifier
from app.services.gmail_client import GmailClient, ParsedMessage
from app.services.ws_manager import manager as ws_manager

logger = logging.getLogger(__name__)


def _get_recent_corrections(db: Session, limit: int = 5) -> list[dict]:
    """撈最近用戶手動修正過嘅分類，做 few-shot examples 俾 AI 學習。"""
    stmt = (
        select(Email.subject, Email.sender, Email.snippet, EmailClassification.user_category)
        .join(EmailClassification, EmailClassification.email_id == Email.id)
        .where(EmailClassification.user_category.isnot(None))
        .order_by(EmailClassification.user_corrected_at.desc())
        .limit(limit)
    )
    rows = db.execute(stmt).all()
    return [
        {
            "subject": row.subject,
            "sender": row.sender,
            "snippet": (row.snippet or "")[:200],
            "category": row.user_category,
        }
        for row in rows
    ]


# ─── 共用 post-sync pipeline ──────────────────────────────────────────────

def process_new_emails(
    db: Session,
    user: User,
    new_emails: list[Email],
    *,
    classify: bool = True,
    source_label: str = "email",
) -> tuple[int, list[str]]:
    """對一批新 Email 物件跑完整 post-sync pipeline。

    包括：AI 分類、VIP/封鎖規則、自動 archive、發票提取、訂閱偵測、
    WebSocket 廣播（含分類資料）、Web Push 通知。

    返回 (classified_count, errors)。
    呢個 function 唔做 commit — caller 負責 commit。
    """
    classified_count = 0
    errors: list[str] = []

    # ── 1. 封鎖寄件者 → 自動 archive ──
    for email in new_emails:
        if is_muted(db, user.id, email.sender_email):
            email.is_archived = True

    # ── 2. AI 分類（VIP / 封鎖 / Claude AI）──
    if classify:
        examples = _get_recent_corrections(db, limit=5)
        for email in new_emails:
            try:
                if is_vip(db, user.id, email.sender_email):
                    cls = EmailClassification(
                        email_id=email.id,
                        ai_category="important",
                        ai_confidence=1.0,
                        ai_reason="VIP 白名單",
                        ai_model="vip-rule",
                    )
                elif is_muted(db, user.id, email.sender_email):
                    cls = EmailClassification(
                        email_id=email.id,
                        ai_category="promotional",
                        ai_confidence=1.0,
                        ai_reason="封鎖寄件者",
                        ai_model="muted-rule",
                    )
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
                        action_required=result.action_required,
                        action_summary=result.action_summary,
                        action_deadline=result.action_deadline,
                    )
                    if result.category == "promotional":
                        email.is_archived = True
                db.add(cls)
                classified_count += 1
            except Exception as e:
                errors.append(f"classify {email.id}: {e}")
                logger.exception("classify failed for email %d", email.id)

    # ── 3. 發票提取（important emails）──
    for email in new_emails:
        if not email.classification:
            continue
        if email.classification.final_category != "important":
            continue
        dup = db.execute(
            select(Expense.id).where(Expense.source_email_id == email.id)
        ).scalar_one_or_none()
        if dup is not None:
            continue
        try:
            from app.services.invoice_extractor import extract_invoice

            inv = extract_invoice(
                subject=email.subject,
                sender=email.sender,
                body=email.body_text or email.snippet,
            )
            if inv.has_invoice and inv.confidence >= 0.7 and inv.amount is not None:
                from datetime import date as date_type

                expense = Expense(
                    user_id=user.id,
                    amount=inv.amount,
                    currency=inv.currency,
                    category=inv.category,
                    description=inv.description,
                    merchant=inv.merchant,
                    spent_at=inv.spent_date or date_type.today(),
                    source="email",
                    source_email_id=email.id,
                )
                db.add(expense)
                logger.info(
                    "Auto-extracted expense %.2f %s from email %d",
                    inv.amount, inv.currency, email.id,
                )
        except Exception as e:
            errors.append(f"invoice_extract {email.id}: {e}")
            logger.exception("Invoice extraction failed for email %d", email.id)

    # ── 4. 訂閱偵測（important emails）──
    from app.models.subscription import Subscription as SubscriptionModel

    for email in new_emails:
        if not email.classification:
            continue
        if email.classification.final_category != "important":
            continue
        try:
            from app.services.subscription_detector import detect_subscription

            sub_result = detect_subscription(
                subject=email.subject,
                sender=email.sender,
                body=email.body_text or email.snippet,
            )
            if sub_result.is_subscription and sub_result.name:
                existing = db.execute(
                    select(SubscriptionModel).where(
                        SubscriptionModel.user_id == user.id,
                        SubscriptionModel.name == sub_result.name,
                    )
                ).scalar_one_or_none()
                if existing is None:
                    from datetime import date as date_type, timedelta

                    sub = SubscriptionModel(
                        user_id=user.id,
                        name=sub_result.name,
                        amount=sub_result.amount,
                        currency=sub_result.currency,
                        cycle=sub_result.cycle,
                        next_billing=date_type.today() + timedelta(days=30),
                    )
                    db.add(sub)
                    logger.info(
                        "Auto-detected subscription: %s %.2f %s",
                        sub_result.name, sub_result.amount, sub_result.currency,
                    )
        except Exception as e:
            errors.append(f"subscription_detect {email.id}: {e}")
            logger.exception("Subscription detection failed for email %d", email.id)

    return classified_count, errors


def broadcast_new_emails(
    db: Session,
    user: User,
    new_emails: list[Email],
    *,
    source: str = "gmail",
) -> None:
    """廣播新 email 事件（WebSocket + Push）。應該喺 commit 之後 call。"""

    # ── WebSocket 廣播（含完整分類資料）──
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
                    "folder": email.folder,
                    "classification": {
                        "ai_category": email.classification.ai_category,
                        "ai_confidence": email.classification.ai_confidence,
                        "ai_reason": email.classification.ai_reason,
                        "user_category": email.classification.user_category,
                        "final_category": email.classification.final_category,
                        "action_required": email.classification.action_required,
                        "action_summary": email.classification.action_summary,
                        "action_deadline": email.classification.action_deadline,
                    }
                    if email.classification
                    else None,
                },
            }
            ws_manager.broadcast_threadsafe(payload)
        except Exception:
            logger.exception("broadcast new email failed")

    # ── Push 通知（合併重要郵件）──
    try:
        from app.services import push_service

        if push_service.is_configured():
            important_new = [
                e for e in new_emails
                if e.classification
                and e.classification.final_category == "important"
            ]
            if important_new:
                n = len(important_new)
                first = important_new[0]
                src_label = " iCloud" if source == "icloud" else ""
                if n == 1:
                    title = f"📧 新重要{src_label}郵件"
                    body = f"{first.sender}：{first.subject or '(冇主題)'}"
                    url = f"/inbox/detail?id={first.id}"
                else:
                    title = f"📧 {n} 封新重要{src_label}郵件"
                    body = f"最新：{first.sender} — {first.subject or '(冇主題)'}"
                    url = "/inbox?category=important"
                try:
                    push_service.send_to_user(
                        db, user.id, title=title, body=body, url=url,
                        tag=f"lifeos-email-{source}",
                    )
                except Exception:
                    logger.exception("push for new important emails failed")
    except Exception:
        logger.exception("push_service import / setup failed")

    # ── sync.done 總結 ──
    classified = sum(1 for e in new_emails if e.classification)
    if new_emails:
        ws_manager.broadcast_threadsafe({
            "type": "sync.done",
            "source": source,
            "new": len(new_emails),
            "classified": classified,
        })


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
        for att in parsed.attachments:
            db.add(EmailAttachment(
                email_id=email.id,
                gmail_attachment_id=att.gmail_attachment_id,
                filename=att.filename,
                mime_type=att.mime_type,
                size_bytes=att.size_bytes,
            ))
        new_emails.append(email)

    # ── 共用 pipeline：AI 分類 + 發票提取 + 訂閱偵測 ──
    classified_count, pipeline_errors = process_new_emails(
        db, user, new_emails, classify=classify,
    )
    errors.extend(pipeline_errors)

    # Update history_id
    try:
        user.gmail_history_id = client.get_profile_history_id()
    except Exception as e:
        errors.append(f"get_profile_history_id: {e}")

    db.commit()

    # Broadcast（commit 之後）
    broadcast_new_emails(db, user, new_emails, source="gmail")

    return SyncResult(
        fetched=len(message_ids),
        new=len(new_emails),
        classified=classified_count,
        errors=errors,
    )


def sync_sent_for_user(
    db: Session,
    user: User,
    *,
    limit: int = 50,
) -> SyncResult:
    """同步一個 user 嘅 Gmail 寄件備份（SENT label）。

    寄件備份唔做 AI 分類。
    """
    if not user.gmail_refresh_token:
        return SyncResult(fetched=0, new=0, classified=0, errors=["User not connected to Gmail"])

    client = GmailClient(refresh_token=user.gmail_refresh_token)
    errors: list[str] = []

    message_ids = client.list_sent_message_ids(max_results=limit)

    new_count = 0

    for msg_id in message_ids:
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
            folder="sent",
            is_read=True,
        )
        db.add(email)
        new_count += 1

    db.commit()
    return SyncResult(
        fetched=len(message_ids),
        new=new_count,
        classified=0,
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
