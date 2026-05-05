"""add notebook cover_image_path

Revision ID: 409e4bcf187b
Revises: e2ace96c7ae9
Create Date: 2026-04-24 22:51:34.416468

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = '409e4bcf187b'
down_revision: str | None = 'e2ace96c7ae9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('notebooks', schema=None) as batch_op:
        batch_op.add_column(sa.Column('cover_image_path', sa.String(length=500), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('notebooks', schema=None) as batch_op:
        batch_op.drop_column('cover_image_path')
