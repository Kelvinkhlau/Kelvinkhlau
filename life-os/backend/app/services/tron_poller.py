"""Tronscan TRC20 poller — pulls USDT in/out for all active wallets across all groups.

Phase 1: ingest only (no Telegram alert yet — Phase 2 wires that).
Idempotent: skips tx_hashes already in DB for the same wallet.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.models.forex import (
    AccountGroup,
    AccountGroupWallet,
    BrokerAccount,
    WalletTransaction,
)
from app.services import forex_auto_tagger, telegram_bot

logger = logging.getLogger(__name__)

USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
TRONSCAN_TRC20_URL = "https://apilist.tronscanapi.com/api/transfer/trc20"
PAGE_LIMIT = 50  # max per Tronscan call


def _api_headers() -> dict[str, str]:
    settings = get_settings()
    key = getattr(settings, "tronscan_api_key", None)
    return {"TRON-PRO-API-KEY": key} if key else {}


def fetch_trc20_transfers(
    address: str,
    start_ts_ms: int,
    end_ts_ms: int | None = None,
    *,
    contract: str = USDT_TRC20_CONTRACT,
    timeout: float = 30.0,
) -> list[dict]:
    """Fetch all USDT TRC20 transfers for `address` within timestamp window (ms)."""
    transfers: list[dict] = []
    start = 0
    headers = _api_headers()
    with httpx.Client(timeout=timeout, headers=headers) as client:
        while True:
            params: dict[str, str | int] = {
                "address": address,
                "start_timestamp": start_ts_ms,
                "trc20Id": contract,
                "limit": PAGE_LIMIT,
                "start": start,
                "sort": "-timestamp",
                "direction": 0,  # 0 = both in & out (default 1 = out only)
            }
            if end_ts_ms is not None:
                params["end_timestamp"] = end_ts_ms
            r = client.get(TRONSCAN_TRC20_URL, params=params)
            r.raise_for_status()
            data = r.json() or {}
            batch = data.get("token_transfers") or data.get("data") or []
            if not batch:
                break
            transfers.extend(batch)
            if len(batch) < PAGE_LIMIT:
                break
            start += PAGE_LIMIT
            if start >= 10000:  # safety cap
                logger.warning("tron_poller: hit 10k page cap for %s", address)
                break
    return transfers


def _parse_transfer(
    raw: dict, wallet_address: str
) -> tuple[str, datetime, str, float, str] | None:
    """Normalise one Tronscan record → (tx_hash, ts_utc, direction, amount, counterparty).

    Tronscan v1 fields: hash, block_timestamp (ms), from, to, amount (smallest unit string),
    decimals (e.g. 6 for USDT). Returns None if malformed.
    """
    tx_hash = raw.get("hash") or raw.get("transaction_id")
    if not tx_hash:
        return None

    ts_ms = raw.get("block_timestamp") or raw.get("block_ts") or raw.get("timestamp")
    if not ts_ms:
        return None
    ts = datetime.fromtimestamp(int(ts_ms) / 1000, tz=UTC).replace(tzinfo=None)

    from_addr = (raw.get("from") or raw.get("from_address") or raw.get("ownerAddress") or "").strip()
    to_addr = (raw.get("to") or raw.get("to_address") or raw.get("toAddress") or "").strip()
    wa = wallet_address.strip()

    if to_addr == wa:
        direction = "in"
        counterparty = from_addr
    elif from_addr == wa:
        direction = "out"
        counterparty = to_addr
    else:
        return None

    raw_amt = raw.get("amount") or raw.get("quant") or raw.get("amount_str")
    if raw_amt is None:
        return None
    decimals = int(raw.get("decimals") or 6)
    try:
        amount = float(int(raw_amt)) / (10 ** decimals)
    except (TypeError, ValueError):
        try:
            amount = float(raw_amt)
        except (TypeError, ValueError):
            return None

    return tx_hash, ts, direction, amount, counterparty


def poll_wallet(
    wallet: AccountGroupWallet,
    db: Session,
    *,
    lookback_days: int = 1,
    notify: bool = True,
) -> int:
    """Pull recent USDT transfers for one wallet → insert new + run auto-tagger.

    Returns the number of newly-inserted transactions. If ``notify=True``, sends
    a Telegram alert per new transaction.
    """
    now_ms = int(datetime.now(tz=UTC).timestamp() * 1000)
    start_ms = now_ms - lookback_days * 86_400_000
    try:
        records = fetch_trc20_transfers(wallet.address, start_ms)
    except httpx.HTTPError as e:
        logger.error("tron_poller: fetch failed for %s: %s", wallet.address, e)
        return 0

    group = db.get(AccountGroup, wallet.group_id) if notify else None
    new_count = 0
    for raw in records:
        parsed = _parse_transfer(raw, wallet.address)
        if parsed is None:
            continue
        tx_hash, ts, direction, amount, counterparty = parsed

        existing = db.execute(
            select(WalletTransaction).where(
                WalletTransaction.wallet_id == wallet.id,
                WalletTransaction.tx_hash == tx_hash,
            )
        ).scalar_one_or_none()
        if existing is not None:
            continue

        tx = WalletTransaction(
            group_id=wallet.group_id,
            wallet_id=wallet.id,
            tx_hash=tx_hash,
            block_timestamp=ts,
            direction=direction,
            amount_usdt=amount,
            counterparty_address=counterparty,
            status="pending_tag",
            raw_data=raw,
        )
        db.add(tx)
        db.flush()
        forex_auto_tagger.try_tag_transaction(tx, db)
        new_count += 1

        if notify and group is not None and tx.status != "internal_transfer":
            broker = (
                db.get(BrokerAccount, tx.broker_account_id)
                if tx.broker_account_id is not None
                else None
            )
            telegram_bot.notify_new_tx(tx, group, wallet, broker)

    if new_count:
        db.commit()
    return new_count


def poll_all_active_wallets(db: Session | None = None, *, lookback_days: int = 1) -> dict:
    """Iterate all active wallets across all groups; report per-wallet new count."""
    own_session = db is None
    db = db or SessionLocal()
    try:
        wallets = db.execute(
            select(AccountGroupWallet).where(AccountGroupWallet.is_active.is_(True))
        ).scalars().all()
        result: dict[str, int] = {}
        for w in wallets:
            n = poll_wallet(w, db, lookback_days=lookback_days)
            result[f"{w.label} ({w.address[:6]}...{w.address[-4:]})"] = n
            if n:
                logger.info("tron_poller: %s — %d new tx", w.label, n)
        return result
    finally:
        if own_session:
            db.close()


def forex_poll_job() -> None:
    """APScheduler entry point."""
    logger.info("forex_poll_job: starting")
    counts = poll_all_active_wallets()
    total = sum(counts.values())
    logger.info("forex_poll_job: done — %d new tx across %d wallets", total, len(counts))
