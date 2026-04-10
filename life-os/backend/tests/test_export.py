"""Data export API tests。"""

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
