"""驗證受保護 endpoints 冇 JWT 會 401。"""

from fastapi.testclient import TestClient


def test_emails_list_requires_auth(client: TestClient) -> None:
    response = client.get("/api/emails")
    assert response.status_code == 401


def test_emails_stats_requires_auth(client: TestClient) -> None:
    response = client.get("/api/emails/stats")
    assert response.status_code == 401


def test_emails_sync_requires_auth(client: TestClient) -> None:
    response = client.post("/api/emails/sync")
    assert response.status_code == 401


def test_todos_list_requires_auth(client: TestClient) -> None:
    response = client.get("/api/todos")
    assert response.status_code == 401


def test_todos_create_requires_auth(client: TestClient) -> None:
    response = client.post("/api/todos", json={"title": "hi"})
    assert response.status_code == 401


def test_bad_token_rejected(client: TestClient) -> None:
    response = client.get(
        "/api/todos",
        headers={"Authorization": "Bearer not-a-real-jwt"},
    )
    assert response.status_code == 401


def test_missing_bearer_prefix_rejected(client: TestClient) -> None:
    response = client.get(
        "/api/todos",
        headers={"Authorization": "just-a-token-no-bearer"},
    )
    assert response.status_code == 401


def test_health_is_public(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_gmail_status_is_public(client: TestClient) -> None:
    """Gmail status endpoint 唔應該要 JWT（首頁未登入都要顯示）。"""
    response = client.get("/api/auth/gmail/status")
    assert response.status_code == 200
    body = response.json()
    assert "connected" in body
