"""forex private group — partner fields + manual deposit/withdrawal on monthly balances

Revision ID: 20260608_forex_private
Revises: f1a2c3d4e5b6
Create Date: 2026-06-08

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260608_forex_private"
down_revision: str | None = "f1a2c3d4e5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Partner (e.g. Jackson) — single profit-split partner per group
    op.add_column(
        "forex_account_groups",
        sa.Column("partner_name", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "forex_account_groups",
        sa.Column("partner_split_pct", sa.Numeric(5, 2), nullable=True),
    )
    # Broker-side manual deposit / withdrawal for the month (private group enters by hand).
    # P/L = closing - opening - deposit + withdrawal
    op.add_column(
        "forex_monthly_balances",
        sa.Column("deposit_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
    )
    op.add_column(
        "forex_monthly_balances",
        sa.Column("withdrawal_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("forex_monthly_balances", "withdrawal_amount")
    op.drop_column("forex_monthly_balances", "deposit_amount")
    op.drop_column("forex_account_groups", "partner_split_pct")
    op.drop_column("forex_account_groups", "partner_name")
