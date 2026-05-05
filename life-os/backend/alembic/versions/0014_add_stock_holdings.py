"""add_stock_holdings — 證券戶口持倉

新建 stock_holdings table，俾 brokerage 類型嘅 BankAccount 儲股票持倉。
Quote 由 background scheduler 自動 refresh。

Revision ID: 0014_add_stock_holdings
Revises: 0013_multi_passkey_support
Create Date: 2026-04-14 01:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "0014_add_stock_holdings"
down_revision: str | None = "0013_multi_passkey_support"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "stock_holdings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "account_id",
            sa.Integer(),
            sa.ForeignKey("bank_accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("symbol", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=True),
        sa.Column("quantity", sa.Numeric(18, 6), nullable=False, server_default="0"),
        sa.Column("avg_cost", sa.Numeric(18, 6), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="HKD"),
        sa.Column("last_price", sa.Numeric(18, 6), nullable=True),
        sa.Column("last_price_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
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
    )
    op.create_index(
        "ix_stock_holdings_account_id", "stock_holdings", ["account_id"]
    )
    op.create_index("ix_stock_holdings_symbol", "stock_holdings", ["symbol"])


def downgrade() -> None:
    op.drop_index("ix_stock_holdings_symbol", table_name="stock_holdings")
    op.drop_index("ix_stock_holdings_account_id", table_name="stock_holdings")
    op.drop_table("stock_holdings")
