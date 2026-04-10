"""Project CRUD + Todo linkage smoke tests。"""

from fastapi.testclient import TestClient


def test_list_projects_empty(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.get("/api/projects", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_create_project_minimal(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = client.post(
        "/api/projects",
        headers=auth_headers,
        json={"name": "生活雜務"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "生活雜務"
    assert body["status"] == "active"
    assert body["todo_count"] == 0
    assert body["done_count"] == 0
    assert body["id"] > 0


def test_create_project_full(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = client.post(
        "/api/projects",
        headers=auth_headers,
        json={
            "name": "學廣東話",
            "description": "每日 30 分鐘",
            "status": "active",
            "color": "#3b82f6",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["description"] == "每日 30 分鐘"
    assert body["color"] == "#3b82f6"


def test_create_project_invalid_status(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = client.post(
        "/api/projects",
        headers=auth_headers,
        json={"name": "x", "status": "unknown"},
    )
    assert response.status_code in (400, 422)


def test_update_project(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    created = client.post(
        "/api/projects", headers=auth_headers, json={"name": "old"}
    ).json()
    response = client.patch(
        f"/api/projects/{created['id']}",
        headers=auth_headers,
        json={"name": "new", "status": "paused"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "new"
    assert body["status"] == "paused"


def test_delete_project(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    created = client.post(
        "/api/projects", headers=auth_headers, json={"name": "temp"}
    ).json()
    response = client.delete(
        f"/api/projects/{created['id']}", headers=auth_headers
    )
    assert response.status_code == 204
    response = client.get(
        f"/api/projects/{created['id']}", headers=auth_headers
    )
    assert response.status_code == 404


def test_filter_by_status(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    client.post("/api/projects", headers=auth_headers, json={"name": "A"})
    b = client.post(
        "/api/projects", headers=auth_headers, json={"name": "B"}
    ).json()
    client.patch(
        f"/api/projects/{b['id']}",
        headers=auth_headers,
        json={"status": "archived"},
    )

    active = client.get(
        "/api/projects?status=active", headers=auth_headers
    ).json()
    assert len(active) == 1
    assert active[0]["name"] == "A"

    archived = client.get(
        "/api/projects?status=archived", headers=auth_headers
    ).json()
    assert len(archived) == 1
    assert archived[0]["name"] == "B"


def test_create_todo_with_project(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project = client.post(
        "/api/projects", headers=auth_headers, json={"name": "Work"}
    ).json()
    todo = client.post(
        "/api/todos",
        headers=auth_headers,
        json={"title": "deploy", "project_id": project["id"]},
    )
    assert todo.status_code == 201
    assert todo.json()["project_id"] == project["id"]


def test_create_todo_rejects_invalid_project(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = client.post(
        "/api/todos",
        headers=auth_headers,
        json={"title": "x", "project_id": 999999},
    )
    assert response.status_code == 400


def test_todo_counts_on_project(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project = client.post(
        "/api/projects", headers=auth_headers, json={"name": "Chores"}
    ).json()
    t1 = client.post(
        "/api/todos",
        headers=auth_headers,
        json={"title": "a", "project_id": project["id"]},
    ).json()
    client.post(
        "/api/todos",
        headers=auth_headers,
        json={"title": "b", "project_id": project["id"]},
    )
    # mark one done
    client.patch(
        f"/api/todos/{t1['id']}", headers=auth_headers, json={"done": True}
    )

    body = client.get(
        f"/api/projects/{project['id']}", headers=auth_headers
    ).json()
    assert body["todo_count"] == 2
    assert body["done_count"] == 1


def test_filter_todos_by_project(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    p = client.post(
        "/api/projects", headers=auth_headers, json={"name": "P"}
    ).json()
    client.post(
        "/api/todos",
        headers=auth_headers,
        json={"title": "in project", "project_id": p["id"]},
    )
    client.post(
        "/api/todos", headers=auth_headers, json={"title": "standalone"}
    )

    in_project = client.get(
        f"/api/todos?project_id={p['id']}", headers=auth_headers
    ).json()
    assert len(in_project) == 1
    assert in_project[0]["title"] == "in project"

    all_todos = client.get("/api/todos", headers=auth_headers).json()
    assert len(all_todos) == 2


def test_delete_project_keeps_todos(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    """刪 project 後，todos 應該仲喺度（project_id SET NULL）。"""
    p = client.post(
        "/api/projects", headers=auth_headers, json={"name": "P"}
    ).json()
    todo = client.post(
        "/api/todos",
        headers=auth_headers,
        json={"title": "orphan", "project_id": p["id"]},
    ).json()

    response = client.delete(
        f"/api/projects/{p['id']}", headers=auth_headers
    )
    assert response.status_code == 204

    response = client.get(
        f"/api/todos/{todo['id']}", headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["project_id"] is None


def test_reassign_todo_project(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    p1 = client.post(
        "/api/projects", headers=auth_headers, json={"name": "P1"}
    ).json()
    p2 = client.post(
        "/api/projects", headers=auth_headers, json={"name": "P2"}
    ).json()
    todo = client.post(
        "/api/todos",
        headers=auth_headers,
        json={"title": "move", "project_id": p1["id"]},
    ).json()

    response = client.patch(
        f"/api/todos/{todo['id']}",
        headers=auth_headers,
        json={"project_id": p2["id"]},
    )
    assert response.status_code == 200
    assert response.json()["project_id"] == p2["id"]

    # Unassign via explicit null
    response = client.patch(
        f"/api/todos/{todo['id']}",
        headers=auth_headers,
        json={"project_id": None},
    )
    assert response.status_code == 200
    assert response.json()["project_id"] is None
