"""AI assistant API smoke tests — mock AI call。"""

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.services.ai_assistant import AssistantResult


def test_assistant_requires_auth(client: TestClient) -> None:
    response = client.post("/api/assistant/chat", json={"message": "hi"})
    assert response.status_code == 401


def test_assistant_chat_action(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    mock_result = AssistantResult(
        action="chat", reply="你好！有咩幫到你？", data={}
    )
    with patch(
        "app.api.assistant.ask_assistant", return_value=mock_result
    ):
        response = client.post(
            "/api/assistant/chat",
            headers=auth_headers,
            json={"message": "你好"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["action"] == "chat"
    assert "你好" in body["reply"]
    assert body["created_id"] is None


def test_assistant_create_todo(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    mock_result = AssistantResult(
        action="create_todo",
        reply="已加 todo",
        data={"title": "買牛奶", "priority": "medium"},
    )
    with patch(
        "app.api.assistant.ask_assistant", return_value=mock_result
    ):
        response = client.post(
            "/api/assistant/chat",
            headers=auth_headers,
            json={"message": "提醒我買牛奶"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["action"] == "create_todo"
    assert body["created_type"] == "todo"
    assert body["created_id"] is not None

    # 確認 todo 真係建咗
    todos = client.get("/api/todos", headers=auth_headers).json()
    assert any(t["title"] == "買牛奶" for t in todos)


def test_assistant_create_idea(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    mock_result = AssistantResult(
        action="create_idea",
        reply="已記低",
        data={"title": "AI app", "content": "分類相片", "tags": "ai,app"},
    )
    with patch(
        "app.api.assistant.ask_assistant", return_value=mock_result
    ):
        response = client.post(
            "/api/assistant/chat",
            headers=auth_headers,
            json={"message": "記低個 idea"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["action"] == "create_idea"
    assert body["created_type"] == "idea"

    ideas = client.get("/api/ideas", headers=auth_headers).json()
    assert any(i["title"] == "AI app" for i in ideas)


def test_assistant_create_project(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    mock_result = AssistantResult(
        action="create_project",
        reply="已建立",
        data={"name": "新 side project", "description": "用 Rust 寫"},
    )
    with patch(
        "app.api.assistant.ask_assistant", return_value=mock_result
    ):
        response = client.post(
            "/api/assistant/chat",
            headers=auth_headers,
            json={"message": "開個新 project"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["action"] == "create_project"
    assert body["created_type"] == "project"

    projects = client.get("/api/projects", headers=auth_headers).json()
    assert any(p["name"] == "新 side project" for p in projects)


def test_assistant_rejects_empty(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = client.post(
        "/api/assistant/chat",
        headers=auth_headers,
        json={"message": ""},
    )
    assert response.status_code == 422
