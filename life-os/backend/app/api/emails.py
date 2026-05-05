"""Email API routes。"""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import selectinload

from app.deps import CurrentUser, DbSession, current_user
from app.models.email import Email, EmailClassification
from app.models.user import User
from app.schemas.email import (
    AiComposeDraft,
    AiComposeRequest,
    AiReplyDraft,
    AiReplyRequest,
    CategoryUpdate,
    EmailComposePayload,
    EmailOut,
    EmailReplyPayload,
    EmailSendResponse,
    EmailSummary,
    EmailTranslation,
)
from app.services import ai_classifier, email_sync, vault_storage
from app.services.gmail_client import GmailClient, build_new_message, build_reply_message
from app.services.icloud_client import build_icloud_mime, send_via_icloud_smtp
from app.services.rate_limit import rate_limit
from app.api.muted import is_muted
from app.config import get_settings
from app.models.vault import VaultFile

# AI endpoints 貴 — 加 rate limit（per-IP）
_ai_limit = rate_limit("emails_ai", max_per_minute=20, max_per_hour=200)
_classify_all_limit = rate_limit("classify_all", max_per_minute=2, max_per_hour=10)
_send_limit = rate_limit("email_send", max_per_minute=10, max_per_hour=60)

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


class AccountInfo(BaseModel):
    id: str  # "gmail" | "icloud"
    label: str
    email: str | None
    connected: bool


@router.get("/accounts", response_model=list[AccountInfo])
async def list_accounts(user: CurrentUser) -> list[AccountInfo]:
    """返回可用寄件帳號 — 俾前端揀寄件人 dropdown。"""
    settings = get_settings()
    return [
        AccountInfo(
            id="gmail",
            label="Gmail",
            email=user.email if user.gmail_refresh_token else None,
            connected=bool(user.gmail_refresh_token),
        ),
        AccountInfo(
            id="icloud",
            label="iCloud",
            email=settings.icloud_email,
            connected=bool(settings.icloud_email and settings.icloud_app_password),
        ),
    ]


