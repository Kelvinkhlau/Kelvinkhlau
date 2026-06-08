"""Forex API schemas (Phase 1: groups / wallets / brokers / transactions read)."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

# ───────── AccountGroup ─────────

class AccountGroupBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=1, max_length=50, pattern=r"^[a-z0-9_-]+$")
    owner_name: str | None = Field(None, max_length=100)
    partner_name: str | None = Field(None, max_length=100)
    partner_split_pct: float | None = Field(None, ge=0, le=100)
    notes: str | None = None
    is_active: bool = True


class AccountGroupCreate(AccountGroupBase):
    pass


class AccountGroupUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    owner_name: str | None = None
    partner_name: str | None = None
    partner_split_pct: float | None = Field(None, ge=0, le=100)
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


# ───────── Broker credentials (step-up gated) ─────────

class BrokerCredentials(BaseModel):
    """敏感登入資料 — 只經 Face ID / passkey 重驗後讀寫。"""
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    owner: str | None = None
    login_url: str | None = None
    email: str | None = None
    account_number: str | None = None
    password: str | None = None
    twofa: str | None = None
    is_active: bool = True


class BrokerCredentialsUpdate(BaseModel):
    login_url: str | None = None
    email: str | None = None
    account_number: str | None = None
    password: str | None = None
    twofa: str | None = None
    is_active: bool | None = None


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
    fee_usdt: float | None = None
    notes: str | None = None
    counterparty_address: str
    broker_account_id: int | None
    status: str
    created_at: datetime


class TransactionUpdate(BaseModel):
    """事後人手補手續費 / 備註。"""
    fee_usdt: float | None = None
    notes: str | None = None


# ───────── MonthlyBalance (private group manual entry) ─────────

class MonthlyBalanceUpsert(BaseModel):
    """私人組逐 broker 手動入月結（只入結餘；出入金由交易自動加總）。"""
    opening_balance: float
    closing_balance: float
    notes: str | None = None


class MonthlyRow(BaseModel):
    broker_id: int
    broker_name: str
    owner: str | None = None
    account_number: str | None = None
    opening: float
    closing: float
    deposit: float
    withdrawal: float
    pnl: float
    has_data: bool
    notes: str | None = None


class MonthlyTotals(BaseModel):
    opening: float
    closing: float
    deposit: float
    withdrawal: float
    pnl: float


class MonthlyView(BaseModel):
    group_id: int
    month: str
    rows: list[MonthlyRow]
    totals: MonthlyTotals
    untagged_wallet: int = 0  # 本月未 tag 鏈上交易數（提示去 tag）
    locked: bool = False  # 該月有冇鎖定（防誤改）


# ───────── Transfers (出入金明細) ─────────

class TransferCreate(BaseModel):
    broker_account_id: int
    flow: str = Field(..., pattern=r"^(withdrawal|deposit)$")
    method: str = Field("bank", max_length=30)
    amount_usdt: float = Field(..., gt=0)
    transfer_date: date
    notes: str | None = None


class TransferOut(BaseModel):
    id: int
    source: str  # "manual" / "wallet"
    flow: str
    method: str
    amount: float
    date: str
    notes: str | None = None


# ───────── QuarterlySettlement (50/50 profit split) ─────────

class SettlementPreview(BaseModel):
    group_id: int
    quarter: str
    months: list[str]
    partner_name: str | None = None
    partner_split_pct: float
    gross_pnl: float
    total_fees: float
    fees_auto: bool
    net_pnl: float
    carry_in: float
    distributable: float
    partner_share: float
    paid_amount: float
    carry_out: float


class SettlementSave(BaseModel):
    """確認結算：total_fees 留空 = 自動由 wallet tx sum。"""
    total_fees: float | None = None
    paid_amount: float = Field(0, ge=0)
    paid_tx_hash: str | None = Field(None, max_length=80)
    paid_at: datetime | None = None
    notes: str | None = None
    status: str = Field("settled", pattern=r"^(draft|settled)$")


class SettlementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    group_id: int
    quarter: str
    gross_pnl: float
    total_fees: float
    net_pnl: float
    carry_in: float
    distributable: float
    partner_split_pct: float
    partner_share: float
    paid_amount: float
    paid_tx_hash: str | None
    paid_at: datetime | None
    carry_out: float
    status: str
    notes: str | None
    updated_at: datetime
