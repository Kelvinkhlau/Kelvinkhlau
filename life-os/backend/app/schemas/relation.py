"""Relation API schemas — polymorphic cross-module links。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RelationBase(BaseModel):
    source_type: str = Field(..., min_length=1, max_length=32)
    source_id: int = Field(..., gt=0)
    target_type: str = Field(..., min_length=1, max_length=32)
    target_id: int = Field(..., gt=0)
    kind: str = Field("related", min_length=1, max_length=32)
    note: str | None = None


class RelationCreate(RelationBase):
    pass


class RelationOut(RelationBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class RelatedEntity(BaseModel):
    """展開咗嘅對方 entity — 用嚟喺 UI 顯示 link。"""

    type: str
    id: int
    title: str
    subtitle: str | None = None
    href: str


class RelatedLink(BaseModel):
    """一條 relation + 對方 entity 摘要。"""

    relation_id: int
    kind: str
    note: str | None
    entity: RelatedEntity
    created_at: datetime