@router.get("", response_model=list[EmailOut])
async def list_emails(
    db: DbSession,
    response: Response,
    folder: str = Query("inbox", description="inbox / sent / icloud"),
    source: str | None = Query(None, description="gmail / icloud / all（跨 source 查詢）"),
    category: str | None = Query(None, description="important / normal / promotional"),
    q: str | None = Query(None, description="搜尋 subject / sender / snippet / body"),
    unread_only: bool = Query(False),
    archived: bool = Query(False, description="true = 只睇已封存"),
    trashed: bool = Query(False, description="true = 只睇垃圾桶"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
) -> list[Email]:
    """列出 emails — 可以按類別過濾同/或全文搜尋。

    source 參數：
    - "gmail"：只睇 Gmail（folder=inbox）
    - "icloud"：只睇 iCloud（folder=icloud）
    - "all" 或留空：兩者都睇

    Response header `X-Total-Count` 係過濾後嘅總數（俾前端做 pagination）。
    """
    base = select(Email).options(
        selectinload(Email.classification),
        selectinload(Email.smart_label),
    )

    # Source / folder filter
    if source == "gmail":
        base = base.where(Email.folder.in_(["inbox", "sent"]))
    elif source == "icloud":
        base = base.where(Email.folder == "icloud")
    elif source == "all":
        base = base.where(Email.folder.in_(["inbox", "icloud", "sent"]))
    else:
        base = base.where(Email.folder == folder)

    if trashed:
        # 垃圾桶模式：只顯示已軟刪除嘅
        base = base.where(Email.deleted_at.is_not(None))
    else:
        # 正常模式：排除已軟刪除嘅
        base = base.where(Email.deleted_at.is_(None))
        if folder in ("inbox", "icloud") or source in ("gmail", "icloud", "all"):
            base = base.where(Email.is_archived.is_(archived))

    if category:
        base = base.join(
            EmailClassification, EmailClassification.email_id == Email.id
        ).where(
            func.coalesce(EmailClassification.user_category, EmailClassification.ai_category)
            == category
        )
    elif folder == "inbox" and not archived:
        # Inbox view：自動排除廣告（廣告只喺「已封存」先見到）
        promo_subq = (
            select(EmailClassification.email_id)
            .where(
                func.coalesce(EmailClassification.user_category, EmailClassification.ai_category)
                == "promotional"
            )
        )
        base = base.where(Email.id.notin_(promo_subq))

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
    not_trashed = Email.deleted_at.is_(None)
    total = db.execute(select(func.count()).select_from(Email).where(not_trashed)).scalar_one()
    unread = db.execute(
        select(func.count()).select_from(Email).where(Email.is_read.is_(False), not_trashed)
    ).scalar_one()

    # 今日（本地 00:00 — 為簡單 UTC cut-off）
    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
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


@router.get("/learning-stats")
async def learning_stats(user: CurrentUser, db: DbSession) -> dict:
    """AI 分類學習統計 — 顯示用戶修正次數、準確率。"""
    total_classified = db.execute(
        select(func.count(EmailClassification.id))
        .join(Email)
        .where(Email.user_id == user.id)
    ).scalar() or 0

    total_corrected = db.execute(
        select(func.count(EmailClassification.id))
        .join(Email)
        .where(Email.user_id == user.id, EmailClassification.user_category.isnot(None))
    ).scalar() or 0

    accuracy = ((total_classified - total_corrected) / total_classified * 100) if total_classified > 0 else 100.0

    # 各分類嘅修正統計
    correction_detail = {}
    if total_corrected > 0:
        rows = db.execute(
            select(
                EmailClassification.ai_category,
                EmailClassification.user_category,
                func.count(),
            )
            .join(Email)
            .where(Email.user_id == user.id, EmailClassification.user_category.isnot(None))
            .group_by(EmailClassification.ai_category, EmailClassification.user_category)
        ).all()
        for ai_cat, user_cat, cnt in rows:
            correction_detail[f"{ai_cat} → {user_cat}"] = cnt

    return {
        "total_classified": total_classified,
        "total_corrected": total_corrected,
        "accuracy_pct": round(accuracy, 1),
        "corrections": correction_detail,
    }


def _get_user_email(db, email_id: int, user: User) -> Email:
    """攞 email 並驗證 user ownership。"""
    email = db.get(Email, email_id)
    if email is None or email.user_id != user.id:
        raise HTTPException(status_code=404, detail="Email not found")
    return email


@router.get("/{email_id}")
async def get_email(
    email_id: int,
    user: CurrentUser,
    db: DbSession,
    archived: bool = Query(False, description="導航 context — 封存 or inbox"),
    category: str | None = Query(None, description="導航 context — 分類 filter"),
    folder: str | None = Query(None, description="導航 context — inbox / icloud / sent"),
) -> dict:
    """睇 email 詳情 — 包含 prev_id / next_id 方便前後導航。

    prev/next 會根據 archived / category / folder 參數嚟 filter，
    令用戶喺「iCloud」/「已封存」/「重要」view 入面可以連續睇唔會跳 source。
    """
    email = _get_user_email(db, email_id, user)

    # 建立同 list view 一致嘅 filter
    nav_filter = [Email.is_archived.is_(archived)]
    # 跨 folder 導航保留 context — 用戶睇 iCloud 就只 prev/next iCloud
    if folder == "icloud":
        nav_filter.append(Email.folder == "icloud")
    elif folder == "sent":
        nav_filter.append(Email.folder == "sent")
    elif folder == "inbox":
        # Gmail inbox（排除 iCloud 同 sent）
        nav_filter.append(Email.folder == "inbox")
    nav_join = None
    if category:
        nav_join = EmailClassification
        nav_filter.append(
            func.coalesce(EmailClassification.user_category, EmailClassification.ai_category)
            == category
        )

    def _nav_query(direction_filter, order_col):
        stmt = select(Email.id).where(*nav_filter, direction_filter)
        if nav_join is not None:
            stmt = stmt.join(nav_join, EmailClassification.email_id == Email.id)
        return db.execute(stmt.order_by(order_col).limit(1)).scalar_one_or_none()

    # 上一封（時間較新）
    prev_row = _nav_query(Email.received_at > email.received_at, Email.received_at.asc())
    # 下一封（時間較舊）
    next_row = _nav_query(Email.received_at < email.received_at, Email.received_at.desc())

    # Serialize classification
    cls_data = None
    if email.classification:
        cls_data = {
            "ai_category": email.classification.ai_category,
            "ai_confidence": email.classification.ai_confidence,
            "ai_reason": email.classification.ai_reason,
            "user_category": email.classification.user_category,
            "final_category": email.classification.final_category,
            "action_required": email.classification.action_required,
            "action_summary": email.classification.action_summary,
            "action_deadline": email.classification.action_deadline,
        }

    # Smart label info
    sl_data = None
    if email.smart_label_id:
        from app.models.smart_label import SmartLabel
        sl = db.get(SmartLabel, email.smart_label_id)
        if sl:
            sl_data = {"id": sl.id, "name": sl.name, "color": sl.color}

    # Attachments metadata (inbound)
    from app.models.email_attachment import EmailAttachment
    atts = db.execute(
        select(EmailAttachment)
        .where(EmailAttachment.email_id == email.id)
        .order_by(EmailAttachment.id)
    ).scalars().all()
    att_data = [
        {
            "id": a.id,
            "filename": a.filename,
            "mime_type": a.mime_type,
            "size_bytes": a.size_bytes,
        }
        for a in atts
    ]

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
        "attachments": att_data,
        "classification": cls_data,
        "body_text": email.body_text,
        "body_html": email.body_html,
        "recipients": email.recipients,
        "prev_id": prev_row,
        "next_id": next_row,
        "is_sender_muted": is_muted(db, user.id, email.sender_email),
        "smart_label": sl_data,
    }


