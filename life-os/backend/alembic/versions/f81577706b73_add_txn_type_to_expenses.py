"""add_txn_type_to_expenses

Revision ID: f81577706b73
Revises: a2b76e86bad1
Create Date: 2026-04-11 23:49:55.692389

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f81577706b73'
down_revision: str | None = 'a2b76e86bad1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('expenses', schema=None) as batch_op:
        batch_op.add_column(sa.Column('txn_type', sa.String(length=10), nullable=False, server_default=sa.text("'expense'")))
        batch_op.create_index(batch_op.f('ix_expenses_txn_type'), ['txn_type'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('expenses', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_expenses_txn_type'))
        batch_op.drop_column('txn_type')
