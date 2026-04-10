"""Idea CRUD + pin / archive / search smoke tests。"""

from fastapi.testclient import TestClient


def test_list_ideas_empty(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.get("/api/ideas", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_create_idea_minimal(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.post(
        "/api/ideas", headers=auth_headers, json={"title": "學日文"}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "學日文"
    assert body["pinned"] is False
    assert body["archived"] is False
    assert body["tags"] == ""


def test_create_idea_with_tags(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = client.post(
        "/api/ideas",
        headers=auth_headers,
        json={"title": "Recipe idea", "content": "# 蕃茄炒蛋\n好好味", "tags": "food,recipe"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["tags"] == "food,recipe"
    assert body["content"] == "# 蕃茄炒蛋\n好好味"


def test_update_idea(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = client.post(
        "/api/ideas", headers=auth_headers, json={"title": "old"}
    ).json()
    response = client.patch(
        f"/api/ideas/{created['id']}",
        headers=auth_headers,
        json={"title": "new", "tags": "updated"},
    )
    assert response.status_code == 200
    assert response.json()["title"] == "new"
    assert response.json()["tags"] == "updated"


def test_pin_idea(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = client.post(
        "/api/ideas", headers=auth_headers, json={"title": "pin me"}
    ).json()
    response = client.patch(
        f"/api/ideas/{created['id']}",
        headers=auth_headers,
        json={"pinned": True},
    )
    assert response.status_code == 200
    assert response.json()["pinned"] is True


def test_archive_idea(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = client.post(
        "/api/ideas", headers=auth_headers, json={"title": "archive me"}
    ).json()
    client.patch(
        f"/api/ideas/{created['id']}",
        headers=auth_headers,
        json={"archived": True},
    )
    # default list 唔會顯示 archived
    active = client.get("/api/ideas", headers=auth_headers).json()
    assert len(active) == 0
    # 但加 archived=true 就有
    archived = client.get(
        "/api/ideas?archived=true", headers=auth_headers
    ).json()
    assert len(archived) == 1
    assert archived[0]["title"] == "archive me"


def test_delete_idea(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = client.post(
        "/api/ideas", headers=auth_headers, json={"title": "temp"}
    ).json()
    response = client.delete(
        f"/api/ideas/{created['id']}", headers=auth_headers
    )
    assert response.status_code == 204
    response = client.get(
        f"/api/ideas/{created['id']}", headers=auth_headers
    )
    assert response.status_code == 404


def test_filter_by_tag(client: TestClient, auth_headers: dict[str, str]) -> None:
    client.post(
        "/api/ideas",
        headers=auth_headers,
        json={"title": "A", "tags": "python,ai"},
    )
    client.post(
        "/api/ideas",
        headers=auth_headers,
        json={"title": "B", "tags": "cooking"},
    )
    filtered = client.get(
        "/api/ideas?tag=python", headers=auth_headers
    ).json()
    assert len(filtered) == 1
    assert filtered[0]["title"] == "A"


def test_search_ideas(client: TestClient, auth_headers: dict[str, str]) -> None:
    client.post(
        "/api/ideas",
        headers=auth_headers,
        json={"title": "Learn Rust", "content": "systems programming"},
    )
    client.post(
        "/api/ideas",
        headers=auth_headers,
        json={"title": "Buy milk"},
    )
    found = client.get(
        "/api/ideas?q=rust", headers=auth_headers
    ).json()
    assert len(found) == 1
    assert found[0]["title"] == "Learn Rust"


def test_pinned_first_ordering(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    a = client.post(
        "/api/ideas", headers=auth_headers, json={"title": "normal"}
    ).json()
    b = client.post(
        "/api/ideas", headers=auth_headers, json={"title": "pinned"}
    ).json()
    client.patch(
        f"/api/ideas/{b['id']}",
        headers=auth_headers,
        json={"pinned": True},
    )
    ideas = client.get("/api/ideas", headers=auth_headers).json()
    assert ideas[0]["title"] == "pinned"
    assert ideas[1]["title"] == "normal"


def test_ideas_require_auth(client: TestClient) -> None:
    assert client.get("/api/ideas").status_code == 401
    assert client.post("/api/ideas", json={"title": "x"}).status_code == 401


def test_link_idea_to_project(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project = client.post(
        "/api/projects", headers=auth_headers, json={"name": "P"}
    ).json()
    idea = client.post(
        "/api/ideas",
        headers=auth_headers,
        json={"title": "linked", "project_id": project["id"]},
    ).json()
    assert idea["project_id"] == project["id"]

    # unlink
    response = client.patch(
        f"/api/ideas/{idea['id']}",
        headers=auth_headers,
        json={"project_id": None},
    )
    assert response.json()["project_id"] is None
