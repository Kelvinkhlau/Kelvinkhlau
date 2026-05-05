"""Budget API routes — 預算管理。"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession, current_user
from app.models.budget import Budget
from app.models.expense import Expense
from app.schemas.budget import BudgetCreate, BudgetOut, BudgetUpdate, BudgetWithSpent

router = APIRouter(dependencies=[Depends(current_user)])


def _month_range(d: date | None = None) -> tuple[date, date]:
    """返回當月第一日同最後一日。"""
    d = d or date.today()
    first = d.replace(day=1)
    if d.month == 12:
        last = d.replace(year=d.year + 1, month=1, day=1)
    else:
        last = d.replace(month=d.month + 1, day=1)
    return first, last


@router.get("", response_model=list[BudgetWithSpent])
async def list_budgets(
    user: CurrentUser, db: DbSession
) -> list[BudgetWithSpent]:
    """列出所有預算 + 當月已用金額。"""
    budgets = list(
        db.execute(
            select(Budget).where(Budget.user_id == user.id).order_by(Budget.category)
        ).scalars().all()
    )

    first, last = _month_range()

    result = []
    for b in budgets:
        spent = db.execute(
            select(func.coalesce(func.sum(Expense.amount), 0)).where(
                Expense.user_id == user.id,
                Expense.category == b.category,
                Expense.spent_at >= first,
                Expense.spent_at < last,
            )
        ).scalar() or 0.0
        spent = float(spent)
        remaining = max(0.0, float(b.amount) - spent)
        pct = (spent / float(b.amount) * 100) if b.amount > 0 else 0.0
        result.append(
            BudgetWithSpent(
                id=b.id,
                category=b.category,
                amount=float(b.amount),
                currency=b.currency,
                created_at=b.created_at,
                updated_at=b.updated_at,
                spent=spent,
                remaining=remaining,
                percentage=round(pct, 1),
            )
        )
    return result


@router.post("", response_model=BudgetOut, status_code=201)
async def create_budget(
    payload: BudgetCreate, user: CurrentUser, db: DbSession
) -> Budget:
    # 同一分類唔可以有兩個 budget
    existing = db.execute(
        select(Budget).where(Budget.user_id == user.id, Budget.category == payload.category)
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail=f"「{payload.category}」已有預算")

    budget = Budget(user_id=user.id, **payload.model_dump())
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return budget


@router.patch("/{budget_id}", response_model=BudgetOut)
async def update_budget(
    budget_id: int, payload: BudgetUpdate, user: CurrentUser, db: DbSession
) -> Budget:
    budget = db.get(Budget, budget_id)
    if budget is None or budget.user_id != user.id:
        raise HTTPException(status_code=404, detail="Budget not found")
    for field in payload.model_fields_set:
        setattr(budget, field, getattr(payload, field))
    db.commit()
    db.refresh(budget)
    return budget


@router.delete("/{budget_id}", status_code=204)
async def delete_budget(
    budget_id: int, user: CurrentUser, db: DbSession
) -> None:
    budget = db.get(Budget, budget_id)
    if budget is None or budget.user_id != user.id:
        raise HTTPException(status_code=404, detail="Budget not found")
    db.delete(budget)
    db.commit()
