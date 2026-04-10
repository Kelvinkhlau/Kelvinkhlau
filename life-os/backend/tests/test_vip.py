"""VIP sender CRUD + dedup tests。"""

from fastapi.testclient import TestClient


def test_list_vips_empty(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.get("/api/vip", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_add_vip(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.post(
        "/api/vip",
        headers=auth_headers,
        json={"email": "Boss@Company.com", "name": "老闆"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "boss@company.com"  # 自動 lowercase
    assert body["name"] == "老闆"


def test_add_vip_duplicate(client: TestClient, auth_headers: dict[str, str]) -> None:
    client.post(
        "/api/vip",
        headers=auth_headers,
        json={"email": "dupe@test.com"},
    )
    response = client.post(
        "/api/vip",
        headers=auth_headers,
        json={"email": "DUPE@test.com"},  # same email diff case
    )
    assert response.status_code == 409


def test_update_vip(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = client.post(
        "/api/vip",
        headers=auth_headers,
        json={"email": "a@b.com", "name": "old"},
    ).json()
    response = client.patch(
        f"/api/vip/{created['id']}",
        headers=auth_headers,
        json={"name": "new", "note": "重要客戶"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "new"
    assert response.json()["note"] == "重要客戶"


def test_delete_vip(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = client.post(
        "/api/vip",
        headers=auth_headers,
        json={"email": "del@test.com"},
    ).json()
    response = client.delete(
        f"/api/vip/{created['id']}", headers=auth_headers
    )
    assert response.status_code == 204

    # list 應該空
    vips = client.get("/api/vip", headers=auth_headers).json()
    assert len(vips) == 0


def test_vip_requires_auth(client: TestClient) -> None:
    assert client.get("/api/vip").status_code == 401
    assert client.post(
        "/api/vip", json={"email": "a@b.com"}
    ).status_code == 401
