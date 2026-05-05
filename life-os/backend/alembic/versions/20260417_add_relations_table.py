"""add_relations_table

Revision ID: 20260417_relations
Revises: 20260417_idx
Create Date: 2026-04-17

Polymorphic cross-module linking — Relation 一張表連起所有 entity type
（email / todo / note / idea / project / event / expense）。
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260417_relations"
down_revision: str | None = "20260417_idx"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "relations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("target_type", sa.String(length=32), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column(
            "kind",
            sa.String(length=32),
            nullable=False,
            server_default="related",
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "source_type",
            "source_id",
            "target_type",
            "target_id",
            name="uq_relation_source_target",
        ),
    )
    with op.batch_alter_table("relations", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_relations_user_id"),
            ["user_id"],
            unique=False,
        )
        batch_op.create_index(
            "ix_relation_source_lookup",
            ["user_id", "source_type", "source_id"],
            unique=False,
        )
        batch_op.create_index(
            "ix_relation_target_lookup",
            ["user_id", "target_type", "target_id"],
            unique=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("relations", schema=None) as batch_op:
        batch_op.drop_index("ix_relation_target_lookup")
        batch_op.drop_index("ix_relation_source_lookup")
        batch_op.drop_index(batch_op.f("ix_relations_user_id"))
    op.drop_table("relations")
