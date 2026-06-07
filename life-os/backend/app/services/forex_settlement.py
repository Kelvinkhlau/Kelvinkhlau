"""Forex quarterly settlement — 50/50 profit split with partner + carry-forward.

Natural quarters: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec.

For a group + quarter:
  gross_pnl     = Σ MonthlyBalance.reported_pnl over the quarter's 3 months
  total_fees    = Σ WalletTransaction.fee_usdt in the quarter (override-able by user)
  net_pnl       = gross_pnl − total_fees
  carry_in      = previous quarter settlement's carry_out (0 if none)
  distributable = net_pnl + carry_in
  partner_share = max(0, distributable × split% )       # what to pay partner
  carry_out     = distributable − 2 × paid_amount       # 50/50: each takes paid_amount
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.forex import (
    AccountGroup,
    BrokerAccount,
    MonthlyBalance,
    QuarterlySettlement,
)
from app.services import forex_flows


def parse_quarter(quarter: str) -> tuple[int, int]:
    """'2026-Q2' → (2026, 2)."""
    year_s, q_s = quarter.upper().split("-Q")
    q = int(q_s)
    if q < 1 or q > 4:
        raise ValueError(f"Invalid quarter: {quarter}")
    return int(year_s), q


def quarter_months(quarter: str) -> list[str]:
    """'2026-Q2' → ['2026-04', '2026-05', '2026-06']."""
    year, q = parse_quarter(quarter)
    start = (q - 1) * 3 + 1
    return [f"{year}-{start + i:02d}" for i in range(3)]


def quarter_bounds(quarter: str) -> tuple[datetime, datetime]:
    """'2026-Q2' → (2026-04-01, 2026-07-01) as [start, end) naive datetimes."""
    year, q = parse_quarter(quarter)
    start_month = (q - 1) * 3 + 1
    start = datetime(year, start_month, 1)
    end = datetime(year + 1, 1, 1) if q == 4 else datetime(year, start_month + 3, 1)
    return start, end


def prev_quarter(quarter: str) -> str:
    year, q = parse_quarter(quarter)
    return f"{year - 1}-Q4" if q == 1 else f"{year}-Q{q - 1}"


def _gross_pnl(db: Session, group: AccountGroup, quarter: str) -> float:
    """Σ 該季每個 broker-month 嘅 P/L（即時計：closing − opening − 入金 + 出金）。"""
    months = quarter_months(quarter)
    rows = db.execute(
        select(MonthlyBalance, BrokerAccount)
        .join(BrokerAccount, BrokerAccount.id == MonthlyBalance.broker_account_id)
        .where(BrokerAccount.group_id == group.id, MonthlyBalance.month.in_(months))
    ).all()
    total = 0.0
    for mb, _b in rows:
        withdrawal, deposit = forex_flows.month_flows(db, mb.broker_account_id, mb.month)
        total += float(mb.closing_balance) - float(mb.opening_balance) - deposit + withdrawal
    return round(total, 2)


def _carry_in(db: Session, group: AccountGroup, quarter: str) -> float:
    prev = db.execute(
        select(QuarterlySettlement).where(
            QuarterlySettlement.group_id == group.id,
            QuarterlySettlement.quarter == prev_quarter(quarter),
        )
    ).scalar_one_or_none()
    return float(prev.carry_out) if prev else 0.0


def compute_preview(
    db: Session,
    group: AccountGroup,
    quarter: str,
    *,
    total_fees: float | None = None,
    paid_amount: float = 0.0,
) -> dict:
    """Compute settlement numbers WITHOUT persisting.

    手續費已包含喺月度 P/L 入面（用戶填實數），所以預設唔再另外扣 fee（fees=0）。
    total_fees 可選 override，留作日後手動調整。
    """
    split_pct = float(group.partner_split_pct or 50)
    gross = _gross_pnl(db, group, quarter)
    fees = float(total_fees) if total_fees is not None else 0.0
    net = gross - fees
    carry_in = _carry_in(db, group, quarter)
    distributable = net + carry_in
    partner_share = round(distributable * split_pct / 100, 2) if distributable > 0 else 0.0
    carry_out = round(distributable - 2 * paid_amount, 2)
    return {
        "group_id": group.id,
        "quarter": quarter,
        "months": quarter_months(quarter),
        "partner_name": group.partner_name,
        "partner_split_pct": split_pct,
        "gross_pnl": round(gross, 2),
        "total_fees": round(fees, 2),
        "fees_auto": total_fees is None,
        "net_pnl": round(net, 2),
        "carry_in": round(carry_in, 2),
        "distributable": round(distributable, 2),
        "partner_share": partner_share,
        "paid_amount": round(paid_amount, 2),
        "carry_out": carry_out,
    }
