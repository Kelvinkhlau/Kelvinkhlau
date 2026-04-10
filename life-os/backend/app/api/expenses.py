"""Expense API routes — CRUD + 統計。"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, extract, func, select

from app.deps import CurrentUser, DbSession, current_user
from app.models.expense import Expense
from app.schemas.expense import ExpenseCreate, ExpenseOut, ExpenseStats, ExpenseUpdate
from app.services.audit import log_action

router = APIRouter(dependencies=[Depends(current_user)])


@router.get("", response_model=list[ExpenseOut])
async def list_expenses(
    user: CurrentUser,
    db: DbSession,
    category: str | None = Query(None, description="篩選分類"),
    date_from: date | None = Query(None, description="開始日期"),
    date_to: date | None = Query(None, description="結束日期"),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
) -> list[Expense]:
    """列出消費記錄 — 按 spent_at 倒序。"""
    stmt = (
        select(Expense)
        .where(Expense.user_id == user.id)
        .order_by(desc(Expense.spent_at), desc(Expense.id))
        .limit(limit)
        .offset(offset)
    )
    if category:
        stmt = stmt.where(Expense.category == category)
    if date_from:
        stmt = stmt.where(Expense.spent_at >= date_from)
    if date_to:
        stmt = stmt.where(Expense.spent_at <= date_to)
    return list(db.execute(stmt).scalars().all())


@router.get("/stats", response_model=ExpenseStats)
async def expense_stats(
    user: CurrentUser,
    db: DbSession,
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
) -> ExpenseStats:
    """消費統計 — 總額 + 分類小計。"""
    base = select(Expense).where(Expense.user_id == user.id)
    if date_from:
        base = base.where(Expense.spent_at >= date_from)
    if date_to:
        base = base.where(Expense.spent_at <= date_to)

    # Total + count
    total_stmt = select(
        func.coalesce(func.sum(Expense.amount), 0),
        func.count(Expense.id),
    ).where(Expense.user_id == user.id)
    if date_from:
        total_stmt = total_stmt.where(Expense.spent_at >= date_from)
    if date_to:
        total_stmt = total_stmt.where(Expense.spent_at <= date_to)
    row = db.execute(total_stmt).one()
    total = float(row[0])
    count = int(row[1])

    # By category
    cat_stmt = (
        select(Expense.category, func.sum(Expense.amount))
        .where(Expense.user_id == user.id)
        .group_by(Expense.category)
    )
    if date_from:
        cat_stmt = cat_stmt.where(Expense.spent_at >= date_from)
    if date_to:
        cat_stmt = cat_stmt.where(Expense.spent_at <= date_to)
    by_category = {cat: float(amt) for cat, amt in db.execute(cat_stmt).all()}

    return ExpenseStats(total=total, count=count, by_category=by_category)


@router.get("/monthly")
async def expense_monthly(
    user: CurrentUser,
    db: DbSession,
    months: int = Query(6, ge=1, le=24, description="過去幾個月"),
) -> list[dict]:
    """每月消費彙總 — 用嚟畫趨勢圖。"""
    stmt = (
        select(
            extract("year", Expense.spent_at).label("year"),
            extract("month", Expense.spent_at).label("month"),
            func.sum(Expense.amount),
            func.count(Expense.id),
        )
        .where(Expense.user_id == user.id)
        .group_by("year", "month")
        .order_by(desc("year"), desc("month"))
        .limit(months)
    )
    rows = db.execute(stmt).all()
    return [
        {
            "year": int(y),
            "month": int(m),
            "total": float(t),
            "count": int(c),
        }
        for y, m, t, c in reversed(rows)
    ]


@router.post("", response_model=ExpenseOut, status_code=201)
async def create_expense(
    payload: ExpenseCreate, user: CurrentUser, db: DbSession
) -> Expense:
    expense = Expense(
        user_id=user.id,
        amount=payload.amount,
        currency=payload.currency,
        category=payload.category.strip(),
        description=payload.description,
        merchant=payload.merchant,
        payment_method=payload.payment_method,
        spent_at=payload.spent_at,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    log_action(db, action="create", user_id=user.id, resource_type="expense", resource_id=expense.id, detail=f"${expense.amount} {expense.category}")
    return expense


@router.get("/{expense_id}", response_model=ExpenseOut)
async def get_expense(
    expense_id: int, user: CurrentUser, db: DbSession
) -> Expense:
    expense = db.get(Expense, expense_id)
    if expense is None or expense.user_id != user.id:
        raise HTTPException(status_code=404, detail="Expense not found")
    return expense


@router.patch("/{expense_id}", response_model=ExpenseOut)
async def update_expense(
    expense_id: int, payload: ExpenseUpdate, user: CurrentUser, db: DbSession
) -> Expense:
    expense = db.get(Expense, expense_id)
    if expense is None or expense.user_id != user.id:
        raise HTTPException(status_code=404, detail="Expense not found")

    for field in payload.model_fields_set:
        value = getattr(payload, field)
        if field == "category" and value is not None:
            value = value.strip()
        setattr(expense, field, value)

    db.commit()
    db.refresh(expense)
    return expense


@router.delete("/{expense_id}", status_code=204)
async def delete_expense(
    expense_id: int, user: CurrentUser, db: DbSession
) -> None:
    expense = db.get(Expense, expense_id)
    if expense is None or expense.user_id != user.id:
        raise HTTPException(status_code=404, detail="Expense not found")
    detail = f"${expense.amount} {expense.category}"
    db.delete(expense)
    db.commit()
    log_action(db, action="delete", user_id=user.id, resource_type="expense", resource_id=expense_id, detail=detail)
