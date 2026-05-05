"""Telegram bot client — send messages + format forex notifications.

Single bot serves all forex groups; group identifier is included in the message body.
"""

from __future__ import annotations

import logging

import httpx

from app.config import get_settings
from app.models.forex import (
    AccountGroup,
    AccountGroupWallet,
    BrokerAccount,
    WalletTransaction,
)

logger = logging.getLogger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org"


def _api_url(method: str) -> str | None:
    settings = get_settings()
    token = settings.telegram_bot_token
    if not token:
        return None
    return f"{TELEGRAM_API_BASE}/bot{token}/{method}"


def send_message(
    text: str,
    *,
    chat_id: str | None = None,
    parse_mode: str | None = None,
    disable_notification: bool = False,
) -> bool:
    """Send a message to the configured chat. Returns True on Telegram-acked success."""
    settings = get_settings()
    url = _api_url("sendMessage")
    if not url:
        logger.warning("telegram_bot: TELEGRAM_BOT_TOKEN unset, dropping message")
        return False
    cid = chat_id or settings.telegram_chat_id
    if not cid:
        logger.warning("telegram_bot: TELEGRAM_CHAT_ID unset, dropping message")
        return False

    payload: dict[str, str | bool] = {
        "chat_id": cid,
        "text": text,
        "disable_notification": disable_notification,
    }
    if parse_mode:
        payload["parse_mode"] = parse_mode

    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.post(url, data=payload)
        body = r.json()
    except (httpx.HTTPError, ValueError) as e:
        logger.error("telegram_bot: send failed: %s", e)
        return False
    if not body.get("ok"):
        logger.error("telegram_bot: send rejected: %s", body)
        return False
    return True


def format_new_tx_alert(
    tx: WalletTransaction,
    group: AccountGroup,
    wallet: AccountGroupWallet,
    broker: BrokerAccount | None = None,
) -> str:
    """Build the per-transaction notification body."""
    arrow = "🟢 收到" if tx.direction == "in" else "🔴 發出"
    short_hash = tx.tx_hash[:6]
    cp_short = (
        tx.counterparty_address[:10] + "..." + tx.counterparty_address[-6:]
        if len(tx.counterparty_address) > 18
        else tx.counterparty_address
    )
    when = tx.block_timestamp.strftime("%Y-%m-%d %H:%M UTC")

    lines = [
        f"{arrow} [{group.name} / {wallet.label}]",
        f"金額: {float(tx.amount_usdt):,.2f} USDT",
        f"對手: {cp_short}",
        f"時間: {when}",
        f"Tx: {short_hash}...",
    ]
    if broker is not None:
        lines.append(f"自動 tag → {broker.name}" + (f" ({broker.owner})" if broker.owner else ""))
    else:
        lines.append("")
        lines.append(f"請 tag：/tag {short_hash} <broker_name>")
        lines.append(f"睇 broker 名：/brokers {group.code}")
    return "\n".join(lines)


def notify_new_tx(
    tx: WalletTransaction,
    group: AccountGroup,
    wallet: AccountGroupWallet,
    broker: BrokerAccount | None = None,
) -> None:
    """Send a notification for a single new transaction. Errors are logged, not raised."""
    text = format_new_tx_alert(tx, group, wallet, broker)
    send_message(text)