def _push_icloud_seen(message_id: str, seen: bool) -> None:
    """喺 background thread push \\Seen flag 去 iCloud IMAP server。

    失敗只會 log、唔會 re-raise — local DB 已經 commit 咗係真相源頭。
    """
    try:
        from app.services.icloud_client import ICloudClient

        client = ICloudClient()
        client.connect()
        try:
            ok = client.mark_seen(message_id, seen=seen)
            if not ok:
                logger.info("iCloud mark_seen returned False for message-id=%r", message_id)
        finally:
            client.disconnect()
    except Exception as e:
        logger.warning("iCloud mark_seen push failed for %r: %s", message_id, e)


@router.put("/{email_id}/read")
async def mark_read(
    email_id: int,
    user: CurrentUser,
    db: DbSession,
    background: BackgroundTasks,
    read: bool = True,
) -> dict:
    """標記 email 為已讀 / 未讀。已讀時自動配對智能標籤。

    iCloud 郵件：同時喺 background push `\\Seen` flag 去 IMAP server，
    令 iCloud.com / iPhone Mail 都見到已讀狀態。
    """
    email = _get_user_email(db, email_id, user)
    email.is_read = read

    # 已讀時自動歸檔到匹配嘅 Smart Label
    label_name = None
    if read:
        from app.services.label_matcher import auto_label_email
        if auto_label_email(db, email):
            from app.models.smart_label import SmartLabel
            label = db.get(SmartLabel, email.smart_label_id)
            label_name = label.name if label else None

    db.commit()

    # iCloud 郵件 push flag 返去 IMAP（唔 block API response）
    if email.folder == "icloud" and email.gmail_message_id:
        background.add_task(_push_icloud_seen, email.gmail_message_id, read)

    return {"ok": True, "is_read": read, "smart_label": label_name}


@router.put("/{email_id}/category")
async def update_category(
    email_id: int, payload: CategoryUpdate, user: CurrentUser, db: DbSession
) -> dict:
    """用戶修正 AI 分類。"""
    email = _get_user_email(db, email_id, user)

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
            user_corrected_at=datetime.now(UTC),
        )
        db.add(classification)
    else:
        classification.user_category = payload.category
        classification.user_corrected_at = datetime.now(UTC)

    db.commit()
    return {"ok": True, "final_category": payload.category}


@router.put("/{email_id}/archive")
async def archive_email(email_id: int, user: CurrentUser, db: DbSession, archive: bool = True) -> dict:
    """Archive / un-archive 一封 email。"""
    email = _get_user_email(db, email_id, user)
    email.is_archived = archive
    db.commit()
    return {"ok": True, "is_archived": archive}


@router.delete("/{email_id}")
async def delete_email(email_id: int, user: CurrentUser, db: DbSession) -> dict:
    """軟刪除 — 移到垃圾桶（7日後自動永久刪除）。"""
    email = _get_user_email(db, email_id, user)
    email.deleted_at = datetime.now(UTC)
    db.commit()
    return {"ok": True}


@router.post("/{email_id}/restore")
async def restore_email(email_id: int, user: CurrentUser, db: DbSession) -> dict:
    """從垃圾桶還原。"""
    email = db.execute(
        select(Email).where(Email.id == email_id, Email.user_id == user.id)
    ).scalar_one_or_none()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    email.deleted_at = None
    db.commit()
    return {"ok": True}


@router.delete("/{email_id}/permanent")
async def permanent_delete_email(email_id: int, user: CurrentUser, db: DbSession) -> dict:
    """永久刪除（從垃圾桶清除）。"""
    email = _get_user_email(db, email_id, user)
    db.delete(email)
    db.commit()
    return {"ok": True}


# ─── Attachments (inbound Gmail) ─────────────────────────────────────────────

class AttachmentOut(BaseModel):
    id: int
    filename: str
    mime_type: str
    size_bytes: int


@router.get("/{email_id}/attachments", response_model=list[AttachmentOut])
async def list_email_attachments(
    email_id: int, user: CurrentUser, db: DbSession
) -> list[AttachmentOut]:
    """List 一封 email 嘅 attachments（metadata only）。"""
    from app.models.email_attachment import EmailAttachment

    email = _get_user_email(db, email_id, user)
    rows = db.execute(
        select(EmailAttachment)
        .where(EmailAttachment.email_id == email.id)
        .order_by(EmailAttachment.id)
    ).scalars().all()
    return [
        AttachmentOut(
            id=a.id,
            filename=a.filename,
            mime_type=a.mime_type,
            size_bytes=a.size_bytes,
        )
        for a in rows
    ]


