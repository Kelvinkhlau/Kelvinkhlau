"""WebAuthn / Passkey helpers。

單用戶系統 —— 一個 user 有一個 passkey。Challenge 存喺 in-memory dict
（單 process、重啟會清除，MVP 夠用）。
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


def _expected_origin() -> str:
    """WebAuthn `origin` 驗證值 — 用 frontend_url。"""
    return settings.frontend_url.rstrip("/")


# === Registration ==============================================

def start_registration(user_id: int, user_email: str, user_name: str) -> tuple[str, dict[str, Any]]:
    """Return `(challenge_token, options_json)` — options 送俾 browser。"""
    options = generate_registration_options(
        rp_id=settings.webauthn_rp_id,
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
    challenge_token: str, credential: dict[str, Any]
) -> RegistrationVerified:
    stored = challenge_store.pop(challenge_token)
    if stored is None:
        raise ValueError("challenge expired or invalid")

    verification = verify_registration_response(
        credential=credential,
        expected_challenge=stored.challenge,
        expected_rp_id=settings.webauthn_rp_id,
        expected_origin=_expected_origin(),
    )
    return RegistrationVerified(
        credential_id=_b64url(verification.credential_id),
        public_key=_b64url(verification.credential_public_key),
        sign_count=verification.sign_count,
    )


# === Authentication ============================================

def start_authentication(credential_id_b64url: str) -> tuple[str, dict[str, Any]]:
    """為已註冊嘅 user 產生 assertion options。"""
    options = generate_authentication_options(
        rp_id=settings.webauthn_rp_id,
        allow_credentials=[
            PublicKeyCredentialDescriptor(id=_b64url_decode(credential_id_b64url))
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
) -> AuthenticationVerified:
    stored = challenge_store.pop(challenge_token)
    if stored is None:
        raise ValueError("challenge expired or invalid")

    verification = verify_authentication_response(
        credential=credential,
        expected_challenge=stored.challenge,
        expected_rp_id=settings.webauthn_rp_id,
        expected_origin=_expected_origin(),
        credential_public_key=_b64url_decode(stored_public_key_b64url),
        credential_current_sign_count=stored_sign_count,
    )
    return AuthenticationVerified(new_sign_count=verification.new_sign_count)
