"""Forex API routes — groups / wallets / brokers / transactions / reconciliation."""

from __future__ import annotations

import shutil
import tempfile
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError

from pydantic import BaseModel

from app.api.vault import require_recent_auth
from app.deps import DbSession, current_user
from app.models.forex import (
    AccountGroup,
    AccountGroupWallet,
    AddressBookEntry,
    BrokerAccount,
    ManualTransfer,
    MonthlyBalance,
    QuarterlySettlement,
    ReconciliationRun,
    WalletTransaction,
)
from app.schemas.forex import (
    AccountGroupCreate,
    AccountGroupOut,
    AccountGroupUpdate,
    BrokerCreate,
    BrokerCredentials,
    BrokerCredentialsUpdate,
    BrokerOut,
    BrokerUpdate,
    MonthlyBalanceUpsert,
    MonthlyView,
    SettlementOut,
    SettlementPreview,
    SettlementSave,
    TransactionOut,
    TransactionUpdate,
    TransferCreate,
    TransferOut,
    WalletCreate,
    WalletOut,
    WalletUpdate,
)
from app.services import (
    forex_balance_ocr,
    forex_excel_importer,
    forex_flows,
    forex_reconciliation,
    forex_settlement,
    tron_poller,
)


class TagRequest(BaseModel):
    broker_account_id: int
    learn_address: bool = True
    # tag 嗰陣可以順手填手續費 / 備註（知就填，唔知留空，之後再補）
    fee_usdt: float | None = None
    notes: str | None = None

router = APIRouter(dependencies=[Depends(current_user)])


# ───────── Groups ─────────

@router.get("/groups", response_model=list[AccountGroupOut])
async def list_groups(db: DbSession) -> list[AccountGroup]:
    return list(
        db.execute(select(AccountGroup).order_by(AccountGroup.id)).scalars().all()
    )


@router.post("/groups", response_model=AccountGroupOut, status_code=201)
async def create_group(payload: AccountGroupCreate, db: DbSession) -> AccountGroup:
    group = AccountGroup(**payload.model_dump())
    db.add(group)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(409, f"Group code '{payload.code}' already exists") from e
    db.refresh(group)
    return group


@router.patch("/groups/{group_id}", response_model=AccountGroupOut)
async def update_group(
    group_id: int, payload: AccountGroupUpdate, db: DbSession
) -> AccountGroup:
    group = db.get(AccountGroup, group_id)
    if group is None:
        raise HTTPException(404, "Group not found")
    for field in payload.model_fields_set:
        setattr(group, field, getattr(payload, field))
    db.commit()
    db.refresh(group)
    return group


# ───────── Wallets (per group) ─────────

@router.get("/groups/{group_id}/wallets", response_model=list[WalletOut])
async def list_wallets(group_id: int, db: DbSession) -> list[AccountGroupWallet]:
    if db.get(AccountGroup, group_id) is None:
        raise HTTPException(404, "Group not found")
    return list(
        db.execute(
            select(AccountGroupWallet)
            .where(AccountGroupWallet.group_id == group_id)
            .order_by(AccountGroupWallet.id)
        ).scalars().all()
    )


@router.post("/groups/{group_id}/wallets", response_model=WalletOut, status_code=201)
async def add_wallet(
    group_id: int, payload: WalletCreate, db: DbSession
) -> AccountGroupWallet:
    if db.get(AccountGroup, group_id) is None:
        raise HTTPException(404, "Group not found")
    wallet = AccountGroupWallet(group_id=group_id, **payload.model_dump())
    db.add(wallet)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(409, "Wallet address already exists") from e
    db.refresh(wallet)
    return wallet


@router.patch(
    "/groups/{group_id}/wallets/{wallet_id}", response_model=WalletOut
)
async def update_wallet(
    group_id: int, wallet_id: int, payload: WalletUpdate, db: DbSession
) -> AccountGroupWallet:
    wallet = db.get(AccountGroupWallet, wallet_id)
    if wallet is None or wallet.group_id != group_id:
        raise HTTPException(404, "Wallet not found")
    for field in payload.model_fields_set:
        setattr(wallet, field, getattr(payload, field))
    db.commit()
    db.refresh(wallet)
    return wallet


