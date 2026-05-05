"""multi_passkey_support — 一個 user 可以有多個 passkey

新建 passkey_credentials table，將 users.passkey_* 現有 credential 搬入嚟，
然後 drop users 嘅 passkey_* columns。

Revision ID: 0013_multi_passkey_support
Revises: 4c6fbfd1b8b7
Create Date: 2026-04-14 00:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "0013_multi_passkey_support"
down_revision: str | None = "4c6fbfd1b8b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. 新建 passkey_credentials table
    op.create_table(
        "passkey_credentials",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("credential_id", sa.String(), nullable=False),
        sa.Column("public_key", sa.String(), nullable=False),
        sa.Column("sign_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("device_name", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_passkey_credentials_user_id", "passkey_credentials", ["user_id"]
    )
    op.create_index(
        "ix_passkey_credentials_credential_id",
        "passkey_credentials",
        ["credential_id"],
        unique=True,
    )

    # 2. 將現有 users.passkey_* 資料搬入嚟（保留 iPad credential，唔好俾用戶失去登入）
    op.execute(
        """
        INSERT INTO passkey_credentials (
            user_id, credential_id, public_key, sign_count, device_name, created_at
        )
        SELECT
            id,
            passkey_credential_id,
            passkey_public_key,
            COALESCE(passkey_sign_count, 0),
            'Legacy device',
            CURRENT_TIMESTAMP
        FROM users
        WHERE passkey_credential_id IS NOT NULL
          AND passkey_public_key IS NOT NULL
        """
    )

    # 3. Drop 舊 columns（用 batch mode for SQLite）
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("passkey_credential_id")
        batch_op.drop_column("passkey_public_key")
        batch_op.drop_column("passkey_sign_count")


def downgrade() -> None:
    # 將 passkey_credentials 嘅第一個 credential 搬返去 users（lossy — 只保留一個）
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("passkey_credential_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("passkey_public_key", sa.String(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "passkey_sign_count",
                sa.Integer(),
                nullable=False,
                server_default="0",
            )
        )

    op.execute(
        """
        UPDATE users
        SET
            passkey_credential_id = (
                SELECT credential_id FROM passkey_credentials
                WHERE passkey_credentials.user_id = users.id
                ORDER BY id ASC LIMIT 1
            ),
            passkey_public_key = (
                SELECT public_key FROM passkey_credentials
                WHERE passkey_credentials.user_id = users.id
                ORDER BY id ASC LIMIT 1
            ),
            passkey_sign_count = COALESCE((
                SELECT sign_count FROM passkey_credentials
                WHERE passkey_credentials.user_id = users.id
                ORDER BY id ASC LIMIT 1
            ), 0)
        """
    )

    op.drop_index("ix_passkey_credentials_credential_id", table_name="passkey_credentials")
    op.drop_index("ix_passkey_credentials_user_id", table_name="passkey_credentials")
    op.drop_table("passkey_credentials")
