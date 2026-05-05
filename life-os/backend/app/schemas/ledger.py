"""Ledger API schemas。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LedgerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    icon: str | None = None
    color: str | None = None
    is_default: bool = False
    sort_order: int = 0
    note: str | None = None


class LedgerUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    icon: str | None = None
    color: str | None = None
    is_default: bool | None = None
    is_active: bool | None = None
    sort_order: int | None = None
    note: str | None = None


class LedgerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    icon: str | None
    color: str | None
    is_default: bool
    is_active: bool
    sort_order: int
    note: str | None
    created_at: datetime
    updated_at: datetime
