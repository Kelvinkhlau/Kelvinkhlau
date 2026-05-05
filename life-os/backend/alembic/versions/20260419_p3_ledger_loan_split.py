"""P2-13 + P3-14/15/16/17: ledger, loan, family_member/split, credit cycle, recurring.

Revision ID: 20260419_p3
Revises: 20260418_bank_last4
Create Date: 2026-04-19

Adds:
- ledgers 表（多帳本）
- loans + loan_repayments（借貸追蹤）
- family_members + expense_splits（分帳）
- bank_accounts 加 statement_day / due_day / credit_limit
- subscriptions 加 auto_create_expense / payment_account_id / merchant / last_generated_at
- expenses 加 ledger_id + subscription_id
"""

from alembic import op
import sqlalchemy as sa


revision = "20260419_p3"
down_revision = "20260418_bank_last4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- ledgers (P3-14) ---
    op.create_table(
        "ledgers",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("icon", sa.String(length=10), nullable=True),
        sa.Column("color", sa.String(length=20), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ledgers_user_id", "ledgers", ["user_id"])

    # --- loans (P3-15) ---
    op.create_table(
        "loans",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("direction", sa.String(length=20), nullable=False),
        sa.Column("counterparty", sa.String(length=200), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="HKD"),
        sa.Column("repaid_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("started_at", sa.Date(), nullable=False),
        sa.Column("due_at", sa.Date(), nullable=True),
        sa.Column("settled_at", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_loans_user_id", "loans", ["user_id"])
    op.create_index("ix_loans_direction", "loans", ["direction"])
    op.create_index("ix_loans_status", "loans", ["status"])
    op.create_index("ix_loans_started_at", "loans", ["started_at"])
    op.create_index("ix_loans_due_at", "loans", ["due_at"])

    op.create_table(
        "loan_repayments",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("loan_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("paid_at", sa.Date(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["loan_id"], ["loans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_loan_repayments_loan_id", "loan_repayments", ["loan_id"])
    op.create_index("ix_loan_repayments_user_id", "loan_repayments", ["user_id"])
    op.create_index("ix_loan_repayments_paid_at", "loan_repayments", ["paid_at"])

    # --- family_members + expense_splits (P3-17) ---
    op.create_table(
        "family_members",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("relation", sa.String(length=50), nullable=True),
        sa.Column("color", sa.String(length=20), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_family_members_user_id", "family_members", ["user_id"])

    op.create_table(
        "expense_splits",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("expense_id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("is_paid", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["expense_id"], ["expenses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["member_id"], ["family_members.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_expense_splits_expense_id", "expense_splits", ["expense_id"])
    op.create_index("ix_expense_splits_member_id", "expense_splits", ["member_id"])

    # --- bank_accounts: credit cycle (P2-13) ---
    with op.batch_alter_table("bank_accounts") as batch:
        batch.add_column(sa.Column("statement_day", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("due_day", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("credit_limit", sa.Numeric(14, 2), nullable=True))

    # --- subscriptions: auto-gen (P3-16) ---
    with op.batch_alter_table("subscriptions") as batch:
        batch.add_column(sa.Column("auto_create_expense", sa.Boolean(), nullable=False, server_default=sa.text("0")))
        batch.add_column(sa.Column("payment_account_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("merchant", sa.String(length=200), nullable=True))
        batch.add_column(sa.Column("last_generated_at", sa.Date(), nullable=True))
        batch.create_foreign_key(
            "fk_subscriptions_payment_account",
            "bank_accounts",
            ["payment_account_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_index("ix_subscriptions_payment_account_id", ["payment_account_id"])

    # --- expenses: ledger_id + subscription_id ---
    with op.batch_alter_table("expenses") as batch:
        batch.add_column(sa.Column("ledger_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("subscription_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_expenses_ledger",
            "ledgers",
            ["ledger_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_foreign_key(
            "fk_expenses_subscription",
            "subscriptions",
            ["subscription_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_index("ix_expenses_ledger_id", ["ledger_id"])
        batch.create_index("ix_expenses_subscription_id", ["subscription_id"])


def downgrade() -> None:
    with op.batch_alter_table("expenses") as batch:
        batch.drop_index("ix_expenses_ledger_id")
        batch.drop_index("ix_expenses_subscription_id")
        batch.drop_constraint("fk_expenses_ledger", type_="foreignkey")
        batch.drop_constraint("fk_expenses_subscription", type_="foreignkey")
        batch.drop_column("subscription_id")
        batch.drop_column("ledger_id")

    with op.batch_alter_table("subscriptions") as batch:
        batch.drop_index("ix_subscriptions_payment_account_id")
        batch.drop_constraint("fk_subscriptions_payment_account", type_="foreignkey")
        batch.drop_column("last_generated_at")
        batch.drop_column("merchant")
        batch.drop_column("payment_account_id")
        batch.drop_column("auto_create_expense")

    with op.batch_alter_table("bank_accounts") as batch:
        batch.drop_column("credit_limit")
        batch.drop_column("due_day")
        batch.drop_column("statement_day")

    op.drop_index("ix_expense_splits_member_id", table_name="expense_splits")
    op.drop_index("ix_expense_splits_expense_id", table_name="expense_splits")
    op.drop_table("expense_splits")
    op.drop_index("ix_family_members_user_id", table_name="family_members")
    op.drop_table("family_members")

    op.drop_index("ix_loan_repayments_paid_at", table_name="loan_repayments")
    op.drop_index("ix_loan_repayments_user_id", table_name="loan_repayments")
    op.drop_index("ix_loan_repayments_loan_id", table_name="loan_repayments")
    op.drop_table("loan_repayments")
    op.drop_index("ix_loans_due_at", table_name="loans")
    op.drop_index("ix_loans_started_at", table_name="loans")
    op.drop_index("ix_loans_status", table_name="loans")
    op.drop_index("ix_loans_direction", table_name="loans")
    op.drop_index("ix_loans_user_id", table_name="loans")
    op.drop_table("loans")

    op.drop_index("ix_ledgers_user_id", table_name="ledgers")
    op.drop_table("ledgers")
