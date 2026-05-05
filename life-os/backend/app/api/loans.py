"""Loan (借貸) API routes。"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select

from app.deps import CurrentUser, DbSession, current_user
from app.models.loan import Loan, LoanRepayment
from app.schemas.loan import (
    LoanCreate,
    LoanDetail,
    LoanOut,
    LoanRepaymentCreate,
    LoanRepaymentOut,
    LoanUpdate,
)

router = APIRouter(dependencies=[Depends(current_user)])


def _to_detail(loan: Loan, repayments: list[LoanRepayment]) -> dict:
    outstanding = float(loan.amount) - float(loan.repaid_amount)
    return {
        **{c.name: getattr(loan, c.name) for c in loan.__table__.columns},
        "repayments": [
            {c.name: getattr(r, c.name) for c in r.__table__.columns}
            for r in repayments
        ],
        "outstanding": max(outstanding, 0.0),
    }


@router.get("", response_model=list[LoanOut])
async def list_loans(
    user: CurrentUser,
    db: DbSession,
    direction: str | None = Query(None, description="lent | borrowed"),
    status: str | None = Query(None, description="active | settled | overdue"),
) -> list[Loan]:
    stmt = select(Loan).where(Loan.user_id == user.id)
    if direction:
        stmt = stmt.where(Loan.direction == direction)
    if status:
        stmt = stmt.where(Loan.status == status)
    stmt = stmt.order_by(desc(Loan.started_at), desc(Loan.id))
    return list(db.execute(stmt).scalars().all())


@router.get("/summary")
async def loan_summary(user: CurrentUser, db: DbSession) -> dict:
    """借出 vs 借入總額。"""
    rows = db.execute(
        select(
            Loan.direction,
            func.coalesce(func.sum(Loan.amount - Loan.repaid_amount), 0),
            func.count(Loan.id),
        ).where(Loan.user_id == user.id, Loan.status != "settled").group_by(Loan.direction)
    ).all()
    out = {"lent_outstanding": 0.0, "borrowed_outstanding": 0.0, "lent_count": 0, "borrowed_count": 0}
    for direction, outstanding, cnt in rows:
        if direction == "lent":
            out["lent_outstanding"] = float(outstanding)
            out["lent_count"] = int(cnt)
        elif direction == "borrowed":
            out["borrowed_outstanding"] = float(outstanding)
            out["borrowed_count"] = int(cnt)
    return out


@router.get("/{loan_id}", response_model=LoanDetail)
async def get_loan(loan_id: int, user: CurrentUser, db: DbSession) -> dict:
    loan = db.get(Loan, loan_id)
    if loan is None or loan.user_id != user.id:
        raise HTTPException(status_code=404, detail="Loan not found")
    repayments = list(
        db.execute(
            select(LoanRepayment)
            .where(LoanRepayment.loan_id == loan_id)
            .order_by(desc(LoanRepayment.paid_at), desc(LoanRepayment.id))
        ).scalars().all()
    )
    return _to_detail(loan, repayments)


@router.post("", response_model=LoanOut, status_code=201)
async def create_loan(
    payload: LoanCreate, user: CurrentUser, db: DbSession
) -> Loan:
    loan = Loan(user_id=user.id, **payload.model_dump())
    db.add(loan)
    db.commit()
    db.refresh(loan)
    return loan


@router.patch("/{loan_id}", response_model=LoanOut)
async def update_loan(
    loan_id: int, payload: LoanUpdate, user: CurrentUser, db: DbSession
) -> Loan:
    loan = db.get(Loan, loan_id)
    if loan is None or loan.user_id != user.id:
        raise HTTPException(status_code=404, detail="Loan not found")
    for field in payload.model_fields_set:
        setattr(loan, field, getattr(payload, field))
    db.commit()
    db.refresh(loan)
    return loan


@router.delete("/{loan_id}", status_code=204)
async def delete_loan(loan_id: int, user: CurrentUser, db: DbSession) -> None:
    loan = db.get(Loan, loan_id)
    if loan is None or loan.user_id != user.id:
        raise HTTPException(status_code=404, detail="Loan not found")
    db.delete(loan)
    db.commit()


@router.post("/{loan_id}/repayments", response_model=LoanRepaymentOut, status_code=201)
async def add_repayment(
    loan_id: int,
    payload: LoanRepaymentCreate,
    user: CurrentUser,
    db: DbSession,
) -> LoanRepayment:
    loan = db.get(Loan, loan_id)
    if loan is None or loan.user_id != user.id:
        raise HTTPException(status_code=404, detail="Loan not found")

    repayment = LoanRepayment(
        loan_id=loan_id,
        user_id=user.id,
        **payload.model_dump(),
    )
    db.add(repayment)

    # 更新 loan.repaid_amount
    new_repaid = float(loan.repaid_amount) + float(payload.amount)
    loan.repaid_amount = new_repaid
    if new_repaid >= float(loan.amount):
        loan.status = "settled"
        loan.settled_at = payload.paid_at

    db.commit()
    db.refresh(repayment)
    return repayment


@router.delete("/{loan_id}/repayments/{repayment_id}", status_code=204)
async def delete_repayment(
    loan_id: int, repayment_id: int, user: CurrentUser, db: DbSession
) -> None:
    loan = db.get(Loan, loan_id)
    if loan is None or loan.user_id != user.id:
        raise HTTPException(status_code=404, detail="Loan not found")
    repayment = db.get(LoanRepayment, repayment_id)
    if repayment is None or repayment.loan_id != loan_id:
        raise HTTPException(status_code=404, detail="Repayment not found")
    loan.repaid_amount = max(0.0, float(loan.repaid_amount) - float(repayment.amount))
    if float(loan.repaid_amount) < float(loan.amount):
        loan.status = "active"
        loan.settled_at = None
    db.delete(repayment)
    db.commit()
