"""Forex API routes — Phase 1: groups / wallets / brokers / transactions (read).

Tagging, deposit-intents, reconciliation, dashboard endpoints arrive in later phases.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError

from pydantic import BaseModel

from app.deps import DbSession, current_user
from app.models.forex import (
    AccountGroup,
    AccountGroupWallet,
    AddressBookEntry,
    BrokerAccount,
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
    status: str | None = Query(None, description="pending_tag / tagged / ignored"),
    direction: str | None = Query(None, pattern=r"^(in|out)$"),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
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
