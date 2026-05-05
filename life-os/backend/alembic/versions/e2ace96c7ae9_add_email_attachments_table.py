"""add email_attachments table

Revision ID: e2ace96c7ae9
Revises: 7bdc2c5209d5
Create Date: 2026-04-24 17:41:45.580591

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e2ace96c7ae9'
down_revision: str | None = '7bdc2c5209d5'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "email_attachments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("email_id", sa.Integer(), nullable=False),
        sa.Column("gmail_attachment_id", sa.String(length=500), nullable=False),
        sa.Column("filename", sa.String(length=500), nullable=False, server_default=""),
        sa.Column(
            "mime_type",
            sa.String(length=200),
            nullable=False,
            server_default="application/octet-stream",
        ),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("local_path", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["email_id"], ["emails.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_email_attachments_email_id", "email_attachments", ["email_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_email_attachments_email_id", table_name="email_attachments")
    op.drop_table("email_attachments")
