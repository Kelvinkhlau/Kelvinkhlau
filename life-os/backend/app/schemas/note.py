"""Note API schemas。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class NoteBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    content: str = ""
    folder: str = Field("", max_length=100)
    tags: str = ""


class NoteCreate(NoteBase):
    pass


class NoteUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    content: str | None = None
    folder: str | None = Field(None, max_length=100)
    tags: str | None = None
    pinned: bool | None = None
    archived: bool | None = None


class NoteOut(NoteBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pinned: bool
    archived: bool
    created_at: datetime
    updated_at: datetime
