"""Project API schemas。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    status: str = "active"  # active / paused / done / archived
    color: str | None = Field(None, max_length=20)


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    status: str | None = None
    color: str | None = Field(None, max_length=20)


class ProjectOut(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    todo_count: int = 0
    done_count: int = 0
    created_at: datetime
    updated_at: datetime
