"""Budget API schemas。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class BudgetCreate(BaseModel):
    category: str = Field(..., min_length=1, max_length=50)
    amount: float = Field(..., gt=0)
    currency: str = Field("HKD", max_length=3)


class BudgetUpdate(BaseModel):
    category: str | None = Field(None, min_length=1, max_length=50)
    amount: float | None = Field(None, gt=0)


class BudgetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category: str
    amount: float
    currency: str
    created_at: datetime
    updated_at: datetime


class BudgetWithSpent(BudgetOut):
    """預算 + 當月已花金額。"""
    spent: float = 0.0
    remaining: float = 0.0
    percentage: float = 0.0
