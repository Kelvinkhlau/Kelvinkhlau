"""add index on emails.is_archived for inbox filtering performance

Revision ID: 0012_is_archived_idx
Revises: 0011_muted_senders
Create Date: 2026-04-10 23:00:00

"""
from collections.abc import Sequence

from alembic import op

revision: str = "0012_is_archived_idx"
down_revision: str | None = "0011_muted_senders"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_emails_is_archived", "emails", ["is_archived"])


def downgrade() -> None:
    op.drop_index("ix_emails_is_archived", "emails")
