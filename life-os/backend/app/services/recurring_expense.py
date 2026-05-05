"""Recurring expense generator — P3-16.

邏輯：
- 掃描 active + auto_create_expense 嘅 Subscription
- 若 next_billing <= 今日，且該月/週/年嘅 expense 仲未產生，就建一筆 Expense
- 更新 subscription.next_billing 去下個 cycle
- 更新 subscription.last_generated_at
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models.expense import Expense
from app.models.ledger import Ledger
from app.models.subscription import Subscription

logger = logging.getLogger(__name__)


def _advance_date(d: date, cycle: str) -> date:
    if cycle == "weekly":
        return d + timedelta(days=7)
    if cycle == "yearly":
        try:
            return d.replace(year=d.year + 1)
        except ValueError:
            # 例如 2/29
            return d.replace(year=d.year + 1, day=28)
    # monthly
    year = d.year + (1 if d.month == 12 else 0)
    month = 1 if d.month == 12 else d.month + 1
    try:
        return d.replace(year=year, month=month)
    except ValueError:
        # 例如 1/31 → 2/28
        # 用該月最後一日
        # 簡單搞法：向前退到最大可行日
        day = d.day
        while day > 28:
            try:
                return d.replace(year=year, month=month, day=day)
            except ValueError:
                day -= 1
        return d.replace(year=year, month=month, day=28)


def generate_recurring_expenses(today: date | None = None) -> dict:
    """掃描所有 user 嘅 auto-gen subscription，補建缺失嘅 expenses。

    用：scheduler 每日跑一次，或 manual trigger via API。
    Return：{processed: int, generated: int, errors: list[str]}
    """
    if today is None:
        today = date.today()

    generated = 0
    processed = 0
    errors: list[str] = []

    with SessionLocal() as db:
        subs = list(
            db.execute(
                select(Subscription).where(
                    Subscription.active.is_(True),
                    Subscription.auto_create_expense.is_(True),
                )
            ).scalars().all()
        )
        processed = len(subs)

        for sub in subs:
            try:
                # 若 next_billing 未到，skip
                if sub.next_billing > today:
                    continue

                # 找 user 預設 ledger
                default_ledger = db.execute(
                    select(Ledger).where(
                        Ledger.user_id == sub.user_id, Ledger.is_default.is_(True)
                    ).limit(1)
                ).scalar_one_or_none()

                # 可能 next_billing 係幾期前（pc 被關咗一排），逐期補
                due = sub.next_billing
                while due <= today:
                    # 防重：check 同 subscription_id + spent_at 嘅 expense 有冇
                    existing = db.execute(
                        select(Expense).where(
                            Expense.user_id == sub.user_id,
                            Expense.subscription_id == sub.id,
                            func.date(Expense.spent_at) == due,
                        ).limit(1)
                    ).scalar_one_or_none()

                    if existing is None:
                        expense = Expense(
                            user_id=sub.user_id,
                            txn_type="expense",
                            amount=float(sub.amount),
                            currency=sub.currency,
                            category=sub.category,
                            description=f"[自動] {sub.name}",
                            merchant=sub.merchant or sub.name,
                            payment_account_id=sub.payment_account_id,
                            ledger_id=default_ledger.id if default_ledger else None,
                            spent_at=due,
                            source="subscription",
                            subscription_id=sub.id,
                        )
                        db.add(expense)
                        generated += 1

                    sub.last_generated_at = due
                    due = _advance_date(due, sub.cycle)

                sub.next_billing = due
                db.commit()

            except Exception as e:
                errors.append(f"subscription {sub.id}: {e}")
                logger.exception("recurring generation failed for sub %d", sub.id)
                db.rollback()

    return {"processed": processed, "generated": generated, "errors": errors}
