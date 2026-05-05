"""Backfill last N days of USDT TRC20 transactions for ALL active wallets.

Run from project root:
    cd backend && uv run python -m scripts.backfill_forex_transactions [days]
"""

from __future__ import annotations

import logging
import sys

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models.forex import AccountGroup, AccountGroupWallet, WalletTransaction
from app.services.tron_poller import poll_all_active_wallets

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("backfill_forex")


def main() -> None:
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 90
    logger.info("backfill: pulling last %d days for all active wallets", days)

    db = SessionLocal()
    try:
        counts = poll_all_active_wallets(db, lookback_days=days)
        # Per-wallet summary
        for label, n in counts.items():
            logger.info("  %s : %d new tx", label, n)

        # Final DB state
        groups = db.execute(select(AccountGroup).order_by(AccountGroup.id)).scalars().all()
        for g in groups:
            wallets = db.execute(
                select(AccountGroupWallet).where(AccountGroupWallet.group_id == g.id)
            ).scalars().all()
            for w in wallets:
                in_count = db.execute(
                    select(func.count(WalletTransaction.id)).where(
                        WalletTransaction.wallet_id == w.id,
                        WalletTransaction.direction == "in",
                    )
                ).scalar_one()
                out_count = db.execute(
                    select(func.count(WalletTransaction.id)).where(
                        WalletTransaction.wallet_id == w.id,
                        WalletTransaction.direction == "out",
                    )
                ).scalar_one()
                in_sum = db.execute(
                    select(func.coalesce(func.sum(WalletTransaction.amount_usdt), 0)).where(
                        WalletTransaction.wallet_id == w.id,
                        WalletTransaction.direction == "in",
                    )
                ).scalar_one()
                out_sum = db.execute(
                    select(func.coalesce(func.sum(WalletTransaction.amount_usdt), 0)).where(
                        WalletTransaction.wallet_id == w.id,
                        WalletTransaction.direction == "out",
                    )
                ).scalar_one()
                logger.info(
                    "[%s] %s — IN: %d ($%s)   OUT: %d ($%s)",
                    g.code, w.label, in_count, in_sum, out_count, out_sum,
                )
    finally:
        db.close()


if __name__ == "__main__":
    main()
