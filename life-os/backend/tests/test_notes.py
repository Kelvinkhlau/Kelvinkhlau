"""Note / Knowledge CRUD + search + folder tests。"""

from fastapi.testclient import TestClient


def _create(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {"title": "Test note", **overrides}
    res = client.post("/api/notes", headers=headers, json=payload)
    assert res.status_code == 201
    return res.json()


def test_list_notes_empty(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.get("/api/notes", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_create_note_minimal(client: TestClient, auth_headers: dict[str, str]) -> None:
    body = _create(client, auth_headers, title="Hello")
    assert body["title"] == "Hello"
    assert body["content"] == ""
    assert body["folder"] == ""
    assert body["pinned"] is False


def test_create_note_full(client: TestClient, auth_headers: dict[str, str]) -> None:
    body = _create(
        client,
        auth_headers,
        title="Docker 筆記",
        content="# Docker\n\n用 `docker run` ...",
        folder="技術",
        tags="docker,devops",
    )
    assert body["folder"] == "技術"
    assert body["tags"] == "docker,devops"
    assert "Docker" in body["content"]


def test_update_note(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = _create(client, auth_headers)
    response = client.patch(
        f"/api/notes/{created['id']}",
        headers=auth_headers,
        json={"title": "Updated", "folder": "新 folder"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Updated"
    assert body["folder"] == "新 folder"


def test_delete_note(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = _create(client, auth_headers)
    response = client.delete(
        f"/api/notes/{created['id']}", headers=auth_headers
    )
    assert response.status_code == 204
    assert client.get(
        f"/api/notes/{created['id']}", headers=auth_headers
    ).status_code == 404


def test_pin_note(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = _create(client, auth_headers, title="pin me")
    response = client.patch(
        f"/api/notes/{created['id']}",
        headers=auth_headers,
        json={"pinned": True},
    )
    assert response.json()["pinned"] is True


def test_archive_note(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = _create(client, auth_headers, title="archive me")
    client.patch(
        f"/api/notes/{created['id']}",
        headers=auth_headers,
        json={"archived": True},
    )
    active = client.get("/api/notes", headers=auth_headers).json()
    assert all(n["title"] != "archive me" for n in active)
    archived = client.get(
        "/api/notes?archived=true", headers=auth_headers
    ).json()
    assert any(n["title"] == "archive me" for n in archived)


def test_filter_by_folder(client: TestClient, auth_headers: dict[str, str]) -> None:
    _create(client, auth_headers, title="A", folder="技術")
    _create(client, auth_headers, title="B", folder="生活")
    filtered = client.get(
        "/api/notes?folder=技術", headers=auth_headers
    ).json()
    assert len(filtered) == 1
    assert filtered[0]["title"] == "A"


def test_filter_by_tag(client: TestClient, auth_headers: dict[str, str]) -> None:
    _create(client, auth_headers, title="A", tags="python,ai")
    _create(client, auth_headers, title="B", tags="cooking")
    filtered = client.get(
        "/api/notes?tag=python", headers=auth_headers
    ).json()
    assert len(filtered) == 1
    assert filtered[0]["title"] == "A"


def test_search_notes(client: TestClient, auth_headers: dict[str, str]) -> None:
    _create(client, auth_headers, title="Rust 入門", content="systems programming")
    _create(client, auth_headers, title="買菜清單")
    found = client.get(
        "/api/notes?q=rust", headers=auth_headers
    ).json()
    assert len(found) == 1
    assert found[0]["title"] == "Rust 入門"


def test_list_folders(client: TestClient, auth_headers: dict[str, str]) -> None:
    _create(client, auth_headers, folder="技術")
    _create(client, auth_headers, folder="生活")
    _create(client, auth_headers, folder="技術")  # duplicate
    _create(client, auth_headers, folder="")  # empty — should not appear
    folders = client.get("/api/notes/folders", headers=auth_headers).json()
    assert sorted(folders) == ["技術", "生活"]


def test_pinned_first(client: TestClient, auth_headers: dict[str, str]) -> None:
    _create(client, auth_headers, title="normal")
    b = _create(client, auth_headers, title="pinned")
    client.patch(
        f"/api/notes/{b['id']}",
        headers=auth_headers,
        json={"pinned": True},
    )
    notes = client.get("/api/notes", headers=auth_headers).json()
    assert notes[0]["title"] == "pinned"


def test_notes_require_auth(client: TestClient) -> None:
    assert client.get("/api/notes").status_code == 401
    assert client.post("/api/notes", json={"title": "x"}).status_code == 401
