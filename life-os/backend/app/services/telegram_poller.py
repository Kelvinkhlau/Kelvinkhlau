"""Telegram long-polling background thread.

Used instead of webhook because life-os runs on TCP/9443 and Telegram only
allows webhooks on 80/88/443/8443 (deployment policy disallows port change).

The thread starts during FastAPI lifespan startup and stops on shutdown.
Polling uses Telegram's long-polling (timeout=25s) so we make ~2.4 requests
per minute under no load — well under any reasonable rate limit.
"""

from __future__ import annotations

import logging
import threading
import time

import httpx

from app.config import get_settings
from app.db import SessionLocal
from app.services import forex_commands, telegram_bot

logger = logging.getLogger(__name__)

_stop_event = threading.Event()
_thread: threading.Thread | None = None


def _poll_once(last_update_id: int, base_url: str, allowed_chat_id: str | None) -> int:
    """Single getUpdates call. Returns the new last_update_id."""
    params = {"offset": last_update_id + 1, "timeout": 25}
    try:
        r = httpx.get(f"{base_url}/getUpdates", params=params, timeout=35)
        body = r.json()
    except (httpx.HTTPError, ValueError) as e:
        logger.warning("telegram_poller: getUpdates failed: %s", e)
        time.sleep(2)
        return last_update_id

    if not body.get("ok"):
        logger.warning("telegram_poller: getUpdates rejected: %s", body)
        time.sleep(5)
        return last_update_id

    new_last = last_update_id
    for update in body.get("result") or []:
        uid = update.get("update_id", 0)
        if uid > new_last:
            new_last = uid
        msg = update.get("message") or update.get("edited_message")
        if not msg:
            continue
        text = msg.get("text") or ""
        chat = msg.get("chat") or {}
        chat_id = str(chat.get("id") or "")
        if not text or not chat_id:
            continue
        if allowed_chat_id and chat_id != allowed_chat_id:
            logger.warning(
                "telegram_poller: ignoring message from foreign chat_id=%s", chat_id
            )
            continue

        db = SessionLocal()
        try:
            reply = forex_commands.dispatch(text, db)
            if reply is not None:
                telegram_bot.send_message(reply, chat_id=chat_id)
        except Exception:
            logger.exception("telegram_poller: dispatch failed for %r", text)
        finally:
            db.close()
    return new_last


def _poll_loop() -> None:
    settings = get_settings()
    token = settings.telegram_bot_token
    if not token:
        logger.warning("telegram_poller: TELEGRAM_BOT_TOKEN unset, not starting")
        return
    base_url = f"https://api.telegram.org/bot{token}"
    allowed_chat_id = settings.telegram_chat_id

    # Make sure no webhook is set (would prevent getUpdates from working)
    try:
        httpx.post(f"{base_url}/deleteWebhook", timeout=10)
    except httpx.HTTPError as e:
        logger.warning("telegram_poller: deleteWebhook failed (continuing): %s", e)

    logger.info("telegram_poller: started")
    last_update_id = 0
    while not _stop_event.is_set():
        last_update_id = _poll_once(last_update_id, base_url, allowed_chat_id)
    logger.info("telegram_poller: stopped")


def start_telegram_poller() -> None:
    """Spawn the polling thread once. No-op if already running or token unset."""
    global _thread
    if _thread is not None and _thread.is_alive():
        return
    settings = get_settings()
    if not settings.telegram_bot_token:
        return
    _stop_event.clear()
    _thread = threading.Thread(target=_poll_loop, daemon=True, name="telegram_poller")
    _thread.start()


def stop_telegram_poller() -> None:
    """Signal the polling thread to exit. Returns immediately; long-poll may take up to 25s to drain."""
    global _thread
    if _thread is None:
        return
    _stop_event.set()
    _thread = None
