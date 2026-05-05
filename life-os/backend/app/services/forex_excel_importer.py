"""Forex Excel importer — friend's monthly xlsx → MonthlyBalance + auto-create brokers.

Expected xlsx layout (mirrors A-group format used by Kelvin's friend):
    Sheet "Sheet1":
      row 1: free-form / total row (skipped)
      row 2: header — Owner | Broker | Email|Account | PW | 2FA | <opening_label> | <closing_label> | 出金 | 入金 | P&L
      rows 3+: data rows; "total" row at bottom is skipped

Optional Sheet "流水表" (only A group uses this):
      Owner-side cash-flow ledger; rows imported as DepositIntent (status=matched).

Caller specifies group_id; this importer never decides which group.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.forex import (
    AccountGroup,
    BrokerAccount,
    DepositIntent,
    MonthlyBalance,
)

logger = logging.getLogger(__name__)


@dataclass
class ImportResult:
    month: str
    brokers_created: int
    monthly_inserted: int
    monthly_updated: int
    intents_inserted: int
    warnings: list[str]


def _ensure_broker(
    db: Session,
    group: AccountGroup,
    name: str,
    *,
    owner: str | None = None,
    email: str | None = None,
    account_number: str | None = None,
) -> tuple[BrokerAccount, bool]:
    """Get-or-create. Returns (broker, was_created)."""
    b = db.execute(
        select(BrokerAccount).where(
            BrokerAccount.group_id == group.id,
            BrokerAccount.name == name,
            BrokerAccount.owner == owner,
        )
    ).scalar_one_or_none()
    if b is not None:
        return b, False
    b = BrokerAccount(
        group_id=group.id, name=name, owner=owner, email=email,
        account_number=account_number,
    )
    db.add(b)
    db.flush()
    return b, True


def import_monthly_xlsx(
    db: Session,
    group: AccountGroup,
    xlsx_path: Path,
    *,
    month: str | None = None,
) -> ImportResult:
    """Parse xlsx → MonthlyBalance for the given group.

    If ``month`` not provided, infers from the closing-balance column header
    (e.g. "1/4/2026Balance" → "2026-03" since 1/4/2026 is the first-of-next-month).
    """
    if not xlsx_path.exists():
        raise FileNotFoundError(f"xlsx not found: {xlsx_path}")

    wb = load_workbook(xlsx_path, data_only=True)
    ws = wb.get_sheet_by_name("Sheet1") if "Sheet1" in wb.sheetnames else wb.active
    if ws is None:
        raise ValueError("xlsx has no readable sheet")

    # Read header row (row 2) to detect column meanings + month
    header = next(ws.iter_rows(min_row=2, max_row=2, values_only=True))
    inferred_month = month
    if inferred_month is None:
        # Column 7 (index 6) typically holds closing-balance header like "1/4/2026Balance"
        for h in header:
            if not isinstance(h, str):
                continue
            if "Balance" in h and "/" in h:
                # parse "1/4/2026Balance" → year=2026, month=4 → balance is 月初, so period = month-1
                try:
                    date_part = h.replace("Balance", "").strip()
                    d = datetime.strptime(date_part, "%d/%m/%Y")
                    period_year = d.year if d.month > 1 else d.year - 1
                    period_month = d.month - 1 if d.month > 1 else 12
                    inferred_month = f"{period_year:04d}-{period_month:02d}"
                except ValueError:
                    continue
        if inferred_month is None:
            raise ValueError(
                "Could not infer month from header — please pass month=YYYY-MM explicitly"
            )

    brokers_created = 0
    monthly_inserted = 0
    monthly_updated = 0
    warnings: list[str] = []

    # Skip header row (row 2); data from row 3
    for row in ws.iter_rows(min_row=3, values_only=True):
        if row is None or all(v is None for v in row):
            continue
        # Layout: Owner | Broker | Email/Acct | PW | 2FA | opening | closing | 出金 | 入金 | P&L
        owner_v, broker_v, ident_v, _pw, _twofa, opening_v, closing_v, _withdraw, _deposit, pnl_v = (
            (list(row) + [None] * 10)[:10]
        )
        if not broker_v or str(broker_v).strip().lower() == "total":
            continue
        owner = str(owner_v).strip() if owner_v else None
        broker_name = str(broker_v).strip()
        # `ident_v` is email in A-group, account number in B-group transcription — try both
        email_v = None
        account_v = None
        if ident_v:
            s = str(ident_v).strip()
            if "@" in s:
                email_v = s
            else:
                account_v = s

        broker, created = _ensure_broker(
            db, group, broker_name, owner=owner, email=email_v, account_number=account_v,
        )
        if created:
            brokers_created += 1

        if opening_v is None and closing_v is None:
            continue

        opening = float(opening_v or 0)
        closing = float(closing_v or 0)
        pnl = float(pnl_v or 0)

        existing = db.execute(
            select(MonthlyBalance).where(
                MonthlyBalance.broker_account_id == broker.id,
                MonthlyBalance.month == inferred_month,
            )
        ).scalar_one_or_none()
        if existing is None:
            db.add(
                MonthlyBalance(
                    broker_account_id=broker.id,
                    month=inferred_month,
                    opening_balance=opening,
                    closing_balance=closing,
                    reported_pnl=pnl,
                )
            )
            monthly_inserted += 1
        else:
            # Update if values differ
            changed = False
            if float(existing.opening_balance) != opening:
                existing.opening_balance = opening
                changed = True
            if float(existing.closing_balance) != closing:
                existing.closing_balance = closing
                changed = True
            if float(existing.reported_pnl) != pnl:
                existing.reported_pnl = pnl
                changed = True
            if changed:
                monthly_updated += 1

    # Optional 流水表 sheet → DepositIntent
    intents_inserted = 0
    if "流水表" in wb.sheetnames:
        flow = wb["流水表"]
        for row in flow.iter_rows(min_row=3, values_only=True):
            (date_v, company, _mt4, withdraw, deposit, method, status_v,
             note_v, _landed_at, landed_amt) = (list(row) + [None] * 10)[:10]
            if not company or not date_v:
                continue
            broker_name = str(company).strip()
            broker, _ = _ensure_broker(db, group, broker_name)
            amt = withdraw or deposit or landed_amt
            if not amt:
                continue
            intended_at = (
                date_v if isinstance(date_v, datetime)
                else datetime.combine(date_v, datetime.min.time())
            )
            existing_int = db.execute(
                select(DepositIntent).where(
                    DepositIntent.group_id == group.id,
                    DepositIntent.broker_account_id == broker.id,
                    DepositIntent.amount_usdt == float(amt),
                    DepositIntent.intended_at == intended_at,
                )
            ).scalar_one_or_none()
            if existing_int is not None:
                continue
            intent_status = (
                "matched"
                if (status_v and "DONE" in str(status_v).upper())
                else "pending"
            )
            db.add(
                DepositIntent(
                    group_id=group.id,
                    broker_account_id=broker.id,
                    amount_usdt=float(amt),
                    intended_at=intended_at,
                    status=intent_status,
                    notes=f"method={method}; status={status_v}; landed={landed_amt}; note={note_v}",
                )
            )
            intents_inserted += 1

    # Validate: previous-month closing should match this month's opening (per broker, per group)
    if inferred_month >= "0001-02":  # has a previous month conceptually
        prev_year, prev_month = inferred_month.split("-")
        py, pm = int(prev_year), int(prev_month) - 1
        if pm == 0:
            py, pm = py - 1, 12
        prev_month_str = f"{py:04d}-{pm:02d}"
        for broker in db.execute(
            select(BrokerAccount).where(BrokerAccount.group_id == group.id)
        ).scalars():
            prev = db.execute(
                select(MonthlyBalance).where(
                    MonthlyBalance.broker_account_id == broker.id,
                    MonthlyBalance.month == prev_month_str,
                )
            ).scalar_one_or_none()
            cur = db.execute(
                select(MonthlyBalance).where(
                    MonthlyBalance.broker_account_id == broker.id,
                    MonthlyBalance.month == inferred_month,
                )
            ).scalar_one_or_none()
            if prev is None or cur is None:
                continue
            diff = abs(float(prev.closing_balance) - float(cur.opening_balance))
            if diff > 0.01:
                warnings.append(
                    f"{broker.name}"
                    + (f" ({broker.owner})" if broker.owner else "")
                    + f": prev closing ${float(prev.closing_balance):,.2f} "
                    + f"≠ cur opening ${float(cur.opening_balance):,.2f}  Δ${diff:,.2f}"
                )

    db.commit()
    return ImportResult(
        month=inferred_month,
        brokers_created=brokers_created,
        monthly_inserted=monthly_inserted,
        monthly_updated=monthly_updated,
        intents_inserted=intents_inserted,
        warnings=warnings,
    )
