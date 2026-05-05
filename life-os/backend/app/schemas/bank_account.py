"""Bank Account API schemas。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class BankAccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    bank: str = Field(..., min_length=1, max_length=100)
    account_type: str = Field("savings", max_length=50)
    currency: str = Field("HKD", max_length=3)
    balance: float = 0
    icon: str | None = Field(None, max_length=10)
    color: str | None = Field(None, max_length=20)
    last4: str | None = Field(None, max_length=4)
    is_active: bool = True
    sort_order: int = 0
    note: str | None = None
    parent_account_id: int | None = None
    statement_day: int | None = Field(None, ge=1, le=31)
    due_day: int | None = Field(None, ge=1, le=31)
    credit_limit: float | None = None


class BankAccountUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    bank: str | None = None
    account_type: str | None = None
    currency: str | None = None
    balance: float | None = None
    icon: str | None = None
    color: str | None = None
    last4: str | None = Field(None, max_length=4)
    is_active: bool | None = None
    sort_order: int | None = None
    note: str | None = None
    parent_account_id: int | None = None
    statement_day: int | None = Field(None, ge=1, le=31)
    due_day: int | None = Field(None, ge=1, le=31)
    credit_limit: float | None = None


class CashBalanceItem(BaseModel):
    """單一幣種現金結餘。"""
    currency: str
    amount: float


class HoldingBreakdownItem(BaseModel):
    """單一幣種持倉市值小計。"""
    currency: str
    market_value: float


class BankAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    bank: str
    account_type: str
    currency: str
    balance: float
    icon: str | None
    color: str | None
    last4: str | None = None
    is_active: bool
    sort_order: int
    note: str | None
    parent_account_id: int | None = None
    statement_day: int | None = None
    due_day: int | None = None
    credit_limit: float | None = None
    created_at: datetime
    updated_at: datetime

    # 證券戶口先有：多幣種現金 + 持倉按幣分組
    cash_balances: list[CashBalanceItem] = []
    holdings_by_currency: list[HoldingBreakdownItem] = []


class CashBalanceUpsert(BaseModel):
    """加 / 改一個幣種嘅現金結餘。"""
    currency: str = Field(..., min_length=3, max_length=3)
    amount: float


class BankPreset(BaseModel):
    """預設銀行/支付方式 — 方便用戶快速新增。"""
    name: str
    bank: str
    account_type: str
    icon: str
    color: str
