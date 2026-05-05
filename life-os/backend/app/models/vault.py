"""Vault models — 個人資料庫：categories / files / tags。

檔案儲存喺 `<data_dir>/vault/<user_id>/<yyyy>/<mm>/<uuid>.<ext>`，
DB 只記 metadata + 相對 path。

設計：
- category 係 dynamic table（唔 hardcode），預設 seed 10 個
- tag 係 many-to-many via vault_file_tags
- 軟刪除（deleted_at）— 30 日後 cron 永久清除
- access count 由 AuditLog derive，唔喺 vault_files 度 update
"""

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class VaultCategory(Base):
    __tablename__ = "vault_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    icon: Mapped[str] = mapped_column(String(20), nullable=False, default="📁")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_vault_category_user_name"),
    )


class VaultTag(Base):
    __tablename__ = "vault_tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#6b7280")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_vault_tag_user_name"),
    )


class VaultFile(Base):
    __tablename__ = "vault_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("vault_categories.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    # 主題 / 人性化標題 — 例：「Lau Kelvin Kai Hang 香港身份證」；
    # null = 未設，UI 會 fallback 去 filename。
    title: Mapped[str | None] = mapped_column(String(300), nullable=True)
    # 用戶俾嘅 display name（可 rename）
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    # Upload 時原本嘅檔名（unchanged）
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    # Relative path under data_dir, e.g. "vault/2/2026/04/abc.pdf"
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)

    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    # 到期前幾多日通知；null = 用 global default (7/1/0 日) — 只會喺有 expiry_date 嘅時候 meaningful
    reminder_days_before: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )

    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    # 軟刪除：deleted_at 非 null = 喺 trash 入面
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, index=True
    )

    category: Mapped["VaultCategory | None"] = relationship(
        "VaultCategory", lazy="joined"
    )
    tags: Mapped[list["VaultTag"]] = relationship(
        "VaultTag",
        secondary="vault_file_tags",
        lazy="joined",
    )


class VaultFileTag(Base):
    __tablename__ = "vault_file_tags"

    file_id: Mapped[int] = mapped_column(
        ForeignKey("vault_files.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[int] = mapped_column(
        ForeignKey("vault_tags.id", ondelete="CASCADE"), primary_key=True
    )


class VaultShare(Base):
    """外部分享 link — 以 random token 做 public URL，可設定過期 / 次數限制。

    建立時自動 log audit；public download 時亦 log（帶 IP / UA）。
    """

    __tablename__ = "vault_shares"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    file_id: Mapped[int] = mapped_column(
        ForeignKey("vault_files.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )
    # URL-safe random token（喺 handler 自己 gen）
    token: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    # 可選：UI 俾用戶填嘅 memo，例：「畀律師」
    label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, index=True
    )
    max_downloads: Mapped[int | None] = mapped_column(Integer, nullable=True)
    download_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    allow_download: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    file: Mapped["VaultFile"] = relationship("VaultFile", lazy="joined")


__all__ = [
    "VaultCategory",
    "VaultTag",
    "VaultFile",
    "VaultFileTag",
    "VaultShare",
]
