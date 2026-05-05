"""Loan API schemas。"""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class LoanCreate(BaseModel):
    direction: Literal["lent", "borrowed"]
    counterparty: str = Field(..., min_length=1, max_length=200)
    amount: float = Field(..., gt=0)
    currency: str = Field("HKD", max_length=3)
    started_at: date
    due_at: date | None = None
    description: str | None = None


class LoanUpdate(BaseModel):
    counterparty: str | None = Field(None, min_length=1, max_length=200)
    amount: float | None = Field(None, gt=0)
    currency: str | None = None
    started_at: date | None = None
    due_at: date | None = None
    settled_at: date | None = None
    status: Literal["active", "settled", "overdue"] | None = None
    description: str | None = None


class LoanRepaymentCreate(BaseModel):
    amount: float = Field(..., gt=0)
    paid_at: date
    note: str | None = None


class LoanRepaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    loan_id: int
    amount: float
    paid_at: date
    note: str | None
    created_at: datetime


class LoanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    direction: str
    counterparty: str
    amount: float
    currency: str
    repaid_amount: float
    started_at: date
    due_at: date | None
    settled_at: date | None
    status: str
    description: str | None
    created_at: datetime
    updated_at: datetime


class LoanDetail(LoanOut):
    repayments: list[LoanRepaymentOut] = []
    outstanding: float = 0.0
