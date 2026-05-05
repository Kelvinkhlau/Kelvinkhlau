"""Stock quote fetching — 用 Stooq 為主、Yahoo 為 fallback。

兩個 source 都唔需要 API key。Stooq 比較穩定（無 rate limit），所以做主要 source。

Symbol convention（用戶輸入時用 Yahoo Finance 格式，內部會自動 normalize）：
- HK 股票：「0700.HK」、「9988.HK」、「0005.HK」（4 位數 + .HK）
- US 股票：「AAPL」、「VOO」、「TSLA」（純 ticker）
- ETF / 加密貨幣同 US ticker

延遲：Stooq HK 約 15 分鐘、US 約即時（盤後資料）。對個人 portfolio 追蹤完全足夠。
"""

from __future__ import annotations

import csv
import io
import logging
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx

logger = logging.getLogger(__name__)

STOOQ_URL = "https://stooq.com/q/l/"
YAHOO_CHART_URLS = [
    "https://query2.finance.yahoo.com/v8/finance/chart/{symbol}",
    "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
]
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
TIMEOUT_SECONDS = 10.0


@dataclass
class Quote:
    symbol: str
    price: float
    currency: str
    short_name: str | None
    fetched_at: datetime


def _currency_from_suffix(symbol: str) -> str:
    """根據 symbol suffix 推斷貨幣。"""
    s = symbol.upper()
    if s.endswith(".HK"):
        return "HKD"
    if s.endswith(".SS") or s.endswith(".SZ"):
        return "CNY"
    if s.endswith(".T") or s.endswith(".JP"):
        return "JPY"
    if s.endswith(".L"):
        return "GBP"
    if s.endswith(".TO") or s.endswith(".V"):
        return "CAD"
    if s.endswith(".AX"):
        return "AUD"
    return "USD"


def _to_stooq_symbol(symbol: str) -> str:
    """Yahoo style → Stooq style。
    - "0700.HK" → "700.hk"（Stooq 唔加 leading zero）
    - "AAPL" → "aapl.us"
    - "9988.HK" → "9988.hk"
    """
    s = symbol.strip().upper()
    if "." in s:
        ticker, suffix = s.rsplit(".", 1)
        if suffix == "HK":
            ticker = ticker.lstrip("0") or "0"
        return f"{ticker.lower()}.{suffix.lower()}"
    return f"{s.lower()}.us"


def _fetch_stooq(symbol: str) -> Quote | None:
    stooq_sym = _to_stooq_symbol(symbol)
    try:
        with httpx.Client(timeout=TIMEOUT_SECONDS, headers={"User-Agent": USER_AGENT}) as client:
            resp = client.get(
                STOOQ_URL,
                params={"s": stooq_sym, "f": "sd2t2ohlcv", "h": "", "e": "csv"},
            )
        resp.raise_for_status()
        text = resp.text
    except (httpx.HTTPError, ValueError) as e:
        logger.warning("stooq(%s) http failed: %s", symbol, e)
        return None

    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows:
        return None
    row = rows[0]
    close = row.get("Close", "")
    if not close or close == "N/D":
        return None
    try:
        price = float(close)
    except ValueError:
        return None

    return Quote(
        symbol=symbol.strip().upper(),
        price=price,
        currency=_currency_from_suffix(symbol),
        short_name=None,
        fetched_at=datetime.now(UTC),
    )


def _fetch_yahoo(symbol: str) -> Quote | None:
    sym = symbol.strip().upper()
    data = None
    last_err: Exception | None = None
    with httpx.Client(timeout=TIMEOUT_SECONDS, headers={"User-Agent": USER_AGENT}) as client:
        for tmpl in YAHOO_CHART_URLS:
            try:
                resp = client.get(
                    tmpl.format(symbol=sym),
                    params={"interval": "1d", "range": "1d"},
                )
                resp.raise_for_status()
                data = resp.json()
                break
            except (httpx.HTTPError, ValueError) as e:
                last_err = e
                continue
    if data is None:
        logger.warning("yahoo(%s) failed: %s", symbol, last_err)
        return None

    chart = (data or {}).get("chart") or {}
    if chart.get("error") or not (chart.get("result") or []):
        return None
    meta = (chart["result"][0] or {}).get("meta") or {}
    price = meta.get("regularMarketPrice")
    currency = meta.get("currency")
    if price is None:
        return None
    return Quote(
        symbol=sym,
        price=float(price),
        currency=str(currency or _currency_from_suffix(sym)).upper(),
        short_name=meta.get("shortName") or meta.get("longName"),
        fetched_at=datetime.now(UTC),
    )


def fetch_quote(symbol: str) -> Quote | None:
    """Fetch a single quote — Stooq 優先，失敗 fallback 落 Yahoo。"""
    if not symbol or not symbol.strip():
        return None
    q = _fetch_stooq(symbol)
    if q is not None:
        return q
    return _fetch_yahoo(symbol)


def fetch_quotes(symbols: list[str]) -> dict[str, Quote]:
    """Batch fetch — 順序 call。返回 {symbol: Quote}（失敗嘅 symbol 缺席）。"""
    out: dict[str, Quote] = {}
    seen: set[str] = set()
    for raw in symbols:
        sym = raw.strip().upper()
        if not sym or sym in seen:
            continue
        seen.add(sym)
        q = fetch_quote(sym)
        if q is not None:
            out[sym] = q
    return out
