"""Idea API schemas。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class IdeaBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    content: str | None = None
    tags: str = ""  # comma-separated: "python,idea,later"
    project_id: int | None = None


class IdeaCreate(IdeaBase):
    pass


class IdeaUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    content: str | None = None
    tags: str | None = None
    project_id: int | None = None
    pinned: bool | None = None
    archived: bool | None = None


class IdeaOut(IdeaBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pinned: bool
    archived: bool
    created_at: datetime
    updated_at: datetime
