"""Daily report API tests。"""

from fastapi.testclient import TestClient


def test_report_requires_auth(client: TestClient) -> None:
    response = client.get("/api/report")
    assert response.status_code == 401


def test_report_empty(client: TestClient, auth_headers: dict[str, str]) -> None:
    """冇任何數據時都能產生報告。"""
    response = client.get("/api/report", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert "date" in body
    assert body["todos"]["pending_total"] == 0
    assert body["calendar"]["event_count"] == 0
    assert body["emails"]["received_today"] == 0
    assert body["expenses"]["today_total"] == 0


def test_report_with_todos(client: TestClient, auth_headers: dict[str, str]) -> None:
    """報告包含 todo 數據。"""
    # 建幾個 todos
    client.post(
        "/api/todos", headers=auth_headers, json={"title": "Task A"}
    )
    client.post(
        "/api/todos", headers=auth_headers, json={"title": "Task B"}
    )
    response = client.get("/api/report", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["todos"]["pending_total"] == 2


def test_report_with_expenses(client: TestClient, auth_headers: dict[str, str]) -> None:
    """報告包含當日消費。"""
    from datetime import date

    today = date.today().isoformat()
    client.post(
        "/api/expenses",
        headers=auth_headers,
        json={"amount": 50, "category": "飲食", "spent_at": today},
    )
    client.post(
        "/api/expenses",
        headers=auth_headers,
        json={"amount": 30, "category": "交通", "spent_at": today},
    )
    response = client.get("/api/report", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["expenses"]["today_total"] == 80
    assert body["expenses"]["today_count"] == 2


def test_report_specific_date(client: TestClient, auth_headers: dict[str, str]) -> None:
    """可以查特定日期嘅報告。"""
    response = client.get(
        "/api/report?report_date=2026-01-01", headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["date"] == "2026-01-01"
