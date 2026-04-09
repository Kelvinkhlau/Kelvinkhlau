"""JWT issue / decode unit tests。"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from jose import jwt

from app.config import get_settings
from app.services import jwt_service


def test_issue_and_decode_roundtrip() -> None:
    token = jwt_service.issue_token(user_id=42)
    payload = jwt_service.decode_token(token)
    assert payload is not None
    assert payload["sub"] == "42"
    assert "exp" in payload
    assert "iat" in payload


def test_decode_rejects_garbage() -> None:
    assert jwt_service.decode_token("not.a.jwt") is None
    assert jwt_service.decode_token("") is None


def test_decode_rejects_wrong_secret() -> None:
    # 用唔同 secret 簽，應該 decode 唔到
    bad_token = jwt.encode(
        {"sub": "1", "exp": datetime.now(tz=UTC).timestamp() + 3600},
        "different-secret-that-is-not-the-app-secret-key",
        algorithm="HS256",
    )
    assert jwt_service.decode_token(bad_token) is None


def test_decode_rejects_expired() -> None:
    settings = get_settings()
    # Manually 簽個已經過期嘅 token
    past = datetime.now(tz=UTC) - timedelta(hours=1)
    expired = jwt.encode(
        {"sub": "1", "exp": int(past.timestamp())},
        settings.app_secret_key,
        algorithm=settings.jwt_algorithm,
    )
    assert jwt_service.decode_token(expired) is None


def test_issue_includes_extra_claims() -> None:
    token = jwt_service.issue_token(user_id=1, extra={"role": "owner"})
    payload = jwt_service.decode_token(token)
    assert payload is not None
    assert payload["role"] == "owner"
