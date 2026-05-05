"""Expense API schemas。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ExpenseBase(BaseModel):
    txn_type: str = Field("expense", description="expense 或 income")
    amount: float = Field(..., gt=0, description="金額（正數）")
    currency: str = Field("HKD", max_length=3)
    category: str = Field(..., min_length=1, max_length=50)
    subcategory: str | None = Field(None, max_length=50)
    description: str | None = None
    merchant: str | None = Field(None, max_length=200)
    payment_method: str | None = Field(None, max_length=50)
    payment_account_id: int | None = Field(None, description="付款賬戶 ID")
    ledger_id: int | None = Field(None, description="帳本 ID（可選）")
    spent_at: datetime = Field(..., description="消費日期時間")


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    txn_type: str | None = Field(None)
    amount: float | None = Field(None, gt=0)
    currency: str | None = Field(None, max_length=3)
    category: str | None = Field(None, min_length=1, max_length=50)
    subcategory: str | None = Field(None, max_length=50)
    description: str | None = None
    merchant: str | None = None
    payment_method: str | None = None
    payment_account_id: int | None = None
    ledger_id: int | None = None
    spent_at: datetime | None = None


class ExpenseOut(ExpenseBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    txn_type: str
    source: str | None = None
    source_email_id: int | None = None
    payment_account_id: int | None = None
    ledger_id: int | None = None
    subscription_id: int | None = None
    created_at: datetime
    updated_at: datetime


class BudgetWarning(BaseModel):
    category: str
    budget: float
    spent: float
    percentage: float


class ExpenseCreateResponse(ExpenseOut):
    """新增消費嘅 response — 包括預算警告。"""
    budget_warning: BudgetWarning | None = None


class ExpenseStats(BaseModel):
    """月度 / 期間消費統計。"""

    total: float
    count: int
    by_category: dict[str, float]
