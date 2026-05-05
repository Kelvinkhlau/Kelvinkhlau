"""Auto-tagger — match new wallet_transactions to brokers via address_book / deposit_intents.

All lookups are SCOPED BY group_id — addresses learned for one group never leak into another.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.forex import (
    AddressBookEntry,
    DepositIntent,
    WalletTransaction,
)

logger = logging.getLogger(__name__)

DEPOSIT_INTENT_WINDOW_HOURS = 24
DEPOSIT_INTENT_AMOUNT_TOLERANCE = 5.0  # USDT


def try_tag_transaction(tx: WalletTransaction, db: Session) -> bool:
    """Attempt to auto-tag a single transaction. Returns True if tagged."""
    # 1) address_book lookup (scoped to tx.group_id)
    entry = db.execute(
        select(AddressBookEntry).where(
            AddressBookEntry.group_id == tx.group_id,
            AddressBookEntry.address == tx.counterparty_address,
        )
    ).scalar_one_or_none()
    if entry is not None:
        tx.broker_account_id = entry.broker_account_id
        tx.status = "tagged"
        # Refresh last_seen_at
        if entry.first_seen_at is None:
            entry.first_seen_at = tx.block_timestamp
        if entry.last_seen_at is None or tx.block_timestamp > entry.last_seen_at:
            entry.last_seen_at = tx.block_timestamp
        logger.info(
            "auto_tagger: tagged tx %s → broker %d (group %d) via address_book",
            tx.tx_hash[:12], entry.broker_account_id, tx.group_id,
        )
        return True

    # 2) For outgoing tx, try matching against pending deposit_intents in same group
    if tx.direction == "out":
        window = timedelta(hours=DEPOSIT_INTENT_WINDOW_HOURS)
        intents = db.execute(
            select(DepositIntent)
            .where(
                DepositIntent.group_id == tx.group_id,
                DepositIntent.status == "pending",
                DepositIntent.intended_at >= tx.block_timestamp - window,
                DepositIntent.intended_at <= tx.block_timestamp + window,
            )
        ).scalars().all()
        # Pick the closest amount within tolerance
        best: DepositIntent | None = None
        best_diff = float("inf")
        for it in intents:
            diff = abs(float(it.amount_usdt) - float(tx.amount_usdt))
            if diff <= DEPOSIT_INTENT_AMOUNT_TOLERANCE and diff < best_diff:
                best, best_diff = it, diff
        if best is not None:
            tx.broker_account_id = best.broker_account_id
            tx.status = "tagged"
            best.status = "matched"
            best.matched_tx_hash = tx.tx_hash
            logger.info(
                "auto_tagger: matched tx %s → intent %d (broker %d, ±$%.2f)",
                tx.tx_hash[:12], best.id, best.broker_account_id, best_diff,
            )
            return True

    # 3) Otherwise leave as pending_tag
    return False
