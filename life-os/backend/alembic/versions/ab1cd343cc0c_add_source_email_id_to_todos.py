"""add source_email_id to todos

Revision ID: ab1cd343cc0c
Revises: 2763a322b803
Create Date: 2026-04-11 12:36:57.673002

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'ab1cd343cc0c'
down_revision: str | None = '2763a322b803'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('todos', schema=None) as batch_op:
        batch_op.add_column(sa.Column('source_email_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_todos_source_email_id', 'emails', ['source_email_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    with op.batch_alter_table('todos', schema=None) as batch_op:
        batch_op.drop_constraint('fk_todos_source_email_id', type_='foreignkey')
        batch_op.drop_column('source_email_id')
