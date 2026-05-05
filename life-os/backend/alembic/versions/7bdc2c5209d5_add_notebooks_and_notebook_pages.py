"""add notebooks and notebook_pages

Revision ID: 7bdc2c5209d5
Revises: 20260420_expense_spent_at_datetime
Create Date: 2026-04-24 11:50:52.260267

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = '7bdc2c5209d5'
down_revision: str | None = '20260420_expense_spent_at_datetime'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'notebooks',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('cover_color', sa.String(length=20), server_default='#4f46e5', nullable=False),
        sa.Column('icon', sa.String(length=10), nullable=True),
        sa.Column('default_template', sa.String(length=20), server_default='blank', nullable=False),
        sa.Column('tags', sa.Text(), server_default='', nullable=False),
        sa.Column('pinned', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('archived', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('notebooks', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_notebooks_archived'), ['archived'], unique=False)
        batch_op.create_index(batch_op.f('ix_notebooks_user_id'), ['user_id'], unique=False)

    op.create_table(
        'notebook_pages',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('notebook_id', sa.Integer(), nullable=False),
        sa.Column('page_number', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=True),
        sa.Column('canvas_json', sa.Text(), server_default='', nullable=False),
        sa.Column('text_content', sa.Text(), server_default='', nullable=False),
        sa.Column('thumbnail', sa.Text(), nullable=True),
        sa.Column('tags', sa.Text(), server_default='', nullable=False),
        sa.Column('template', sa.String(length=20), server_default='blank', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['notebook_id'], ['notebooks.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('notebook_pages', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_notebook_pages_notebook_id'), ['notebook_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('notebook_pages', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_notebook_pages_notebook_id'))
    op.drop_table('notebook_pages')

    with op.batch_alter_table('notebooks', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_notebooks_user_id'))
        batch_op.drop_index(batch_op.f('ix_notebooks_archived'))
    op.drop_table('notebooks')
