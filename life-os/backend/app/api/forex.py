"""Forex API routes — groups / wallets / brokers / transactions / reconciliation."""

from __future__ import annotations

import shutil
import tempfile
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError

from pydantic import BaseModel

from app.deps import DbSession, current_user
from app.models.forex import (
    AccountGroup,
    AccountGroupWallet,
    AddressBookEntry,
    BrokerAccount,
    ReconciliationRun,
    WalletTransaction,
)
from app.schemas.forex import (
    AccountGroupCreate,
    AccountGroupOut,
    AccountGroupUpdate,
    BrokerOut,
    TransactionOut,
    WalletCreate,
    WalletOut,
    WalletUpdate,
)
from app.services import forex_excel_importer, forex_reconciliation


class TagRequest(BaseModel):
    broker_account_id: int
    learn_address: bool = True

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
