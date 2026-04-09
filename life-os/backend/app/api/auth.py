"""認證 routes — Passkey (WebAuthn) + Gmail OAuth2。"""

from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.config import get_settings
from app.deps import DbSession
from app.models.user import User
from app.services import gmail_client, jwt_service, passkey_service

router = APIRouter()
settings = get_settings()


# ===== Passkey (WebAuthn) =====


class PasskeyRegisterFinishPayload(BaseModel):
    challenge_token: str
    credential: dict[str, Any]


class PasskeyLoginFinishPayload(BaseModel):
    challenge_token: str
    credential: dict[str, Any]


def _get_or_create_owner(db) -> User:
    """Local-first 單用戶 — 冇 user 就用 .env 嘅 owner 資料建一個。"""
    user = db.execute(select(User).limit(1)).scalar_one_or_none()
    if user is None:
        user = User(email=settings.owner_email, name=settings.owner_name)
        db.add(user)
        db.flush()
    return user


@router.post("/passkey/register/start")
async def passkey_register_start(db: DbSession) -> dict:
    """啟動 passkey 註冊 — 返回 PublicKeyCredentialCreationOptions。

    Local-first 單用戶系統：如果 owner 已經有 passkey，唔俾再註冊（避免被人重置）。
    用戶要重置，要 manual 刪除 DB 記錄。
    """
    user = _get_or_create_owner(db)
    if user.passkey_credential_id:
        raise HTTPException(
            status_code=400, detail="Passkey already registered for this user"
        )
    db.commit()
    token, options = passkey_service.start_registration(
        user_id=user.id, user_email=user.email, user_name=user.name
    )
    return {"challenge_token": token, "options": options}


@router.post("/passkey/register/finish")
async def passkey_register_finish(
    payload: PasskeyRegisterFinishPayload, db: DbSession
) -> dict:
    """完成 passkey 註冊 — 驗證 attestation 並儲存 credential。"""
    user = db.execute(select(User).limit(1)).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        verified = passkey_service.finish_registration(
            challenge_token=payload.challenge_token,
            credential=payload.credential,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Verification failed: {e}") from e

    user.passkey_credential_id = verified.credential_id
    user.passkey_public_key = verified.public_key
    user.passkey_sign_count = verified.sign_count
    db.commit()

    token = jwt_service.issue_token(user.id)
    return {"ok": True, "token": token, "user": {"email": user.email, "name": user.name}}


@router.post("/passkey/login/start")
async def passkey_login_start(db: DbSession) -> dict:
    """啟動 passkey 登入 — 返回 PublicKeyCredentialRequestOptions。"""
    user = db.execute(select(User).limit(1)).scalar_one_or_none()
    if user is None or not user.passkey_credential_id:
        raise HTTPException(
            status_code=404, detail="No passkey registered. 請先 register。"
        )
    token, options = passkey_service.start_authentication(user.passkey_credential_id)
    return {"challenge_token": token, "options": options}


@router.post("/passkey/login/finish")
async def passkey_login_finish(
    payload: PasskeyLoginFinishPayload, db: DbSession
) -> dict:
    """完成 passkey 登入 — 驗證 assertion，發 JWT。"""
    user = db.execute(select(User).limit(1)).scalar_one_or_none()
    if user is None or not user.passkey_credential_id or not user.passkey_public_key:
        raise HTTPException(status_code=404, detail="No passkey registered")

    try:
        verified = passkey_service.finish_authentication(
            challenge_token=payload.challenge_token,
            credential=payload.credential,
            stored_public_key_b64url=user.passkey_public_key,
            stored_sign_count=user.passkey_sign_count,
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {e}") from e

    user.passkey_sign_count = verified.new_sign_count
    db.commit()

    token = jwt_service.issue_token(user.id)
    return {"ok": True, "token": token, "user": {"email": user.email, "name": user.name}}


# ===== Gmail OAuth2 =====


@router.get("/gmail/authorize")
async def gmail_authorize() -> dict:
    """返回 Google 同意畫面 URL — frontend 會將 browser 導去呢度。"""
    try:
        url, state = gmail_client.build_authorization_url()
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"authorization_url": url, "state": state}


@router.get("/gmail/callback")
async def gmail_callback(
    db: DbSession,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    """Google OAuth2 redirect 回呼。

    流程：
    1. Google 同意之後會帶 `code` 返嚟
    2. 用 code 換 refresh_token
    3. 用 Google profile 嘅 email 建立 / 更新 user
    4. 重導去 frontend callback page
    """
    if error:
        return RedirectResponse(
            url=f"{settings.frontend_url}/auth/callback?error={error}",
            status_code=302,
        )
    if not code:
        raise HTTPException(status_code=400, detail="Missing code parameter")

    try:
        tokens = gmail_client.exchange_code_for_tokens(code=code, state=state)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Token exchange failed: {e}") from e

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            status_code=400,
            detail="No refresh_token returned. 可能之前已經授權過 — 去 "
            "https://myaccount.google.com/permissions remove，再嚟過。",
        )

    user_email = tokens["email"]
    user_name = tokens.get("name") or settings.owner_name

    # Upsert user
    existing = db.execute(select(User).where(User.email == user_email)).scalar_one_or_none()
    if existing is None:
        user = User(
            email=user_email,
            name=user_name,
            gmail_refresh_token=refresh_token,
        )
        db.add(user)
    else:
        existing.gmail_refresh_token = refresh_token
        existing.name = user_name
    db.commit()

    return RedirectResponse(
        url=f"{settings.frontend_url}/auth/callback?ok=1&email={user_email}",
        status_code=302,
    )


@router.get("/gmail/status")
async def gmail_status(db: DbSession) -> dict:
    """檢查 Gmail 連接狀態（係咪已經有 refresh_token）。"""
    user = db.execute(select(User).limit(1)).scalar_one_or_none()
    if user is None or not user.gmail_refresh_token:
        return {"connected": False}
    return {
        "connected": True,
        "email": user.email,
        "name": user.name,
    }
