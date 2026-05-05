"""Relations API — polymorphic cross-module linking tests。"""

from fastapi.testclient import TestClient


def _mk_todo(client: TestClient, auth_headers: dict[str, str], title: str) -> int:
    r = client.post("/api/todos", headers=auth_headers, json={"title": title})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _mk_note(client: TestClient, auth_headers: dict[str, str], title: str) -> int:
    r = client.post(
        "/api/notes",
        headers=auth_headers,
        json={"title": title, "content": "body"},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _mk_idea(client: TestClient, auth_headers: dict[str, str], title: str) -> int:
    r = client.post(
        "/api/ideas",
        headers=auth_headers,
        json={"title": title},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_create_relation(client: TestClient, auth_headers: dict[str, str]) -> None:
    todo_id = _mk_todo(client, auth_headers, "寫報告")
    note_id = _mk_note(client, auth_headers, "研究筆記")

    r = client.post(
        "/api/relations",
        headers=auth_headers,
        json={
            "source_type": "todo",
            "source_id": todo_id,
            "target_type": "note",
            "target_id": note_id,
            "kind": "references",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["source_type"] == "todo"
    assert body["source_id"] == todo_id
    assert body["target_type"] == "note"
    assert body["target_id"] == note_id
    assert body["kind"] == "references"


def test_create_dedupes_same_direction(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    todo_id = _mk_todo(client, auth_headers, "A")
    note_id = _mk_note(client, auth_headers, "B")
    payload = {
        "source_type": "todo",
        "source_id": todo_id,
        "target_type": "note",
        "target_id": note_id,
    }
    r1 = client.post("/api/relations", headers=auth_headers, json=payload)
    r2 = client.post("/api/relations", headers=auth_headers, json=payload)
    assert r1.status_code == 201
    # 第二次仍然 201（返回既有 relation） — 或者 200，兩個都可接受
    assert r2.status_code in (200, 201)
    assert r1.json()["id"] == r2.json()["id"]


def test_cannot_self_link(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    todo_id = _mk_todo(client, auth_headers, "x")
    r = client.post(
        "/api/relations",
        headers=auth_headers,
        json={
            "source_type": "todo",
            "source_id": todo_id,
            "target_type": "todo",
            "target_id": todo_id,
        },
    )
    assert r.status_code == 400


def test_invalid_entity_type(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    todo_id = _mk_todo(client, auth_headers, "x")
    r = client.post(
        "/api/relations",
        headers=auth_headers,
        json={
            "source_type": "todo",
            "source_id": todo_id,
            "target_type": "invalid_kind",
            "target_id": 1,
        },
    )
    assert r.status_code == 400


def test_target_not_found(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    todo_id = _mk_todo(client, auth_headers, "x")
    r = client.post(
        "/api/relations",
        headers=auth_headers,
        json={
            "source_type": "todo",
            "source_id": todo_id,
            "target_type": "note",
            "target_id": 999999,
        },
    )
    assert r.status_code == 404


def test_list_bidirectional(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    """無論 entity 係 source 定 target，list 都會返到個 link。"""
    todo_id = _mk_todo(client, auth_headers, "todo A")
    note_id = _mk_note(client, auth_headers, "note B")

    # todo → note
    client.post(
        "/api/relations",
        headers=auth_headers,
        json={
            "source_type": "todo",
            "source_id": todo_id,
            "target_type": "note",
            "target_id": note_id,
        },
    )

    # 從 todo 角度 list
    r1 = client.get(
        f"/api/relations?type=todo&id={todo_id}", headers=auth_headers
    )
    assert r1.status_code == 200
    links1 = r1.json()
    assert len(links1) == 1
    assert links1[0]["entity"]["type"] == "note"
    assert links1[0]["entity"]["id"] == note_id

    # 從 note 角度 list（反向都要返到）
    r2 = client.get(
        f"/api/relations?type=note&id={note_id}", headers=auth_headers
    )
    assert r2.status_code == 200
    links2 = r2.json()
    assert len(links2) == 1
    assert links2[0]["entity"]["type"] == "todo"
    assert links2[0]["entity"]["id"] == todo_id


def test_delete_relation(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    todo_id = _mk_todo(client, auth_headers, "A")
    note_id = _mk_note(client, auth_headers, "B")
    created = client.post(
        "/api/relations",
        headers=auth_headers,
        json={
            "source_type": "todo",
            "source_id": todo_id,
            "target_type": "note",
            "target_id": note_id,
        },
    ).json()

    r = client.delete(
        f"/api/relations/{created['id']}", headers=auth_headers
    )
    assert r.status_code == 204

    # List 之後應該空
    listed = client.get(
        f"/api/relations?type=todo&id={todo_id}", headers=auth_headers
    ).json()
    assert listed == []


def test_dangling_relation_cleaned_on_list(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    """對方 entity 被刪 → list 時自動清走 orphan relation。"""
    todo_id = _mk_todo(client, auth_headers, "A")
    note_id = _mk_note(client, auth_headers, "B")
    client.post(
        "/api/relations",
        headers=auth_headers,
        json={
            "source_type": "todo",
            "source_id": todo_id,
            "target_type": "note",
            "target_id": note_id,
        },
    )
    # 刪 note
    del_r = client.delete(f"/api/notes/{note_id}", headers=auth_headers)
    assert del_r.status_code in (200, 204)

    # 從 todo 角度 list — 應該冇 dangling link
    r = client.get(f"/api/relations?type=todo&id={todo_id}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == []


def test_search_entities(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    _mk_todo(client, auth_headers, "買餸去街市")
    _mk_note(client, auth_headers, "街市筆記")
    _mk_idea(client, auth_headers, "新餐廳 idea")

    r = client.get(
        "/api/relations/search?q=街市&types=todo,note,idea",
        headers=auth_headers,
    )
    assert r.status_code == 200
    results = r.json()
    types = {x["type"] for x in results}
    # 起碼有 todo 同 note 兩種命中
    assert "todo" in types
    assert "note" in types
    # "新餐廳" 唔會 match "街市"
    titles = [x["title"] for x in results]
    assert "新餐廳 idea" not in titles


def test_search_requires_valid_types(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.get(
        "/api/relations/search?q=x&types=invalid", headers=auth_headers
    )
    assert r.status_code == 400


def test_requires_auth(client: TestClient) -> None:
    r = client.get("/api/relations?type=todo&id=1")
    assert r.status_code == 401
