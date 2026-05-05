"""Forex Telegram bot command handlers.

Each handler receives the parsed command + args + DB session, returns a reply string.
The webhook layer is the only thing that talks to Telegram; handlers stay pure.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Callable

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.models.forex import (
    AccountGroup,
    AccountGroupWallet,
    AddressBookEntry,
    BrokerAccount,
    DepositIntent,
    MonthlyBalance,
    WalletTransaction,
)
from app.services import forex_reconciliation

logger = logging.getLogger(__name__)


def _resolve_group(db: Session, code: str) -> AccountGroup | None:
    return db.execute(
        select(AccountGroup).where(AccountGroup.code == code.lower())
    ).scalar_one_or_none()


_QUOTE_CHARS = "\"'`‘’“”«»"  # ASCII + smart + guillemets


def _clean_token(s: str) -> str:
    """Strip surrounding quotes (incl. iOS smart quotes) and whitespace."""
    return (s or "").strip().strip(_QUOTE_CHARS).strip()


def _find_tx_by_short_hash(db: Session, short_hash: str) -> WalletTransaction | None:
    """Find a wallet_transaction whose tx_hash starts with the given short hash."""
    short = _clean_token(short_hash).lower()
    if len(short) < 4:
        return None
    matches = db.execute(
        select(WalletTransaction).where(func.lower(WalletTransaction.tx_hash).like(f"{short}%"))
    ).scalars().all()
    if len(matches) == 1:
        return matches[0]
    return None


def _find_broker(db: Session, group: AccountGroup, name_or_alias: str) -> BrokerAccount | None:
    name = name_or_alias.strip()
    rows = db.execute(
        select(BrokerAccount).where(
            BrokerAccount.group_id == group.id,
            func.lower(BrokerAccount.name) == name.lower(),
        )
    ).scalars().all()
    if len(rows) == 1:
        return rows[0]
    if len(rows) > 1:
        # ambiguous (multiple owners with same broker name) — caller must disambiguate
        return None
    # Try prefix match
    rows = db.execute(
        select(BrokerAccount).where(
            BrokerAccount.group_id == group.id,
            func.lower(BrokerAccount.name).like(f"{name.lower()}%"),
        )
    ).scalars().all()
    return rows[0] if len(rows) == 1 else None


# ───────── /start ─────────

def cmd_start(args: list[str], db: Session) -> str:
    return (
        "👋 life-os Forex bot\n\n"
        "📋 查睇：\n"
        "/groups — 戶口組 + wallet\n"
        "/brokers <code> — 某組嘅 broker\n"
        "/pending [code] — 未 tag 嘅 tx\n"
        "/status [code] — 即時狀況\n\n"
        "✏️ 操作：\n"
        "/tag <hash> <broker> [owner] — tag 條 tx\n"
        "/deposit <code> <broker> <amt> — 預先登記出金\n\n"
        "📊 月結：\n"
        "/reconcile <YYYY-MM> [code] — 跑對賬\n"
        "/report <YYYY-MM> <code> — 睇 flagged 細節\n\n"
        "/help — 顯示呢段"
    )


def cmd_help(args: list[str], db: Session) -> str:
    return cmd_start(args, db)


# ───────── /groups ─────────

def cmd_groups(args: list[str], db: Session) -> str:
    groups = db.execute(select(AccountGroup).order_by(AccountGroup.id)).scalars().all()
    if not groups:
        return "（冇任何 group — 跑 seed 先）"
    parts: list[str] = []
    for g in groups:
        wallets = db.execute(
            select(AccountGroupWallet)
            .where(AccountGroupWallet.group_id == g.id)
            .order_by(AccountGroupWallet.id)
        ).scalars().all()
        broker_count = db.execute(
            select(func.count(BrokerAccount.id)).where(BrokerAccount.group_id == g.id)
        ).scalar()
        parts.append(f"📂 {g.name}  (`{g.code}`)")
        parts.append(f"  Brokers: {broker_count}")
        for w in wallets:
            short = f"{w.address[:8]}...{w.address[-6:]}"
            parts.append(f"  • {w.label}  `{short}`")
        parts.append("")
    return "\n".join(parts).rstrip()


# ───────── /brokers ─────────

def cmd_brokers(args: list[str], db: Session) -> str:
    if not args:
        return "用法：/brokers <group_code>\n例：/brokers company  /brokers personal"
    code = args[0].lower()
    g = _resolve_group(db, code)
    if g is None:
        return f"❌ 搵唔到 group code = `{code}`。試 /groups 睇晒"
    rows = db.execute(
        select(BrokerAccount)
        .where(BrokerAccount.group_id == g.id)
        .order_by(BrokerAccount.name, BrokerAccount.owner)
    ).scalars().all()
    if not rows:
        return f"📂 {g.name} 入面冇 broker"
    parts = [f"📂 {g.name} — {len(rows)} brokers", ""]
    for b in rows:
        suffix = f" ({b.owner})" if b.owner else ""
        parts.append(f"  • {b.name}{suffix}")
    return "\n".join(parts)


# ───────── /pending ─────────

def cmd_pending(args: list[str], db: Session, *, limit: int = 10) -> str:
    stmt = (
        select(WalletTransaction)
        .where(WalletTransaction.status == "pending_tag")
        .order_by(desc(WalletTransaction.block_timestamp))
        .limit(limit)
    )
    if args:
        g = _resolve_group(db, args[0])
        if g is None:
            return f"❌ 搵唔到 group code = `{args[0]}`"
        stmt = stmt.where(WalletTransaction.group_id == g.id)
    txs = db.execute(stmt).scalars().all()
    total = db.execute(
        select(func.count(WalletTransaction.id)).where(
            WalletTransaction.status == "pending_tag",
        )
    ).scalar()
    if not txs:
        return "✅ 冇 pending tag tx"
    parts = [f"⏳ Pending tag — 顯示最新 {len(txs)} 條（總共 {total}）", ""]
    # Build a quick group/wallet label map
    group_map = {g.id: g for g in db.execute(select(AccountGroup)).scalars().all()}
    wallet_map = {w.id: w for w in db.execute(select(AccountGroupWallet)).scalars().all()}
    for tx in txs:
        g = group_map.get(tx.group_id)
        w = wallet_map.get(tx.wallet_id)
        arrow = "🟢" if tx.direction == "in" else "🔴"
        when = tx.block_timestamp.strftime("%m-%d %H:%M")
        gname = g.code if g else "?"
        wname = w.label.split()[0] if w else "?"
        parts.append(
            f"{arrow} {when}  {float(tx.amount_usdt):>10,.2f}  [{gname}/{wname}]  `{tx.tx_hash[:6]}`"
        )
    parts.append("")
    parts.append("👉 /tag <short_hash> <broker_name>")
    return "\n".join(parts)


# ───────── /tag ─────────

def cmd_tag(args: list[str], db: Session) -> str:
    if len(args) < 2:
        return (
            "用法：/tag <short_hash> <broker_name> [owner]\n"
            "例：/tag 9f8401 ICM\n"
            "如果同名 broker 多過一個（B 組 ICM 有 Celia 同 CANDY），加 owner：\n"
            "/tag 9f8401 ICM Celia"
        )
    short_hash = _clean_token(args[0])
    broker_name = _clean_token(args[1])
    owner_arg = _clean_token(args[2]) if len(args) >= 3 else None

    tx = _find_tx_by_short_hash(db, short_hash)
    if tx is None:
        # Distinguish 'no match' vs 'multiple match' for clearer error
        matches = db.execute(
            select(WalletTransaction).where(
                func.lower(WalletTransaction.tx_hash).like(f"{short_hash.lower().strip()}%")
            )
        ).scalars().all()
        if not matches:
            return f"❌ 搵唔到 tx hash 開頭 = `{short_hash}`"
        return f"⚠️ `{short_hash}` 對應到 {len(matches)} 條 tx，要打長啲。"

    group = db.get(AccountGroup, tx.group_id)
    if group is None:
        return "❌ Internal: tx 嘅 group 唔見咗"

    # Find broker (scoped to tx's group). Try exact match first, then prefix match.
    name_lower = broker_name.lower()

    def _query(filter_clause):
        stmt = select(BrokerAccount).where(
            BrokerAccount.group_id == group.id, filter_clause
        )
        if owner_arg:
            stmt = stmt.where(func.lower(BrokerAccount.owner) == owner_arg.lower())
        return db.execute(stmt).scalars().all()

    rows = _query(func.lower(BrokerAccount.name) == name_lower)
    if not rows:
        rows = _query(func.lower(BrokerAccount.name).like(f"{name_lower}%"))
    if not rows:
        rows = _query(func.lower(BrokerAccount.name).like(f"%{name_lower}%"))

    if not rows:
        owner_suffix = f" (owner={owner_arg})" if owner_arg else ""
        return (
            f"❌ 搵唔到 broker `{broker_name}`{owner_suffix} 喺 {group.code}\n"
            f"睇 /brokers {group.code}"
        )
    if len(rows) > 1:
        owners = ", ".join(
            f"{b.name} ({b.owner})" if b.owner else b.name for b in rows[:6]
        )
        return (
            f"⚠️ `{broker_name}` 喺 {group.code} 對應到 {len(rows)} 個 broker：\n  {owners}\n"
            f"打長啲 broker 名，或者加 owner（例：/tag {short_hash} {broker_name} Kelvin）"
        )
    broker = rows[0]

    # Apply tag
    tx.broker_account_id = broker.id
    tx.status = "tagged"

    # Learn this address for future auto-tagging
    existing = db.execute(
        select(AddressBookEntry).where(
            AddressBookEntry.group_id == group.id,
            AddressBookEntry.address == tx.counterparty_address,
        )
    ).scalar_one_or_none()
    if existing is None:
        db.add(
            AddressBookEntry(
                group_id=group.id,
                address=tx.counterparty_address,
                broker_account_id=broker.id,
                label=broker.name,
                first_seen_at=tx.block_timestamp,
                last_seen_at=tx.block_timestamp,
            )
        )
        learned = True
    else:
        # If same address but different broker, don't auto-overwrite — flag
        if existing.broker_account_id != broker.id:
            return (
                f"⚠️ 呢個 counterparty address 之前 tag 咗去另一個 broker。\n"
                f"今次 tag 咗 tx 但冇更新 address book — 如果想改，去 web UI 處理。"
            )
        existing.last_seen_at = tx.block_timestamp
        learned = False

    db.commit()

    # Count how many other pending_tag tx have the same counterparty + group
    # — they'll auto-tag next poll (since address_book just learned), but show count now
    similar = db.execute(
        select(func.count(WalletTransaction.id)).where(
            WalletTransaction.group_id == group.id,
            WalletTransaction.counterparty_address == tx.counterparty_address,
            WalletTransaction.status == "pending_tag",
            WalletTransaction.id != tx.id,
        )
    ).scalar()

    msg = [
        f"✅ Tagged tx `{tx.tx_hash[:6]}` → {broker.name}"
        + (f" ({broker.owner})" if broker.owner else ""),
    ]
    if learned and similar:
        msg.append(f"📚 學咗呢個 address。重有 {similar} 條同 address 嘅 pending tx — 跑一次 backfill 會自動 tag")
    elif learned:
        msg.append("📚 學咗呢個 address，下次同地址自動 tag")
    return "\n".join(msg)


# ───────── /deposit ─────────

def cmd_deposit(args: list[str], db: Session) -> str:
    if len(args) < 3:
        return (
            "用法：/deposit <group_code> <broker> <amount> [owner]\n"
            "例：/deposit personal ICM 5000\n"
            "    /deposit personal ICM 5000 Celia"
        )
    code, broker_name, amount_s = args[0], args[1], args[2]
    owner_arg = args[3] if len(args) >= 4 else None

    g = _resolve_group(db, code)
    if g is None:
        return f"❌ 搵唔到 group code = `{code}`"
    try:
        amount = float(amount_s)
    except ValueError:
        return f"❌ Amount `{amount_s}` 唔係數字"
    if amount <= 0:
        return "❌ Amount 要正數"

    if owner_arg:
        broker = db.execute(
            select(BrokerAccount).where(
                BrokerAccount.group_id == g.id,
                func.lower(BrokerAccount.name) == broker_name.lower(),
                func.lower(BrokerAccount.owner) == owner_arg.lower(),
            )
        ).scalar_one_or_none()
    else:
        rows = db.execute(
            select(BrokerAccount).where(
                BrokerAccount.group_id == g.id,
                func.lower(BrokerAccount.name) == broker_name.lower(),
            )
        ).scalars().all()
        if len(rows) > 1:
            owners = ", ".join(b.owner or "?" for b in rows)
            return f"⚠️ Broker `{broker_name}` 多個 owner：{owners}。請加 owner。"
        broker = rows[0] if rows else None
    if broker is None:
        return f"❌ 搵唔到 broker `{broker_name}` 喺 {g.code}"

    intent = DepositIntent(
        group_id=g.id,
        broker_account_id=broker.id,
        amount_usdt=amount,
        intended_at=datetime.utcnow(),
        status="pending",
    )
    db.add(intent)
    db.commit()
    return (
        f"📤 已登記出金: {amount:,.2f} USDT → {broker.name}"
        + (f" ({broker.owner})" if broker.owner else "")
        + f"\n等緊 {g.name} wallet 出 USDT，±5 USDT / ±24h 內會自動 match"
    )


# ───────── /status ─────────

def cmd_status(args: list[str], db: Session) -> str:
    groups: list[AccountGroup]
    if args:
        g = _resolve_group(db, args[0])
        if g is None:
            return f"❌ 搵唔到 group code = `{args[0]}`"
        groups = [g]
    else:
        groups = list(db.execute(select(AccountGroup).order_by(AccountGroup.id)).scalars())

    parts: list[str] = []
    for g in groups:
        broker_count = db.execute(
            select(func.count(BrokerAccount.id)).where(BrokerAccount.group_id == g.id)
        ).scalar()
        pending = db.execute(
            select(func.count(WalletTransaction.id)).where(
                WalletTransaction.group_id == g.id,
                WalletTransaction.status == "pending_tag",
            )
        ).scalar()
        tagged = db.execute(
            select(func.count(WalletTransaction.id)).where(
                WalletTransaction.group_id == g.id,
                WalletTransaction.status == "tagged",
            )
        ).scalar()
        intents = db.execute(
            select(func.count(DepositIntent.id)).where(
                DepositIntent.group_id == g.id,
                DepositIntent.status == "pending",
            )
        ).scalar()
        # Latest month with monthly_balance for this group
        month_row = db.execute(
            select(func.max(MonthlyBalance.month))
            .join(BrokerAccount, BrokerAccount.id == MonthlyBalance.broker_account_id)
            .where(BrokerAccount.group_id == g.id)
        ).scalar()
        parts.append(f"📊 {g.name}  (`{g.code}`)")
        parts.append(f"  Brokers: {broker_count}")
        parts.append(f"  Tx tagged: {tagged}   pending_tag: {pending}")
        parts.append(f"  Pending deposits: {intents}")
        if month_row:
            parts.append(f"  Latest monthly: {month_row}")
        parts.append("")
    return "\n".join(parts).rstrip()


# ───────── /reconcile ─────────

def cmd_reconcile(args: list[str], db: Session) -> str:
    """/reconcile <YYYY-MM> [group_code]  — run reconciliation, return summary"""
    if not args:
        return (
            "用法：/reconcile <YYYY-MM> [group_code]\n"
            "例：/reconcile 2026-03            ← 兩組都跑\n"
            "    /reconcile 2026-03 company   ← 只跑 A 組"
        )
    month = args[0]
    if len(month) != 7 or month[4] != "-":
        return f"❌ Month 格式應該係 YYYY-MM，唔係 `{month}`"

    if len(args) >= 2:
        g = _resolve_group(db, args[1])
        if g is None:
            return f"❌ 搵唔到 group code = `{args[1]}`"
        groups = [g]
    else:
        groups = list(db.execute(select(AccountGroup).where(AccountGroup.is_active.is_(True)).order_by(AccountGroup.id)).scalars())

    parts: list[str] = []
    for g in groups:
        run = forex_reconciliation.run_monthly_reconciliation(db, g, month)
        totals = run.summary.get("totals", {})
        parts.append(f"📊 {g.name}  {month}")
        parts.append(f"  Brokers: {run.total_accounts}   ✅ matched: {run.matched_count}   ⚠️ flagged: {run.flagged_count}")
        parts.append(
            f"  Σ reported P&L: {totals.get('reported_pnl', 0):,.2f}   "
            f"Σ expected: {totals.get('expected_pnl', 0):,.2f}   "
            f"Σ Δ: {totals.get('variance', 0):+,.2f}"
        )
        if run.flagged_count:
            parts.append(f"  👉 詳情：/report {month} {g.code}")
        parts.append("")
    return "\n".join(parts).rstrip()


# ───────── /report ─────────

def cmd_report(args: list[str], db: Session) -> str:
    """/report <YYYY-MM> <group_code>  — show flagged broker details from latest run"""
    if len(args) < 2:
        return (
            "用法：/report <YYYY-MM> <group_code>\n"
            "例：/report 2026-03 company"
        )
    month, code = args[0], args[1]
    g = _resolve_group(db, code)
    if g is None:
        return f"❌ 搵唔到 group code = `{code}`"
    run = forex_reconciliation.latest_run_for_group(db, g, month)
    if run is None:
        return f"❌ {g.code} {month} 仲未跑過 reconciliation。試 /reconcile {month} {code}"

    rows = run.summary.get("rows", [])
    flagged = [r for r in rows if r.get("status") == "flagged"]
    parts = [
        f"📋 {g.name}  {month}  (run {run.run_at.strftime('%Y-%m-%d %H:%M')})",
        f"Total: {run.total_accounts}   ✅ {run.matched_count}   ⚠️ {run.flagged_count}",
        "",
    ]
    if not flagged:
        parts.append("✅ 全部 broker 對到數，冇 flagged")
        return "\n".join(parts)

    parts.append("⚠️ Flagged brokers (|Δ| > tolerance):")
    parts.append("")
    for r in flagged[:20]:  # cap at 20 for Telegram message length
        owner = f" ({r['owner']})" if r.get("owner") else ""
        parts.append(
            f"• {r['broker_name']}{owner}\n"
            f"  Open ${r['opening']:,.2f} → Close ${r['closing']:,.2f}\n"
            f"  Reported: {r['reported_pnl']:+,.2f}  Expected: {r['expected_pnl']:+,.2f}  "
            f"Δ: {r['variance']:+,.2f}\n"
            f"  Tracked in: {r['tracked_in']:,.2f}   out: {r['tracked_out']:,.2f}"
        )
    if len(flagged) > 20:
        parts.append(f"\n…及其他 {len(flagged) - 20} 個 flagged broker（去 web UI 睇晒）")
    return "\n".join(parts)


# ───────── dispatch ─────────

COMMANDS: dict[str, Callable[[list[str], Session], str]] = {
    "start": cmd_start,
    "help": cmd_help,
    "groups": cmd_groups,
    "group": cmd_groups,  # alias for typo tolerance
    "brokers": cmd_brokers,
    "broker": cmd_brokers,
    "pending": cmd_pending,
    "tag": cmd_tag,
    "deposit": cmd_deposit,
    "status": cmd_status,
    "reconcile": cmd_reconcile,
    "report": cmd_report,
}


def dispatch(text: str, db: Session) -> str | None:
    """Parse incoming Telegram text. Returns reply string, or None if not a command we handle."""
    s = (text or "").strip()
    if not s.startswith("/"):
        return None
    # Strip @botname suffix if present (`/groups@lifeos_forex_kelvin_bot`)
    head, *rest = s.split(maxsplit=1)
    cmd_token = head[1:].split("@", 1)[0].lower()
    args_str = rest[0] if rest else ""
    args = args_str.split() if args_str else []
    handler = COMMANDS.get(cmd_token)
    if handler is None:
        return None  # silently ignore unknown commands
    try:
        return handler(args, db)
    except Exception:
        logger.exception("forex_commands: handler %s failed", cmd_token)
        return f"❌ 處理 /{cmd_token} 出錯，睇 server log"
