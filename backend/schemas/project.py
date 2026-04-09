"""Pydantic schemas for Project endpoints."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    color_tag: Optional[str] = Field(None, max_length=32)
    status: str = Field("ongoing", max_length=32)


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    color_tag: Optional[str] = None
    status: str
    progress: float
    created_at: datetime
    updated_at: datetime
