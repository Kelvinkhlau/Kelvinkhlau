"""Email CRUD / stats / mark-read / category tests。"""

from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.email import Email, EmailClassification


def _seed_email(db: Session, user_id: int, **overrides) -> Email:
    """Helper — 直接喺 DB 建一封 email（唔經 Gmail sync）。"""
    defaults = dict(
        user_id=user_id,
        gmail_message_id=f"msg-{id(overrides)}-{datetime.utcnow().timestamp()}",
        gmail_thread_id="thread-1",
        subject="Test email",
        sender="Alice <alice@example.com>",
        sender_email="alice@example.com",
        recipients="me@example.com",
        snippet="Preview text",
        body_text="Full body text here",
        received_at=datetime.utcnow(),
        is_read=False,
        has_attachment=False,
    )
    defaults.update(overrides)
    email = Email(**defaults)
    db.add(email)
    db.commit()
    db.refresh(email)
    return email


def _classify(db: Session, email_id: int, category: str = "normal") -> None:
    """Helper — 幫 email 加分類。"""
    c = EmailClassification(
        email_id=email_id,
        ai_category=category,
        ai_confidence=0.9,
        ai_reason="test",
        ai_model="test-model",
    )
    db.add(c)
    db.commit()


def test_list_emails_empty(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.get("/api/emails", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_list_emails_with_data(
    client: TestClient, auth_headers: dict[str, str], db_session: Session
) -> None:
    _seed_email(db_session, 1, subject="Hello world")
    _seed_email(db_session, 1, subject="Second email")
    response = client.get("/api/emails", headers=auth_headers)
    assert response.status_code == 200
    emails = response.json()
    assert len(emails) == 2
    assert "X-Total-Count" in response.headers
    assert response.headers["X-Total-Count"] == "2"


def test_list_emails_search(
    client: TestClient, auth_headers: dict[str, str], db_session: Session
) -> None:
    _seed_email(db_session, 1, subject="Invoice from Amazon")
    _seed_email(db_session, 1, subject="Meeting tomorrow")
    response = client.get("/api/emails?q=invoice", headers=auth_headers)
    emails = response.json()
    assert len(emails) == 1
    assert "Invoice" in emails[0]["subject"]


def test_list_emails_unread_filter(
    client: TestClient, auth_headers: dict[str, str], db_session: Session
) -> None:
    _seed_email(db_session, 1, subject="Read", is_read=True)
    _seed_email(db_session, 1, subject="Unread", is_read=False)
    response = client.get("/api/emails?unread_only=true", headers=auth_headers)
    emails = response.json()
    assert len(emails) == 1
    assert emails[0]["subject"] == "Unread"


def test_get_email(
    client: TestClient, auth_headers: dict[str, str], db_session: Session
) -> None:
    email = _seed_email(db_session, 1, subject="Detail test", body_text="Full content")
    response = client.get(f"/api/emails/{email.id}", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["subject"] == "Detail test"
    assert body["body_text"] == "Full content"


def test_get_email_not_found(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = client.get("/api/emails/99999", headers=auth_headers)
    assert response.status_code == 404


def test_mark_read(
    client: TestClient, auth_headers: dict[str, str], db_session: Session
) -> None:
    email = _seed_email(db_session, 1, is_read=False)
    response = client.put(
        f"/api/emails/{email.id}/read?read=true", headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["is_read"] is True

    # Mark unread again
    response = client.put(
        f"/api/emails/{email.id}/read?read=false", headers=auth_headers
    )
    assert response.json()["is_read"] is False


def test_update_category(
    client: TestClient, auth_headers: dict[str, str], db_session: Session
) -> None:
    email = _seed_email(db_session, 1)
    _classify(db_session, email.id, "normal")
    response = client.put(
        f"/api/emails/{email.id}/category",
        headers=auth_headers,
        json={"category": "important"},
    )
    assert response.status_code == 200
    assert response.json()["final_category"] == "important"


def test_update_category_no_classification(
    client: TestClient, auth_headers: dict[str, str], db_session: Session
) -> None:
    """冇 AI 分類都可以手動設定 category。"""
    email = _seed_email(db_session, 1)
    response = client.put(
        f"/api/emails/{email.id}/category",
        headers=auth_headers,
        json={"category": "promotional"},
    )
    assert response.status_code == 200
    assert response.json()["final_category"] == "promotional"


def test_email_stats_empty(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = client.get("/api/emails/stats", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 0
    assert body["unread"] == 0
    assert body["today_new"] == 0


def test_email_stats_with_data(
    client: TestClient, auth_headers: dict[str, str], db_session: Session
) -> None:
    e1 = _seed_email(db_session, 1, is_read=False)
    e2 = _seed_email(db_session, 1, is_read=True)
    _seed_email(
        db_session, 1,
        is_read=False,
        received_at=datetime.utcnow() - timedelta(days=5),
    )
    _classify(db_session, e1.id, "important")
    _classify(db_session, e2.id, "normal")

    response = client.get("/api/emails/stats", headers=auth_headers)
    body = response.json()
    assert body["total"] == 3
    assert body["unread"] == 2
    assert body["by_category"]["important"] == 1
    assert body["by_category"]["normal"] == 1


def test_list_emails_pagination(
    client: TestClient, auth_headers: dict[str, str], db_session: Session
) -> None:
    for i in range(5):
        _seed_email(db_session, 1, subject=f"Email {i}")
    response = client.get("/api/emails?limit=2&offset=0", headers=auth_headers)
    assert len(response.json()) == 2
    assert response.headers["X-Total-Count"] == "5"

    response2 = client.get("/api/emails?limit=2&offset=2", headers=auth_headers)
    assert len(response2.json()) == 2


def test_list_emails_category_filter(
    client: TestClient, auth_headers: dict[str, str], db_session: Session
) -> None:
    e1 = _seed_email(db_session, 1, subject="Important one")
    e2 = _seed_email(db_session, 1, subject="Normal one")
    _classify(db_session, e1.id, "important")
    _classify(db_session, e2.id, "normal")
    response = client.get(
        "/api/emails?category=important", headers=auth_headers
    )
    emails = response.json()
    assert len(emails) == 1
    assert emails[0]["subject"] == "Important one"
