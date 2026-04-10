"""add ideas table

Revision ID: 0005_ideas
Revises: 0004_projects
Create Date: 2026-04-10 12:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_ideas"
down_revision: str | None = "0004_projects"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ideas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("tags", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "pinned", sa.Boolean(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column(
            "archived", sa.Boolean(), nullable=False, server_default=sa.text("0")
        ),
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
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ideas_user_id", "ideas", ["user_id"])
    op.create_index("ix_ideas_project_id", "ideas", ["project_id"])
    op.create_index("ix_ideas_archived", "ideas", ["archived"])


def downgrade() -> None:
    op.drop_index("ix_ideas_archived", table_name="ideas")
    op.drop_index("ix_ideas_project_id", table_name="ideas")
    op.drop_index("ix_ideas_user_id", table_name="ideas")
    op.drop_table("ideas")