@router.delete("/groups/{group_id}/wallets/{wallet_id}", status_code=204)
async def delete_wallet(group_id: int, wallet_id: int, db: DbSession) -> None:
    wallet = db.get(AccountGroupWallet, wallet_id)
    if wallet is None or wallet.group_id != group_id:
        raise HTTPException(404, "Wallet not found")
    db.delete(wallet)
    db.commit()


# ───────── Brokers (per group) ─────────

@router.get("/groups/{group_id}/brokers", response_model=list[BrokerOut])
async def list_brokers(group_id: int, db: DbSession) -> list[BrokerAccount]:
    if db.get(AccountGroup, group_id) is None:
        raise HTTPException(404, "Group not found")
    return list(
        db.execute(
            select(BrokerAccount)
            .where(BrokerAccount.group_id == group_id)
            .order_by(BrokerAccount.name)
        ).scalars().all()
    )


@router.post("/groups/{group_id}/brokers", response_model=BrokerOut, status_code=201)
async def create_broker(group_id: int, payload: BrokerCreate, db: DbSession) -> BrokerAccount:
    if db.get(AccountGroup, group_id) is None:
        raise HTTPException(404, "Group not found")
    broker = BrokerAccount(group_id=group_id, **payload.model_dump())
    db.add(broker)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(
            409, f"Broker '{payload.name}' (owner={payload.owner}) already exists in this group",
        ) from e
    db.refresh(broker)
    return broker


@router.patch("/groups/{group_id}/brokers/{broker_id}", response_model=BrokerOut)
async def update_broker(
    group_id: int, broker_id: int, payload: BrokerUpdate, db: DbSession
) -> BrokerAccount:
    broker = db.get(BrokerAccount, broker_id)
    if broker is None or broker.group_id != group_id:
        raise HTTPException(404, "Broker not found")
    for field in payload.model_fields_set:
        setattr(broker, field, getattr(payload, field))
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(409, "Update would conflict with existing (name, owner)") from e
    db.refresh(broker)
    return broker


# ── Broker login credentials (Face ID / passkey step-up gated) ──

@router.get(
    "/groups/{group_id}/brokers/{broker_id}/credentials",
    response_model=BrokerCredentials,
    dependencies=[Depends(require_recent_auth)],
)
async def get_broker_credentials(
    group_id: int, broker_id: int, db: DbSession
) -> BrokerAccount:
    broker = db.get(BrokerAccount, broker_id)
    if broker is None or broker.group_id != group_id:
        raise HTTPException(404, "Broker not found in this group")
    return broker


@router.put(
    "/groups/{group_id}/brokers/{broker_id}/credentials",
    response_model=BrokerCredentials,
    dependencies=[Depends(require_recent_auth)],
)
async def update_broker_credentials(
    group_id: int, broker_id: int, payload: BrokerCredentialsUpdate, db: DbSession
) -> BrokerAccount:
    broker = db.get(BrokerAccount, broker_id)
    if broker is None or broker.group_id != group_id:
        raise HTTPException(404, "Broker not found in this group")
    for field in payload.model_fields_set:
        setattr(broker, field, getattr(payload, field))
    db.commit()
    db.refresh(broker)
    return broker


@router.delete("/groups/{group_id}/brokers/{broker_id}", status_code=204)
async def delete_broker(group_id: int, broker_id: int, db: DbSession) -> None:
    broker = db.get(BrokerAccount, broker_id)
    if broker is None or broker.group_id != group_id:
        raise HTTPException(404, "Broker not found")
    db.delete(broker)
    db.commit()


# ───────── Transactions ─────────