@router.get("/{email_id}/attachments/{attachment_id}/download")
async def download_email_attachment(
    email_id: int,
    attachment_id: int,
    user: CurrentUser,
    db: DbSession,
    inline: bool = Query(False, description="inline=true 用 Content-Disposition:inline（俾 PDF preview）"),
) -> Response:
    """Stream attachment bytes — lazy fetch 由 Gmail API 攞。"""
    from urllib.parse import quote

    from app.models.email_attachment import EmailAttachment

    email = _get_user_email(db, email_id, user)
    att = db.execute(
        select(EmailAttachment).where(
            EmailAttachment.id == attachment_id,
            EmailAttachment.email_id == email.id,
        )
    ).scalar_one_or_none()
    if att is None:
        raise HTTPException(404, "Attachment not found")

    if not user.gmail_refresh_token:
        raise HTTPException(400, "Gmail not connected")

    try:
        client = GmailClient(refresh_token=user.gmail_refresh_token)
        content = client.get_attachment_bytes(email.gmail_message_id, att.gmail_attachment_id)
    except Exception as e:
        logger.exception("failed to fetch attachment %s", attachment_id)
        raise HTTPException(502, f"Gmail attachment fetch failed: {e}") from e

    disposition = "inline" if inline else "attachment"
    # RFC 5987 — UTF-8 filename for non-ASCII
    fn_ascii = att.filename.encode("ascii", "ignore").decode("ascii") or "attachment"
    fn_utf8 = quote(att.filename)
    headers = {
        "Content-Disposition": f"{disposition}; filename=\"{fn_ascii}\"; filename*=UTF-8''{fn_utf8}",
        "Content-Length": str(len(content)),
        "Cache-Control": "private, max-age=3600",
    }
    return Response(content=content, media_type=att.mime_type, headers=headers)


@router.post("/{email_id}/reply", response_model=EmailSendResponse, dependencies=[Depends(_send_limit)])
async def reply_email(
    email_id: int,
    user: CurrentUser,
    db: DbSession,
    background: BackgroundTasks,
    body: str = Form(...),
    attachments: list[UploadFile] = File(default=[]),
    vault_file_ids: str = Form(default=""),
    account: str = Form(default="gmail", description="gmail / icloud"),
) -> EmailSendResponse:
    """回覆一封 email — 可選用 Gmail 或 iCloud 帳號寄。"""
    email = _get_user_email(db, email_id, user)
    account = (account or "gmail").lower().strip()

    uploaded = await _read_attachments(attachments)
    vault_items = _read_vault_attachments(db, user, _parse_vault_ids(vault_file_ids))
    att = _check_total_size(uploaded, vault_items)

    subject = email.subject if email.subject.lower().startswith("re:") else f"Re: {email.subject}"
    in_reply_to = f"<{email.gmail_message_id}@mail.gmail.com>"
    references = in_reply_to

    if account == "icloud":
        ic_email, ic_name = _icloud_from_info()
        try:
            mime_msg = build_icloud_mime(
                from_email=ic_email,
                from_name=user.name or ic_name,
                to=email.sender_email,
                subject=subject,
                body=body,
                in_reply_to=in_reply_to,
                references=references,
                attachments=att or None,
            )
            send_via_icloud_smtp(mime_msg)
            _store_sent_email(
                db, user, msg=mime_msg, to=email.sender_email, subject=subject,
                body=body, has_attachment=bool(att), source="icloud",
            )
            return EmailSendResponse(ok=True, gmail_message_id=mime_msg.get("Message-ID"))
        except Exception as e:
            logger.exception("Failed to send iCloud reply for email %d", email_id)
            return EmailSendResponse(ok=False, error=str(e))

    # Gmail 路徑（default）
    if not user.gmail_refresh_token:
        raise HTTPException(status_code=400, detail="Gmail 未連接")

    raw, thread_id = build_reply_message(
        from_email=user.email,
        from_name=user.name,
        to=email.sender_email,
        subject=email.subject,
        body=body,
        in_reply_to=in_reply_to,
        references=references,
        thread_id=email.gmail_thread_id,
        attachments=att or None,
    )

    try:
        client = GmailClient(user.gmail_refresh_token)
        send_body: dict = {"raw": raw}
        if thread_id:
            send_body["threadId"] = thread_id
        result = client.service.users().messages().send(userId="me", body=send_body).execute()
        background.add_task(_trigger_sent_sync, user.id)
        return EmailSendResponse(ok=True, gmail_message_id=result.get("id"))
    except Exception as e:
        logger.exception("Failed to send reply for email %d", email_id)
        return EmailSendResponse(ok=False, error=str(e))


