"""Family member / expense split schemas。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FamilyMemberCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    relation: str | None = None
    color: str | None = None


class FamilyMemberUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    relation: str | None = None
    color: str | None = None
    is_active: bool | None = None


class FamilyMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    relation: str | None
    color: str | None
    is_active: bool
    created_at: datetime


class ExpenseSplitIn(BaseModel):
    """建立分帳用：member_id=None 代表 user 自己。"""
    member_id: int | None = None
    amount: float = Field(..., gt=0)
    is_paid: bool = False


class ExpenseSplitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    expense_id: int
    member_id: int | None
    amount: float
    is_paid: bool
    created_at: datetime
