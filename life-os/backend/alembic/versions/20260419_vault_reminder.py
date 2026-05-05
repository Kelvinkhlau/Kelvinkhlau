"""Vault — add title + reminder_days_before + external share links。

Revision ID: 20260419_vault_reminder
Revises: 20260419_vault
Create Date: 2026-04-19 22:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260419_vault_reminder"
down_revision: str | None = "20260419_vault"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("vault_files") as batch:
        batch.add_column(sa.Column("title", sa.String(300), nullable=True))
        batch.add_column(
            sa.Column("reminder_days_before", sa.Integer(), nullable=True)
        )

    op.create_table(
        "vault_shares",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("file_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token", sa.String(64), nullable=False),
        sa.Column("label", sa.String(200), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("max_downloads", sa.Integer(), nullable=True),
        sa.Column(
            "download_count", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "allow_download", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["file_id"], ["vault_files.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index("ix_vault_shares_token", "vault_shares", ["token"])
    op.create_index("ix_vault_shares_file_id", "vault_shares", ["file_id"])
    op.create_index("ix_vault_shares_user_id", "vault_shares", ["user_id"])
    op.create_index(
        "ix_vault_shares_expires_at", "vault_shares", ["expires_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_vault_shares_expires_at", "vault_shares")
    op.drop_index("ix_vault_shares_user_id", "vault_shares")
    op.drop_index("ix_vault_shares_file_id", "vault_shares")
    op.drop_index("ix_vault_shares_token", "vault_shares")
    op.drop_table("vault_shares")
    with op.batch_alter_table("vault_files") as batch:
        batch.drop_column("reminder_days_before")
        batch.drop_column("title")
