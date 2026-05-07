"""rename calendar event fields for icloud

Revision ID: 4b6b95c2edd9
Revises: forex_module_001
Create Date: 2026-05-07 17:17:13.551350

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = '4b6b95c2edd9'
down_revision: str | None = 'forex_module_001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 表已經 truncate，安全 rename。SQLite ALTER 限制：用 batch。
    with op.batch_alter_table("calendar_events") as batch:
        batch.alter_column("google_event_id", new_column_name="external_id", existing_type=sa.String(200), type_=sa.String(500))
        batch.alter_column("google_calendar_id", new_column_name="external_calendar_id", existing_type=sa.String(200), type_=sa.String(500))
        batch.add_column(sa.Column("source", sa.String(20), nullable=False, server_default="icloud"))
        batch.add_column(sa.Column("calendar_name", sa.String(200), nullable=False, server_default=""))
        batch.create_index("ix_calendar_events_source", ["source"])


def downgrade() -> None:
    with op.batch_alter_table("calendar_events") as batch:
        batch.drop_index("ix_calendar_events_source")
        batch.drop_column("calendar_name")
        batch.drop_column("source")
        batch.alter_column("external_calendar_id", new_column_name="google_calendar_id", existing_type=sa.String(500), type_=sa.String(200))
        batch.alter_column("external_id", new_column_name="google_event_id", existing_type=sa.String(500), type_=sa.String(200))
