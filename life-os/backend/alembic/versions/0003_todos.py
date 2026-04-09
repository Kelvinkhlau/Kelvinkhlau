"""add todos table

Revision ID: 0003_todos
Revises: 0002_passkey_sign_count
Create Date: 2026-04-09 15:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "0003_todos"
down_revision: str | None = "0002_passkey_sign_count"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "todos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "done",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "priority",
            sa.String(length=10),
            nullable=False,
            server_default="medium",
        ),
        sa.Column("due_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_todos_user_id", "todos", ["user_id"])
    op.create_index("ix_todos_done", "todos", ["done"])
    op.create_index("ix_todos_due_at", "todos", ["due_at"])


def downgrade() -> None:
    op.drop_index("ix_todos_due_at", table_name="todos")
    op.drop_index("ix_todos_done", table_name="todos")
    op.drop_index("ix_todos_user_id", table_name="todos")
    op.drop_table("todos")