@router.post("/{email_id}/draft", response_model=EmailSendResponse)
async def save_reply_draft(
    email_id: int,
    user: CurrentUser,
    db: DbSession,
    body: str = Form(...),
    attachments: list[UploadFile] = File(default=[]),
    vault_file_ids: str = Form(default=""),
) -> EmailSendResponse:
    """將回覆儲存為 Gmail 草稿（支援附件 + 資料庫檔，唔會即刻發送）。"""
    email = _get_user_email(db, email_id, user)
    if not user.gmail_refresh_token:
        raise HTTPException(status_code=400, detail="Gmail 未連接")

    uploaded = await _read_attachments(attachments)
    vault_items = _read_vault_attachments(db, user, _parse_vault_ids(vault_file_ids))
    att = _check_total_size(uploaded, vault_items)

    in_reply_to = f"<{email.gmail_message_id}@mail.gmail.com>"
    references = in_reply_to

    raw, thread_id = build_reply_message(
        from_email=user.email,
        from_name=user.name,
        to=email.sender_email,
        subject=email.subject,
        body=body,
        in_reply_to=in_reply_to,
        references=references,
        thread_id=email.gmail_thread_id,
        attachments=att or None,
    )

    try:
        client = GmailClient(user.gmail_refresh_token)
        draft_body: dict = {"message": {"raw": raw}}
        if thread_id:
            draft_body["message"]["threadId"] = thread_id
        result = (
            client.service.users()
            .drafts()
            .create(userId="me", body=draft_body)
            .execute()
        )
        return EmailSendResponse(
            ok=True, gmail_message_id=result.get("id")
        )
    except Exception as e:
        logger.exception("Failed to save draft for email %d", email_id)
        return EmailSendResponse(ok=False, error=str(e))


MAX_ATTACHMENT_TOTAL = 25 * 1024 * 1024  # Gmail 25 MB 限制


def _trigger_sent_sync(user_id: int) -> None:
    """Post-send background task：拉最新 SENT label 落 DB，等用戶即刻喺寄件備份見到。"""
    from app.db import SessionLocal

    db = SessionLocal()
    try:
        u = db.get(User, user_id)
        if not u or not u.gmail_refresh_token:
            return
        try:
            email_sync.sync_sent_for_user(db, u, limit=10)
        except Exception:
            logger.exception("post-send sent sync failed for user %s", u.email)
    finally:
        db.close()


def _icloud_from_info() -> tuple[str, str]:
    """返回 iCloud 寄件人 (email, display_name)。"""
    settings = get_settings()
    if not settings.icloud_email or not settings.icloud_app_password:
        raise HTTPException(
            status_code=400,
            detail="iCloud Mail 未設定，請喺 .env 填 ICLOUD_EMAIL / ICLOUD_APP_PASSWORD",
        )
    return settings.icloud_email, settings.icloud_email.split("@")[0]


def _store_sent_email(
    db,
    user: User,
    *,
    msg,
    to: str,
    subject: str,
    body: str,
    has_attachment: bool,
    source: str,
) -> Email:
    """將用戶剛剛寄出嘅 email 存入 DB（folder="sent"）即時可見。"""
    message_id = msg.get("Message-ID") or f"<local-{datetime.now(UTC).timestamp()}@{source}>"
    sender_email = user.email if source == "gmail" else get_settings().icloud_email or user.email
    e = Email(
        user_id=user.id,
        gmail_message_id=message_id,
        gmail_thread_id=message_id,
        subject=subject,
        sender=user.name or sender_email,
        sender_email=sender_email,
        recipients=to,
        snippet=(body or "")[:300].replace("\n", " ").strip(),
        body_text=body,
        body_html=None,
        received_at=datetime.now(UTC),
        has_attachment=has_attachment,
        folder="sent",
        is_read=True,
    )
    db.add(e)
    db.commit()
    return e


def _parse_vault_ids(raw: str) -> list[int]:
    """Parse comma-separated vault file IDs。"""
    if not raw:
        return []
    out: list[int] = []
    for chunk in raw.split(","):
        c = chunk.strip()
        if not c:
            continue
        try:
            out.append(int(c))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"無效 vault_file_id: {c}")
    return out


