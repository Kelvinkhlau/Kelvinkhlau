"""Todo CRUD end-to-end smoke tests。"""

from fastapi.testclient import TestClient


def test_list_todos_empty(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.get("/api/todos", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_create_todo_minimal(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.post(
        "/api/todos",
        headers=auth_headers,
        json={"title": "買餸"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "買餸"
    assert body["done"] is False
    assert body["priority"] == "medium"  # default
    assert body["id"] > 0


def test_create_todo_full(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.post(
        "/api/todos",
        headers=auth_headers,
        json={
            "title": "交水電費",
            "description": "記得 auto-pay",
            "priority": "high",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "交水電費"
    assert body["description"] == "記得 auto-pay"
    assert body["priority"] == "high"


def test_create_todo_rejects_invalid_priority(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = client.post(
        "/api/todos",
        headers=auth_headers,
        json={"title": "x", "priority": "urgent"},  # not a valid priority
    )
    # Pydantic 會 422，service 層再保險 400 — 兩個都係 client error
    assert response.status_code in (400, 422)


def test_list_todos_after_create(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    client.post("/api/todos", headers=auth_headers, json={"title": "A"})
    client.post("/api/todos", headers=auth_headers, json={"title": "B"})

    response = client.get("/api/todos", headers=auth_headers)
    assert response.status_code == 200
    items = response.json()
    assert len(items) == 2
    titles = {t["title"] for t in items}
    assert titles == {"A", "B"}


def test_toggle_done(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = client.post(
        "/api/todos", headers=auth_headers, json={"title": "sleep"}
    ).json()
    todo_id = created["id"]

    # Mark done
    response = client.patch(
        f"/api/todos/{todo_id}", headers=auth_headers, json={"done": True}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["done"] is True
    assert body["completed_at"] is not None

    # Toggle back
    response = client.patch(
        f"/api/todos/{todo_id}", headers=auth_headers, json={"done": False}
    )
    assert response.json()["done"] is False
    assert response.json()["completed_at"] is None


def test_update_title_priority(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    created = client.post(
        "/api/todos", headers=auth_headers, json={"title": "old"}
    ).json()
    response = client.patch(
        f"/api/todos/{created['id']}",
        headers=auth_headers,
        json={"title": "new", "priority": "low"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "new"
    assert body["priority"] == "low"


def test_delete_todo(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = client.post(
        "/api/todos", headers=auth_headers, json={"title": "temp"}
    ).json()
    todo_id = created["id"]

    response = client.delete(f"/api/todos/{todo_id}", headers=auth_headers)
    assert response.status_code == 204

    # 再 get 應該 404
    response = client.get(f"/api/todos/{todo_id}", headers=auth_headers)
    assert response.status_code == 404


def test_update_nonexistent_404(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = client.patch(
        "/api/todos/999999", headers=auth_headers, json={"title": "x"}
    )
    assert response.status_code == 404


def test_filter_by_done(client: TestClient, auth_headers: dict[str, str]) -> None:
    # create two, mark one done
    a = client.post("/api/todos", headers=auth_headers, json={"title": "a"}).json()
    client.post("/api/todos", headers=auth_headers, json={"title": "b"})
    client.patch(
        f"/api/todos/{a['id']}", headers=auth_headers, json={"done": True}
    )

    pending = client.get(
        "/api/todos?done=false", headers=auth_headers
    ).json()
    assert len(pending) == 1
    assert pending[0]["title"] == "b"

    done = client.get("/api/todos?done=true", headers=auth_headers).json()
    assert len(done) == 1
    assert done[0]["title"] == "a"
