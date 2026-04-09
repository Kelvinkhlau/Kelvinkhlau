"""initial schema: users, emails, email_classifications

Revision ID: 0001_initial
Revises:
Create Date: 2026-04-09 12:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("gmail_refresh_token", sa.String(), nullable=True),
        sa.Column("gmail_history_id", sa.String(), nullable=True),
        sa.Column("passkey_credential_id", sa.String(), nullable=True),
        sa.Column("passkey_public_key", sa.String(), nullable=True),
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
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "emails",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("gmail_message_id", sa.String(length=100), nullable=False),
        sa.Column("gmail_thread_id", sa.String(length=100), nullable=False),
        sa.Column("subject", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("sender", sa.String(length=500), nullable=False, server_default=""),
        sa.Column(
            "sender_email", sa.String(length=255), nullable=False, server_default=""
        ),
        sa.Column("recipients", sa.Text(), nullable=False, server_default=""),
        sa.Column("snippet", sa.Text(), nullable=False, server_default=""),
        sa.Column("body_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("body_html", sa.Text(), nullable=True),
        sa.Column("received_at", sa.DateTime(), nullable=False),
        sa.Column(
            "is_read",
            sa.Boolean(),
            nullable=False,
            server_default=sa.sql.expression.false(),
        ),
        sa.Column(
            "has_attachment",
            sa.Boolean(),
            nullable=False,
            server_default=sa.sql.expression.false(),
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
    op.create_index("ix_emails_user_id", "emails", ["user_id"])
    op.create_index(
        "ix_emails_gmail_message_id", "emails", ["gmail_message_id"], unique=True
    )
    op.create_index("ix_emails_gmail_thread_id", "emails", ["gmail_thread_id"])
    op.create_index("ix_emails_sender_email", "emails", ["sender_email"])
    op.create_index("ix_emails_received_at", "emails", ["received_at"])
    op.create_index(
        "ix_emails_user_received", "emails", ["user_id", "received_at"]
    )

    op.create_table(
        "email_classifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email_id", sa.Integer(), nullable=False),
        sa.Column("ai_category", sa.String(length=50), nullable=False),
        sa.Column("ai_confidence", sa.Float(), nullable=False),
        sa.Column("ai_reason", sa.Text(), nullable=True),
        sa.Column("ai_model", sa.String(length=100), nullable=False),
        sa.Column("user_category", sa.String(length=50), nullable=True),
        sa.Column("user_corrected_at", sa.DateTime(), nullable=True),
        sa.Column(
            "classified_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["email_id"], ["emails.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email_id"),
    )


def downgrade() -> None:
    op.drop_table("email_classifications")
    op.drop_index("ix_emails_user_received", table_name="emails")
    op.drop_index("ix_emails_received_at", table_name="emails")
    op.drop_index("ix_emails_sender_email", table_name="emails")
    op.drop_index("ix_emails_gmail_thread_id", table_name="emails")
    op.drop_index("ix_emails_gmail_message_id", table_name="emails")
    op.drop_index("ix_emails_user_id", table_name="emails")
    op.drop_table("emails")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
