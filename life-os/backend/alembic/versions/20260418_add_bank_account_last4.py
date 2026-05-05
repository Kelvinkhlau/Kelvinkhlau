"""add_bank_account_last4

Revision ID: 20260418_bank_last4
Revises: 20260417_daily_focus
Create Date: 2026-04-18

俾 BankAccount 加 `last4`（尾 4 碼）— 主要俾信用卡 / debit card，
用嚟响 expense row 顯示「尾 4 碼」chip（同 iOS Wallet、Card App 一致）。
Nullable — 非卡類 / 現金 / e-wallet 可以唔填。
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260418_bank_last4"
down_revision: str | None = "20260417_daily_focus"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("bank_accounts") as batch:
        batch.add_column(sa.Column("last4", sa.String(length=4), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("bank_accounts") as batch:
        batch.drop_column("last4")