@router.get("/transactions", response_model=list[TransactionOut])
async def list_transactions(
    db: DbSession,
    group_id: int | None = Query(None),
    wallet_id: int | None = Query(None),
    status: str | None = Query(None, description="pending_tag / tagged / ignored / internal_transfer"),
    direction: str | None = Query(None, pattern=r"^(in|out)$"),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    include_internal: bool = Query(False, description="set true to include internal_transfer rows"),
    limit: int = Query(200, le=1000),
    offset: int = Query(0, ge=0),
) -> list[WalletTransaction]:
    stmt = select(WalletTransaction).order_by(desc(WalletTransaction.block_timestamp))
    if group_id is not None:
        stmt = stmt.where(WalletTransaction.group_id == group_id)
    if wallet_id is not None:
        stmt = stmt.where(WalletTransaction.wallet_id == wallet_id)
    if status:
        stmt = stmt.where(WalletTransaction.status == status)
    elif not include_internal:
        # Default: hide internal transfers unless explicitly requested or status filter set
        stmt = stmt.where(WalletTransaction.status != "internal_transfer")
    if direction:
        stmt = stmt.where(WalletTransaction.direction == direction)
    if date_from:
        stmt = stmt.where(WalletTransaction.block_timestamp >= date_from)
    if date_to:
        stmt = stmt.where(WalletTransaction.block_timestamp <= date_to)
    stmt = stmt.limit(limit).offset(offset)
    return list(db.execute(stmt).scalars().all())


@router.post("/transactions/{tx_id}/tag", response_model=TransactionOut)
async def tag_transaction(tx_id: int, payload: TagRequest, db: DbSession) -> WalletTransaction:
    """Manually tag a transaction to a broker; optionally learn the counterparty address."""
    tx = db.get(WalletTransaction, tx_id)
    if tx is None:
        raise HTTPException(404, "Transaction not found")
    broker = db.get(BrokerAccount, payload.broker_account_id)
    if broker is None or broker.group_id != tx.group_id:
        raise HTTPException(400, "Broker not found or belongs to a different group")
    tx.broker_account_id = broker.id
    tx.status = "tagged"
    # 只喺有提供時先改（model_fields_set 區分「冇填」同「明確清空」）
    if "fee_usdt" in payload.model_fields_set:
        tx.fee_usdt = payload.fee_usdt
    if "notes" in payload.model_fields_set:
        tx.notes = payload.notes

    if payload.learn_address:
        existing = db.execute(
            select(AddressBookEntry).where(
                AddressBookEntry.group_id == tx.group_id,
                AddressBookEntry.address == tx.counterparty_address,
            )
        ).scalar_one_or_none()
        if existing is None:
            db.add(
                AddressBookEntry(
                    group_id=tx.group_id,
                    address=tx.counterparty_address,
                    broker_account_id=broker.id,
                    label=broker.name,
                    first_seen_at=tx.block_timestamp,
                    last_seen_at=tx.block_timestamp,
                )
            )
        elif existing.broker_account_id == broker.id:
            existing.last_seen_at = tx.block_timestamp
    db.commit()
    db.refresh(tx)
    return tx


@router.patch("/transactions/{tx_id}", response_model=TransactionOut)
async def update_transaction(
    tx_id: int, payload: TransactionUpdate, db: DbSession
) -> WalletTransaction:
    """事後人手補 / 改手續費 + 備註（唔影響 tag / broker）。"""
    tx = db.get(WalletTransaction, tx_id)
    if tx is None:
        raise HTTPException(404, "Transaction not found")
    if "fee_usdt" in payload.model_fields_set:
        tx.fee_usdt = payload.fee_usdt
    if "notes" in payload.model_fields_set:
        tx.notes = payload.notes
    db.commit()
    db.refresh(tx)
    return tx


# ───────── Monthly balances (private group manual entry) ─────────

def _prev_month(month: str) -> str:
    """'2026-05' → '2026-04'."""
    year, mon = (int(p) for p in month.split("-"))
    return f"{year - 1}-12" if mon == 1 else f"{year}-{mon - 1:02d}"


def _pnl(opening: float, closing: float, deposit: float, withdrawal: float) -> float:
    return closing - opening - deposit + withdrawal


