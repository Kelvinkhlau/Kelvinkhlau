"""Stock holdings API — brokerage 戶口入面嘅持倉 CRUD + quote refresh。"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.db import SessionLocal
from app.deps import CurrentUser, DbSession, current_user
from app.models.bank_account import BankAccount
from app.models.stock_holding import StockHolding
from app.schemas.stock_holding import (
    StockHoldingCreate,
    StockHoldingOut,
    StockHoldingUpdate,
    StockRefreshResult,
)
from app.services import stock_portfolio, stock_quote

router = APIRouter(dependencies=[Depends(current_user)])


def _owned_account(db, account_id: int, user_id: int) -> BankAccount:
    account = db.get(BankAccount, account_id)
    if account is None or account.user_id != user_id:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.account_type != stock_portfolio.BROKERAGE_TYPE:
        raise HTTPException(
            status_code=400, detail="Account is not a brokerage account"
        )
    return account


def _owned_holding(db, holding_id: int, user_id: int) -> StockHolding:
    holding = db.get(StockHolding, holding_id)
    if holding is None:
        raise HTTPException(status_code=404, detail="Holding not found")
    account = db.get(BankAccount, holding.account_id)
    if account is None or account.user_id != user_id:
        raise HTTPException(status_code=404, detail="Holding not found")
    return holding


@router.get("", response_model=list[StockHoldingOut])
async def list_holdings(
    user: CurrentUser, db: DbSession, account_id: int | None = None
) -> list[StockHolding]:
    """列出 user 所有 stock holdings — 可以用 account_id filter。"""
    stmt = (
        select(StockHolding)
        .join(BankAccount, BankAccount.id == StockHolding.account_id)
        .where(BankAccount.user_id == user.id)
        .order_by(StockHolding.account_id, StockHolding.symbol)
    )
    if account_id is not None:
        stmt = stmt.where(StockHolding.account_id == account_id)
    return list(db.execute(stmt).scalars().all())


@router.post("", response_model=StockHoldingOut, status_code=201)
async def create_holding(
    payload: StockHoldingCreate, user: CurrentUser, db: DbSession
) -> StockHolding:
    account = _owned_account(db, payload.account_id, user.id)

    holding = StockHolding(
        account_id=account.id,
        symbol=payload.symbol.strip().upper(),
        name=payload.name,
        quantity=payload.quantity,
        avg_cost=payload.avg_cost,
        currency=(payload.currency or account.currency or "HKD").upper(),
    )

    # 即刻 fetch 一次 quote，慳得用戶等 scheduler
    quote = stock_quote.fetch_quote(holding.symbol)
    if quote is not None:
        holding.last_price = quote.price
        holding.last_price_at = datetime.now(UTC)
        if not holding.name:
            holding.name = quote.short_name
        if not holding.currency:
            holding.currency = quote.currency

    db.add(holding)
    db.flush()
    stock_portfolio.recompute_account_balance(db, account.id)
    db.commit()
    db.refresh(holding)
    return holding


@router.patch("/{holding_id}", response_model=StockHoldingOut)
async def update_holding(
    holding_id: int,
    payload: StockHoldingUpdate,
    user: CurrentUser,
    db: DbSession,
) -> StockHolding:
    holding = _owned_holding(db, holding_id, user.id)
    data = payload.model_dump(exclude_unset=True)
    if "symbol" in data and data["symbol"]:
        data["symbol"] = data["symbol"].strip().upper()
    if "currency" in data and data["currency"]:
        data["currency"] = data["currency"].upper()
    for k, v in data.items():
        setattr(holding, k, v)

    db.flush()
    stock_portfolio.recompute_account_balance(db, holding.account_id)
    db.commit()
    db.refresh(holding)
    return holding


@router.delete("/{holding_id}", status_code=204)
async def delete_holding(
    holding_id: int, user: CurrentUser, db: DbSession
) -> None:
    holding = _owned_holding(db, holding_id, user.id)
    account_id = holding.account_id
    db.delete(holding)
    db.flush()
    stock_portfolio.recompute_account_balance(db, account_id)
    db.commit()


@router.post("/refresh", response_model=StockRefreshResult)
async def refresh_quotes(user: CurrentUser, db: DbSession) -> StockRefreshResult:
    """手動觸發 quote refresh — 拉所有 user 嘅 holding，update last_price + balance。"""
    # 為咗保持單用戶 simplicity，refresh 全部 holdings（all users）
    result = stock_portfolio.refresh_all_holdings(db)
    return StockRefreshResult(**result)


# ── 為 scheduler 用嘅內部 helper（唔受 router auth 影響） ──
def scheduled_refresh() -> None:
    """APScheduler job entry — 拉 quote + 更新 balance。"""
    db = SessionLocal()
    try:
        stock_portfolio.refresh_all_holdings(db)
    finally:
        db.close()
