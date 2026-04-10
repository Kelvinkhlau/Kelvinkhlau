"""Audit log API + service tests。"""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services.audit import log_action


def test_audit_requires_auth(client: TestClient) -> None:
    response = client.get("/api/audit")
    assert response.status_code == 401


def test_audit_list_empty(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.get("/api/audit", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_log_action_creates_entry(
    client: TestClient, auth_headers: dict[str, str], db_session: Session
) -> None:
    log_action(
        db_session,
        action="login",
        user_id=1,
        detail="Passkey login",
        ip_address="127.0.0.1",
    )
    response = client.get("/api/audit", headers=auth_headers)
    assert response.status_code == 200
    logs = response.json()
    assert len(logs) == 1
    assert logs[0]["action"] == "login"
    assert logs[0]["ip_address"] == "127.0.0.1"


def test_log_action_with_resource(
    client: TestClient, auth_headers: dict[str, str], db_session: Session
) -> None:
    log_action(
        db_session,
        action="create",
        user_id=1,
        resource_type="todo",
        resource_id=42,
        detail="Created todo: 買菜",
    )
    response = client.get("/api/audit", headers=auth_headers)
    logs = response.json()
    assert logs[0]["resource_type"] == "todo"
    assert logs[0]["resource_id"] == 42


def test_filter_by_action(
    client: TestClient, auth_headers: dict[str, str], db_session: Session
) -> None:
    log_action(db_session, action="login", user_id=1)
    log_action(db_session, action="create", user_id=1)
    log_action(db_session, action="delete", user_id=1)
    response = client.get("/api/audit?action=login", headers=auth_headers)
    logs = response.json()
    assert len(logs) == 1
    assert logs[0]["action"] == "login"


def test_audit_ordering(
    client: TestClient, auth_headers: dict[str, str], db_session: Session
) -> None:
    log_action(db_session, action="first", user_id=1)
    log_action(db_session, action="second", user_id=1)
    response = client.get("/api/audit", headers=auth_headers)
    logs = response.json()
    assert logs[0]["action"] == "second"  # newest first
    assert logs[1]["action"] == "first"
