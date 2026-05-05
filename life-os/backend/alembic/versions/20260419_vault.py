"""Vault module — 個人資料庫 (categories / files / tags).

Revision ID: 20260419_vault
Revises: 20260419_p3
Create Date: 2026-04-19 20:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260419_vault"
down_revision: str | None = "20260419_p3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # vault_categories
    op.create_table(
        "vault_categories",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("icon", sa.String(20), nullable=False, server_default="📁"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_vault_category_user_name"),
    )
    op.create_index(
        "ix_vault_categories_user_id", "vault_categories", ["user_id"]
    )

    # vault_tags
    op.create_table(
        "vault_tags",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("color", sa.String(20), nullable=False, server_default="#6b7280"),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_vault_tag_user_name"),
    )
    op.create_index("ix_vault_tags_user_id", "vault_tags", ["user_id"])

    # vault_files
    op.create_table(
        "vault_files",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("original_filename", sa.String(500), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False, server_default=""),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sha256", sa.String(64), nullable=False, server_default=""),
        sa.Column("storage_path", sa.String(500), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column(
            "uploaded_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"]
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["vault_categories.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_vault_files_user_id", "vault_files", ["user_id"])
    op.create_index("ix_vault_files_category_id", "vault_files", ["category_id"])
    op.create_index("ix_vault_files_expiry_date", "vault_files", ["expiry_date"])
    op.create_index("ix_vault_files_deleted_at", "vault_files", ["deleted_at"])

    # vault_file_tags
    op.create_table(
        "vault_file_tags",
        sa.Column("file_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["file_id"], ["vault_files.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"], ["vault_tags.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("file_id", "tag_id"),
    )


def downgrade() -> None:
    op.drop_table("vault_file_tags")
    op.drop_index("ix_vault_files_deleted_at", "vault_files")
    op.drop_index("ix_vault_files_expiry_date", "vault_files")
    op.drop_index("ix_vault_files_category_id", "vault_files")
    op.drop_index("ix_vault_files_user_id", "vault_files")
    op.drop_table("vault_files")
    op.drop_index("ix_vault_tags_user_id", "vault_tags")
    op.drop_table("vault_tags")
    op.drop_index("ix_vault_categories_user_id", "vault_categories")
    op.drop_table("vault_categories")
