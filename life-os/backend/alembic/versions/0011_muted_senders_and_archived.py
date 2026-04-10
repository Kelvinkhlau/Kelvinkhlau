"""add muted_senders table and emails.is_archived column

Revision ID: 0011_muted_senders
Revises: 0010_audit_logs
Create Date: 2026-04-10 22:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_muted_senders"
down_revision: str | None = "0010_audit_logs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Muted senders table
    op.create_table(
        "muted_senders",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("name", sa.String(200), nullable=False, server_default=""),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_muted_senders_user_id", "muted_senders", ["user_id"])
    op.create_index("ix_muted_senders_email", "muted_senders", ["email"])

    # Add is_archived to emails
    op.add_column(
        "emails",
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("emails", "is_archived")
    op.drop_index("ix_muted_senders_email", "muted_senders")
    op.drop_index("ix_muted_senders_user_id", "muted_senders")
    op.drop_table("muted_senders")
