"""Expense CRUD + stats smoke tests。"""

from fastapi.testclient import TestClient


def _create(client: TestClient, headers: dict, **overrides) -> dict:
    """Helper — 建一筆消費。"""
    payload = {
        "amount": 42.5,
        "category": "飲食",
        "spent_at": "2026-04-10",
        **overrides,
    }
    res = client.post("/api/expenses", headers=headers, json=payload)
    assert res.status_code == 201
    return res.json()


def test_list_expenses_empty(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.get("/api/expenses", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_create_expense_minimal(client: TestClient, auth_headers: dict[str, str]) -> None:
    body = _create(client, auth_headers)
    assert body["amount"] == 42.5
    assert body["category"] == "飲食"
    assert body["currency"] == "HKD"
    assert body["spent_at"].startswith("2026-04-10")
    assert body["merchant"] is None


def test_create_expense_full(client: TestClient, auth_headers: dict[str, str]) -> None:
    body = _create(
        client,
        auth_headers,
        amount=128.0,
        currency="USD",
        category="交通",
        description="Uber to airport",
        merchant="Uber",
        payment_method="信用卡",
        spent_at="2026-04-09",
    )
    assert body["amount"] == 128.0
    assert body["currency"] == "USD"
    assert body["merchant"] == "Uber"
    assert body["payment_method"] == "信用卡"


def test_update_expense(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = _create(client, auth_headers)
    response = client.patch(
        f"/api/expenses/{created['id']}",
        headers=auth_headers,
        json={"amount": 99.9, "category": "娛樂"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["amount"] == 99.9
    assert body["category"] == "娛樂"


def test_delete_expense(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = _create(client, auth_headers)
    response = client.delete(
        f"/api/expenses/{created['id']}", headers=auth_headers
    )
    assert response.status_code == 204
    response = client.get(
        f"/api/expenses/{created['id']}", headers=auth_headers
    )
    assert response.status_code == 404


def test_get_expense(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = _create(client, auth_headers, merchant="麥當勞")
    response = client.get(
        f"/api/expenses/{created['id']}", headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["merchant"] == "麥當勞"


def test_filter_by_category(client: TestClient, auth_headers: dict[str, str]) -> None:
    _create(client, auth_headers, category="飲食")
    _create(client, auth_headers, category="交通")
    _create(client, auth_headers, category="飲食")
    filtered = client.get(
        "/api/expenses?category=飲食", headers=auth_headers
    ).json()
    assert len(filtered) == 2


def test_filter_by_date_range(client: TestClient, auth_headers: dict[str, str]) -> None:
    _create(client, auth_headers, spent_at="2026-04-01")
    _create(client, auth_headers, spent_at="2026-04-05")
    _create(client, auth_headers, spent_at="2026-04-10")
    filtered = client.get(
        "/api/expenses?date_from=2026-04-03&date_to=2026-04-08",
        headers=auth_headers,
    ).json()
    assert len(filtered) == 1
    assert filtered[0]["spent_at"].startswith("2026-04-05")


def test_expense_stats(client: TestClient, auth_headers: dict[str, str]) -> None:
    _create(client, auth_headers, amount=100, category="飲食")
    _create(client, auth_headers, amount=50, category="交通")
    _create(client, auth_headers, amount=30, category="飲食")
    stats = client.get("/api/expenses/stats", headers=auth_headers).json()
    assert stats["total"] == 180
    assert stats["count"] == 3
    assert stats["by_category"]["飲食"] == 130
    assert stats["by_category"]["交通"] == 50


def test_expense_stats_with_date_filter(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    _create(client, auth_headers, amount=100, spent_at="2026-04-01")
    _create(client, auth_headers, amount=200, spent_at="2026-04-10")
    stats = client.get(
        "/api/expenses/stats?date_from=2026-04-05",
        headers=auth_headers,
    ).json()
    assert stats["total"] == 200
    assert stats["count"] == 1


def test_expenses_require_auth(client: TestClient) -> None:
    assert client.get("/api/expenses").status_code == 401
    assert client.post(
        "/api/expenses",
        json={"amount": 10, "category": "x", "spent_at": "2026-04-10"},
    ).status_code == 401


def test_create_expense_validation(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    # amount must be > 0
    response = client.post(
        "/api/expenses",
        headers=auth_headers,
        json={"amount": -5, "category": "飲食", "spent_at": "2026-04-10"},
    )
    assert response.status_code == 422

    # category required
    response = client.post(
        "/api/expenses",
        headers=auth_headers,
        json={"amount": 10, "spent_at": "2026-04-10"},
    )
    assert response.status_code == 422
