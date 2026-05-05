"""Subscription API schemas。"""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class SubscriptionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    amount: float = Field(..., gt=0)
    currency: str = Field("HKD", max_length=3)
    cycle: str = Field("monthly", pattern=r"^(monthly|yearly|weekly)$")
    category: str = Field("subscriptions", max_length=50)
    next_billing: date
    note: str | None = None
    auto_create_expense: bool = False
    payment_account_id: int | None = None
    merchant: str | None = None


class SubscriptionUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    amount: float | None = Field(None, gt=0)
    currency: str | None = Field(None, max_length=3)
    cycle: str | None = Field(None, pattern=r"^(monthly|yearly|weekly)$")
    category: str | None = None
    next_billing: date | None = None
    note: str | None = None
    active: bool | None = None
    auto_create_expense: bool | None = None
    payment_account_id: int | None = None
    merchant: str | None = None


class SubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    amount: float
    currency: str
    cycle: str
    category: str
    next_billing: date
    note: str | None
    active: bool
    auto_create_expense: bool
    payment_account_id: int | None
    merchant: str | None
    last_generated_at: date | None
    created_at: datetime
    updated_at: datetime
