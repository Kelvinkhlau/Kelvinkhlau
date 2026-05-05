"""AI 助手 API — 自然語言 → 自動建 todo/idea/project/calendar/note/expense。"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends, HTTPException

from app.deps import CurrentUser, DbSession, current_user
from app.services.rate_limit import rate_limit

_chat_limit = rate_limit("assistant_chat", max_per_minute=15, max_per_hour=150)
from app.models.bank_account import BankAccount
from app.models.calendar_event import CalendarEvent
from app.models.expense import Expense
from app.models.idea import Idea
from app.models.note import Note
from app.models.project import Project
from app.models.todo import Todo
from app.models.user import User
from app.services.ai_assistant import ask_assistant
from sqlalchemy import select

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(current_user)])

HK_TZ = ZoneInfo("Asia/Hong_Kong")


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)


class ChatResponse(BaseModel):
    action: str
    reply: str
    created_id: int | None = None
    created_type: str | None = None


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=HK_TZ)
        return dt
    except (ValueError, TypeError):
        return None


def _parse_date(value: str | None) -> date:
    if value:
        try:
            return date.fromisoformat(value)
        except (ValueError, TypeError):
            pass
    return datetime.now(HK_TZ).date()


def _parse_amount(value: object) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None


@router.post("/chat", response_model=ChatResponse, dependencies=[Depends(_chat_limit)])
async def chat(
    payload: ChatRequest, user: CurrentUser, db: DbSession
) -> dict:
    """用戶發一句話，AI 決定要做乜（建 todo/idea/project/calendar/note/expense 或純回覆）。"""
    result = ask_assistant(payload.message)

    created_id: int | None = None
    created_type: str | None = None

    if result.action == "create_todo":
        todo = Todo(
            user_id=user.id,
            title=(result.data.get("title") or payload.message)[:500],
            priority=result.data.get("priority", "medium"),
        )
        db.add(todo)
        db.commit()
        db.refresh(todo)
        created_id = todo.id
        created_type = "todo"

    elif result.action == "create_idea":
        idea = Idea(
            user_id=user.id,
            title=(result.data.get("title") or payload.message)[:300],
            content=result.data.get("content"),
            tags=result.data.get("tags", ""),
        )
        db.add(idea)
        db.commit()
        db.refresh(idea)
        created_id = idea.id
        created_type = "idea"

    elif result.action == "create_project":
        project = Project(
            user_id=user.id,
            name=(result.data.get("name") or payload.message)[:200],
            description=result.data.get("description"),
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        created_id = project.id
        created_type = "project"

    elif result.action == "create_calendar_event":
        start_at = _parse_dt(result.data.get("start_at"))
        end_at = _parse_dt(result.data.get("end_at"))
        if start_at is None:
            # 解析失敗 → 退回 chat 講用戶錯
            return {
                "action": "chat",
                "reply": f"{result.reply}（不過我唔肯定你講嘅時間，可以再講清楚嗎？）",
                "created_id": None,
                "created_type": None,
            }
        if end_at is None:
            end_at = start_at + timedelta(hours=1)

        title = (result.data.get("title") or payload.message)[:500]
        all_day = bool(result.data.get("all_day", False))
        description = result.data.get("description")
        location = result.data.get("location")
        category = result.data.get("category", "personal")

        # 試同步去 Google Calendar；失敗就淨係存 local
        google_event_id = ""
        google_calendar_id = "primary"
        try:
            if user.gmail_refresh_token:
                from app.services.calendar_client import CalendarClient

                client = CalendarClient(user.gmail_refresh_token)
                parsed = client.create_event(
                    title=title,
                    start_at=start_at,
                    end_at=end_at,
                    all_day=all_day,
                    description=description,
                    location=location,
                )
                google_event_id = parsed.google_event_id
                google_calendar_id = parsed.google_calendar_id
        except Exception as e:
            logger.warning("Google Calendar sync failed for assistant event: %s", e)
            # Local-only fallback — 用 pseudo ID
            google_event_id = f"local-{int(datetime.now().timestamp() * 1000)}"

        event = CalendarEvent(
            user_id=user.id,
            google_event_id=google_event_id,
            google_calendar_id=google_calendar_id,
            title=title,
            description=description,
            location=location,
            start_at=start_at,
            end_at=end_at,
            all_day=all_day,
            category=category,
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        created_id = event.id
        created_type = "calendar_event"

    elif result.action == "create_note":
        title = (result.data.get("title") or payload.message)[:500]
        content_text = str(result.data.get("content") or "").strip()
        # 包裝成 TipTap blocks doc，等 editor 直接打開
        if content_text:
            doc = {
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": line}] if line else [],
                    }
                    for line in content_text.split("\n")
                ],
            }
        else:
            doc = {"type": "doc", "content": [{"type": "paragraph"}]}
        note = Note(
            user_id=user.id,
            title=title,
            content=json.dumps(doc, ensure_ascii=False),
            content_format="blocks",
            folder=str(result.data.get("folder") or "")[:100],
            tags=str(result.data.get("tags") or "")[:500],
        )
        db.add(note)
        db.commit()
        db.refresh(note)
        created_id = note.id
        created_type = "note"

    elif result.action == "create_expense":
        amount = _parse_amount(result.data.get("amount"))
        if amount is None or amount <= 0:
            return {
                "action": "chat",
                "reply": f"{result.reply}（唔好意思，我聽唔清金額，可以再講一次嗎？）",
                "created_id": None,
                "created_type": None,
            }
        txn_type = str(result.data.get("txn_type") or "expense")
        if txn_type not in ("expense", "income"):
            txn_type = "expense"

        # Category normalization：英文 legacy keyword → 繁體中文
        _CAT_ALIAS = {
            "food": "餐飲",
            "transport": "交通",
            "shopping": "購物",
            "entertainment": "娛樂",
            "health": "醫療",
            "medical": "醫療",
            "education": "教育",
            "housing": "住屋",
            "bills": "住屋",
            "utilities": "住屋",
            "daily": "日用品",
            "gift": "人情",
            "investment": "投資",
            "business": "生意",
            "other": "其他",
        }
        raw_cat = str(result.data.get("category") or "其他").strip()
        category = _CAT_ALIAS.get(raw_cat.lower(), raw_cat)[:50]

        subcategory = (result.data.get("subcategory") or "").strip()[:50] or None
        payment_method = (result.data.get("payment_method") or "").strip()[:50] or None
        currency = str(result.data.get("currency") or "HKD")[:3].upper()

        # 試 map payment_method → payment_account_id（模糊匹配 name / bank / last4）
        payment_account_id: int | None = None
        if payment_method:
            pm_lower = payment_method.lower()
            accounts = db.execute(
                select(BankAccount).where(
                    BankAccount.user_id == user.id,
                    BankAccount.is_active.is_(True),
                )
            ).scalars().all()
            for acc in accounts:
                name_l = (acc.name or "").lower()
                bank_l = (acc.bank or "").lower()
                if pm_lower == name_l or pm_lower == bank_l:
                    payment_account_id = acc.id
                    break
                if pm_lower in name_l or pm_lower in bank_l:
                    payment_account_id = acc.id
                    break
                # 特殊：「現金」matches cash account_type
                if "現金" in payment_method and acc.account_type == "cash":
                    payment_account_id = acc.id
                    break

        expense = Expense(
            user_id=user.id,
            txn_type=txn_type,
            amount=amount,
            currency=currency,
            category=category,
            subcategory=subcategory,
            description=result.data.get("description"),
            merchant=result.data.get("merchant"),
            payment_method=payment_method,
            payment_account_id=payment_account_id,
            spent_at=_parse_date(result.data.get("spent_at")),
            source="voice",
        )
        db.add(expense)
        db.commit()
        db.refresh(expense)
        created_id = expense.id
        created_type = "expense"

    return {
        "action": result.action,
        "reply": result.reply,
        "created_id": created_id,
        "created_type": created_type,
    }
