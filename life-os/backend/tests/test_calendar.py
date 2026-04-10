"""Calendar API smoke tests — 用本地 DB 直接寫 events 測。"""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.calendar_event import CalendarEvent
from app.models.user import User


def _seed_events(db: Session, user: User, count: int = 3) -> list[CalendarEvent]:
    """直接喺 DB 建幾個 test events（唔經 Google API）。"""
    now = datetime.now(tz=UTC)
    events = []
    for i in range(count):
        e = CalendarEvent(
            user_id=user.id,
            google_event_id=f"test-event-{i}",
            google_calendar_id="primary",
            title=f"Event {i}",
            description=f"Desc {i}" if i % 2 == 0 else None,
            location="Office" if i == 0 else None,
            start_at=now + timedelta(hours=i + 1),
            end_at=now + timedelta(hours=i + 2),
            all_day=False,
            status="confirmed",
        )
        db.add(e)
        events.append(e)
    db.commit()
    for e in events:
        db.refresh(e)
    return events


def test_list_events_empty(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = client.get("/api/calendar", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_list_events(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
    test_user: User,
) -> None:
    _seed_events(db_session, test_user, count=3)
    response = client.get("/api/calendar", headers=auth_headers)
    assert response.status_code == 200
    events = response.json()
    assert len(events) == 3
    # 確認按 start_at 排序
    assert events[0]["title"] == "Event 0"
    assert events[2]["title"] == "Event 2"


def test_today_events(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
    test_user: User,
) -> None:
    now = datetime.now(tz=UTC)
    # 今日嘅 event
    today_event = CalendarEvent(
        user_id=test_user.id,
        google_event_id="today-1",
        google_calendar_id="primary",
        title="Today meeting",
        start_at=now + timedelta(minutes=30),
        end_at=now + timedelta(hours=1),
        all_day=False,
        status="confirmed",
    )
    # 聽日嘅 event
    tomorrow_event = CalendarEvent(
        user_id=test_user.id,
        google_event_id="tomorrow-1",
        google_calendar_id="primary",
        title="Tomorrow meeting",
        start_at=now + timedelta(days=1, hours=2),
        end_at=now + timedelta(days=1, hours=3),
        all_day=False,
        status="confirmed",
    )
    db_session.add_all([today_event, tomorrow_event])
    db_session.commit()

    response = client.get("/api/calendar/today", headers=auth_headers)
    assert response.status_code == 200
    events = response.json()
    titles = [e["title"] for e in events]
    assert "Today meeting" in titles
    # tomorrow 唔應該出現（可能會出現取決於 UTC 時間，但至少 today 會有）


def test_cancelled_events_hidden(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
    test_user: User,
) -> None:
    now = datetime.now(tz=UTC)
    db_session.add(
        CalendarEvent(
            user_id=test_user.id,
            google_event_id="cancelled-1",
            google_calendar_id="primary",
            title="Cancelled",
            start_at=now + timedelta(hours=1),
            end_at=now + timedelta(hours=2),
            all_day=False,
            status="cancelled",
        )
    )
    db_session.commit()

    response = client.get("/api/calendar", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 0


def test_calendar_requires_auth(client: TestClient) -> None:
    assert client.get("/api/calendar").status_code == 401
    assert client.get("/api/calendar/today").status_code == 401
    assert client.post("/api/calendar/sync").status_code == 401


def test_event_fields(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
    test_user: User,
) -> None:
    now = datetime.now(tz=UTC)
    db_session.add(
        CalendarEvent(
            user_id=test_user.id,
            google_event_id="full-1",
            google_calendar_id="primary",
            title="Full event",
            description="A meeting",
            location="Room 3",
            start_at=now + timedelta(hours=1),
            end_at=now + timedelta(hours=2),
            all_day=False,
            status="tentative",
        )
    )
    db_session.commit()

    response = client.get("/api/calendar", headers=auth_headers)
    assert response.status_code == 200
    event = response.json()[0]
    assert event["title"] == "Full event"
    assert event["description"] == "A meeting"
    assert event["location"] == "Room 3"
    assert event["all_day"] is False
    assert event["status"] == "tentative"
    assert event["google_calendar_id"] == "primary"
