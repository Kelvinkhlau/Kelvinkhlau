"""Stock portfolio helpers — balance recompute + bulk refresh。"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.bank_account import BankAccount
from app.models.stock_holding import StockHolding
from app.services import stock_quote

logger = logging.getLogger(__name__)

BROKERAGE_TYPE = "brokerage"


def holdings_by_currency(db: Session, account_id: int) -> dict[str, float]:
    """計算指定 brokerage account 嘅每幣種持倉市值。

    返回 {currency: market_value}，例如 {"HKD": 12345.0, "USD": 5678.0}。
    冇 last_price 嘅 holding 用 avg_cost fallback；都冇就當 0。
    """
    holdings = list(
        db.execute(
            select(StockHolding).where(StockHolding.account_id == account_id)
        ).scalars()
    )
    breakdown: dict[str, float] = {}
    for h in holdings:
        qty = float(h.quantity or 0)
        price = h.last_price if h.last_price is not None else h.avg_cost
        if price is None:
            continue
        ccy = (h.currency or "HKD").upper()
        breakdown[ccy] = breakdown.get(ccy, 0.0) + qty * float(price)
    return {k: round(v, 2) for k, v in breakdown.items()}


def recompute_account_balance(db: Session, account_id: int) -> float | None:
    """重算 brokerage account 嘅 legacy `balance` field。

    為咗 backward-compat，`balance` 只反映**主幣種**嘅持倉市值（account.currency）。
    其他幣種嘅持倉同現金喺 API 層面額外返回 breakdown，唔影響呢個 field。
    transfer / expense 嘅 source 仲係用主幣種 balance，行為不變。
    """
    account = db.get(BankAccount, account_id)
    if account is None or account.account_type != BROKERAGE_TYPE:
        return None
    breakdown = holdings_by_currency(db, account_id)
    primary = (account.currency or "HKD").upper()
    account.balance = round(breakdown.get(primary, 0.0), 2)
    return account.balance


def refresh_all_holdings(db: Session) -> dict:
    """Fetch quotes for every distinct symbol，更新所有 holding 嘅 last_price，
    並重算每個 brokerage account 嘅 balance。

    返回 {refreshed, failed, accounts_updated}。
    """
    holdings = list(db.execute(select(StockHolding)).scalars())
    if not holdings:
        return {"refreshed": 0, "failed": [], "accounts_updated": []}

    symbols = sorted({h.symbol for h in holdings})
    quotes = stock_quote.fetch_quotes(symbols)

    refreshed = 0
    failed: list[str] = [s for s in symbols if s not in quotes]
    affected_accounts: set[int] = set()
    now = datetime.now(UTC)

    for h in holdings:
        q = quotes.get(h.symbol)
        if q is None:
            continue
        h.last_price = q.price
        h.last_price_at = now
        # 如果 holding 冇設 currency，用 quote 嘅
        if not h.currency:
            h.currency = q.currency
        if not h.name:
            h.name = q.short_name
        affected_accounts.add(h.account_id)
        refreshed += 1

    for acct_id in affected_accounts:
        recompute_account_balance(db, acct_id)

    db.commit()
    logger.info(
        "stock refresh: %d/%d ok, %d accounts updated",
        refreshed,
        len(holdings),
        len(affected_accounts),
    )
    return {
        "refreshed": refreshed,
        "failed": failed,
        "accounts_updated": sorted(affected_accounts),
    }
