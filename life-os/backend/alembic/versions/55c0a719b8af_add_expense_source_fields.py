"""add_expense_source_fields

Revision ID: 55c0a719b8af
Revises: 0012_is_archived_idx
Create Date: 2026-04-11 01:00:21.350147

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = '55c0a719b8af'
down_revision: str | None = '0012_is_archived_idx'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('expenses', schema=None) as batch_op:
        batch_op.add_column(sa.Column('source', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('source_email_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_expenses_source_email_id'), ['source_email_id'], unique=False)
        batch_op.create_foreign_key('fk_expenses_source_email_id', 'emails', ['source_email_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    with op.batch_alter_table('expenses', schema=None) as batch_op:
        batch_op.drop_constraint('fk_expenses_source_email_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_expenses_source_email_id'))
        batch_op.drop_column('source_email_id')
        batch_op.drop_column('source')