def _read_vault_attachments(
    db,
    user: User,
    file_ids: list[int],
) -> list[tuple[str, bytes, str]]:
    """從 vault 讀取指定檔案做 email 附件。只可讀自己嘅、未刪除嘅檔。"""
    if not file_ids:
        return []
    rows = (
        db.query(VaultFile)
        .filter(
            VaultFile.id.in_(file_ids),
            VaultFile.user_id == user.id,
            VaultFile.deleted_at.is_(None),
        )
        .all()
    )
    found = {f.id for f in rows}
    missing = [i for i in file_ids if i not in found]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"資料庫搵唔到檔案：{missing}",
        )
    settings = get_settings()
    result: list[tuple[str, bytes, str]] = []
    for f in rows:
        p = vault_storage.abs_path(settings.data_dir, f.storage_path)
        if not p.exists():
            raise HTTPException(
                status_code=410,
                detail=f"檔案已失蹤：{f.filename}",
            )
        data = p.read_bytes()
        # 優先用 title 做 filename（因為 title 係用戶改嘅靚名），fallback 到 original_filename
        from pathlib import Path as _P
        ext = _P(f.original_filename or f.filename or "").suffix
        if f.title:
            name = f.title if f.title.endswith(ext) else f"{f.title}{ext}"
        else:
            name = f.original_filename or f.filename
        result.append((name, data, f.mime_type or "application/octet-stream"))
    return result


def _check_total_size(
    uploaded: list[tuple[str, bytes, str]],
    vault_items: list[tuple[str, bytes, str]],
) -> list[tuple[str, bytes, str]]:
    """合併 + 檢查總大小。"""
    combined = uploaded + vault_items
    total = sum(len(b) for _, b, _ in combined)
    if total > MAX_ATTACHMENT_TOTAL:
        raise HTTPException(
            status_code=413,
            detail=f"附件總大小 {total/1024/1024:.1f} MB 超過 25 MB（Gmail 限制）",
        )
    return combined


async def _read_attachments(
    files: list[UploadFile],
) -> list[tuple[str, bytes, str]]:
    """讀取上傳檔案，返回 (filename, bytes, content_type) list。"""
    result: list[tuple[str, bytes, str]] = []
    total = 0
    for f in files:
        if not f.filename:
            continue
        data = await f.read()
        total += len(data)
        if total > MAX_ATTACHMENT_TOTAL:
            raise HTTPException(
                status_code=413,
                detail=f"附件總大小超過 25 MB（Gmail 限制）",
            )
        ct = f.content_type or "application/octet-stream"
        result.append((f.filename, data, ct))
    return result


@router.post("/compose", response_model=EmailSendResponse, dependencies=[Depends(_send_limit)])
async def compose_email(
    user: CurrentUser,
    db: DbSession,
    background: BackgroundTasks,
    to: str = Form(...),
    subject: str = Form(...),
    body: str = Form(...),
    attachments: list[UploadFile] = File(default=[]),
    vault_file_ids: str = Form(default=""),
    account: str = Form(default="gmail", description="gmail / icloud"),
) -> EmailSendResponse:
    """撰寫新 email — 可選用 Gmail 或 iCloud 帳號寄。"""
    account = (account or "gmail").lower().strip()

    uploaded = await _read_attachments(attachments)
    vault_items = _read_vault_attachments(db, user, _parse_vault_ids(vault_file_ids))
    att = _check_total_size(uploaded, vault_items)

    if account == "icloud":
        ic_email, ic_name = _icloud_from_info()
        try:
            mime_msg = build_icloud_mime(
                from_email=ic_email,
                from_name=user.name or ic_name,
                to=to,
                subject=subject,
                body=body,
                attachments=att or None,
            )
            send_via_icloud_smtp(mime_msg)
            _store_sent_email(
                db, user, msg=mime_msg, to=to, subject=subject, body=body,
                has_attachment=bool(att), source="icloud",
            )
            return EmailSendResponse(ok=True, gmail_message_id=mime_msg.get("Message-ID"))
        except Exception as e:
            logger.exception("Failed to compose iCloud email")
            return EmailSendResponse(ok=False, error=str(e))

    # Gmail 路徑（default）
    if not user.gmail_refresh_token:
        raise HTTPException(status_code=400, detail="Gmail 未連接")

    raw = build_new_message(
        from_email=user.email,
        from_name=user.name,
        to=to,
        subject=subject,
        body=body,
        attachments=att or None,
    )

    try:
        client = GmailClient(user.gmail_refresh_token)
        result = client.service.users().messages().send(userId="me", body={"raw": raw}).execute()
        background.add_task(_trigger_sent_sync, user.id)
        return EmailSendResponse(ok=True, gmail_message_id=result.get("id"))
    except Exception as e:
        logger.exception("Failed to compose email")
        return EmailSendResponse(ok=False, error=str(e))


@router.post("/ai-compose", response_model=AiComposeDraft, dependencies=[Depends(_ai_limit)])
async def ai_compose(
    payload: AiComposeRequest, user: CurrentUser, db: DbSession
) -> AiComposeDraft:
    """AI 撰寫新電郵草稿 — 用戶提供指示，AI 生成主題 + 內容。"""
    from app.services.ai_reply import generate_compose_draft

    result = generate_compose_draft(
        instructions=payload.instructions,
        user_name=user.name,
    )
    return AiComposeDraft(
        to=result.to,
        subject=result.subject,
        body=result.body,
        model=result.model,
    )


