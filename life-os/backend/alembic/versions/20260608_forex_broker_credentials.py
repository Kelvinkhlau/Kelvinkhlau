"""forex broker — login credentials (login_url, password, 2FA method)

Revision ID: 20260608_forex_cred
Revises: 20260608_forex_xfer
Create Date: 2026-06-08

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260608_forex_cred"
down_revision: str | None = "20260608_forex_xfer"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("forex_broker_accounts", sa.Column("login_url", sa.String(length=300), nullable=True))
    op.add_column("forex_broker_accounts", sa.Column("password", sa.String(length=300), nullable=True))
    op.add_column("forex_broker_accounts", sa.Column("twofa", sa.String(length=300), nullable=True))


def downgrade() -> None:
    op.drop_column("forex_broker_accounts", "twofa")
    op.drop_column("forex_broker_accounts", "password")
    op.drop_column("forex_broker_accounts", "login_url")
