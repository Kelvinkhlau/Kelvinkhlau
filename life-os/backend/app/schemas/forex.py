"""Forex API schemas (Phase 1: groups / wallets / brokers / transactions read)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# ───────── AccountGroup ─────────

class AccountGroupBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=1, max_length=50, pattern=r"^[a-z0-9_-]+$")
    owner_name: str | None = Field(None, max_length=100)
    notes: str | None = None
    is_active: bool = True


class AccountGroupCreate(AccountGroupBase):
    pass


class AccountGroupUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    owner_name: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class AccountGroupOut(AccountGroupBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


# ───────── AccountGroupWallet ─────────

class WalletBase(BaseModel):
    address: str = Field(..., min_length=26, max_length=64)
    label: str = Field(..., min_length=1, max_length=100)
    is_active: bool = True


class WalletCreate(WalletBase):
    pass


class WalletUpdate(BaseModel):
    label: str | None = Field(None, min_length=1, max_length=100)
    is_active: bool | None = None


class WalletOut(WalletBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    group_id: int
    created_at: datetime


# ───────── BrokerAccount ─────────

class BrokerBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    owner: str | None = Field(None, max_length=100)
    email: str | None = Field(None, max_length=200)
    account_number: str | None = Field(None, max_length=100)
    notes: str | None = None
    is_active: bool = True


class BrokerCreate(BrokerBase):
    pass


class BrokerUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    owner: str | None = None
    email: str | None = None
    account_number: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class BrokerOut(BrokerBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    group_id: int


# ───────── WalletTransaction ─────────

class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    group_id: int
    wallet_id: int
    tx_hash: str
    block_timestamp: datetime
    direction: str
    amount_usdt: float
    counterparty_address: str
    broker_account_id: int | None
    status: str
    created_at: datetime
