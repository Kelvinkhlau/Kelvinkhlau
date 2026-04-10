"""Expense API schemas。"""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ExpenseBase(BaseModel):
    amount: float = Field(..., gt=0, description="金額（正數）")
    currency: str = Field("HKD", max_length=3)
    category: str = Field(..., min_length=1, max_length=50)
    description: str | None = None
    merchant: str | None = Field(None, max_length=200)
    payment_method: str | None = Field(None, max_length=50)
    spent_at: date = Field(..., description="消費日期")


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    amount: float | None = Field(None, gt=0)
    currency: str | None = Field(None, max_length=3)
    category: str | None = Field(None, min_length=1, max_length=50)
    description: str | None = None
    merchant: str | None = None
    payment_method: str | None = None
    spent_at: date | None = None


class ExpenseOut(ExpenseBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class ExpenseStats(BaseModel):
    """月度 / 期間消費統計。"""

    total: float
    count: int
    by_category: dict[str, float]
