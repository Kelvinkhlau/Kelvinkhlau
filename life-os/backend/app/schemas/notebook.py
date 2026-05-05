"""Notebook API schemas。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ─── Notebook ───────────────────────────────────────────────────────────────


class NotebookBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    cover_color: str = Field("#4f46e5", max_length=20)
    icon: str | None = Field(None, max_length=10)
    default_template: str = Field("blank", max_length=20)
    tags: str = ""


class NotebookCreate(NotebookBase):
    pass


class NotebookUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    cover_color: str | None = Field(None, max_length=20)
    icon: str | None = Field(None, max_length=10)
    default_template: str | None = Field(None, max_length=20)
    tags: str | None = None
    pinned: bool | None = None
    archived: bool | None = None
    sort_order: int | None = None


class NotebookOut(NotebookBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pinned: bool
    archived: bool
    sort_order: int
    has_cover_image: bool = False
    created_at: datetime
    updated_at: datetime
    page_count: int = 0


# ─── NotebookPage ───────────────────────────────────────────────────────────


class NotebookPageBase(BaseModel):
    title: str | None = Field(None, max_length=200)
    canvas_json: str = ""
    text_content: str = ""
    tags: str = ""
    template: str = Field("blank", max_length=20)


class NotebookPageCreate(BaseModel):
    """建一頁；page_number 可選（唔 pass 就 append 到最後）。"""

    title: str | None = Field(None, max_length=200)
    canvas_json: str = ""
    text_content: str = ""
    tags: str = ""
    template: str = Field("blank", max_length=20)
    page_number: int | None = None


class NotebookPageUpdate(BaseModel):
    title: str | None = Field(None, max_length=200)
    canvas_json: str | None = None
    text_content: str | None = None
    thumbnail: str | None = None
    tags: str | None = None
    template: str | None = Field(None, max_length=20)
    page_number: int | None = None


class NotebookPageSummary(BaseModel):
    """List view — 唔 return canvas_json 慳 bandwidth。"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    notebook_id: int
    page_number: int
    title: str | None
    thumbnail: str | None
    tags: str
    template: str
    updated_at: datetime


class NotebookPageOut(NotebookPageBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    notebook_id: int
    page_number: int
    thumbnail: str | None = None
    created_at: datetime
    updated_at: datetime


class NotebookPageReorderItem(BaseModel):
    id: int
    page_number: int


class NotebookPageReorderPayload(BaseModel):
    pages: list[NotebookPageReorderItem]
