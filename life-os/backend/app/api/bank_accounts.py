"""Bank Account API routes — 銀行賬戶 / 信用卡 / 電子錢包 / 現金 / 證券戶口 CRUD。"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import CurrentUser, DbSession, current_user
from app.models.bank_account import BankAccount
from app.models.brokerage_cash_balance import BrokerageCashBalance
from app.schemas.bank_account import (
    BankAccountCreate,
    BankAccountOut,
    BankAccountUpdate,
    BankPreset,
    CashBalanceItem,
    CashBalanceUpsert,
    HoldingBreakdownItem,
)
from app.services.stock_portfolio import holdings_by_currency

router = APIRouter(dependencies=[Depends(current_user)])

BROKERAGE_TYPE = "brokerage"

# ── 香港常用銀行 / 支付方式預設 ─────────────────────────
HK_PRESETS: list[BankPreset] = [
    # 傳統銀行
    BankPreset(name="HSBC 儲蓄", bank="HSBC", account_type="savings", icon="🏦", color="#DB0011"),
    BankPreset(name="HSBC 信用卡", bank="HSBC", account_type="credit", icon="💳", color="#DB0011"),
    BankPreset(name="恒生銀行", bank="恒生", account_type="savings", icon="🏦", color="#00A651"),
    BankPreset(name="恒生信用卡", bank="恒生", account_type="credit", icon="💳", color="#00A651"),
    BankPreset(name="中銀香港", bank="中銀", account_type="savings", icon="🏦", color="#C8102E"),
    BankPreset(name="中銀信用卡", bank="中銀", account_type="credit", icon="💳", color="#C8102E"),
    BankPreset(name="渣打銀行", bank="渣打", account_type="savings", icon="🏦", color="#0072AA"),
    BankPreset(name="渣打信用卡", bank="渣打", account_type="credit", icon="💳", color="#0072AA"),
    BankPreset(name="DBS 星展銀行", bank="DBS", account_type="savings", icon="🏦", color="#E31937"),
    BankPreset(name="DBS 信用卡", bank="DBS", account_type="credit", icon="💳", color="#E31937"),
    BankPreset(name="東亞銀行", bank="東亞", account_type="savings", icon="🏦", color="#002B5C"),
    BankPreset(name="花旗銀行", bank="Citibank", account_type="savings", icon="🏦", color="#003B70"),
    BankPreset(name="中信銀行", bank="中信", account_type="savings", icon="🏦", color="#E60012"),
    BankPreset(name="大新銀行", bank="大新", account_type="savings", icon="🏦", color="#009CDE"),
    BankPreset(name="交通銀行", bank="交通", account_type="savings", icon="🏦", color="#00247D"),
    BankPreset(name="工銀亞洲", bank="工銀亞洲", account_type="savings", icon="🏦", color="#C8102E"),
    BankPreset(name="招商永隆", bank="招商永隆", account_type="savings", icon="🏦", color="#C8102E"),
    # 虛擬銀行
    BankPreset(name="ZA Bank", bank="ZA Bank", account_type="savings", icon="🟣", color="#6C3EF5"),
    BankPreset(name="Mox Bank", bank="Mox", account_type="savings", icon="🟠", color="#FF6B35"),
    BankPreset(name="WeLab Bank", bank="WeLab", account_type="savings", icon="🟢", color="#00C48C"),
    BankPreset(name="livi Bank", bank="livi", account_type="savings", icon="🔵", color="#0066FF"),
    BankPreset(name="Airstar 天星銀行", bank="天星", account_type="savings", icon="⭐", color="#FFB800"),
    BankPreset(name="Fusion Bank 富融", bank="富融", account_type="savings", icon="🟡", color="#F5A623"),
    BankPreset(name="PAO Bank 平安壹賬通", bank="PAO", account_type="savings", icon="🔴", color="#FA541C"),
    BankPreset(name="Ant Bank 螞蟻銀行", bank="螞蟻", account_type="savings", icon="🐜", color="#1677FF"),
    # 電子錢包
    BankPreset(name="PayMe", bank="PayMe", account_type="ewallet", icon="💜", color="#DB0011"),
    BankPreset(name="八達通", bank="八達通", account_type="ewallet", icon="🟡", color="#F5A623"),
    BankPreset(name="支付寶 HK", bank="支付寶", account_type="ewallet", icon="🔵", color="#1677FF"),
    BankPreset(name="WeChat Pay HK", bank="WeChat Pay", account_type="ewallet", icon="🟢", color="#07C160"),
    BankPreset(name="Tap & Go", bank="Tap & Go", account_type="ewallet", icon="🟠", color="#FF6B00"),
    BankPreset(name="BoC Pay", bank="BoC Pay", account_type="ewallet", icon="🔴", color="#C8102E"),
    BankPreset(name="Apple Pay", bank="Apple Pay", account_type="ewallet", icon="🍎", color="#333333"),
    BankPreset(name="Google Pay", bank="Google Pay", account_type="ewallet", icon="🌈", color="#4285F4"),
    # 現金
    BankPreset(name="現金 HKD", bank="現金", account_type="cash", icon="💵", color="#22C55E"),
    BankPreset(name="現金 RMB", bank="現金", account_type="cash", icon="💴", color="#EF4444"),
    BankPreset(name="現金 USD", bank="現金", account_type="cash", icon="💵", color="#3B82F6"),
    # 證券戶口（brokerage）— 支援多幣種現金 + 子帳戶
    BankPreset(name="富途證券 HK", bank="富途", account_type="brokerage", icon="📈", color="#FF6B00"),
    BankPreset(name="老虎證券", bank="老虎", account_type="brokerage", icon="🐯", color="#F5A623"),
    BankPreset(name="盈透證券 IBKR", bank="IBKR", account_type="brokerage", icon="📊", color="#D81E05"),
    BankPreset(name="moomoo", bank="moomoo", account_type="brokerage", icon="🐮", color="#1677FF"),
    BankPreset(name="華盛證券", bank="華盛", account_type="brokerage", icon="📈", color="#E60012"),
    BankPreset(name="HSBC 證券", bank="HSBC", account_type="brokerage", icon="📈", color="#DB0011"),
    BankPreset(name="輝立證券", bank="輝立", account_type="brokerage", icon="📈", color="#003B70"),
    BankPreset(name="耀才證券", bank="耀才", account_type="brokerage", icon="📈", color="#C8102E"),
]


# ─── helpers ──────────────────────────────────────────────────


def _get_owned_account(db: Session, account_id: int, user_id: int) -> BankAccount:
    account = db.get(BankAccount, account_id)
    if account is None or account.user_id != user_id:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


def _validate_parent(
    db: Session, parent_id: int | None, user_id: int, self_id: int | None = None
) -> None:
    """Parent 必須係：本人擁有 + brokerage type + 自己唔係 child（無 grandchildren）。"""
    if parent_id is None:
        return
    if self_id is not None and parent_id == self_id:
        raise HTTPException(status_code=400, detail="Parent 唔可以係自己")
    parent = db.get(BankAccount, parent_id)
    if parent is None or parent.user_id != user_id:
        raise HTTPException(status_code=404, detail="Parent account 唔存在")
    if parent.account_type != BROKERAGE_TYPE:
        raise HTTPException(status_code=400, detail="只有證券戶口可以做 parent")
    if parent.parent_account_id is not None:
        raise HTTPException(status_code=400, detail="唔支援多層子帳戶（grandchild）")


def _serialize(db: Session, account: BankAccount) -> BankAccountOut:
    """將 ORM model 轉成 BankAccountOut，brokerage 額外加 cash + holdings breakdown。"""
    out = BankAccountOut.model_validate(account)
    if account.account_type == BROKERAGE_TYPE:
        cash_rows = list(
            db.execute(
                select(BrokerageCashBalance)
                .where(BrokerageCashBalance.account_id == account.id)
                .order_by(BrokerageCashBalance.currency)
            ).scalars()
        )
        out.cash_balances = [
            CashBalanceItem(currency=c.currency, amount=float(c.amount)) for c in cash_rows
        ]
        breakdown = holdings_by_currency(db, account.id)
        out.holdings_by_currency = [
            HoldingBreakdownItem(currency=k, market_value=v)
            for k, v in sorted(breakdown.items())
        ]
    return out


# ─── presets ─────────────────────────────────────────────────


@router.get("/presets", response_model=list[BankPreset])
async def list_presets() -> list[BankPreset]:
    """列出預設嘅香港銀行 / 支付方式 — 方便用戶快速新增。"""
    return HK_PRESETS


# ─── account CRUD ────────────────────────────────────────────


@router.get("", response_model=list[BankAccountOut])
async def list_bank_accounts(
    user: CurrentUser,
    db: DbSession,
    active_only: bool = True,
) -> list[BankAccountOut]:
    stmt = select(BankAccount).where(BankAccount.user_id == user.id)
    if active_only:
        stmt = stmt.where(BankAccount.is_active == True)  # noqa: E712
    stmt = stmt.order_by(BankAccount.sort_order, BankAccount.bank)
    accounts = list(db.execute(stmt).scalars().all())
    return [_serialize(db, a) for a in accounts]


@router.post("", response_model=BankAccountOut, status_code=201)
async def create_bank_account(
    payload: BankAccountCreate, user: CurrentUser, db: DbSession
) -> BankAccountOut:
    _validate_parent(db, payload.parent_account_id, user.id)
    account = BankAccount(user_id=user.id, **payload.model_dump())
    db.add(account)
    db.commit()
    db.refresh(account)
    return _serialize(db, account)


@router.patch("/{account_id}", response_model=BankAccountOut)
async def update_bank_account(
    account_id: int, payload: BankAccountUpdate, user: CurrentUser, db: DbSession
) -> BankAccountOut:
    account = _get_owned_account(db, account_id, user.id)
    if "parent_account_id" in payload.model_fields_set:
        _validate_parent(db, payload.parent_account_id, user.id, self_id=account.id)
    for field in payload.model_fields_set:
        setattr(account, field, getattr(payload, field))
    db.commit()
    db.refresh(account)
    return _serialize(db, account)


@router.delete("/{account_id}", status_code=204)
async def delete_bank_account(
    account_id: int, user: CurrentUser, db: DbSession
) -> None:
    account = _get_owned_account(db, account_id, user.id)
    db.delete(account)
    db.commit()


# ─── brokerage cash balances ─────────────────────────────────


@router.get("/{account_id}/cash", response_model=list[CashBalanceItem])
async def list_cash_balances(
    account_id: int, user: CurrentUser, db: DbSession
) -> list[CashBalanceItem]:
    account = _get_owned_account(db, account_id, user.id)
    if account.account_type != BROKERAGE_TYPE:
        raise HTTPException(status_code=400, detail="只有證券戶口先有現金結餘")
    rows = list(
        db.execute(
            select(BrokerageCashBalance)
            .where(BrokerageCashBalance.account_id == account_id)
            .order_by(BrokerageCashBalance.currency)
        ).scalars()
    )
    return [CashBalanceItem(currency=r.currency, amount=float(r.amount)) for r in rows]


@router.put("/{account_id}/cash", response_model=CashBalanceItem)
async def upsert_cash_balance(
    account_id: int,
    payload: CashBalanceUpsert,
    user: CurrentUser,
    db: DbSession,
) -> CashBalanceItem:
    """Set 一個幣種嘅現金結餘（upsert by currency）。"""
    account = _get_owned_account(db, account_id, user.id)
    if account.account_type != BROKERAGE_TYPE:
        raise HTTPException(status_code=400, detail="只有證券戶口先可以 set 現金")
    currency = payload.currency.upper()
    existing = db.execute(
        select(BrokerageCashBalance).where(
            BrokerageCashBalance.account_id == account_id,
            BrokerageCashBalance.currency == currency,
        )
    ).scalar_one_or_none()
    if existing is None:
        existing = BrokerageCashBalance(
            account_id=account_id, currency=currency, amount=payload.amount
        )
        db.add(existing)
    else:
        existing.amount = payload.amount
    db.commit()
    db.refresh(existing)
    return CashBalanceItem(currency=existing.currency, amount=float(existing.amount))


@router.delete("/{account_id}/cash/{currency}", status_code=204)
async def delete_cash_balance(
    account_id: int,
    currency: str,
    user: CurrentUser,
    db: DbSession,
) -> None:
    account = _get_owned_account(db, account_id, user.id)
    if account.account_type != BROKERAGE_TYPE:
        raise HTTPException(status_code=400, detail="只有證券戶口先有現金結餘")
    row = db.execute(
        select(BrokerageCashBalance).where(
            BrokerageCashBalance.account_id == account_id,
            BrokerageCashBalance.currency == currency.upper(),
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="幣種唔存在")
    db.delete(row)
    db.commit()
