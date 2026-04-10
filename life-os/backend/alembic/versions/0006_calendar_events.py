"""add calendar_events table

Revision ID: 0006_calendar_events
Revises: 0005_ideas
Create Date: 2026-04-10 14:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_calendar_events"
down_revision: str | None = "0005_ideas"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "calendar_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("google_event_id", sa.String(length=200), nullable=False),
        sa.Column(
            "google_calendar_id",
            sa.String(length=200),
            nullable=False,
            server_default="primary",
        ),
        sa.Column("title", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location", sa.String(length=500), nullable=True),
        sa.Column("start_at", sa.DateTime(), nullable=False),
        sa.Column("end_at", sa.DateTime(), nullable=False),
        sa.Column(
            "all_day", sa.Boolean(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="confirmed",
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
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_calendar_events_user_id", "calendar_events", ["user_id"]
    )
    op.create_index(
        "ix_calendar_events_google_event_id",
        "calendar_events",
        ["google_event_id"],
        unique=True,
    )
    op.create_index(
        "ix_calendar_events_start_at", "calendar_events", ["start_at"]
    )
    op.create_index(
        "ix_calendar_events_user_start",
        "calendar_events",
        ["user_id", "start_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_calendar_events_user_start", table_name="calendar_events")
    op.drop_index("ix_calendar_events_start_at", table_name="calendar_events")
    op.drop_index(
        "ix_calendar_events_google_event_id", table_name="calendar_events"
    )
    op.drop_index("ix_calendar_events_user_id", table_name="calendar_events")
    op.drop_table("calendar_events")
