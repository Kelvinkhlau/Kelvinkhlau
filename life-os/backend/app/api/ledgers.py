"""Ledger (多帳本) API routes。"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select

from app.deps import CurrentUser, DbSession, current_user
from app.models.ledger import Ledger
from app.schemas.ledger import LedgerCreate, LedgerOut, LedgerUpdate

router = APIRouter(dependencies=[Depends(current_user)])


def _ensure_default_ledger(db, user_id: int) -> Ledger:
    """如果 user 冇任何 ledger，自動建一個「日常」default ledger。"""
    existing = db.execute(
        select(Ledger).where(Ledger.user_id == user_id).limit(1)
    ).scalar_one_or_none()
    if existing:
        return existing
    default = Ledger(
        user_id=user_id,
        name="日常",
        icon="🏠",
        is_default=True,
        sort_order=0,
    )
    db.add(default)
    db.commit()
    db.refresh(default)
    return default


@router.get("", response_model=list[LedgerOut])
async def list_ledgers(
    user: CurrentUser, db: DbSession, active_only: bool = False
) -> list[Ledger]:
    # 確保至少有一個 default ledger
    _ensure_default_ledger(db, user.id)
    stmt = select(Ledger).where(Ledger.user_id == user.id)
    if active_only:
        stmt = stmt.where(Ledger.is_active.is_(True))
    stmt = stmt.order_by(desc(Ledger.is_default), Ledger.sort_order, Ledger.id)
    return list(db.execute(stmt).scalars().all())


@router.post("", response_model=LedgerOut, status_code=201)
async def create_ledger(
    payload: LedgerCreate, user: CurrentUser, db: DbSession
) -> Ledger:
    # 若 is_default=True 則把其他 ledger 設為非 default
    if payload.is_default:
        db.execute(
            select(Ledger).where(Ledger.user_id == user.id, Ledger.is_default.is_(True))
        )
        for led in db.execute(
            select(Ledger).where(Ledger.user_id == user.id, Ledger.is_default.is_(True))
        ).scalars().all():
            led.is_default = False
    ledger = Ledger(user_id=user.id, **payload.model_dump())
    db.add(ledger)
    db.commit()
    db.refresh(ledger)
    return ledger


@router.patch("/{ledger_id}", response_model=LedgerOut)
async def update_ledger(
    ledger_id: int, payload: LedgerUpdate, user: CurrentUser, db: DbSession
) -> Ledger:
    ledger = db.get(Ledger, ledger_id)
    if ledger is None or ledger.user_id != user.id:
        raise HTTPException(status_code=404, detail="Ledger not found")
    if payload.is_default:
        # 把其他 ledger 設為非 default
        for led in db.execute(
            select(Ledger).where(
                Ledger.user_id == user.id,
                Ledger.is_default.is_(True),
                Ledger.id != ledger_id,
            )
        ).scalars().all():
            led.is_default = False
    for field in payload.model_fields_set:
        setattr(ledger, field, getattr(payload, field))
    db.commit()
    db.refresh(ledger)
    return ledger


@router.delete("/{ledger_id}", status_code=204)
async def delete_ledger(
    ledger_id: int, user: CurrentUser, db: DbSession
) -> None:
    ledger = db.get(Ledger, ledger_id)
    if ledger is None or ledger.user_id != user.id:
        raise HTTPException(status_code=404, detail="Ledger not found")
    if ledger.is_default:
        raise HTTPException(status_code=400, detail="唔可以刪除預設 ledger")
    db.delete(ledger)
    db.commit()
