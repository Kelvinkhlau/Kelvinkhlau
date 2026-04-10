"""智能日報 — 彙總 todos、calendar、emails、expenses 數據。"""

from datetime import date, datetime, time, timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models.calendar_event import CalendarEvent
from app.models.email import Email, EmailClassification
from app.models.expense import Expense
from app.models.todo import Todo
from app.models.user import User


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
            Expense.spent_at == d,
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
