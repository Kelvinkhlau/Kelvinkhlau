"""forex — 按月鎖定（對數完防誤改，UI 保護層）

Revision ID: 20260608_forex_lock
Revises: 20260608_forex_cred
Create Date: 2026-06-08

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260608_forex_lock"
down_revision: str | None = "20260608_forex_cred"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "forex_month_locks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("month", sa.String(length=7), nullable=False),
        sa.Column("locked_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["forex_account_groups.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("group_id", "month", name="uq_forex_lock_group_month"),
    )
    op.create_index("ix_forex_lock_group_id", "forex_month_locks", ["group_id"])


def downgrade() -> None:
    op.drop_index("ix_forex_lock_group_id", table_name="forex_month_locks")
    op.drop_table("forex_month_locks")
