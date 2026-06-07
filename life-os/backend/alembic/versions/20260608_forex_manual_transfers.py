"""forex manual transfers — 人手出入金（銀行/其他），月度出入金自動加總嘅其中一個來源

Revision ID: 20260608_forex_xfer
Revises: 20260608_forex_settle
Create Date: 2026-06-08

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260608_forex_xfer"
down_revision: str | None = "20260608_forex_settle"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "forex_manual_transfers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("broker_account_id", sa.Integer(), nullable=False),
        sa.Column("flow", sa.String(length=12), nullable=False),  # withdrawal / deposit
        sa.Column("method", sa.String(length=30), nullable=False, server_default="bank"),
        sa.Column("amount_usdt", sa.Numeric(14, 2), nullable=False),
        sa.Column("transfer_date", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["forex_account_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["broker_account_id"], ["forex_broker_accounts.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_forex_xfer_group_id", "forex_manual_transfers", ["group_id"])
    op.create_index("ix_forex_xfer_broker_id", "forex_manual_transfers", ["broker_account_id"])
    op.create_index("ix_forex_xfer_date", "forex_manual_transfers", ["transfer_date"])


def downgrade() -> None:
    op.drop_index("ix_forex_xfer_date", table_name="forex_manual_transfers")
    op.drop_index("ix_forex_xfer_broker_id", table_name="forex_manual_transfers")
    op.drop_index("ix_forex_xfer_group_id", table_name="forex_manual_transfers")
    op.drop_table("forex_manual_transfers")
