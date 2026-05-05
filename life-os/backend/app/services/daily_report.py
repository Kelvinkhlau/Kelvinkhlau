"""智能日報 — 彙總 todos、calendar、emails、expenses 數據 + AI 摘要。"""

import logging
from datetime import date, datetime, time, timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models.calendar_event import CalendarEvent
from app.models.email import Email, EmailClassification
from app.models.expense import Expense
from app.models.todo import Todo
from app.models.user import User

logger = logging.getLogger(__name__)


def generate_daily_report(db: Session, user: User, report_date: date | None = None) -> dict:
    """產生某日嘅日報摘要。

    Returns dict with sections: todos, calendar, emails, expenses, summary.
    """
    d = report_date or date.today()
    day_start = datetime.combine(d, time.min)
    day_end = datetime.combine(d, time.max)
    tomorrow = d + timedelta(days=1)

    # --- Todos ---
    pending_todos = list(
        db.execute(
            select(Todo).where(
                Todo.user_id == user.id,
                Todo.done.is_(False),
            )
        )
        .scalars()
        .all()
    )
    overdue = [
        t for t in pending_todos if t.due_at and t.due_at.date() < d
    ]
    due_today = [
        t for t in pending_todos if t.due_at and t.due_at.date() == d
    ]
    completed_today = list(
        db.execute(
            select(Todo).where(
                Todo.user_id == user.id,
                Todo.done.is_(True),
                Todo.completed_at >= day_start,
                Todo.completed_at <= day_end,
            )
        )
        .scalars()
        .all()
    )

    # --- Calendar ---
    events_today = list(
        db.execute(
            select(CalendarEvent).where(
                CalendarEvent.user_id == user.id,
                CalendarEvent.start_at >= day_start,
                CalendarEvent.start_at < datetime.combine(tomorrow, time.min),
            ).order_by(CalendarEvent.start_at)
        )
        .scalars()
        .all()
    )

    # --- Emails ---
    row = db.execute(
        select(func.count(Email.id)).where(
            Email.user_id == user.id,
            Email.received_at >= day_start,
            Email.received_at <= day_end,
        )
    ).scalar()
    emails_received = row or 0

    unread_count = db.execute(
        select(func.count(Email.id)).where(
            Email.user_id == user.id,
            Email.is_read.is_(False),
        )
    ).scalar() or 0

    important_count = db.execute(
        select(func.count(Email.id))
        .join(EmailClassification, Email.id == EmailClassification.email_id)
        .where(
            Email.user_id == user.id,
            Email.received_at >= day_start,
            Email.received_at <= day_end,
            EmailClassification.final_category == "important",
        )
    ).scalar() or 0

    # --- Expenses ---
    expense_row = db.execute(
        select(
            func.coalesce(func.sum(Expense.amount), 0),
            func.count(Expense.id),
        ).where(
            Expense.user_id == user.id,
            func.date(Expense.spent_at) == d,
        )
    ).one()
    expense_total = float(expense_row[0])
    expense_count = int(expense_row[1])

    return {
        "date": d.isoformat(),
        "todos": {
            "pending_total": len(pending_todos),
            "overdue": len(overdue),
            "due_today": len(due_today),
            "completed_today": len(completed_today),
            "overdue_items": [
                {"id": t.id, "title": t.title, "due_at": t.due_at.isoformat() if t.due_at else None}
                for t in overdue[:5]
            ],
            "due_today_items": [
                {"id": t.id, "title": t.title, "priority": t.priority}
                for t in due_today
            ],
        },
        "calendar": {
            "event_count": len(events_today),
            "events": [
                {
                    "id": e.id,
                    "title": e.title,
                    "start_at": e.start_at.isoformat(),
                    "end_at": e.end_at.isoformat(),
                    "all_day": e.all_day,
                }
                for e in events_today
            ],
        },
        "emails": {
            "received_today": emails_received,
            "unread_total": unread_count,
            "important_today": important_count,
        },
        "expenses": {
            "today_total": expense_total,
            "today_count": expense_count,
        },
    }


def generate_ai_summary(report: dict) -> str:
    """用 AI 生成日報嘅自然語言摘要。"""
    from app.config import get_settings
    from app.utils.retry import retry_call

    settings = get_settings()

    prompt = (
        "你係一個個人助理。根據以下日報數據，用繁體中文寫一段簡短嘅每日摘要（3-5 句），"
        "包含重點提醒同建議。語氣友善但簡潔。唔好用 markdown。\n\n"
    )
    data_text = (
        f"日期：{report['date']}\n"
        f"待辦：{report['todos']['pending_total']} 個待完成，"
        f"{report['todos']['overdue']} 個過期，"
        f"{report['todos']['due_today']} 個今日到期，"
        f"{report['todos']['completed_today']} 個已完成\n"
        f"日曆：{report['calendar']['event_count']} 個 event\n"
        f"電郵：今日收到 {report['emails']['received_today']} 封，"
        f"未讀 {report['emails']['unread_total']} 封，"
        f"重要 {report['emails']['important_today']} 封\n"
        f"消費：今日花咗 ${report['expenses']['today_total']:.2f}，{report['expenses']['today_count']} 筆\n"
    )

    # 加入具體項目
    if report["todos"]["overdue_items"]:
        data_text += "\n過期待辦：\n"
        for t in report["todos"]["overdue_items"]:
            data_text += f"- {t['title']} (到期 {t['due_at']})\n"

    if report["todos"]["due_today_items"]:
        data_text += "\n今日到期：\n"
        for t in report["todos"]["due_today_items"]:
            data_text += f"- {t['title']} ({t['priority']})\n"

    if report["calendar"]["events"]:
        data_text += "\n今日日程：\n"
        for e in report["calendar"]["events"]:
            data_text += f"- {e['title']} ({e['start_at'][:16]})\n"

    user_content = prompt + data_text
    provider = (settings.ai_provider or "auto").lower()

    def _call_anthropic():
        from app.services.ai_classifier import _get_anthropic_client
        client = _get_anthropic_client()
        resp = client.messages.create(
            model=settings.claude_model_fast,
            max_tokens=500,
            messages=[{"role": "user", "content": user_content}],
        )
        return "".join(b.text for b in resp.content if hasattr(b, "text")).strip()

    def _call_openai():
        from app.services.ai_classifier import _get_openai_client
        client = _get_openai_client()
        resp = client.chat.completions.create(
            model=settings.openai_model_fast,
            max_tokens=500,
            messages=[{"role": "user", "content": user_content}],
        )
        return (resp.choices[0].message.content or "").strip()

    try:
        if provider == "anthropic":
            return _call_anthropic()
        if provider == "openai":
            return _call_openai()
        # auto
        try:
            return _call_anthropic()
        except Exception:
            return _call_openai()
    except Exception as e:
        logger.exception("AI summary generation failed")
        return ""
