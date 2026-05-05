"""add_subcategory_to_expenses

Revision ID: a28db4168a70
Revises: ab1cd343cc0c
Create Date: 2026-04-11 16:52:45.898055

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a28db4168a70'
down_revision: str | None = 'ab1cd343cc0c'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('expenses', schema=None) as batch_op:
        batch_op.add_column(sa.Column('subcategory', sa.String(length=50), nullable=True))
        batch_op.create_index(batch_op.f('ix_expenses_subcategory'), ['subcategory'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('expenses', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_expenses_subcategory'))
        batch_op.drop_column('subcategory')
