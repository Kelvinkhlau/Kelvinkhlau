"""add performance indexes for hot queries

Revision ID: 20260417_idx
Revises: 15c560182451
Create Date: 2026-04-17

收件箱列表 + 未讀計數 + todo→email 反查嘅 hot path 加 index。
其餘 FK index 之前 migrations 已經有。

用 CREATE INDEX IF NOT EXISTS 因為之前可能 partial 執行過。
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "20260417_idx"
down_revision = "15c560182451"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_emails_folder_archived "
        "ON emails (user_id, folder, is_archived, deleted_at)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_emails_user_is_read "
        "ON emails (user_id, is_read)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_todos_source_email_id "
        "ON todos (source_email_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_todos_source_email_id")
    op.execute("DROP INDEX IF EXISTS ix_emails_user_is_read")
    op.execute("DROP INDEX IF EXISTS ix_emails_folder_archived")