@router.post("/{email_id}/suggest-reply", response_model=AiReplyDraft, dependencies=[Depends(_ai_limit)])
async def suggest_reply(
    email_id: int, user: CurrentUser, db: DbSession, payload: AiReplyRequest | None = None
) -> AiReplyDraft:
    """AI 建議回覆 — 用 Haiku 生成簡短專業回覆草稿。可附帶用戶指示。"""
    email = _get_user_email(db, email_id, user)
    from app.services.ai_reply import generate_reply_draft

    result = generate_reply_draft(
        subject=email.subject,
        sender=email.sender,
        body=email.body_text or email.snippet,
        user_name=user.name,
        instructions=payload.instructions if payload else None,
    )
    return result


@router.post("/{email_id}/translate", response_model=EmailTranslation, dependencies=[Depends(_ai_limit)])
async def translate_email_endpoint(
    email_id: int, user: CurrentUser, db: DbSession
) -> EmailTranslation:
    """將電郵翻譯做繁體中文。"""
    email = _get_user_email(db, email_id, user)
    from app.services.ai_email_tools import translate_email

    try:
        result = translate_email(
            subject=email.subject,
            sender=email.sender,
            body=email.body_text or email.snippet,
        )
    except Exception as e:
        logger.exception("Translate failed for email %d", email_id)
        raise HTTPException(status_code=500, detail=f"翻譯失敗：{e}") from e

    return EmailTranslation(translation=result.translation, model=result.model)


@router.post("/{email_id}/summarize", response_model=EmailSummary, dependencies=[Depends(_ai_limit)])
async def summarize_email_endpoint(
    email_id: int, user: CurrentUser, db: DbSession
) -> EmailSummary:
    """分析電郵重點 — 用 AI 提取 tl;dr + key points + action needed。"""
    email = _get_user_email(db, email_id, user)
    from app.services.ai_email_tools import summarize_email

    try:
        result = summarize_email(
            subject=email.subject,
            sender=email.sender,
            body=email.body_text or email.snippet,
        )
    except Exception as e:
        logger.exception("Summarize failed for email %d", email_id)
        raise HTTPException(status_code=500, detail=f"分析失敗：{e}") from e

    return EmailSummary(
        tldr=result.tldr,
        key_points=result.key_points,
        action_needed=result.action_needed,
        model=result.model,
    )


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
    user = db.execute(
        select(User).where(User.gmail_refresh_token.is_not(None)).limit(1)
    ).scalar_one_or_none()
    if user is None:
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


@router.post("/sync-sent", response_model=SyncResponse)
async def sync_sent(
    db: DbSession,
    limit: int = Query(50, ge=1, le=200),
) -> SyncResponse:
    """同步寄件備份（SENT label）。"""
    user = db.execute(
        select(User).where(User.gmail_refresh_token.is_not(None)).limit(1)
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=400,
            detail="Gmail 仲未連接 — 請先去 /api/auth/gmail/authorize",
        )

    result = email_sync.sync_sent_for_user(db, user, limit=limit)
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


@router.post("/classify-all", response_model=ClassifyAllResponse, dependencies=[Depends(_classify_all_limit)])
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
                    action_required=result.action_required,
                    action_summary=result.action_summary,
                    action_deadline=result.action_deadline,
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


class EmailActionRequest(BaseModel):
    """從 email 行動偵測建立 todo 或 calendar event。"""
    action_type: str  # "todo" or "calendar"
    title: str | None = None  # 可選自訂標題（否則用 action_summary）
    due_at: str | None = None  # 可選覆蓋截止日期（YYYY-MM-DD 或 ISO datetime）


class EmailActionResponse(BaseModel):
    ok: bool
    created_type: str
    created_id: int


