"""Todo API schemas。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TodoBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    priority: str = "medium"  # low / medium / high
    due_at: datetime | None = None
    project_id: int | None = None


class TodoCreate(TodoBase):
    pass


class TodoUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    description: str | None = None
    priority: str | None = None
    due_at: datetime | None = None
    done: bool | None = None
    project_id: int | None = None


class TodoOut(TodoBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    done: bool
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
