"""Forex monthly reconciliation engine.

For each broker_account in a group with a MonthlyBalance for `month`:
  total_in  = Σ wallet_transactions where direction='in'  & broker_account_id=this & month
  total_out = Σ wallet_transactions where direction='out' & broker_account_id=this & month
  expected_pnl = closing - opening - total_out + total_in

  Sign-convention reasoning:
    - tx.direction='out' means wallet → counterparty. Counterparty is the broker, so
      this is a DEPOSIT into the broker (broker balance ↑).
    - tx.direction='in' means counterparty → wallet. Counterparty is the broker, so
      this is a WITHDRAWAL from the broker (broker balance ↓).
    - Broker balance equation: closing = opening + deposits - withdrawals + trading_pnl
                              => trading_pnl = closing - opening - deposits + withdrawals
                                            = closing - opening - total_out + total_in

  variance = reported_pnl - expected_pnl
  status: "matched" if |variance| ≤ tolerance, else "flagged"
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.forex import (
    AccountGroup,
    BrokerAccount,
    MonthlyBalance,
    ReconciliationRun,
    WalletTransaction,
)

logger = logging.getLogger(__name__)


def _month_bounds(month: str) -> tuple[datetime, datetime]:
    """'YYYY-MM' → (start_inclusive, end_exclusive) as naive UTC datetimes."""
    year, mon = (int(p) for p in month.split("-"))
    start = datetime(year, mon, 1)
    end = datetime(year + 1, 1, 1) if mon == 12 else datetime(year, mon + 1, 1)
    return start, end


def reconcile_broker(
    db: Session,
    broker: BrokerAccount,
    monthly: MonthlyBalance,
    *,
    tolerance: float,
) -> dict[str, Any]:
    """Compute reconciliation for one broker-month. Mutates `monthly` in-place."""
    start, end = _month_bounds(monthly.month)
    in_sum = db.execute(
        select(func.coalesce(func.sum(WalletTransaction.amount_usdt), 0)).where(
            WalletTransaction.broker_account_id == broker.id,
            WalletTransaction.direction == "in",
            and_(
                WalletTransaction.block_timestamp >= start,
                WalletTransaction.block_timestamp < end,
            ),
        )
    ).scalar() or 0
    out_sum = db.execute(
        select(func.coalesce(func.sum(WalletTransaction.amount_usdt), 0)).where(
            WalletTransaction.broker_account_id == broker.id,
            WalletTransaction.direction == "out",
            and_(
                WalletTransaction.block_timestamp >= start,
                WalletTransaction.block_timestamp < end,
            ),
        )
    ).scalar() or 0

    opening = float(monthly.opening_balance or 0)
    closing = float(monthly.closing_balance or 0)
    reported = float(monthly.reported_pnl or 0)
    expected = closing - opening - float(out_sum) + float(in_sum)
    variance = reported - expected
    status = "matched" if abs(variance) <= tolerance else "flagged"

    monthly.expected_pnl = expected
    monthly.variance = variance
    monthly.status = status

    return {
        "broker_id": broker.id,
        "broker_name": broker.name,
        "owner": broker.owner,
        "opening": opening,
        "closing": closing,
        "reported_pnl": reported,
        "tracked_in": float(in_sum),
        "tracked_out": float(out_sum),
        "expected_pnl": expected,
        "variance": variance,
        "status": status,
    }


def run_monthly_reconciliation(
    db: Session,
    group: AccountGroup,
    month: str,
    *,
    tolerance: float | None = None,
) -> ReconciliationRun:
    """Run reconciliation for one group + one month. Persists ReconciliationRun + updates MonthlyBalance rows."""
    if tolerance is None:
        tolerance = get_settings().forex_reconciliation_tolerance_usdt

    rows: list[dict[str, Any]] = []
    matched = 0
    flagged = 0

    monthly_rows = db.execute(
        select(MonthlyBalance, BrokerAccount)
        .join(BrokerAccount, BrokerAccount.id == MonthlyBalance.broker_account_id)
        .where(BrokerAccount.group_id == group.id, MonthlyBalance.month == month)
        .order_by(BrokerAccount.name, BrokerAccount.owner)
    ).all()

    for monthly, broker in monthly_rows:
        r = reconcile_broker(db, broker, monthly, tolerance=tolerance)
        rows.append(r)
        if r["status"] == "matched":
            matched += 1
        else:
            flagged += 1

    summary = {
        "tolerance_usdt": tolerance,
        "rows": rows,
        "totals": {
            "opening": sum(r["opening"] for r in rows),
            "closing": sum(r["closing"] for r in rows),
            "reported_pnl": sum(r["reported_pnl"] for r in rows),
            "expected_pnl": sum(r["expected_pnl"] for r in rows),
            "variance": sum(r["variance"] for r in rows),
            "tracked_in": sum(r["tracked_in"] for r in rows),
            "tracked_out": sum(r["tracked_out"] for r in rows),
        },
    }
    run = ReconciliationRun(
        group_id=group.id,
        month=month,
        total_accounts=len(rows),
        matched_count=matched,
        flagged_count=flagged,
        summary=summary,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    logger.info(
        "reconciliation %s %s: %d total, %d matched, %d flagged",
        group.code, month, len(rows), matched, flagged,
    )
    return run


def run_all_groups_reconciliation(
    db: Session, month: str, *, tolerance: float | None = None
) -> list[ReconciliationRun]:
    runs: list[ReconciliationRun] = []
    for group in db.execute(
        select(AccountGroup).where(AccountGroup.is_active.is_(True)).order_by(AccountGroup.id)
    ).scalars():
        runs.append(run_monthly_reconciliation(db, group, month, tolerance=tolerance))
    return runs


def latest_run_for_group(
    db: Session, group: AccountGroup, month: str
) -> ReconciliationRun | None:
    return db.execute(
        select(ReconciliationRun)
        .where(ReconciliationRun.group_id == group.id, ReconciliationRun.month == month)
        .order_by(ReconciliationRun.run_at.desc())
        .limit(1)
    ).scalar_one_or_none()
