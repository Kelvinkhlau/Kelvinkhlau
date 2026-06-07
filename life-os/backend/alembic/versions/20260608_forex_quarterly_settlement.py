"""forex quarterly settlement — 50/50 profit split with partner, carry-forward

Revision ID: 20260608_forex_settle
Revises: 20260608_forex_private
Create Date: 2026-06-08

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260608_forex_settle"
down_revision: str | None = "20260608_forex_private"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "forex_quarterly_settlements",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("quarter", sa.String(length=7), nullable=False),  # "2026-Q2"
        sa.Column("gross_pnl", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("total_fees", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("net_pnl", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("carry_in", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("distributable", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("partner_split_pct", sa.Numeric(5, 2), nullable=False, server_default="50"),
        sa.Column("partner_share", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("paid_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("paid_tx_hash", sa.String(length=80), nullable=True),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("carry_out", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["group_id"], ["forex_account_groups.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("group_id", "quarter", name="uq_forex_settle_group_quarter"),
    )
    op.create_index("ix_forex_settle_group_id", "forex_quarterly_settlements", ["group_id"])
    op.create_index("ix_forex_settle_quarter", "forex_quarterly_settlements", ["quarter"])


def downgrade() -> None:
    op.drop_index("ix_forex_settle_quarter", table_name="forex_quarterly_settlements")
    op.drop_index("ix_forex_settle_group_id", table_name="forex_quarterly_settlements")
    op.drop_table("forex_quarterly_settlements")
