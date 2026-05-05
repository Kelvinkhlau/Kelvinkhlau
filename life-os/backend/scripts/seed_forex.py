"""Seed forex tables — groups, wallets, brokers, March-2026 monthly balances, historical intents.

Idempotent: safe to re-run. Skips entities that already exist.

Run from project root:
    cd backend && uv run python -m scripts.seed_forex
"""

from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path

from openpyxl import load_workbook
from sqlalchemy import select

from app.db import SessionLocal
from app.models.forex import (
    AccountGroup,
    AccountGroupWallet,
    BrokerAccount,
    DepositIntent,
    MonthlyBalance,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("seed_forex")

# ───────── Source files ─────────
PROJECT_ROOT = Path(__file__).resolve().parents[2]
A_GROUP_XLSX = Path(
    "/Users/kelvinkhlau/Library/Mobile Documents/com~apple~CloudDocs/"
    "2026年3月 Kelvin account_ALL.xlsx"
)
B_GROUP_XLSX = (
    PROJECT_ROOT / "docs" / "forex" / "2026-03 B-group accounts (transcribed from photo).xlsx"
)

# ───────── Seed config ─────────
GROUPS: list[dict] = [
    {
        "code": "company",
        "name": "公司戶口組 (A)",
        "owner_name": "Kelvin / Kelvin太太",
        "wallets": [
            ("Kelvin Binance", "TS2EgmAn6HWbeKtTYS3r8Gj2C7T9vYCa1n"),
            ("Carrie (Kelvin太太) Tronlink", "TF67r6LGT5RBWkQoL9m3CPzmfiguoUJSAr"),
        ],
    },
    {
        "code": "personal",
        "name": "私人戶口組 (B)",
        "owner_name": "Candy / Celia / Simon",
        "wallets": [
            ("Candy Tronlink", "TUmeZhbdMwmANDneK3fY6boGezv5nSiyiA"),
            ("Celia Tronlink", "TX2MqYC72hsbqc73DLDmE8ZAmRXGpUWeyH"),
            ("Simon Tronlink", "TSqhxb9RC27qZTWUvKvM2eQekm9nWgppvx"),
        ],
    },
]

# A xlsx columns: Owner, Broker, Email, PW, 2FA, opening, closing, 出金, 入金, P&L
# B xlsx (transcribed): Owner, Broker, Account, PW, 2FA, opening, closing, 出金, 入金, P&L
SEED_MONTH = "2026-03"


def _ensure_group(db, code: str, name: str, owner_name: str) -> AccountGroup:
    g = db.execute(select(AccountGroup).where(AccountGroup.code == code)).scalar_one_or_none()
    if g is None:
        g = AccountGroup(code=code, name=name, owner_name=owner_name)
        db.add(g)
        db.flush()
        logger.info("created group %s (%s)", code, g.id)
    return g


def _ensure_wallet(db, group: AccountGroup, label: str, address: str) -> AccountGroupWallet:
    w = db.execute(
        select(AccountGroupWallet).where(AccountGroupWallet.address == address)
    ).scalar_one_or_none()
    if w is None:
        w = AccountGroupWallet(group_id=group.id, address=address, label=label)
        db.add(w)
        db.flush()
        logger.info("  + wallet %s (%s...)", label, address[:8])
    return w


def _ensure_broker(
    db,
    group: AccountGroup,
    name: str,
    *,
    owner: str | None = None,
    email: str | None = None,
    account_number: str | None = None,
) -> BrokerAccount:
    b = db.execute(
        select(BrokerAccount).where(
            BrokerAccount.group_id == group.id,
            BrokerAccount.name == name,
            BrokerAccount.owner == owner,
        )
    ).scalar_one_or_none()
    if b is None:
        b = BrokerAccount(
            group_id=group.id, name=name, owner=owner, email=email,
            account_number=account_number,
        )
        db.add(b)
        db.flush()
    return b


def _upsert_monthly(
    db,
    broker: BrokerAccount,
    *,
    month: str,
    opening: float,
    closing: float,
    pnl: float,
) -> bool:
    """Insert monthly balance if not present. Returns True if inserted."""
    exists = db.execute(
        select(MonthlyBalance).where(
            MonthlyBalance.broker_account_id == broker.id, MonthlyBalance.month == month
        )
    ).scalar_one_or_none()
    if exists is not None:
        return False
    db.add(
        MonthlyBalance(
            broker_account_id=broker.id,
            month=month,
            opening_balance=opening,
            closing_balance=closing,
            reported_pnl=pnl,
        )
    )
    return True


def seed_a_group(db, group: AccountGroup) -> tuple[int, int]:
    """Returns (brokers_created, monthly_inserted)."""
    if not A_GROUP_XLSX.exists():
        logger.warning("A xlsx missing: %s — skipping A broker seed", A_GROUP_XLSX)
        return 0, 0
    wb = load_workbook(A_GROUP_XLSX, data_only=True)
    ws = wb["Sheet1"]
    new_brokers = 0
    new_monthly = 0
    for row in ws.iter_rows(min_row=3, values_only=True):
        owner, broker_name, email, pw, twofa, opening, closing, withdraw, deposit, pnl = row
        if not broker_name or str(broker_name).strip().lower() == "total":
            continue
        broker = _ensure_broker(
            db, group, str(broker_name).strip(),
            owner=str(owner).strip() if owner else None,
            email=str(email).strip() if email else None,
        )
        if broker.id is None:
            db.flush()
        # If broker was just created, count it
        # (refetch to confirm — flushed already)
        if opening is not None or closing is not None:
            inserted = _upsert_monthly(
                db, broker,
                month=SEED_MONTH,
                opening=float(opening or 0),
                closing=float(closing or 0),
                pnl=float(pnl or 0),
            )
            if inserted:
                new_monthly += 1
    return new_brokers, new_monthly


def seed_b_group(db, group: AccountGroup) -> tuple[int, int]:
    if not B_GROUP_XLSX.exists():
        logger.warning("B xlsx missing: %s — run build_b_group_xlsx first", B_GROUP_XLSX)
        return 0, 0
    wb = load_workbook(B_GROUP_XLSX, data_only=True)
    ws = wb["Sheet1"]
    new_monthly = 0
    for row in ws.iter_rows(min_row=2, values_only=True):
        owner, broker_name, account, pw, twofa, opening, closing, withdraw, deposit, pnl = row
        if not broker_name or str(broker_name).strip().lower() == "total":
            continue
        broker = _ensure_broker(
            db, group, str(broker_name).strip(),
            owner=str(owner).strip() if owner else None,
            account_number=str(account).strip() if account else None,
        )
        if broker.id is None:
            db.flush()
        if opening is not None or closing is not None:
            inserted = _upsert_monthly(
                db, broker,
                month=SEED_MONTH,
                opening=float(opening or 0),
                closing=float(closing or 0),
                pnl=float(pnl or 0),
            )
            if inserted:
                new_monthly += 1
    return 0, new_monthly


def seed_a_group_intents(db, group: AccountGroup) -> int:
    """Import 流水表 sheet rows into deposit_intents (status=matched, since landed amounts known)."""
    if not A_GROUP_XLSX.exists():
        return 0
    wb = load_workbook(A_GROUP_XLSX, data_only=True)
    if "流水表" not in wb.sheetnames:
        return 0
    ws = wb["流水表"]
    inserted = 0
    for row in ws.iter_rows(min_row=3, values_only=True):
        date_v, company, mt4, withdraw, deposit, method, status, note, landed_at, landed_amt = row
        if not company or not date_v:
            continue
        broker_name = str(company).strip()
        broker = db.execute(
            select(BrokerAccount).where(
                BrokerAccount.group_id == group.id, BrokerAccount.name == broker_name
            )
        ).scalar_one_or_none()
        if broker is None:
            broker = _ensure_broker(db, group, broker_name)
            db.flush()
        amt = withdraw or deposit or landed_amt
        if not amt:
            continue
        intended_at = (
            date_v if isinstance(date_v, datetime)
            else datetime.combine(date_v, datetime.min.time())
        )
        existing = db.execute(
            select(DepositIntent).where(
                DepositIntent.group_id == group.id,
                DepositIntent.broker_account_id == broker.id,
                DepositIntent.amount_usdt == float(amt),
                DepositIntent.intended_at == intended_at,
            )
        ).scalar_one_or_none()
        if existing is not None:
            continue
        intent_status = "matched" if (status and "DONE" in str(status).upper()) else "pending"
        db.add(
            DepositIntent(
                group_id=group.id,
                broker_account_id=broker.id,
                amount_usdt=float(amt),
                intended_at=intended_at,
                status=intent_status,
                notes=f"method={method}; status={status}; landed={landed_amt}; note={note}",
            )
        )
        inserted += 1
    return inserted


def main() -> None:
    db = SessionLocal()
    try:
        # Groups + wallets
        for gcfg in GROUPS:
            g = _ensure_group(db, gcfg["code"], gcfg["name"], gcfg["owner_name"])
            for label, addr in gcfg["wallets"]:
                _ensure_wallet(db, g, label, addr)
        db.flush()

        # A brokers + monthly + intents
        a = db.execute(select(AccountGroup).where(AccountGroup.code == "company")).scalar_one()
        _, a_monthly = seed_a_group(db, a)
        a_intents = seed_a_group_intents(db, a)

        # B brokers + monthly
        b = db.execute(select(AccountGroup).where(AccountGroup.code == "personal")).scalar_one()
        _, b_monthly = seed_b_group(db, b)

        db.commit()

        # Summary
        groups = db.execute(select(AccountGroup)).scalars().all()
        for g in groups:
            wallet_count = db.execute(
                select(AccountGroupWallet).where(AccountGroupWallet.group_id == g.id)
            ).scalars().all()
            broker_count = db.execute(
                select(BrokerAccount).where(BrokerAccount.group_id == g.id)
            ).scalars().all()
            logger.info(
                "%-8s wallets=%d brokers=%d",
                g.code, len(wallet_count), len(broker_count),
            )
        logger.info(
            "monthly inserted: A=%d B=%d  intents inserted (A): %d",
            a_monthly, b_monthly, a_intents,
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
