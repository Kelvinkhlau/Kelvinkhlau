"""VIP sender schemas。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class VipCreate(BaseModel):
    email: EmailStr
    name: str = Field("", max_length=200)
    note: str | None = None


class VipUpdate(BaseModel):
    name: str | None = Field(None, max_length=200)
    note: str | None = None


class VipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    note: str | None
    created_at: datetime
