"""MutedSender API schemas。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MutedOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    reason: str | None
    created_at: datetime


class MutedCreate(BaseModel):
    email: str
    name: str = ""
    reason: str | None = None


class MutedUpdate(BaseModel):
    name: str | None = None
    reason: str | None = None
