"""WebAuthn / Passkey helpers。

單用戶系統 —— 一個 user 可以有多個 passkey（每部 device 一個 credential）。
Challenge 存喺 in-memory dict（單 process、重啟會清除，MVP 夠用）。
"""

from __future__ import annotations

import base64
import logging
import os
import threading
import time
from dataclasses import dataclass
from typing import Any

from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers.cose import COSEAlgorithmIdentifier
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    AuthenticatorTransport,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# === Challenge store ============================================

@dataclass
class _StoredChallenge:
    challenge: bytes
    user_id: int | None  # register 時係新 user ID（或 owner 固定 id），login 時係 None
    expires_at: float


class _ChallengeStore:
    """Thread-safe in-memory challenge store。5 分鐘過期。"""

    TTL_SECONDS = 300

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._data: dict[str, _StoredChallenge] = {}

    def put(self, challenge: bytes, user_id: int | None = None) -> str:
        token = base64.urlsafe_b64encode(os.urandom(18)).decode().rstrip("=")
        with self._lock:
            self._gc_locked()
            self._data[token] = _StoredChallenge(
                challenge=challenge,
                user_id=user_id,
                expires_at=time.time() + self.TTL_SECONDS,
            )
        return token

    def pop(self, token: str) -> _StoredChallenge | None:
        with self._lock:
            self._gc_locked()
            return self._data.pop(token, None)

    def _gc_locked(self) -> None:
        now = time.time()
        expired = [k for k, v in self._data.items() if v.expires_at < now]
        for k in expired:
            self._data.pop(k, None)


challenge_store = _ChallengeStore()


# === Helpers ====================================================

def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64url_decode(text: str) -> bytes:
    padding = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + padding)


def _expected_origins() -> list[str]:
    """WebAuthn `origin` 驗證值 — 支援多個 origin（開發 + 生產）。"""
    origins = {settings.frontend_url.rstrip("/")}
    # 永遠都支援 localhost 開發
    origins.add("http://localhost:3100")
    origins.add("http://localhost:3000")
    return list(origins)


def resolve_rp_id(host: str | None = None) -> str:
    """根據 request Host header 自動選擇 RP ID。
    - localhost 訪問 → "localhost"
    - Tailscale / 其他 → settings.webauthn_rp_id
    """
    if host:
        # 去掉 port
        hostname = host.split(":")[0]
        if hostname in ("localhost", "127.0.0.1"):
            return "localhost"
    return settings.webauthn_rp_id


# === Registration ==============================================

def start_registration(
    user_id: int,
    user_email: str,
    user_name: str,
    *,
    existing_credential_ids_b64url: list[str] | None = None,
    host: str | None = None,
) -> tuple[str, dict[str, Any]]:
    """Return `(challenge_token, options_json)` — options 送俾 browser。

    `existing_credential_ids_b64url`: 已經喺呢個 user 註冊過嘅 credential id list，
    放入 `excludeCredentials` 防止同一部 device 重複註冊。
    """
    rp_id = resolve_rp_id(host)
    exclude_transports = [
        AuthenticatorTransport.INTERNAL,
        AuthenticatorTransport.HYBRID,
    ]
    exclude = [
        PublicKeyCredentialDescriptor(
            id=_b64url_decode(cid), transports=exclude_transports
        )
        for cid in (existing_credential_ids_b64url or [])
    ]
    options = generate_registration_options(
        rp_id=rp_id,
        rp_name=settings.webauthn_rp_name,
        user_id=str(user_id).encode(),
        user_name=user_email,
        user_display_name=user_name,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
        supported_pub_key_algs=[
            COSEAlgorithmIdentifier.ECDSA_SHA_256,
            COSEAlgorithmIdentifier.RSASSA_PKCS1_v1_5_SHA_256,
        ],
        exclude_credentials=exclude or None,
    )
    token = challenge_store.put(options.challenge, user_id=user_id)
    options_json: dict[str, Any] = __import__("json").loads(options_to_json(options))
    return token, options_json


@dataclass
class RegistrationVerified:
    credential_id: str  # base64url
    public_key: str  # base64url
    sign_count: int


def finish_registration(
    challenge_token: str, credential: dict[str, Any], *, host: str | None = None
) -> RegistrationVerified:
    stored = challenge_store.pop(challenge_token)
    if stored is None:
        raise ValueError("challenge expired or invalid")

    rp_id = resolve_rp_id(host)
    verification = verify_registration_response(
        credential=credential,
        expected_challenge=stored.challenge,
        expected_rp_id=rp_id,
        expected_origin=_expected_origins(),
    )
    return RegistrationVerified(
        credential_id=_b64url(verification.credential_id),
        public_key=_b64url(verification.credential_public_key),
        sign_count=verification.sign_count,
    )


# === Authentication ============================================

def start_authentication(
    credential_ids_b64url: list[str], *, host: str | None = None
) -> tuple[str, dict[str, Any]]:
    """為已註冊嘅 user 產生 assertion options。

    傳入嗰個 user 嘅所有 credential id，browser 會揀其中一個（match 到 device 上面嘅 passkey）。
    Transports 包含 `internal`（同部 device 嘅 platform authenticator）+ `hybrid`
    （cross-device QR code flow — 例如 Mac mini 借 iPhone 嘅 passkey 登入）。
    """
    rp_id = resolve_rp_id(host)
    transports = [AuthenticatorTransport.INTERNAL, AuthenticatorTransport.HYBRID]
    options = generate_authentication_options(
        rp_id=rp_id,
        allow_credentials=[
            PublicKeyCredentialDescriptor(
                id=_b64url_decode(cid), transports=transports
            )
            for cid in credential_ids_b64url
        ],
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    token = challenge_store.put(options.challenge, user_id=None)
    options_json: dict[str, Any] = __import__("json").loads(options_to_json(options))
    return token, options_json


@dataclass
class AuthenticationVerified:
    new_sign_count: int


def finish_authentication(
    challenge_token: str,
    credential: dict[str, Any],
    stored_public_key_b64url: str,
    stored_sign_count: int,
    *,
    host: str | None = None,
) -> AuthenticationVerified:
    stored = challenge_store.pop(challenge_token)
    if stored is None:
        raise ValueError("challenge expired or invalid")

    rp_id = resolve_rp_id(host)
    verification = verify_authentication_response(
        credential=credential,
        expected_challenge=stored.challenge,
        expected_rp_id=rp_id,
        expected_origin=_expected_origins(),
        credential_public_key=_b64url_decode(stored_public_key_b64url),
        credential_current_sign_count=stored_sign_count,
    )
    return AuthenticationVerified(new_sign_count=verification.new_sign_count)
