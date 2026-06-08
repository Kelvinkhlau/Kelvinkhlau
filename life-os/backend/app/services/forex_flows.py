"""出入金加總 — 月度「出金/入金」由逐筆交易自動 sum。

來源：
  1. ManualTransfer（人手：銀行匯款 / 其他）— 所有月份都計。
  2. WalletTransaction（鏈上 USDT，status='tagged'）— 只計 AUTO_FROM_MONTH 之後嘅月份。
     （5 月及之前係手動 setup，啲錢包數太殘，唔自動計，避免同手動數撞。）

方向對應（broker 角度）：
  - 錢包 direction='in'（收到）  = broker 出金 withdrawal
  - 錢包 direction='out'（寄出）= broker 入金 deposit
  - ManualTransfer.flow 直接係 'withdrawal' / 'deposit'
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.forex import BrokerAccount, ManualTransfer, WalletTransaction

# 6 月起先自動接錢包 tagged 交易（之前手動）
AUTO_FROM_MONTH = "2026-06"


def _month_bounds(month: str) -> tuple[datetime, datetime, date, date]:
    """'YYYY-MM' → (dt_start, dt_end_excl, d_start, d_end_excl)."""
    year, mon = (int(p) for p in month.split("-"))
    start = datetime(year, mon, 1)
    end = datetime(year + 1, 1, 1) if mon == 12 else datetime(year, mon + 1, 1)
    return start, end, start.date(), end.date()


def month_flows(db: Session, broker_id: int, month: str) -> tuple[float, float]:
    """回傳 (出金 withdrawal_total, 入金 deposit_total) for one broker-month."""
    dt_start, dt_end, d_start, d_end = _month_bounds(month)

    # 1) 人手交易（所有月份）
    man = dict(
        db.execute(
            select(ManualTransfer.flow, func.coalesce(func.sum(ManualTransfer.amount_usdt), 0))
            .where(
                ManualTransfer.broker_account_id == broker_id,
                ManualTransfer.transfer_date >= d_start,
                ManualTransfer.transfer_date < d_end,
            )
            .group_by(ManualTransfer.flow)
        ).all()
    )
    withdrawal = float(man.get("withdrawal", 0) or 0)
    deposit = float(man.get("deposit", 0) or 0)

    # 2) 鏈上 tagged 交易（只限 AUTO_FROM_MONTH 之後）
    if month >= AUTO_FROM_MONTH:
        wallet = dict(
            db.execute(
                select(
                    WalletTransaction.direction,
                    func.coalesce(func.sum(WalletTransaction.amount_usdt), 0),
                )
                .where(
                    WalletTransaction.broker_account_id == broker_id,
                    WalletTransaction.status == "tagged",
                    WalletTransaction.block_timestamp >= dt_start,
                    WalletTransaction.block_timestamp < dt_end,
                )
                .group_by(WalletTransaction.direction)
            ).all()
        )
        withdrawal += float(wallet.get("in", 0) or 0)  # 錢包收到 = broker 出金
        deposit += float(wallet.get("out", 0) or 0)  # 錢包寄出 = broker 入金

    return round(withdrawal, 2), round(deposit, 2)


def list_transfers(db: Session, broker_id: int, month: str) -> list[dict]:
    """一個 broker-month 嘅明細（人手 + 鏈上 tagged），統一格式，畀展開列表用。"""
    dt_start, dt_end, d_start, d_end = _month_bounds(month)
    out: list[dict] = []

    for t in db.execute(
        select(ManualTransfer).where(
            ManualTransfer.broker_account_id == broker_id,
            ManualTransfer.transfer_date >= d_start,
            ManualTransfer.transfer_date < d_end,
        )
    ).scalars():
        out.append({
            "id": t.id,
            "source": "manual",
            "flow": t.flow,
            "method": t.method,
            "amount": float(t.amount_usdt),
            "date": t.transfer_date.isoformat(),
            "notes": t.notes,
        })

    if month >= AUTO_FROM_MONTH:
        for tx in db.execute(
            select(WalletTransaction).where(
                WalletTransaction.broker_account_id == broker_id,
                WalletTransaction.status == "tagged",
                WalletTransaction.block_timestamp >= dt_start,
                WalletTransaction.block_timestamp < dt_end,
            )
        ).scalars():
            out.append({
                "id": tx.id,
                "source": "wallet",
                "flow": "withdrawal" if tx.direction == "in" else "deposit",
                "method": "crypto",
                "amount": float(tx.amount_usdt),
                "date": tx.block_timestamp.date().isoformat(),
                "notes": tx.notes,
            })

    out.sort(key=lambda r: r["date"])
    return out


def list_group_transfers(db: Session, group_id: int, month: str) -> list[dict]:
    """成個 group 一個月嘅出入金明細（連 broker 資料），畀報告用。"""
    brokers = db.execute(
        select(BrokerAccount).where(BrokerAccount.group_id == group_id)
    ).scalars().all()
    out: list[dict] = []
    for b in brokers:
        for t in list_transfers(db, b.id, month):
            out.append({
                "broker_id": b.id,
                "broker_name": b.name,
                "owner": b.owner,
                **t,
            })
    out.sort(key=lambda r: (r["owner"] or "", r["broker_name"], r["date"]))
    return out
