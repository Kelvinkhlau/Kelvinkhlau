"""Data export + import API tests。"""

import json

from fastapi.testclient import TestClient


def test_export_requires_auth(client: TestClient) -> None:
    response = client.get("/api/export")
    assert response.status_code == 401


def test_export_empty(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.get("/api/export", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert "exported_at" in body
    assert body["user"]["email"] == "test@example.com"
    assert body["todos"] == []
    assert body["projects"] == []
    assert body["ideas"] == []
    assert body["notes"] == []
    assert body["expenses"] == []


def test_export_with_data(client: TestClient, auth_headers: dict[str, str]) -> None:
    client.post("/api/todos", headers=auth_headers, json={"title": "Test todo"})
    client.post("/api/ideas", headers=auth_headers, json={"title": "Test idea"})
    response = client.get("/api/export", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body["todos"]) == 1
    assert body["todos"][0]["title"] == "Test todo"
    assert len(body["ideas"]) == 1
    assert body["ideas"][0]["title"] == "Test idea"
    assert "Content-Disposition" in response.headers
    assert "lifeos-backup" in response.headers["Content-Disposition"]


def test_import_requires_auth(client: TestClient) -> None:
    response = client.post(
        "/api/export/import",
        files={"file": ("backup.json", b"{}", "application/json")},
    )
    assert response.status_code == 401


def test_import_empty(client: TestClient, auth_headers: dict[str, str]) -> None:
    data = json.dumps({"todos": [], "ideas": []})
    response = client.post(
        "/api/export/import",
        headers=auth_headers,
        files={"file": ("backup.json", data.encode(), "application/json")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["imported"]["todos"] == 0


def test_import_with_data(client: TestClient, auth_headers: dict[str, str]) -> None:
    data = json.dumps({
        "todos": [
            {"title": "Imported todo", "priority": "high", "done": False},
            {"title": "Another todo", "priority": "low", "done": False},
        ],
        "ideas": [
            {"title": "Imported idea", "tags": "test"},
        ],
    })
    response = client.post(
        "/api/export/import",
        headers=auth_headers,
        files={"file": ("backup.json", data.encode(), "application/json")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["imported"]["todos"] == 2
    assert body["imported"]["ideas"] == 1

    # Verify data actually imported
    todos = client.get("/api/todos", headers=auth_headers).json()
    assert any(t["title"] == "Imported todo" for t in todos)
    ideas = client.get("/api/ideas", headers=auth_headers).json()
    assert any(i["title"] == "Imported idea" for i in ideas)


def test_import_roundtrip(client: TestClient, auth_headers: dict[str, str]) -> None:
    """Export → Import 一個完整 cycle。"""
    # Create some data
    client.post("/api/todos", headers=auth_headers, json={"title": "Original"})
    client.post("/api/notes", headers=auth_headers, json={"title": "My note", "content": "# Hello"})

    # Export
    export_res = client.get("/api/export", headers=auth_headers)
    export_data = json.dumps(export_res.json())

    # Import (adds to existing — won't delete originals)
    import_res = client.post(
        "/api/export/import",
        headers=auth_headers,
        files={"file": ("backup.json", export_data.encode(), "application/json")},
    )
    assert import_res.status_code == 200
    body = import_res.json()
    assert body["imported"]["todos"] == 1
    assert body["imported"]["notes"] == 1
