"""Notebook model — GoodNotes 風格嘅記事簿 + 頁面。

- Notebook：一本記事簿（有 cover、icon、多頁）
- NotebookPage：單一頁（tldraw canvas JSON + optional text）

設計重點：
- canvas_json 儲 tldraw store snapshot（畫圖 + 手寫 + 文字）
- text_content 為 OCR / 純文字內容，方便 FTS5 搜尋
- thumbnail 儲 base64 PNG，list view 即用
- tags 儲 comma-separated string，同 Note 一致
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Notebook(Base):
    """一本記事簿。"""

    __tablename__ = "notebooks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_color: Mapped[str] = mapped_column(
        String(20), nullable=False, default="#4f46e5", server_default="#4f46e5"
    )
    icon: Mapped[str | None] = mapped_column(String(10), nullable=True)  # emoji
    # 相片封面（相對 data_dir 嘅 path，例如 "notebook_covers/2/<uuid>.jpg"）
    cover_image_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    default_template: Mapped[str] = mapped_column(
        String(20), nullable=False, default="blank", server_default="blank"
    )  # blank | ruled | grid | dot

    tags: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    pinned: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0", index=True
    )
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    pages: Mapped[list["NotebookPage"]] = relationship(
        "NotebookPage",
        back_populates="notebook",
        cascade="all, delete-orphan",
        order_by="NotebookPage.page_number",
    )


class NotebookPage(Base):
    """一頁。"""

    __tablename__ = "notebook_pages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    notebook_id: Mapped[int] = mapped_column(
        ForeignKey("notebooks.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    page_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # tldraw store snapshot (JSON serialised)
    canvas_json: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    # OCR / 純文字內容（做 FTS5 + 快速 preview）
    text_content: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    # 縮圖（base64 PNG data URL），唔長期存可 NULL
    thumbnail: Mapped[str | None] = mapped_column(Text, nullable=True)

    tags: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    template: Mapped[str] = mapped_column(
        String(20), nullable=False, default="blank", server_default="blank"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    notebook: Mapped["Notebook"] = relationship("Notebook", back_populates="pages")
