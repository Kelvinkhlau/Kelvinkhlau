"""add forex reconciliation module — 8 tables, multi-group + multi-wallet

Revision ID: forex_module_001
Revises: 409e4bcf187b
Create Date: 2026-05-05 14:30:00

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "forex_module_001"
down_revision: str | None = "409e4bcf187b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ───── account_groups ─────
    op.create_table(
        "forex_account_groups",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("owner_name", sa.String(length=100), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("code", name="uq_forex_groups_code"),
    )
    op.create_index("ix_forex_groups_code", "forex_account_groups", ["code"])

    # ───── account_group_wallets ─────
    op.create_table(
        "forex_account_group_wallets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("address", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["forex_account_groups.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("address", name="uq_forex_wallets_address"),
    )
    op.create_index("ix_forex_wallets_group_id", "forex_account_group_wallets", ["group_id"])
    op.create_index("ix_forex_wallets_address", "forex_account_group_wallets", ["address"])

    # ───── broker_accounts ─────
    op.create_table(
        "forex_broker_accounts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("owner", sa.String(length=100), nullable=True),
        sa.Column("email", sa.String(length=200), nullable=True),
        sa.Column("account_number", sa.String(length=100), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["forex_account_groups.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("group_id", "name", "owner", name="uq_forex_brokers_group_name_owner"),
    )
    op.create_index("ix_forex_brokers_group_id", "forex_broker_accounts", ["group_id"])

    # ───── monthly_balances ─────
    op.create_table(
        "forex_monthly_balances",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("broker_account_id", sa.Integer(), nullable=False),
        sa.Column("month", sa.String(length=7), nullable=False),
        sa.Column("opening_balance", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("closing_balance", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("reported_pnl", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("expected_pnl", sa.Numeric(14, 2), nullable=True),
        sa.Column("variance", sa.Numeric(14, 2), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["broker_account_id"], ["forex_broker_accounts.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint("broker_account_id", "month", name="uq_forex_monthly_broker_month"),
    )
    op.create_index(
        "ix_forex_monthly_broker_id", "forex_monthly_balances", ["broker_account_id"]
    )
    op.create_index("ix_forex_monthly_month", "forex_monthly_balances", ["month"])

    # ───── wallet_transactions ─────
    op.create_table(
        "forex_wallet_transactions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("wallet_id", sa.Integer(), nullable=False),
        sa.Column("tx_hash", sa.String(length=80), nullable=False),
        sa.Column("block_timestamp", sa.DateTime(), nullable=False),
        sa.Column("direction", sa.String(length=4), nullable=False),
        sa.Column("amount_usdt", sa.Numeric(20, 6), nullable=False),
        sa.Column("counterparty_address", sa.String(length=64), nullable=False),
        sa.Column("broker_account_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending_tag"),
        sa.Column("raw_data", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["forex_account_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["wallet_id"], ["forex_account_group_wallets.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["broker_account_id"], ["forex_broker_accounts.id"], ondelete="SET NULL"
        ),
        sa.UniqueConstraint("wallet_id", "tx_hash", name="uq_forex_tx_wallet_hash"),
    )
    op.create_index("ix_forex_tx_group_id", "forex_wallet_transactions", ["group_id"])
    op.create_index("ix_forex_tx_wallet_id", "forex_wallet_transactions", ["wallet_id"])
    op.create_index("ix_forex_tx_hash", "forex_wallet_transactions", ["tx_hash"])
    op.create_index(
        "ix_forex_tx_block_timestamp", "forex_wallet_transactions", ["block_timestamp"]
    )
    op.create_index(
        "ix_forex_tx_counterparty", "forex_wallet_transactions", ["counterparty_address"]
    )
    op.create_index("ix_forex_tx_broker_id", "forex_wallet_transactions", ["broker_account_id"])
    op.create_index("ix_forex_tx_status", "forex_wallet_transactions", ["status"])

    # ───── address_book ─────
    op.create_table(
        "forex_address_book",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("address", sa.String(length=64), nullable=False),
        sa.Column("broker_account_id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["group_id"], ["forex_account_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["broker_account_id"], ["forex_broker_accounts.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint("group_id", "address", name="uq_forex_addrbook_group_addr"),
    )
    op.create_index("ix_forex_addrbook_group_id", "forex_address_book", ["group_id"])
    op.create_index("ix_forex_addrbook_address", "forex_address_book", ["address"])

    # ───── deposit_intents ─────
    op.create_table(
        "forex_deposit_intents",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("broker_account_id", sa.Integer(), nullable=False),
        sa.Column("amount_usdt", sa.Numeric(20, 6), nullable=False),
        sa.Column("intended_at", sa.DateTime(), nullable=False),
        sa.Column("matched_tx_hash", sa.String(length=80), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["forex_account_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["broker_account_id"], ["forex_broker_accounts.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_forex_intents_group_id", "forex_deposit_intents", ["group_id"])
    op.create_index("ix_forex_intents_intended_at", "forex_deposit_intents", ["intended_at"])
    op.create_index("ix_forex_intents_status", "forex_deposit_intents", ["status"])

    # ───── reconciliation_runs ─────
    op.create_table(
        "forex_reconciliation_runs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("month", sa.String(length=7), nullable=False),
        sa.Column("run_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("total_accounts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("matched_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("flagged_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("summary", sa.JSON(), nullable=False, server_default="{}"),
        sa.ForeignKeyConstraint(["group_id"], ["forex_account_groups.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "group_id", "month", "run_at", name="uq_forex_recon_group_month_run"
        ),
    )
    op.create_index("ix_forex_recon_group_id", "forex_reconciliation_runs", ["group_id"])
    op.create_index("ix_forex_recon_month", "forex_reconciliation_runs", ["month"])


def downgrade() -> None:
    op.drop_index("ix_forex_recon_month", table_name="forex_reconciliation_runs")
    op.drop_index("ix_forex_recon_group_id", table_name="forex_reconciliation_runs")
    op.drop_table("forex_reconciliation_runs")

    op.drop_index("ix_forex_intents_status", table_name="forex_deposit_intents")
    op.drop_index("ix_forex_intents_intended_at", table_name="forex_deposit_intents")
    op.drop_index("ix_forex_intents_group_id", table_name="forex_deposit_intents")
    op.drop_table("forex_deposit_intents")

    op.drop_index("ix_forex_addrbook_address", table_name="forex_address_book")
    op.drop_index("ix_forex_addrbook_group_id", table_name="forex_address_book")
    op.drop_table("forex_address_book")

    op.drop_index("ix_forex_tx_status", table_name="forex_wallet_transactions")
    op.drop_index("ix_forex_tx_broker_id", table_name="forex_wallet_transactions")
    op.drop_index("ix_forex_tx_counterparty", table_name="forex_wallet_transactions")
    op.drop_index("ix_forex_tx_block_timestamp", table_name="forex_wallet_transactions")
    op.drop_index("ix_forex_tx_hash", table_name="forex_wallet_transactions")
    op.drop_index("ix_forex_tx_wallet_id", table_name="forex_wallet_transactions")
    op.drop_index("ix_forex_tx_group_id", table_name="forex_wallet_transactions")
    op.drop_table("forex_wallet_transactions")

    op.drop_index("ix_forex_monthly_month", table_name="forex_monthly_balances")
    op.drop_index("ix_forex_monthly_broker_id", table_name="forex_monthly_balances")
    op.drop_table("forex_monthly_balances")

    op.drop_index("ix_forex_brokers_group_id", table_name="forex_broker_accounts")
    op.drop_table("forex_broker_accounts")

    op.drop_index("ix_forex_wallets_address", table_name="forex_account_group_wallets")
    op.drop_index("ix_forex_wallets_group_id", table_name="forex_account_group_wallets")
    op.drop_table("forex_account_group_wallets")

    op.drop_index("ix_forex_groups_code", table_name="forex_account_groups")
    op.drop_table("forex_account_groups")
