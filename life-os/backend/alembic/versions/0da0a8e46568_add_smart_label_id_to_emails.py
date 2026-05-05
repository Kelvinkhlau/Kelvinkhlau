"""add_smart_label_id_to_emails

Revision ID: 0da0a8e46568
Revises: f81577706b73
Create Date: 2026-04-12 00:01:14.761775

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0da0a8e46568'
down_revision: str | None = 'f81577706b73'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('emails', schema=None) as batch_op:
        batch_op.add_column(sa.Column('smart_label_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_emails_smart_label_id'), ['smart_label_id'], unique=False)
        batch_op.create_foreign_key('fk_emails_smart_label_id', 'smart_labels', ['smart_label_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    with op.batch_alter_table('emails', schema=None) as batch_op:
        batch_op.drop_constraint('fk_emails_smart_label_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_emails_smart_label_id'))
        batch_op.drop_column('smart_label_id')
