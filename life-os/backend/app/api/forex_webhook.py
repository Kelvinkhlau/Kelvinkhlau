"""Telegram webhook endpoint for the forex bot.

Telegram POSTs updates here. We verify the secret_token header, dispatch the
command, then reply via sendMessage.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Header, HTTPException, Request

from app.config import get_settings
from app.deps import DbSession
from app.services import forex_commands, telegram_bot

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/telegram/webhook")
async def telegram_webhook(
    request: Request,
    db: DbSession,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
) -> dict:
    """Telegram update entry point. Auth via shared secret header."""
    settings = get_settings()
    expected = settings.telegram_webhook_secret
    if not expected:
        logger.error("telegram_webhook: TELEGRAM_WEBHOOK_SECRET not configured")
        raise HTTPException(503, "webhook not configured")
    if x_telegram_bot_api_secret_token != expected:
        logger.warning("telegram_webhook: bad secret token")
        raise HTTPException(401, "bad secret")

    payload = await request.json()
    msg = payload.get("message") or payload.get("edited_message")
    if not msg:
        return {"ok": True}  # callback_query etc — ignore for now
    text = msg.get("text") or ""
    chat = msg.get("chat") or {}
    chat_id = str(chat.get("id") or "")
    if not text or not chat_id:
        return {"ok": True}

    # Only respond to the configured chat (defence-in-depth — webhook secret is primary auth)
    if settings.telegram_chat_id and chat_id != settings.telegram_chat_id:
        logger.warning("telegram_webhook: rejected message from foreign chat_id=%s", chat_id)
        return {"ok": True}

    reply = forex_commands.dispatch(text, db)
    if reply is not None:
        telegram_bot.send_message(reply, chat_id=chat_id)
    return {"ok": True}
