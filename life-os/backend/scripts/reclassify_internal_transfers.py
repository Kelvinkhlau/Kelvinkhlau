"""One-off: scan all pending_tag wallet_transactions and re-classify
those whose counterparty is one of our own wallets as internal_transfer.

Idempotent. Safe to run multiple times.

    cd backend && uv run python -m scripts.reclassify_internal_transfers
"""

from __future__ import annotations

import logging

from sqlalchemy import select

from app.db import SessionLocal
from app.models.forex import AccountGroupWallet, WalletTransaction

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("reclassify_internal_transfers")


def main() -> None:
    db = SessionLocal()
    try:
        own_addrs = {
            a for (a,) in db.execute(select(AccountGroupWallet.address)).all()
        }
        logger.info("Found %d own wallet addresses", len(own_addrs))

        candidates = db.execute(
            select(WalletTransaction).where(
                WalletTransaction.status.in_(["pending_tag", "tagged"])
            )
        ).scalars().all()

        reclassified = 0
        for tx in candidates:
            if tx.counterparty_address in own_addrs and tx.status != "internal_transfer":
                tx.status = "internal_transfer"
                tx.broker_account_id = None
                reclassified += 1

        db.commit()
        logger.info("Reclassified %d tx as internal_transfer", reclassified)
    finally:
        db.close()


if __name__ == "__main__":
    main()
