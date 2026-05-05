"""Expense.spent_at Date → DateTime（加時間資訊）。

Revision ID: 20260420_expense_spent_at_datetime
Revises: 20260419_vault_reminder
Create Date: 2026-04-20 10:00:00

Data-preserving + idempotent migration。

背景：之前版本用 `batch_alter_table.alter_column(..., type_=DateTime)`，
SQLite 喺 batch copy 嗰陣將 'YYYY-MM-DD' 字串 cast 去 NUMERIC affinity，
截斷成 integer（e.g. '2026-04-15' → 2026），毀咗所有 row 嘅 spent_at。

新版邏輯：
1. 先 UPDATE — 將所有 'YYYY-MM-DD' 正規化做 'YYYY-MM-DD 00:00:00'
   （SQLite 兩種 type 底層都係 TEXT，無 storage 改變）
2. 對異常值（冇 dash）重設去 '2000-01-01 00:00:00'（可見嘅 sentinel）
3. ORM 層嘅 DateTime 宣告足以令 SQLAlchemy 正確解析
4. 唔再 call batch_alter_table — 避免 SQLite affinity bug
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260420_expense_spent_at_datetime"
down_revision: str | None = "20260419_vault_reminder"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # Step 1: 正規化純 DATE 值（'YYYY-MM-DD'，長度 10）→ 加 ' 00:00:00'
    conn.execute(
        sa.text(
            """
            UPDATE expenses
            SET spent_at = spent_at || ' 00:00:00'
            WHERE typeof(spent_at) = 'text'
              AND length(spent_at) = 10
              AND spent_at LIKE '____-__-__'
            """
        )
    )

    # Step 2: 處理異常值（integer / 短 text 等，例如舊版 migration 破壞留低嘅 2026）
    # 設成 '2000-01-01 00:00:00' 做可見 sentinel，方便事後 restore
    conn.execute(
        sa.text(
            """
            UPDATE expenses
            SET spent_at = '2000-01-01 00:00:00'
            WHERE typeof(spent_at) != 'text'
               OR length(spent_at) < 10
               OR spent_at NOT LIKE '____-__-__%'
            """
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    # DateTime → Date：截返前 10 個字（'YYYY-MM-DD'）
    conn.execute(
        sa.text(
            """
            UPDATE expenses
            SET spent_at = substr(spent_at, 1, 10)
            WHERE length(spent_at) > 10
            """
        )
    )
