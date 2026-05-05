"""Stock Holding API schemas。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class StockHoldingCreate(BaseModel):
    account_id: int
    symbol: str = Field(..., min_length=1, max_length=20)
    name: str | None = Field(None, max_length=120)
    quantity: float = Field(0, ge=0)
    avg_cost: float | None = Field(None, ge=0)
    currency: str = Field("HKD", min_length=3, max_length=3)


class StockHoldingUpdate(BaseModel):
    symbol: str | None = Field(None, min_length=1, max_length=20)
    name: str | None = Field(None, max_length=120)
    quantity: float | None = Field(None, ge=0)
    avg_cost: float | None = Field(None, ge=0)
    currency: str | None = Field(None, min_length=3, max_length=3)


class StockHoldingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    account_id: int
    symbol: str
    name: str | None
    quantity: float
    avg_cost: float | None
    currency: str
    last_price: float | None
    last_price_at: datetime | None
    created_at: datetime
    updated_at: datetime


class StockRefreshResult(BaseModel):
    refreshed: int
    failed: list[str]
    accounts_updated: list[int]
