"""Today API tests — daily focus + aggregated snapshot。"""

from datetime import date, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.calendar_event import CalendarEvent
from app.models.email import Email, EmailClassification
from app.models.todo import Todo


def _mk_todo(client: TestClient, auth_headers: dict[str, str], title: str) -> int:
    r = client.post("/api/todos", headers=auth_headers, json={"title": title})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_today_empty(client: TestClient, auth_headers: dict[str, str]) -> None:
    r = client.get("/api/today", headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["today"] == date.today().isoformat()
    assert body["focuses"] == []
    assert body["events"] == []
    assert body["important_emails"] == []
    assert body["suggested_todos"] == []
    assert body["stats"]["todos_open_total"] == 0
    assert body["stats"]["streak_days"] == 0


def test_add_focus(client: TestClient, auth_headers: dict[str, str]) -> None:
    todo_id = _mk_todo(client, auth_headers, "寫日報")
    r = client.post(
        "/api/today/focus",
        headers=auth_headers,
        json={"todo_id": todo_id},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["todo_id"] == todo_id
    assert body["position"] == 0
    assert body["todo"] is not None
    assert body["todo"]["title"] == "寫日報"


def test_add_focus_dedupes(client: TestClient, auth_headers: dict[str, str]) -> None:
    todo_id = _mk_todo(client, auth_headers, "x")
    r1 = client.post(
        "/api/today/focus", headers=auth_headers, json={"todo_id": todo_id}
    )
    r2 = client.post(
        "/api/today/focus", headers=auth_headers, json={"todo_id": todo_id}
    )
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"]


def test_add_focus_not_your_todo(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.post(
        "/api/today/focus", headers=auth_headers, json={"todo_id": 999999}
    )
    assert r.status_code == 404


def test_add_focus_appends_position(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    t1 = _mk_todo(client, auth_headers, "A")
    t2 = _mk_todo(client, auth_headers, "B")
    t3 = _mk_todo(client, auth_headers, "C")
    r1 = client.post("/api/today/focus", headers=auth_headers, json={"todo_id": t1})
    r2 = client.post("/api/today/focus", headers=auth_headers, json={"todo_id": t2})
    r3 = client.post("/api/today/focus", headers=auth_headers, json={"todo_id": t3})
    assert r1.json()["position"] == 0
    assert r2.json()["position"] == 1
    assert r3.json()["position"] == 2


def test_remove_focus(client: TestClient, auth_headers: dict[str, str]) -> None:
    todo_id = _mk_todo(client, auth_headers, "x")
    focus = client.post(
        "/api/today/focus", headers=auth_headers, json={"todo_id": todo_id}
    ).json()
    r = client.delete(
        f"/api/today/focus/{focus['id']}", headers=auth_headers
    )
    assert r.status_code == 204

    # Today 應該冇 focus
    t = client.get("/api/today", headers=auth_headers).json()
    assert t["focuses"] == []


def test_today_shows_focus(client: TestClient, auth_headers: dict[str, str]) -> None:
    todo_id = _mk_todo(client, auth_headers, "focus todo")
    client.post(
        "/api/today/focus", headers=auth_headers, json={"todo_id": todo_id}
    )
    r = client.get("/api/today", headers=auth_headers)
    assert r.status_code == 200
    focuses = r.json()["focuses"]
    assert len(focuses) == 1
    assert focuses[0]["todo"]["title"] == "focus todo"


def test_reorder_focus(client: TestClient, auth_headers: dict[str, str]) -> None:
    t1 = _mk_todo(client, auth_headers, "A")
    t2 = _mk_todo(client, auth_headers, "B")
    t3 = _mk_todo(client, auth_headers, "C")
    f1 = client.post(
        "/api/today/focus", headers=auth_headers, json={"todo_id": t1}
    ).json()["id"]
    f2 = client.post(
        "/api/today/focus", headers=auth_headers, json={"todo_id": t2}
    ).json()["id"]
    f3 = client.post(
        "/api/today/focus", headers=auth_headers, json={"todo_id": t3}
    ).json()["id"]

    # 反序
    r = client.post(
        "/api/today/focus/reorder",
        headers=auth_headers,
        json={"focus_ids": [f3, f2, f1]},
    )
    assert r.status_code == 200
    rows = r.json()
    assert [x["id"] for x in rows] == [f3, f2, f1]
    assert [x["position"] for x in rows] == [0, 1, 2]


def test_focus_cascade_on_todo_delete(
    client: TestClient, auth_headers: dict[str, str], db_session: Session
) -> None:
    """Todo 被刪 → 對應 focus 自動清走（CASCADE）。"""
    todo_id = _mk_todo(client, auth_headers, "will delete")
    client.post("/api/today/focus", headers=auth_headers, json={"todo_id": todo_id})

    # 用 API 刪 todo
    del_r = client.delete(f"/api/todos/{todo_id}", headers=auth_headers)
    assert del_r.status_code in (200, 204)

    t = client.get("/api/today", headers=auth_headers).json()
    assert t["focuses"] == []


def test_suggested_todos_excludes_pinned(
    client: TestClient,
    auth_headers: dict[str, str],
    test_user,
    db_session: Session,
) -> None:
    """Overdue / due today todos 出現喺 suggested；已 pinned 嘅唔會重複。"""
    now = datetime.now()
    t_overdue = Todo(
        user_id=test_user.id, title="overdue", due_at=now - timedelta(days=1)
    )
    t_today = Todo(
        user_id=test_user.id,
        title="today",
        due_at=datetime.combine(date.today(), datetime.min.time()) + timedelta(hours=18),
    )
    t_future = Todo(
        user_id=test_user.id, title="future", due_at=now + timedelta(days=5)
    )
    db_session.add_all([t_overdue, t_today, t_future])
    db_session.commit()

    # Pin overdue todo
    client.post(
        "/api/today/focus", headers=auth_headers, json={"todo_id": t_overdue.id}
    )

    body = client.get("/api/today", headers=auth_headers).json()
    suggested_titles = [t["title"] for t in body["suggested_todos"]]
    assert "today" in suggested_titles
    assert "overdue" not in suggested_titles  # 已 pin
    assert "future" not in suggested_titles  # 唔 overdue / 唔係今日


def test_important_emails(
    client: TestClient,
    auth_headers: dict[str, str],
    test_user,
    db_session: Session,
) -> None:
    e = Email(
        user_id=test_user.id,
        gmail_message_id="msg1",
        gmail_thread_id="thr1",
        subject="Server down",
        sender="boss@example.com",
        sender_email="boss@example.com",
        snippet="act now",
        received_at=datetime.now(),
        is_read=False,
        is_archived=False,
    )
    db_session.add(e)
    db_session.commit()
    cls = EmailClassification(
        email_id=e.id,
        ai_category="important",
        ai_confidence=0.9,
        ai_reason="urgent",
        ai_model="haiku",
    )
    db_session.add(cls)
    db_session.commit()

    body = client.get("/api/today", headers=auth_headers).json()
    assert len(body["important_emails"]) == 1
    assert body["important_emails"][0]["subject"] == "Server down"
    assert body["stats"]["unread_important"] == 1


def test_events_today(
    client: TestClient,
    auth_headers: dict[str, str],
    test_user,
    db_session: Session,
) -> None:
    start = datetime.combine(date.today(), datetime.min.time()) + timedelta(hours=10)
    end = start + timedelta(hours=1)
    evt = CalendarEvent(
        user_id=test_user.id,
        google_event_id="evt1",
        google_calendar_id="primary",
        title="Standup",
        start_at=start,
        end_at=end,
        status="confirmed",
    )
    db_session.add(evt)
    db_session.commit()

    body = client.get("/api/today", headers=auth_headers).json()
    assert len(body["events"]) == 1
    assert body["events"][0]["title"] == "Standup"
    assert body["stats"]["events_today"] == 1


def test_stats_overdue_and_done(
    client: TestClient,
    auth_headers: dict[str, str],
    test_user,
    db_session: Session,
) -> None:
    now = datetime.now()
    t_overdue = Todo(
        user_id=test_user.id, title="old", due_at=now - timedelta(days=2)
    )
    t_done_today = Todo(
        user_id=test_user.id,
        title="done",
        done=True,
        completed_at=now,
    )
    db_session.add_all([t_overdue, t_done_today])
    db_session.commit()

    body = client.get("/api/today", headers=auth_headers).json()
    stats = body["stats"]
    assert stats["todos_overdue"] == 1
    assert stats["todos_done_today"] == 1
    assert stats["streak_days"] >= 1  # 今日有完成


def test_requires_auth(client: TestClient) -> None:
    r = client.get("/api/today")
    assert r.status_code == 401
