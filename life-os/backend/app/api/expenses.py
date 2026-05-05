"""Expense API routes — CRUD + 統計 + CSV import。"""

import csv
import io
import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import desc, extract, func, select

from app.deps import CurrentUser, DbSession, current_user
from app.models.bank_account import BankAccount
from app.models.budget import Budget
from app.models.expense import Expense
from app.schemas.expense import BudgetWarning, ExpenseCreate, ExpenseCreateResponse, ExpenseOut, ExpenseStats, ExpenseUpdate
from app.services.audit import log_action

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(current_user)])


@router.get("", response_model=list[ExpenseOut])
async def list_expenses(
    user: CurrentUser,
    db: DbSession,
    txn_type: str | None = Query(None, description="expense 或 income"),
    category: str | None = Query(None, description="篩選分類"),
    ledger_id: int | None = Query(None, description="篩選帳本"),
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
    if txn_type:
        stmt = stmt.where(Expense.txn_type == txn_type)
    if category:
        stmt = stmt.where(Expense.category == category)
    if ledger_id is not None:
        stmt = stmt.where(Expense.ledger_id == ledger_id)
    if date_from:
        stmt = stmt.where(Expense.spent_at >= date_from)
    if date_to:
        stmt = stmt.where(func.date(Expense.spent_at) <= date_to)
    return list(db.execute(stmt).scalars().all())


@router.get("/by-merchant")
async def expenses_by_merchant(
    user: CurrentUser,
    db: DbSession,
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    txn_type: str = Query("expense"),
    limit: int = Query(20, ge=1, le=100),
) -> list[dict]:
    """商家統計 — 消費 top merchants。"""
    filters = [Expense.user_id == user.id, Expense.txn_type == txn_type, Expense.merchant.isnot(None), Expense.merchant != ""]
    if date_from:
        filters.append(Expense.spent_at >= date_from)
    if date_to:
        filters.append(func.date(Expense.spent_at) <= date_to)
    stmt = (
        select(
            Expense.merchant,
            func.sum(Expense.amount).label("total"),
            func.count(Expense.id).label("count"),
        )
        .where(*filters)
        .group_by(Expense.merchant)
        .order_by(desc("total"))
        .limit(limit)
    )
    rows = db.execute(stmt).all()
    return [
        {"merchant": m, "total": float(t), "count": int(c)}
        for m, t, c in rows
    ]


@router.get("/by-account")
async def expenses_by_account(
    user: CurrentUser,
    db: DbSession,
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    txn_type: str = Query("expense"),
) -> list[dict]:
    """按付款帳戶統計。"""
    filters = [Expense.user_id == user.id, Expense.txn_type == txn_type]
    if date_from:
        filters.append(Expense.spent_at >= date_from)
    if date_to:
        filters.append(func.date(Expense.spent_at) <= date_to)
    stmt = (
        select(
            Expense.payment_account_id,
            Expense.payment_method,
            func.sum(Expense.amount),
            func.count(Expense.id),
        )
        .where(*filters)
        .group_by(Expense.payment_account_id, Expense.payment_method)
        .order_by(desc(func.sum(Expense.amount)))
    )
    rows = db.execute(stmt).all()
    # 聚合帳戶名
    out: list[dict] = []
    for acc_id, pm, total, count in rows:
        name = pm or "未指定"
        if acc_id:
            acc = db.get(BankAccount, acc_id)
            if acc and acc.user_id == user.id:
                name = f"{acc.name}" + (f" · {acc.last4}" if acc.last4 else "")
        out.append({
            "payment_account_id": acc_id,
            "name": name,
            "payment_method": pm,
            "total": float(total),
            "count": int(count),
        })
    return out


@router.get("/stats", response_model=ExpenseStats)
async def expense_stats(
    user: CurrentUser,
    db: DbSession,
    txn_type: str | None = Query(None, description="expense 或 income"),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
) -> ExpenseStats:
    """消費統計 — 總額 + 分類小計。"""
    filters = [Expense.user_id == user.id]
    if txn_type:
        filters.append(Expense.txn_type == txn_type)
    if date_from:
        filters.append(Expense.spent_at >= date_from)
    if date_to:
        filters.append(func.date(Expense.spent_at) <= date_to)

    # Total + count
    total_stmt = select(
        func.coalesce(func.sum(Expense.amount), 0),
        func.count(Expense.id),
    ).where(*filters)
    row = db.execute(total_stmt).one()
    total = float(row[0])
    count = int(row[1])

    # By category
    cat_stmt = (
        select(Expense.category, func.sum(Expense.amount))
        .where(*filters)
        .group_by(Expense.category)
    )
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


@router.get("/monthly-summary")
async def expense_monthly_summary(
    user: CurrentUser,
    db: DbSession,
    months: int = Query(12, ge=1, le=24, description="過去幾個月"),
) -> list[dict]:
    """每月收支彙總 — 分開 income / expense。"""
    stmt = (
        select(
            extract("year", Expense.spent_at).label("year"),
            extract("month", Expense.spent_at).label("month"),
            Expense.txn_type,
            func.sum(Expense.amount),
            func.count(Expense.id),
        )
        .where(Expense.user_id == user.id)
        .group_by("year", "month", Expense.txn_type)
        .order_by(desc("year"), desc("month"))
    )
    rows = db.execute(stmt).all()

    # 整合成 {year, month, income, expense, net}
    combined: dict[str, dict] = {}
    for y, m, txn_type, total, count in rows:
        key = f"{int(y)}-{int(m):02d}"
        if key not in combined:
            combined[key] = {"year": int(y), "month": int(m), "income": 0.0, "expense": 0.0, "income_count": 0, "expense_count": 0}
        t = txn_type or "expense"
        combined[key][t] = float(total)
        combined[key][f"{t}_count"] = int(count)

    result = sorted(combined.values(), key=lambda x: (x["year"], x["month"]))
    for r in result:
        r["net"] = r["income"] - r["expense"]
    return result[-months:]


@router.get("/daily-trend")
async def expense_daily_trend(
    user: CurrentUser,
    db: DbSession,
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
) -> list[dict]:
    """每日消費趨勢 — 用嚟畫日趨勢圖。"""
    filters = [Expense.user_id == user.id, Expense.txn_type == "expense"]
    if date_from:
        filters.append(Expense.spent_at >= date_from)
    if date_to:
        filters.append(func.date(Expense.spent_at) <= date_to)

    day_col = func.date(Expense.spent_at).label("spent_day")
    stmt = (
        select(
            day_col,
            func.sum(Expense.amount),
            func.count(Expense.id),
        )
        .where(*filters)
        .group_by(day_col)
        .order_by(day_col)
    )
    rows = db.execute(stmt).all()
    return [
        {"date": str(d), "total": float(t), "count": int(c)}
        for d, t, c in rows
    ]


@router.get("/merchants/suggest")
async def suggest_merchants(
    user: CurrentUser,
    db: DbSession,
    q: str = Query("", description="搜尋字串（前綴或包含）"),
    limit: int = Query(8, ge=1, le=30),
) -> list[dict]:
    """商家 autocomplete — 按歷史使用頻率排 + 最近用過嘅先。

    同一個 user 嘅 distinct merchants，LIKE match `%q%`（大小寫不敏感），
    按出現次數 desc + 最近一次 spent_at desc 排。
    """
    query = q.strip()
    filters = [Expense.user_id == user.id, Expense.merchant.isnot(None), Expense.merchant != ""]
    if query:
        # SQLite: LIKE 默認不區分大小寫（for ASCII），對中文都 OK
        filters.append(Expense.merchant.ilike(f"%{query}%"))

    stmt = (
        select(
            Expense.merchant,
            func.count(Expense.id).label("cnt"),
            func.max(Expense.spent_at).label("last_at"),
            # 最近一次用嘅 category / payment_method，方便前端自動填
        )
        .where(*filters)
        .group_by(Expense.merchant)
        .order_by(desc("cnt"), desc("last_at"))
        .limit(limit)
    )
    rows = db.execute(stmt).all()

    out: list[dict] = []
    for merchant, cnt, last_at in rows:
        # 拎呢個商家最近一筆，供 category / payment_method hint
        last_stmt = (
            select(Expense.category, Expense.subcategory, Expense.payment_method, Expense.payment_account_id)
            .where(Expense.user_id == user.id, Expense.merchant == merchant)
            .order_by(desc(Expense.spent_at), desc(Expense.id))
            .limit(1)
        )
        last = db.execute(last_stmt).first()
        out.append({
            "merchant": merchant,
            "count": int(cnt),
            "last_at": str(last_at) if last_at else None,
            "last_category": last[0] if last else None,
            "last_subcategory": last[1] if last else None,
            "last_payment_method": last[2] if last else None,
            "last_payment_account_id": last[3] if last else None,
        })
    return out


@router.post("", response_model=ExpenseCreateResponse, status_code=201)
async def create_expense(
    payload: ExpenseCreate, user: CurrentUser, db: DbSession
) -> dict:
    # 驗證付款賬戶
    account: BankAccount | None = None
    if payload.payment_account_id:
        account = db.get(BankAccount, payload.payment_account_id)
        if account is None or account.user_id != user.id:
            raise HTTPException(status_code=400, detail="付款賬戶不存在")

    # Ledger：若未指定，用 user 預設 ledger
    ledger_id = payload.ledger_id
    if ledger_id is None:
        from app.models.ledger import Ledger
        default = db.execute(
            select(Ledger).where(
                Ledger.user_id == user.id, Ledger.is_default.is_(True)
            ).limit(1)
        ).scalar_one_or_none()
        if default:
            ledger_id = default.id

    expense = Expense(
        user_id=user.id,
        txn_type=payload.txn_type or "expense",
        amount=payload.amount,
        currency=payload.currency,
        category=payload.category.strip(),
        subcategory=payload.subcategory.strip() if payload.subcategory else None,
        description=payload.description,
        merchant=payload.merchant,
        payment_method=payload.payment_method,
        payment_account_id=payload.payment_account_id,
        ledger_id=ledger_id,
        spent_at=payload.spent_at,
    )
    db.add(expense)

    # 自動調整賬戶餘額
    if account:
        if payload.txn_type == "income":
            account.balance = float(account.balance) + payload.amount  # 收入：加錢
        else:
            account.balance = float(account.balance) - payload.amount  # 支出：扣錢

    db.commit()
    db.refresh(expense)
    log_action(db, action="create", user_id=user.id, resource_type="expense", resource_id=expense.id, detail=f"${expense.amount} {expense.category}")

    # 預算超支警告
    warning = None
    budget = db.execute(
        select(Budget).where(Budget.user_id == user.id, Budget.category == expense.category)
    ).scalar_one_or_none()
    if budget:
        d = expense.spent_at
        first = d.replace(day=1)
        if d.month == 12:
            last = d.replace(year=d.year + 1, month=1, day=1)
        else:
            last = d.replace(month=d.month + 1, day=1)
        spent = float(db.execute(
            select(func.coalesce(func.sum(Expense.amount), 0)).where(
                Expense.user_id == user.id,
                Expense.category == expense.category,
                Expense.spent_at >= first,
                Expense.spent_at < last,
            )
        ).scalar() or 0)
        pct = (spent / float(budget.amount) * 100) if budget.amount > 0 else 0
        if pct >= 80:
            warning = BudgetWarning(
                category=expense.category,
                budget=float(budget.amount),
                spent=spent,
                percentage=round(pct, 1),
            )

    result = {c.name: getattr(expense, c.name) for c in expense.__table__.columns}
    result["budget_warning"] = warning
    return result


class FinancialSummaryResponse(BaseModel):
    summary: str
    month: str
    total: float
    count: int
    by_category: dict[str, float]


# ⚠️ 注意：呢條 route 必須喺 `/{expense_id}` 之前定義，
# 否則 FastAPI 會將 "financial-summary" 當做 expense_id（int）試 parse → 422。
@router.get("/financial-summary")
async def financial_summary(
    user: CurrentUser,
    db: DbSession,
    year: int | None = Query(None),
    month: int | None = Query(None),
) -> FinancialSummaryResponse:
    """AI 月度財務摘要。"""
    from app.services.financial_summary import generate_financial_summary

    today = date.today()
    y = year or today.year
    m = month or today.month
    first = date(y, m, 1)
    if m == 12:
        last = date(y + 1, 1, 1)
    else:
        last = date(y, m + 1, 1)

    # 上個月
    if m == 1:
        prev_first = date(y - 1, 12, 1)
        prev_last = first
    else:
        prev_first = date(y, m - 1, 1)
        prev_last = first

    # 當月支出（只計 txn_type = "expense"，唔包括收入）
    rows = db.execute(
        select(Expense.category, func.sum(Expense.amount), func.count(Expense.id)).where(
            Expense.user_id == user.id,
            Expense.txn_type == "expense",
            Expense.spent_at >= first,
            Expense.spent_at < last,
        ).group_by(Expense.category)
    ).all()
    by_category = {cat: float(amt) for cat, amt, _ in rows}
    total = sum(by_category.values())
    count = sum(int(c) for _, _, c in rows)

    # 當月收入（context 用，唔當做支出）
    income_total = float(db.execute(
        select(func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.user_id == user.id,
            Expense.txn_type == "income",
            Expense.spent_at >= first,
            Expense.spent_at < last,
        )
    ).scalar() or 0)

    # 上月支出
    prev_total = float(db.execute(
        select(func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.user_id == user.id,
            Expense.txn_type == "expense",
            Expense.spent_at >= prev_first,
            Expense.spent_at < prev_last,
        )
    ).scalar() or 0)

    balance = income_total - total
    savings_rate = (balance / income_total * 100) if income_total > 0 else 0

    data_text = (
        f"月份：{y}年{m}月\n"
        f"本月總支出：${total:,.2f}（{count} 筆）\n"
        f"本月總收入：${income_total:,.2f}\n"
        f"本月結餘：${balance:,.2f}（儲蓄率 {savings_rate:.0f}%）\n"
        f"上月支出：${prev_total:,.2f}\n"
        f"支出分類明細：\n"
    )
    for cat, amt in sorted(by_category.items(), key=lambda x: -x[1]):
        data_text += f"  - {cat}：${amt:,.2f}\n"

    summary = generate_financial_summary(data_text)

    return FinancialSummaryResponse(
        summary=summary,
        month=f"{y}-{m:02d}",
        total=total,
        count=count,
        by_category=by_category,
    )


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


class OctopusImportResult(BaseModel):
    imported: int
    skipped: int
    errors: list[str]


@router.post("/import-octopus", response_model=OctopusImportResult)
async def import_octopus(
    file: UploadFile, user: CurrentUser, db: DbSession
) -> OctopusImportResult:
    """匯入八達通消費記錄。

    支援八達通 App 匯出嘅 CSV 格式：
    日期,時間,交易類型,金額,餘額,備註
    """
    data = await file.read()
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("big5", errors="replace")

    imported = 0
    skipped = 0
    errors: list[str] = []
    lines = text.strip().splitlines()

    for i, line in enumerate(lines, start=1):
        # Skip header
        if i == 1 and ("日期" in line or "date" in line.lower()):
            continue
        parts = line.split(",")
        if len(parts) < 4:
            skipped += 1
            continue
        try:
            raw_date = parts[0].strip()
            # 支援 DD/MM/YYYY 同 YYYY-MM-DD
            if "/" in raw_date:
                d_parts = raw_date.split("/")
                if len(d_parts[0]) == 4:
                    spent_date = date.fromisoformat(raw_date.replace("/", "-"))
                else:
                    spent_date = date(int(d_parts[2]), int(d_parts[1]), int(d_parts[0]))
            else:
                spent_date = date.fromisoformat(raw_date)

            raw_amount = parts[3].strip().replace(",", "").replace("$", "").replace("+", "").replace("−", "-").replace("–", "-")
            amount = float(raw_amount)
            if amount >= 0:
                skipped += 1
                continue
            amount = abs(amount)

            description = parts[5].strip() if len(parts) > 5 else None
            tx_type = parts[2].strip() if len(parts) > 2 else ""

            expense = Expense(
                user_id=user.id,
                amount=amount,
                currency="HKD",
                category="交通" if "交通" in (tx_type or "") or "巴士" in (description or "") or "港鐵" in (description or "") else "八達通",
                description=description or tx_type or None,
                merchant=description or None,
                payment_method="八達通",
                spent_at=spent_date,
                source="octopus",
            )
            db.add(expense)
            imported += 1
        except Exception as e:
            errors.append(f"第 {i} 行：{e}")
            if len(errors) > 50:
                break

    if imported > 0:
        db.commit()
        log_action(db, action="import", user_id=user.id, resource_type="expense", detail=f"Octopus import: {imported} records")

    return OctopusImportResult(imported=imported, skipped=skipped, errors=errors)


class CsvImportResult(BaseModel):
    imported: int
    skipped: int
    errors: list[str]


@router.post("/import-csv", response_model=CsvImportResult)
async def import_csv(
    file: UploadFile, user: CurrentUser, db: DbSession
) -> CsvImportResult:
    """匯入 CSV 消費記錄。

    CSV 格式：date,amount,category,merchant,description,payment_method,currency
    第一行係 header。必要欄位：date, amount, category。
    """
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="只接受 .csv 檔案")

    data = await file.read()
    try:
        text = data.decode("utf-8-sig")  # 支援 BOM
    except UnicodeDecodeError:
        text = data.decode("big5", errors="replace")

    reader = csv.DictReader(io.StringIO(text))
    imported = 0
    skipped = 0
    errors: list[str] = []

    for i, row in enumerate(reader, start=2):
        try:
            raw_date = row.get("date", "").strip()
            raw_amount = row.get("amount", "").strip()
            raw_category = row.get("category", "").strip()
            if not raw_date or not raw_amount or not raw_category:
                skipped += 1
                continue

            spent_at = date.fromisoformat(raw_date)
            amount = float(raw_amount.replace(",", ""))
            if amount <= 0:
                skipped += 1
                continue

            expense = Expense(
                user_id=user.id,
                amount=amount,
                currency=(row.get("currency", "") or "HKD").strip()[:3].upper() or "HKD",
                category=raw_category,
                description=row.get("description", "").strip() or None,
                merchant=row.get("merchant", "").strip() or None,
                payment_method=row.get("payment_method", "").strip() or None,
                spent_at=spent_at,
                source="csv",
            )
            db.add(expense)
            imported += 1
        except Exception as e:
            errors.append(f"第 {i} 行：{e}")
            if len(errors) > 50:
                break

    if imported > 0:
        db.commit()
        log_action(db, action="import", user_id=user.id, resource_type="expense", detail=f"CSV import: {imported} records")

    return CsvImportResult(imported=imported, skipped=skipped, errors=errors)
