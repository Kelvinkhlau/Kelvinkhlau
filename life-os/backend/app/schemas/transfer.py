"""Transfer API schemas。"""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class TransferCreate(BaseModel):
    from_account_id: int = Field(..., gt=0)
    to_account_id: int = Field(..., gt=0)
    amount: float = Field(..., gt=0)
    currency: str = Field("HKD", min_length=3, max_length=3)
    note: str | None = None
    transferred_at: date


class TransferOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    from_account_id: int
    to_account_id: int
    amount: float
    currency: str
    note: str | None
    transferred_at: date
    # Denormalized 戶口名 / icon / type — 方便前端直接顯示，唔使再 fetch
    from_account_name: str | None = None
    from_account_icon: str | None = None
    from_account_type: str | None = None
    to_account_name: str | None = None
    to_account_icon: str | None = None
    to_account_type: str | None = None
    created_at: datetime
