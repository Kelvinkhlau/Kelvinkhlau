"""Family members (分帳成員) API routes。"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select

from app.deps import CurrentUser, DbSession, current_user
from app.models.expense import Expense
from app.models.family_member import ExpenseSplit, FamilyMember
from app.schemas.family_member import (
    ExpenseSplitIn,
    ExpenseSplitOut,
    FamilyMemberCreate,
    FamilyMemberOut,
    FamilyMemberUpdate,
)

router = APIRouter(dependencies=[Depends(current_user)])


@router.get("", response_model=list[FamilyMemberOut])
async def list_members(
    user: CurrentUser, db: DbSession, active_only: bool = True
) -> list[FamilyMember]:
    stmt = select(FamilyMember).where(FamilyMember.user_id == user.id)
    if active_only:
        stmt = stmt.where(FamilyMember.is_active.is_(True))
    return list(db.execute(stmt.order_by(FamilyMember.id)).scalars().all())


@router.post("", response_model=FamilyMemberOut, status_code=201)
async def create_member(
    payload: FamilyMemberCreate, user: CurrentUser, db: DbSession
) -> FamilyMember:
    member = FamilyMember(user_id=user.id, **payload.model_dump())
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.patch("/{member_id}", response_model=FamilyMemberOut)
async def update_member(
    member_id: int, payload: FamilyMemberUpdate, user: CurrentUser, db: DbSession
) -> FamilyMember:
    member = db.get(FamilyMember, member_id)
    if member is None or member.user_id != user.id:
        raise HTTPException(status_code=404, detail="Member not found")
    for field in payload.model_fields_set:
        setattr(member, field, getattr(payload, field))
    db.commit()
    db.refresh(member)
    return member


@router.delete("/{member_id}", status_code=204)
async def delete_member(
    member_id: int, user: CurrentUser, db: DbSession
) -> None:
    member = db.get(FamilyMember, member_id)
    if member is None or member.user_id != user.id:
        raise HTTPException(status_code=404, detail="Member not found")
    db.delete(member)
    db.commit()


@router.get("/{member_id}/owed")
async def member_owed(
    member_id: int, user: CurrentUser, db: DbSession
) -> dict:
    """某成員未還嘅分帳總額。"""
    member = db.get(FamilyMember, member_id)
    if member is None or member.user_id != user.id:
        raise HTTPException(status_code=404, detail="Member not found")

    rows = db.execute(
        select(func.coalesce(func.sum(ExpenseSplit.amount), 0))
        .where(
            ExpenseSplit.member_id == member_id,
            ExpenseSplit.is_paid.is_(False),
        )
    ).scalar()

    total = db.execute(
        select(func.coalesce(func.sum(ExpenseSplit.amount), 0))
        .where(ExpenseSplit.member_id == member_id)
    ).scalar()

    return {
        "member_id": member_id,
        "name": member.name,
        "outstanding": float(rows or 0),
        "total": float(total or 0),
    }


# ─── Expense splits ─────────────────────────────────────────
# 呢個 sub-router 唔 mount，只係 export function。實際嵌入 expenses.py 會更 natural。

def attach_splits_to_expense(
    db, expense_id: int, user_id: int, splits: list[ExpenseSplitIn]
) -> list[ExpenseSplit]:
    """內部用 helper — 由 expenses.py 呼叫。"""
    expense = db.get(Expense, expense_id)
    if expense is None or expense.user_id != user_id:
        raise HTTPException(status_code=404, detail="Expense not found")
    # 先刪現有 splits
    db.execute(
        ExpenseSplit.__table__.delete().where(ExpenseSplit.expense_id == expense_id)
    )
    created: list[ExpenseSplit] = []
    for s in splits:
        if s.member_id is not None:
            member = db.get(FamilyMember, s.member_id)
            if member is None or member.user_id != user_id:
                raise HTTPException(status_code=400, detail=f"Member {s.member_id} 不存在")
        split = ExpenseSplit(
            expense_id=expense_id,
            member_id=s.member_id,
            amount=s.amount,
            is_paid=s.is_paid,
        )
        db.add(split)
        created.append(split)
    db.commit()
    return created


@router.get("/splits/by-expense/{expense_id}", response_model=list[ExpenseSplitOut])
async def list_splits_for_expense(
    expense_id: int, user: CurrentUser, db: DbSession
) -> list[ExpenseSplit]:
    expense = db.get(Expense, expense_id)
    if expense is None or expense.user_id != user.id:
        raise HTTPException(status_code=404, detail="Expense not found")
    rows = db.execute(
        select(ExpenseSplit).where(ExpenseSplit.expense_id == expense_id)
    ).scalars().all()
    return list(rows)


@router.post("/splits/by-expense/{expense_id}", response_model=list[ExpenseSplitOut])
async def set_splits_for_expense(
    expense_id: int,
    splits: list[ExpenseSplitIn],
    user: CurrentUser,
    db: DbSession,
) -> list[ExpenseSplit]:
    return attach_splits_to_expense(db, expense_id, user.id, splits)


@router.patch("/splits/{split_id}/mark-paid", response_model=ExpenseSplitOut)
async def mark_split_paid(
    split_id: int, user: CurrentUser, db: DbSession, is_paid: bool = Query(True)
) -> ExpenseSplit:
    split = db.get(ExpenseSplit, split_id)
    if split is None:
        raise HTTPException(status_code=404, detail="Split not found")
    expense = db.get(Expense, split.expense_id)
    if expense is None or expense.user_id != user.id:
        raise HTTPException(status_code=404, detail="Split not found")
    split.is_paid = is_paid
    db.commit()
    db.refresh(split)
    return split