@router.get("/groups/{group_id}/monthly/{month}", response_model=MonthlyView)
async def get_monthly(group_id: int, month: str, db: DbSession) -> MonthlyView:
    """每個 active broker 一行：有 row 用 row，冇就 opening 帶上月 closing。計埋 P/L + totals。"""
    group = db.get(AccountGroup, group_id)
    if group is None:
        raise HTTPException(404, "Group not found")

    brokers = list(
        db.execute(
            select(BrokerAccount)
            .where(BrokerAccount.group_id == group_id, BrokerAccount.is_active.is_(True))
            .order_by(BrokerAccount.owner, BrokerAccount.name)
        ).scalars().all()
    )
    prev = _prev_month(month)
    rows: list[dict] = []
    tot = {"opening": 0.0, "closing": 0.0, "deposit": 0.0, "withdrawal": 0.0, "pnl": 0.0}

    for b in brokers:
        # 出入金永遠由交易自動加總（人手 + 6月起鏈上 tagged）
        withdrawal, deposit = forex_flows.month_flows(db, b.id, month)
        cur = db.execute(
            select(MonthlyBalance).where(
                MonthlyBalance.broker_account_id == b.id, MonthlyBalance.month == month
            )
        ).scalar_one_or_none()
        if cur is not None:
            opening = float(cur.opening_balance)
            closing = float(cur.closing_balance)
            pnl = _pnl(opening, closing, deposit, withdrawal)
            has_data = True
            notes = cur.notes
        else:
            prev_row = db.execute(
                select(MonthlyBalance).where(
                    MonthlyBalance.broker_account_id == b.id, MonthlyBalance.month == prev
                )
            ).scalar_one_or_none()
            opening = float(prev_row.closing_balance) if prev_row else 0.0
            closing = pnl = 0.0
            has_data = False
            notes = None

        rows.append({
            "broker_id": b.id,
            "broker_name": b.name,
            "owner": b.owner,
            "account_number": b.account_number,
            "opening": opening,
            "closing": closing,
            "deposit": deposit,
            "withdrawal": withdrawal,
            "pnl": pnl,
            "has_data": has_data,
            "notes": notes,
        })
        if has_data:
            tot["opening"] += opening
            tot["closing"] += closing
            tot["deposit"] += deposit
            tot["withdrawal"] += withdrawal
            tot["pnl"] += pnl

    # 本月未 tag 鏈上交易（提示去 tag 先計入出入金）
    dt_start, dt_end, _, _ = forex_flows._month_bounds(month)
    untagged = db.execute(
        select(func.count(WalletTransaction.id)).where(
            WalletTransaction.group_id == group_id,
            WalletTransaction.status == "pending_tag",
            WalletTransaction.block_timestamp >= dt_start,
            WalletTransaction.block_timestamp < dt_end,
        )
    ).scalar() or 0

    return MonthlyView(
        group_id=group_id, month=month, rows=rows, totals=tot, untagged_wallet=int(untagged)
    )


@router.put(
    "/groups/{group_id}/monthly/{month}/brokers/{broker_id}",
    response_model=MonthlyView,
)
async def upsert_monthly(
    group_id: int, month: str, broker_id: int, payload: MonthlyBalanceUpsert, db: DbSession
) -> MonthlyView:
    """新增 / 更新一個 broker 嘅月結（只入結餘）。出入金由交易自動加總，P/L 即時計。"""
    broker = db.get(BrokerAccount, broker_id)
    if broker is None or broker.group_id != group_id:
        raise HTTPException(404, "Broker not found in this group")

    withdrawal, deposit = forex_flows.month_flows(db, broker_id, month)
    pnl = _pnl(payload.opening_balance, payload.closing_balance, deposit, withdrawal)
    row = db.execute(
        select(MonthlyBalance).where(
            MonthlyBalance.broker_account_id == broker_id, MonthlyBalance.month == month
        )
    ).scalar_one_or_none()
    if row is None:
        row = MonthlyBalance(broker_account_id=broker_id, month=month)
        db.add(row)
    row.opening_balance = payload.opening_balance
    row.closing_balance = payload.closing_balance
    row.reported_pnl = pnl
    if "notes" in payload.model_fields_set:
        row.notes = payload.notes
    db.commit()
    return await get_monthly(group_id, month, db)


# ───────── Transfers (出入金明細) ─────────

