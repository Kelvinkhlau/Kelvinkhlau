"""add action fields to email classification

Revision ID: 2763a322b803
Revises: 900f094f472e
Create Date: 2026-04-11 09:17:47.693883

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = '2763a322b803'
down_revision: str | None = '900f094f472e'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('email_classifications', schema=None) as batch_op:
        batch_op.add_column(sa.Column('action_required', sa.Boolean(), server_default=sa.text('0'), nullable=False))
        batch_op.add_column(sa.Column('action_summary', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('action_deadline', sa.String(length=20), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('email_classifications', schema=None) as batch_op:
        batch_op.drop_column('action_deadline')
        batch_op.drop_column('action_summary')
        batch_op.drop_column('action_required')
