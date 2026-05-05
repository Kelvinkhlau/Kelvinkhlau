"""iCloud IMAP IDLE watcher — 背景長連接，收到新郵件即刻觸發 sync + push。

用一個 daemon thread 跑，喺 FastAPI startup 時啟動。
IDLE 每 28 分鐘 renew 一次（RFC 2177 限制 29 分鐘）。
連接斷開會自動重連（backoff 10s → 30s → 60s → 120s）。
"""

from __future__ import annotations

import logging
import threading

from app.config import get_settings

logger = logging.getLogger(__name__)

_thread: threading.Thread | None = None
_stop_event = threading.Event()

# Reconnect backoff 序列
BACKOFF_SECS = [10, 30, 60, 120]


def _run_idle_loop() -> None:
    """主 IDLE loop — 跑喺 daemon thread 入面。"""
    settings = get_settings()
    if not settings.icloud_email or not settings.icloud_app_password:
        logger.info("iCloud not configured, IDLE watcher 唔啟動")
        return

    backoff_idx = 0

    while not _stop_event.is_set():
        try:
            from app.services.icloud_client import ICloudClient

            client = ICloudClient()
            client.connect()
            logger.info("iCloud IDLE watcher 已連接")
            backoff_idx = 0  # reset backoff on successful connect

            while not _stop_event.is_set():
                try:
                    has_new = client.idle_wait(timeout=28 * 60)
                except Exception as e:
                    logger.warning("IDLE wait error: %s", e)
                    break  # reconnect

                if _stop_event.is_set():
                    break

                if has_new:
                    logger.info("iCloud IDLE: 收到新郵件通知，觸發 sync")
                    try:
                        _trigger_icloud_sync()
                    except Exception:
                        logger.exception("iCloud IDLE sync 失敗")
                # 冇新郵件 = timeout → 重新 IDLE（keep-alive）

            client.disconnect()

        except Exception as e:
            logger.warning("iCloud IDLE watcher 連接失敗: %s", e)
            delay = BACKOFF_SECS[min(backoff_idx, len(BACKOFF_SECS) - 1)]
            backoff_idx += 1
            logger.info("等 %ds 後重連…", delay)
            _stop_event.wait(delay)


def _trigger_icloud_sync() -> None:
    """觸發 iCloud 郵件 sync + AI 分類 + push 通知。"""
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models.email import Email
    from app.models.user import User
    from app.services.icloud_client import ICloudClient

    db = SessionLocal()
    try:
        user = db.execute(select(User)).scalars().first()
        if not user:
            return

        client = ICloudClient()
        client.connect()
        # 只拉最近 20 封（IDLE 通知通常係 1-2 封新郵件）
        messages = client.fetch_recent(limit=20)
        client.disconnect()

        new_count = 0
        new_emails: list[Email] = []

        for msg in messages:
            if not msg.message_id:
                continue
            existing = db.execute(
                select(Email).where(Email.gmail_message_id == msg.message_id)
            ).scalar_one_or_none()
            if existing:
                continue

            email_obj = Email(
                user_id=user.id,
                gmail_message_id=msg.message_id,
                gmail_thread_id=msg.message_id,
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
            new_count += 1
            new_emails.append(email_obj)

        # ── 共用 pipeline ──
        from app.services.email_sync import process_new_emails, broadcast_new_emails

        classified, errs = process_new_emails(
            db, user, new_emails, classify=True, source_label="iCloud",
        )
        db.commit()

        broadcast_new_emails(db, user, new_emails, source="icloud")

        if new_count > 0:
            logger.info("iCloud IDLE sync: %d 封新郵件, %d 已分類", new_count, classified)

    except Exception:
        logger.exception("iCloud IDLE sync 失敗")
    finally:
        db.close()


def start_icloud_idle_watcher() -> None:
    """啟動 IMAP IDLE watcher daemon thread。"""
    global _thread
    if _thread is not None and _thread.is_alive():
        return

    settings = get_settings()
    if not settings.icloud_email or not settings.icloud_app_password:
        logger.info("iCloud 未設定，跳過 IDLE watcher")
        return

    _stop_event.clear()
    _thread = threading.Thread(target=_run_idle_loop, daemon=True, name="icloud-idle")
    _thread.start()
    logger.info("iCloud IDLE watcher 已啟動")


def stop_icloud_idle_watcher() -> None:
    """停止 IDLE watcher。"""
    global _thread
    _stop_event.set()
    if _thread is not None:
        _thread.join(timeout=5)
        _thread = None
    logger.info("iCloud IDLE watcher 已停止")