@router.post("/{email_id}/create-action", response_model=EmailActionResponse)
async def create_action_from_email(
    email_id: int,
    payload: EmailActionRequest,
    user: CurrentUser,
    db: DbSession,
) -> EmailActionResponse:
    """從 email 行動提醒建立 todo 或 calendar event。"""
    email = _get_user_email(db, email_id, user)

    cls = email.classification
    title = payload.title or (cls.action_summary if cls else None) or email.subject
    deadline = payload.due_at or (cls.action_deadline if cls else None)

    if payload.action_type == "todo":
        from app.models.todo import Todo

        todo = Todo(
            user_id=user.id,
            title=title,
            description=f"來自 email：{email.subject}\n寄件者：{email.sender}",
            priority="high",
            due_at=datetime.fromisoformat(deadline) if deadline else None,
            source_email_id=email.id,
        )
        db.add(todo)
        db.commit()
        db.refresh(todo)
        return EmailActionResponse(ok=True, created_type="todo", created_id=todo.id)

    elif payload.action_type == "calendar":
        from app.models.calendar_event import CalendarEvent

        # 如果有 deadline，用佢做 event 日期；冇就用今日
        if deadline:
            from datetime import date as date_type
            event_date = datetime.fromisoformat(deadline)
        else:
            event_date = datetime.now(UTC)

        event = CalendarEvent(
            user_id=user.id,
            google_event_id=f"local-email-{email_id}",
            google_calendar_id="local",
            title=title,
            description=f"來自 email：{email.subject}\n寄件者：{email.sender}",
            start_at=event_date.replace(hour=9, minute=0, second=0),
            end_at=event_date.replace(hour=10, minute=0, second=0),
            all_day=True,
            status="confirmed",
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        return EmailActionResponse(ok=True, created_type="calendar", created_id=event.id)

    raise HTTPException(status_code=400, detail="action_type 必須係 'todo' 或 'calendar'")


@router.post("/{email_id}/reclassify")
async def reclassify_email(
    email_id: int,
    user: CurrentUser,
    db: DbSession,
) -> dict:
    """重新用 AI 分類一封 email（包括行動偵測）。用嚟更新舊 email 嘅 action fields。"""
    email = _get_user_email(db, email_id, user)

    # 用 full body 做更準確嘅分類
    content = email.body_text or email.snippet
    # 限制長度避免 token 爆
    if len(content) > 2000:
        content = content[:2000]

    try:
        result = ai_classifier.classify_email(
            subject=email.subject,
            sender=email.sender,
            snippet=content,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 分類失敗：{e}") from e

    cls = email.classification
    if cls:
        # 保留用戶修正，但更新 AI 預測 + action 欄位
        cls.ai_category = result.category
        cls.ai_confidence = result.confidence
        cls.ai_reason = result.reason
        cls.ai_model = result.model
        cls.action_required = result.action_required
        cls.action_summary = result.action_summary
        cls.action_deadline = result.action_deadline
        cls.classified_at = datetime.now(UTC)
    else:
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
        db.add(cls)

    db.commit()
    db.refresh(cls)

    return {
        "ok": True,
        "classification": {
            "ai_category": cls.ai_category,
            "ai_confidence": cls.ai_confidence,
            "ai_reason": cls.ai_reason,
            "final_category": cls.final_category,
            "action_required": cls.action_required,
            "action_summary": cls.action_summary,
            "action_deadline": cls.action_deadline,
        },
    }


class ICloudSyncResponse(BaseModel):
    fetched: int
    new: int
    classified: int
    errors: list[str]


@router.post("/sync-icloud", response_model=ICloudSyncResponse)
async def sync_icloud(
    user: CurrentUser,
    db: DbSession,
    limit: int = Query(50, ge=1, le=200),
) -> ICloudSyncResponse:
    """同步 iCloud Mail（IMAP）。需要 ICLOUD_EMAIL + ICLOUD_APP_PASSWORD。"""
    try:
        from app.services.icloud_client import ICloudClient
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    try:
        client = ICloudClient()
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    errors: list[str] = []
    fetched = 0
    new_emails: list = []
    classified = 0

    try:
        client.connect()
        messages = client.fetch_recent(limit=limit)
        fetched = len(messages)
        for msg in messages:
            if not msg.message_id:
                continue
            # Deduplicate by message_id
            existing = db.execute(
                select(Email).where(Email.gmail_message_id == msg.message_id)
            ).scalar_one_or_none()
            if existing:
                continue

            email_obj = Email(
                user_id=user.id,
                gmail_message_id=msg.message_id,
                gmail_thread_id=msg.message_id,  # IMAP 冇 thread concept
                subject=msg.subject,
                sender=msg.sender,
                sender_email=msg.sender_email,
                recipients=msg.recipients,
                snippet=msg.snippet,
                body_text=msg.body_text,
                body_html=msg.body_html,
                received_at=msg.received_at,
                has_attachment=msg.has_attachment,
                folder="icloud",
            )
            db.add(email_obj)
            db.flush()
            new_emails.append(email_obj)

        # 共用 pipeline：AI 分類 + 發票 + 訂閱
        classified, pipeline_errors = email_sync.process_new_emails(
            db, user, new_emails, classify=True, source_label="iCloud",
        )
        errors.extend(pipeline_errors)

        db.commit()
        email_sync.broadcast_new_emails(db, user, new_emails, source="icloud")
    except Exception as e:
        errors.append(str(e))
        logger.exception("iCloud sync failed")
    finally:
        client.disconnect()

    return ICloudSyncResponse(fetched=fetched, new=len(new_emails), classified=classified, errors=errors)
