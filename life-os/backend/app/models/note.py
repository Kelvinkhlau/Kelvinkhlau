"""Note model — 知識管理，儲存筆記 / 文章 / snippets。"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Note(Base):
    """一篇筆記 / 知識條目。"""

    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # "markdown" (legacy plain text/markdown) or "blocks" (TipTap ProseMirror JSON)
    content_format: Mapped[str] = mapped_column(
        String(20), nullable=False, default="markdown", server_default="markdown"
    )
    folder: Mapped[str] = mapped_column(
        String(100), nullable=False, default="", index=True
    )
    tags: Mapped[str] = mapped_column(Text, nullable=False, default="")
    pinned: Mapped[bool] = mapped_column(default=False, nullable=False)
    archived: Mapped[bool] = mapped_column(default=False, nullable=False, index=True)

    # ─── E2E Encryption（可選，per-note） ─────────────────────────────────
    # 加密係 client-side：用 master password 經 PBKDF2 derive key，
    # 再 AES-GCM encrypt `{title, content, tags}` JSON。
    # Server 永遠見唔到明文。
    is_encrypted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    # base64-encoded cipher text (encrypted JSON payload)
    encrypted_payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    # base64-encoded per-save random IV (12 bytes for AES-GCM)
    encryption_iv: Mapped[str | None] = mapped_column(String(32), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    attachments: Mapped[list["NoteAttachment"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "NoteAttachment",
        back_populates="note",
        cascade="all, delete-orphan",
        order_by="NoteAttachment.id",
    )
