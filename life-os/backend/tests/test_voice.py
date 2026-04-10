"""Voice transcription API tests — mock Whisper call。"""

from io import BytesIO
from unittest.mock import patch

from fastapi.testclient import TestClient


def test_voice_requires_auth(client: TestClient) -> None:
    response = client.post(
        "/api/voice/transcribe",
        files={"file": ("test.webm", b"fake", "audio/webm")},
    )
    assert response.status_code == 401


def test_voice_rejects_non_audio(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = client.post(
        "/api/voice/transcribe",
        headers=auth_headers,
        files={"file": ("test.txt", b"hello", "text/plain")},
    )
    assert response.status_code == 400
    assert "音頻" in response.json()["detail"]


def test_voice_rejects_empty(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = client.post(
        "/api/voice/transcribe",
        headers=auth_headers,
        files={"file": ("test.webm", b"", "audio/webm")},
    )
    assert response.status_code == 400


def test_voice_transcribe_success(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    with patch(
        "app.api.voice.transcribe_audio", return_value="提醒我聽日開會"
    ):
        response = client.post(
            "/api/voice/transcribe",
            headers=auth_headers,
            files={"file": ("test.webm", b"fakeaudiodata", "audio/webm")},
        )
    assert response.status_code == 200
    assert response.json()["text"] == "提醒我聽日開會"


def test_voice_transcribe_service_unavailable(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    with patch(
        "app.api.voice.transcribe_audio",
        side_effect=RuntimeError("OPENAI_API_KEY not configured"),
    ):
        response = client.post(
            "/api/voice/transcribe",
            headers=auth_headers,
            files={"file": ("test.webm", b"fakeaudiodata", "audio/webm")},
        )
    assert response.status_code == 503
