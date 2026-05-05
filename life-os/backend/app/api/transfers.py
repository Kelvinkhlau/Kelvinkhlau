"""Transfer API routes — 戶口之間轉賬（包括還卡數）。

轉賬唔係消費記錄：
- 唔計入 expense stats / budgets / 月度趨勢 / AI summary
- 只會自動調整兩邊戶口嘅 balance
- 刪除時會反向 rollback balance
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select

from app.deps import CurrentUser, DbSession, current_user
from app.models.bank_account import BankAccount
from app.models.transfer import Transfer
from app.schemas.transfer import TransferCreate, TransferOut
from app.services.audit import log_action

router = APIRouter(dependencies=[Depends(current_user)])


def _serialize(transfer: Transfer, accounts: dict[int, BankAccount]) -> dict:
    """Build TransferOut dict with denormalized 戶口 fields。"""
    fa = accounts.get(transfer.from_account_id)
    ta = accounts.get(transfer.to_account_id)
    return {
        "id": transfer.id,
        "from_account_id": transfer.from_account_id,
        "to_account_id": transfer.to_account_id,
        "amount": float(transfer.amount),
        "currency": transfer.currency,
        "note": transfer.note,
        "transferred_at": transfer.transferred_at,
        "from_account_name": fa.name if fa else None,
        "from_account_icon": fa.icon if fa else None,
        "from_account_type": fa.account_type if fa else None,
        "to_account_name": ta.name if ta else None,
        "to_account_icon": ta.icon if ta else None,
        "to_account_type": ta.account_type if ta else None,
        "created_at": transfer.created_at,
    }


@router.get("", response_model=list[TransferOut])
async def list_transfers(
    user: CurrentUser,
    db: DbSession,
    account_id: int | None = Query(None, description="只顯示涉及此戶口嘅轉賬"),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
) -> list[dict]:
    """列出轉賬記錄 — 按 transferred_at 倒序。"""
    stmt = (
        select(Transfer)
        .where(Transfer.user_id == user.id)
        .order_by(desc(Transfer.transferred_at), desc(Transfer.id))
        .limit(limit)
        .offset(offset)
    )
    if account_id:
        stmt = stmt.where(
            (Transfer.from_account_id == account_id)
            | (Transfer.to_account_id == account_id)
        )
    if date_from:
        stmt = stmt.where(Transfer.transferred_at >= date_from)
    if date_to:
        stmt = stmt.where(Transfer.transferred_at <= date_to)

    transfers = list(db.execute(stmt).scalars().all())

    # Batch fetch 涉及嘅戶口，避免 N+1
    account_ids: set[int] = set()
    for t in transfers:
        account_ids.add(t.from_account_id)
        account_ids.add(t.to_account_id)
    accounts: dict[int, BankAccount] = {}
    if account_ids:
        rows = db.execute(
            select(BankAccount).where(BankAccount.id.in_(account_ids))
        ).scalars().all()
        accounts = {a.id: a for a in rows}

    return [_serialize(t, accounts) for t in transfers]


@router.post("", response_model=TransferOut, status_code=201)
async def create_transfer(
    payload: TransferCreate, user: CurrentUser, db: DbSession
) -> dict:
    """建立轉賬並同步更新兩邊戶口 balance。"""
    if payload.from_account_id == payload.to_account_id:
        raise HTTPException(status_code=400, detail="兩個戶口唔可以相同")

    from_acc = db.get(BankAccount, payload.from_account_id)
    to_acc = db.get(BankAccount, payload.to_account_id)
    if from_acc is None or from_acc.user_id != user.id:
        raise HTTPException(status_code=404, detail="出賬戶口不存在")
    if to_acc is None or to_acc.user_id != user.id:
        raise HTTPException(status_code=404, detail="入賬戶口不存在")

    if from_acc.currency != to_acc.currency:
        raise HTTPException(
            status_code=400,
            detail=f"暫不支援跨貨幣轉賬（{from_acc.currency} → {to_acc.currency}）",
        )

    currency = (payload.currency or from_acc.currency).upper()
    if currency != from_acc.currency:
        raise HTTPException(
            status_code=400,
            detail=f"貨幣 {currency} 同戶口 {from_acc.currency} 唔 match",
        )

    transfer = Transfer(
        user_id=user.id,
        from_account_id=payload.from_account_id,
        to_account_id=payload.to_account_id,
        amount=payload.amount,
        currency=currency,
        note=payload.note,
        transferred_at=payload.transferred_at,
    )
    db.add(transfer)

    # 調整 balance
    # 對稱邏輯 — 對信用卡還款都 work：
    #   卡 balance 正數 = 欠款金額，from bank 扣 → to credit 加 → 欠款減少 ✓
    from_acc.balance = float(from_acc.balance) - payload.amount
    to_acc.balance = float(to_acc.balance) + payload.amount

    db.commit()
    db.refresh(transfer)

    log_action(
        db,
        action="create",
        user_id=user.id,
        resource_type="transfer",
        resource_id=transfer.id,
        detail=f"${payload.amount} {from_acc.name} → {to_acc.name}",
    )

    return _serialize(transfer, {from_acc.id: from_acc, to_acc.id: to_acc})


@router.delete("/{transfer_id}", status_code=204)
async def delete_transfer(
    transfer_id: int, user: CurrentUser, db: DbSession
) -> None:
    """刪除轉賬並反向 rollback balance。"""
    transfer = db.get(Transfer, transfer_id)
    if transfer is None or transfer.user_id != user.id:
        raise HTTPException(status_code=404, detail="Transfer not found")

    from_acc = db.get(BankAccount, transfer.from_account_id)
    to_acc = db.get(BankAccount, transfer.to_account_id)

    # 反向調整（即使戶口已經 soft delete 都要處理返，避免數字走位）
    if from_acc is not None:
        from_acc.balance = float(from_acc.balance) + float(transfer.amount)
    if to_acc is not None:
        to_acc.balance = float(to_acc.balance) - float(transfer.amount)

    detail = (
        f"${transfer.amount} "
        f"{from_acc.name if from_acc else '?'} → {to_acc.name if to_acc else '?'}"
    )
    db.delete(transfer)
    db.commit()

    log_action(
        db,
        action="delete",
        user_id=user.id,
        resource_type="transfer",
        resource_id=transfer_id,
        detail=detail,
    )
