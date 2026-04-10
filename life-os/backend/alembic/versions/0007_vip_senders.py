"""add vip_senders table

Revision ID: 0007_vip_senders
Revises: 0006_calendar_events
Create Date: 2026-04-10 16:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_vip_senders"
down_revision: str | None = "0006_calendar_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "vip_senders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_vip_senders_user_id", "vip_senders", ["user_id"])
    op.create_index("ix_vip_senders_email", "vip_senders", ["email"])


def downgrade() -> None:
    op.drop_index("ix_vip_senders_email", table_name="vip_senders")
    op.drop_index("ix_vip_senders_user_id", table_name="vip_senders")
    op.drop_table("vip_senders")