@router.get(
    "/groups/{group_id}/brokers/{broker_id}/transfers", response_model=list[TransferOut]
)
async def list_broker_transfers(
    group_id: int, broker_id: int, month: str, db: DbSession
) -> list[dict]:
    """一個 broker-month 嘅出入金明細（人手 + 鏈上 tagged）。"""
    broker = db.get(BrokerAccount, broker_id)
    if broker is None or broker.group_id != group_id:
        raise HTTPException(404, "Broker not found in this group")
    return forex_flows.list_transfers(db, broker_id, month)


@router.post("/groups/{group_id}/transfers", status_code=201)
async def create_transfer(
    group_id: int, payload: TransferCreate, db: DbSession
) -> dict:
    """人手加一筆出入金（銀行匯款 / 其他）。"""
    broker = db.get(BrokerAccount, payload.broker_account_id)
    if broker is None or broker.group_id != group_id:
        raise HTTPException(400, "Broker not found or belongs to a different group")
    t = ManualTransfer(
        group_id=group_id,
        broker_account_id=payload.broker_account_id,
        flow=payload.flow,
        method=payload.method,
        amount_usdt=payload.amount_usdt,
        transfer_date=payload.transfer_date,
        notes=payload.notes,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return {"id": t.id}


@router.delete("/groups/{group_id}/transfers/{transfer_id}", status_code=204)
async def delete_transfer(group_id: int, transfer_id: int, db: DbSession) -> None:
    """刪一筆人手出入金（鏈上交易喺交易記錄頁管理，唔喺度刪）。"""
    t = db.get(ManualTransfer, transfer_id)
    if t is None or t.group_id != group_id:
        raise HTTPException(404, "Manual transfer not found")
    db.delete(t)
    db.commit()


# ───────── Quarterly settlement (50/50 profit split) ─────────

@router.get("/groups/{group_id}/settlements", response_model=list[SettlementOut])
async def list_settlements(group_id: int, db: DbSession) -> list[QuarterlySettlement]:
    if db.get(AccountGroup, group_id) is None:
        raise HTTPException(404, "Group not found")
    return list(
        db.execute(
            select(QuarterlySettlement)
            .where(QuarterlySettlement.group_id == group_id)
            .order_by(desc(QuarterlySettlement.quarter))
        ).scalars().all()
    )


@router.get(
    "/groups/{group_id}/settlement/{quarter}/preview", response_model=SettlementPreview
)
async def preview_settlement(
    group_id: int,
    quarter: str,
    db: DbSession,
    total_fees: float | None = Query(None, description="override; omit = auto from wallet fees"),
    paid_amount: float = Query(0, ge=0),
) -> dict:
    """Compute (not persist) the settlement numbers. Pre-fills from any saved row."""
    group = db.get(AccountGroup, group_id)
    if group is None:
        raise HTTPException(404, "Group not found")
    try:
        # If a saved settlement exists and caller didn't override, reuse its inputs
        if total_fees is None or paid_amount == 0:
            saved = db.execute(
                select(QuarterlySettlement).where(
                    QuarterlySettlement.group_id == group_id,
                    QuarterlySettlement.quarter == quarter,
                )
            ).scalar_one_or_none()
            if saved is not None:
                if total_fees is None:
                    total_fees = float(saved.total_fees)
                if paid_amount == 0:
                    paid_amount = float(saved.paid_amount)
        return forex_settlement.compute_preview(
            db, group, quarter, total_fees=total_fees, paid_amount=paid_amount
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.post("/groups/{group_id}/settlement/{quarter}", response_model=SettlementOut)
async def save_settlement(
    group_id: int, quarter: str, payload: SettlementSave, db: DbSession
) -> QuarterlySettlement:
    """Snapshot + persist a quarter's settlement (incl. the transfer made to the partner)."""
    group = db.get(AccountGroup, group_id)
    if group is None:
        raise HTTPException(404, "Group not found")
    try:
        p = forex_settlement.compute_preview(
            db, group, quarter,
            total_fees=payload.total_fees, paid_amount=payload.paid_amount,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    row = db.execute(
        select(QuarterlySettlement).where(
            QuarterlySettlement.group_id == group_id,
            QuarterlySettlement.quarter == quarter,
        )
    ).scalar_one_or_none()
    if row is None:
        row = QuarterlySettlement(group_id=group_id, quarter=quarter)
        db.add(row)
    row.gross_pnl = p["gross_pnl"]
    row.total_fees = p["total_fees"]
    row.net_pnl = p["net_pnl"]
    row.carry_in = p["carry_in"]
    row.distributable = p["distributable"]
    row.partner_split_pct = p["partner_split_pct"]
    row.partner_share = p["partner_share"]
    row.paid_amount = payload.paid_amount
    row.carry_out = p["carry_out"]
    row.paid_tx_hash = payload.paid_tx_hash
    row.paid_at = payload.paid_at
    row.notes = payload.notes
    row.status = payload.status
    db.commit()
    db.refresh(row)
    return row


# ───────── Excel Import ─────────

@router.post("/groups/{group_id}/import-monthly-report")
async def import_monthly_report(
    group_id: int,
    db: DbSession,
    file: UploadFile = File(...),
    month: str | None = Query(None, description="YYYY-MM; auto-inferred from xlsx if omitted"),
) -> dict:
    """Upload friend's monthly xlsx → ingests MonthlyBalance + auto-creates brokers."""
    group = db.get(AccountGroup, group_id)
    if group is None:
        raise HTTPException(404, "Group not found")
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "File must be .xlsx or .xlsm")

    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)
    try:
        result = forex_excel_importer.import_monthly_xlsx(db, group, tmp_path, month=month)
    finally:
        tmp_path.unlink(missing_ok=True)
    return {
        "month": result.month,
        "brokers_created": result.brokers_created,
        "monthly_inserted": result.monthly_inserted,
        "monthly_updated": result.monthly_updated,
        "intents_inserted": result.intents_inserted,
        "warnings": result.warnings,
    }


# ───────── Manual wallet sync ─────────

@router.post("/sync-wallets")
async def sync_wallets(
    db: DbSession,
    lookback_days: int = Query(7, ge=1, le=90, description="抓近 N 日嘅鏈上交易"),
) -> dict:
    """手動即刻抓所有 active 錢包嘅最新 TRON 交易（唔使等每日 09:00 自動）。"""
    counts = tron_poller.poll_all_active_wallets(db, lookback_days=lookback_days)
    return {"total_new": sum(counts.values()), "per_wallet": counts}


# ───────── Image import (Phase D) ─────────

@router.post("/groups/{group_id}/import-balances-image")
async def import_balances_image(
    group_id: int, db: DbSession, file: UploadFile = File(...)
) -> dict:
    """上傳月結表截圖 → AI 抽最新結餘 → 對返 broker。回傳俾前端 review，唔直接寫入。"""
    group = db.get(AccountGroup, group_id)
    if group is None:
        raise HTTPException(404, "Group not found")
    media_type = file.content_type or "image/png"
    if not media_type.startswith("image/"):
        raise HTTPException(400, "請上傳圖片")
    data = await file.read()
    try:
        parsed = forex_balance_ocr.extract_balances(data, media_type)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(422, str(e)) from e

    brokers = list(
        db.execute(
            select(BrokerAccount).where(BrokerAccount.group_id == group_id)
        ).scalars().all()
    )
    by_name: dict[str, list[BrokerAccount]] = {}
    for b in brokers:
        by_name.setdefault(b.name.strip().lower(), []).append(b)

    rows: list[dict] = []
    matched = 0
    for p in parsed:
        cands = by_name.get(p["broker"].strip().lower(), [])
        chosen = None
        if len(cands) == 1:
            chosen = cands[0]
        elif len(cands) > 1 and p.get("owner"):
            owner_l = p["owner"].strip().lower()
            chosen = next((c for c in cands if (c.owner or "").lower() == owner_l), cands[0])
        elif cands:
            chosen = cands[0]
        rows.append({
            "broker_id": chosen.id if chosen else None,
            "broker_name": chosen.name if chosen else p["broker"],
            "owner": chosen.owner if chosen else p.get("owner"),
            "closing": p["closing"],
            "matched": chosen is not None,
        })
        if chosen is not None:
            matched += 1

    return {"rows": rows, "matched": matched, "unmatched": len(rows) - matched}


# ───────── Reconciliation ─────────

@router.post("/groups/{group_id}/reconcile/{month}")
async def reconcile_one(group_id: int, month: str, db: DbSession) -> dict:
    """Run reconciliation for one group + one month. Returns the run summary."""
    group = db.get(AccountGroup, group_id)
    if group is None:
        raise HTTPException(404, "Group not found")
    run = forex_reconciliation.run_monthly_reconciliation(db, group, month)
    return {
        "id": run.id,
        "group_code": group.code,
        "month": run.month,
        "total_accounts": run.total_accounts,
        "matched_count": run.matched_count,
        "flagged_count": run.flagged_count,
        "summary": run.summary,
    }


@router.post("/reconcile/{month}")
async def reconcile_all(month: str, db: DbSession) -> list[dict]:
    """Run reconciliation across all active groups for one month."""
    runs = forex_reconciliation.run_all_groups_reconciliation(db, month)
    out: list[dict] = []
    for run in runs:
        group = db.get(AccountGroup, run.group_id)
        out.append({
            "id": run.id,
            "group_code": group.code if group else None,
            "month": run.month,
            "total_accounts": run.total_accounts,
            "matched_count": run.matched_count,
            "flagged_count": run.flagged_count,
        })
    return out


@router.get("/groups/{group_id}/reconciliation/{month}")
async def get_reconciliation(group_id: int, month: str, db: DbSession) -> dict:
    """Latest reconciliation run for a group + month, with full summary."""
    group = db.get(AccountGroup, group_id)
    if group is None:
        raise HTTPException(404, "Group not found")
    run = forex_reconciliation.latest_run_for_group(db, group, month)
    if run is None:
        raise HTTPException(404, "No reconciliation run for this group/month")
    return {
        "id": run.id,
        "group_code": group.code,
        "month": run.month,
        "run_at": run.run_at.isoformat(),
        "total_accounts": run.total_accounts,
        "matched_count": run.matched_count,
        "flagged_count": run.flagged_count,
        "summary": run.summary,
    }


@router.get("/dashboard")
async def dashboard(db: DbSession) -> dict:
    """Cross-group summary: per-group counts, latest reconciliation, pending tags."""
    from sqlalchemy import func as _f

    groups_out: list[dict] = []
    for g in db.execute(select(AccountGroup).order_by(AccountGroup.id)).scalars():
        broker_count = db.execute(
            select(_f.count(BrokerAccount.id)).where(BrokerAccount.group_id == g.id)
        ).scalar()
        pending = db.execute(
            select(_f.count(WalletTransaction.id)).where(
                WalletTransaction.group_id == g.id,
                WalletTransaction.status == "pending_tag",
            )
        ).scalar()
        tagged = db.execute(
            select(_f.count(WalletTransaction.id)).where(
                WalletTransaction.group_id == g.id,
                WalletTransaction.status == "tagged",
            )
        ).scalar()
        internal = db.execute(
            select(_f.count(WalletTransaction.id)).where(
                WalletTransaction.group_id == g.id,
                WalletTransaction.status == "internal_transfer",
            )
        ).scalar()
        latest_run = db.execute(
            select(ReconciliationRun)
            .where(ReconciliationRun.group_id == g.id)
            .order_by(desc(ReconciliationRun.run_at))
            .limit(1)
        ).scalar_one_or_none()
        groups_out.append({
            "id": g.id,
            "code": g.code,
            "name": g.name,
            "brokers": broker_count,
            "pending_tag": pending,
            "tagged": tagged,
            "internal_transfer": internal,
            "latest_reconciliation": (
                {
                    "month": latest_run.month,
                    "run_at": latest_run.run_at.isoformat(),
                    "total": latest_run.total_accounts,
                    "matched": latest_run.matched_count,
                    "flagged": latest_run.flagged_count,
                }
                if latest_run else None
            ),
        })
    return {"groups": groups_out}
