"""add_daily_focus

Revision ID: 20260417_daily_focus
Revises: 20260417_relations
Create Date: 2026-04-17

每日起跑點 — 同一日 user 揀幾件 todos pin 起。MVP 只 link todo（其他
entity type 之後用 Relation 就夠）。CASCADE delete：todo 被刪 →
focus 自動清走。
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260417_daily_focus"
down_revision: str | None = "20260417_relations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "daily_focus",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("focus_date", sa.Date(), nullable=False),
        sa.Column("todo_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["todo_id"], ["todos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "focus_date",
            "todo_id",
            name="uq_daily_focus_user_date_todo",
        ),
    )
    with op.batch_alter_table("daily_focus", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_daily_focus_user_id"),
            ["user_id"],
            unique=False,
        )
        batch_op.create_index(
            batch_op.f("ix_daily_focus_focus_date"),
            ["focus_date"],
            unique=False,
        )
        batch_op.create_index(
            "ix_daily_focus_user_date",
            ["user_id", "focus_date"],
            unique=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("daily_focus", schema=None) as batch_op:
        batch_op.drop_index("ix_daily_focus_user_date")
        batch_op.drop_index(batch_op.f("ix_daily_focus_focus_date"))
        batch_op.drop_index(batch_op.f("ix_daily_focus_user_id"))
    op.drop_table("daily_focus")
