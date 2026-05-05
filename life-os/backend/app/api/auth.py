"""認證 routes — Passkey (WebAuthn) + Gmail OAuth2。"""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.config import get_settings
from app.deps import CurrentUser, DbSession
from app.models.passkey_credential import PasskeyCredential
from app.models.user import User
from app.schemas.note import EncryptionInfoResponse, EncryptionSetupPayload
from app.services import gmail_client, jwt_service, passkey_service
from app.services.audit import log_action

router = APIRouter()
settings = get_settings()


# ===== Passkey (WebAuthn) =====


class PasskeyRegisterFinishPayload(BaseModel):
    challenge_token: str
    credential: dict[str, Any]
    device_name: str | None = None


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


MAX_PASSKEYS_PER_USER = 3


def _user_credentials(db, user_id: int) -> list[PasskeyCredential]:
    return list(
        db.execute(
            select(PasskeyCredential).where(PasskeyCredential.user_id == user_id)
        ).scalars()
    )


@router.post("/passkey/register/start")
async def passkey_register_start(request: Request, db: DbSession) -> dict:
    """啟動 passkey 註冊 — 返回 PublicKeyCredentialCreationOptions。

    Local-first 單用戶系統：一個 user 最多可以有 MAX_PASSKEYS_PER_USER 個 passkey
    （每部 device 一個）。已註冊嘅 credential 會放入 excludeCredentials 防止
    同一部 device 重複註冊。
    """
    user = _get_or_create_owner(db)
    db.commit()
    existing = _user_credentials(db, user.id)
    if len(existing) >= MAX_PASSKEYS_PER_USER:
        raise HTTPException(
            status_code=400,
            detail=(
                f"最多只可以註冊 {MAX_PASSKEYS_PER_USER} 個 passkey。"
                "請先去設定刪除舊嘅 device。"
            ),
        )
    existing_ids = [c.credential_id for c in existing]
    host = request.headers.get("host", "")
    token, options = passkey_service.start_registration(
        user_id=user.id,
        user_email=user.email,
        user_name=user.name,
        existing_credential_ids_b64url=existing_ids,
        host=host,
    )
    return {"challenge_token": token, "options": options}


@router.post("/passkey/register/finish")
async def passkey_register_finish(
    request: Request, payload: PasskeyRegisterFinishPayload, db: DbSession
) -> dict:
    """完成 passkey 註冊 — 驗證 attestation 並 insert 一個新 credential row。"""
    user = db.execute(select(User).limit(1)).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    host = request.headers.get("host", "")
    try:
        verified = passkey_service.finish_registration(
            challenge_token=payload.challenge_token,
            credential=payload.credential,
            host=host,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Verification failed: {e}") from e

    # 防止 credential_id 重複（理論上 excludeCredentials 已 handle，double-check）
    duplicate = db.execute(
        select(PasskeyCredential).where(
            PasskeyCredential.credential_id == verified.credential_id
        )
    ).scalar_one_or_none()
    if duplicate is not None:
        raise HTTPException(
            status_code=400, detail="呢部 device 嘅 passkey 已經註冊過。"
        )

    cred = PasskeyCredential(
        user_id=user.id,
        credential_id=verified.credential_id,
        public_key=verified.public_key,
        sign_count=verified.sign_count,
        device_name=payload.device_name or "Unnamed device",
    )
    db.add(cred)
    db.commit()

    log_action(
        db,
        action="register",
        user_id=user.id,
        detail=f"Passkey registered ({cred.device_name})",
    )
    token = jwt_service.issue_token(user.id)
    return {"ok": True, "token": token, "user": {"email": user.email, "name": user.name}}


@router.post("/passkey/login/start")
async def passkey_login_start(request: Request, db: DbSession) -> dict:
    """啟動 passkey 登入 — 返回 PublicKeyCredentialRequestOptions。

    送 user 嘅所有 credential id 落 browser，browser 揀其中一個 device 上面有嘅 passkey。
    """
    user = db.execute(select(User).limit(1)).scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=404, detail="No passkey registered. 請先 register。"
        )
    credentials = _user_credentials(db, user.id)
    if not credentials:
        raise HTTPException(
            status_code=404, detail="No passkey registered. 請先 register。"
        )
    host = request.headers.get("host", "")
    token, options = passkey_service.start_authentication(
        [c.credential_id for c in credentials], host=host
    )
    return {"challenge_token": token, "options": options}


@router.post("/passkey/login/finish")
async def passkey_login_finish(
    request: Request, payload: PasskeyLoginFinishPayload, db: DbSession
) -> dict:
    """完成 passkey 登入 — 由 credential.id 揾出對應 stored credential，驗證後發 JWT。"""
    raw_id = payload.credential.get("id") or payload.credential.get("rawId")
    if not raw_id:
        raise HTTPException(status_code=400, detail="Missing credential id")

    cred = db.execute(
        select(PasskeyCredential).where(PasskeyCredential.credential_id == raw_id)
    ).scalar_one_or_none()
    if cred is None:
        raise HTTPException(status_code=404, detail="呢個 passkey 未註冊過")

    user = db.get(User, cred.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    host = request.headers.get("host", "")
    try:
        verified = passkey_service.finish_authentication(
            challenge_token=payload.challenge_token,
            credential=payload.credential,
            stored_public_key_b64url=cred.public_key,
            stored_sign_count=cred.sign_count,
            host=host,
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {e}") from e

    cred.sign_count = verified.new_sign_count
    cred.last_used_at = datetime.utcnow()
    db.commit()

    log_action(
        db,
        action="login",
        user_id=user.id,
        detail=f"Passkey login ({cred.device_name or 'unknown device'})",
    )
    token = jwt_service.issue_token(user.id)
    return {"ok": True, "token": token, "user": {"email": user.email, "name": user.name}}


# ===== Passkey device management =====


@router.get("/passkey/devices")
async def passkey_list_devices(user: CurrentUser, db: DbSession) -> dict:
    """列出登入緊嘅 user 嘅所有 passkey device。"""
    creds = _user_credentials(db, user.id)
    return {
        "devices": [
            {
                "id": c.id,
                "device_name": c.device_name,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "last_used_at": c.last_used_at.isoformat() if c.last_used_at else None,
            }
            for c in creds
        ]
    }


@router.delete("/passkey/devices/{device_id}")
async def passkey_delete_device(
    device_id: int, user: CurrentUser, db: DbSession
) -> dict:
    """刪除一個 passkey device — 只可以刪除自己嘅。"""
    cred = db.get(PasskeyCredential, device_id)
    if cred is None or cred.user_id != user.id:
        raise HTTPException(status_code=404, detail="Device not found")
    name = cred.device_name or "unknown"
    db.delete(cred)
    db.commit()
    log_action(db, action="delete", user_id=user.id, detail=f"Passkey removed ({name})")
    return {"ok": True}


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
    request: Request,
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
    # 用 request URL derive redirect base — 咁無論 frontend 喺同一 origin 定唔同 port 都得
    base = str(request.base_url).rstrip("/")

    if error:
        return RedirectResponse(
            url=f"{base}/auth/callback?error={error}",
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
        url=f"{base}/auth/callback?ok=1&email={user_email}",
        status_code=302,
    )


# ===== E2E Encryption master password =====


@router.get("/encryption/info", response_model=EncryptionInfoResponse)
async def encryption_info(user: CurrentUser) -> EncryptionInfoResponse:
    """返回 client 驗證 master password 所需嘅 salt + verifier。

    真正 password 從來唔會 send 去 server — client 喺本地用 PBKDF2 derive key，
    再 decrypt verifier 去確認啱唔啱。"""
    if not user.encryption_salt or not user.encryption_verifier:
        return EncryptionInfoResponse(configured=False)
    return EncryptionInfoResponse(
        configured=True,
        salt=user.encryption_salt,
        verifier=user.encryption_verifier,
        verifier_iv=user.encryption_verifier_iv,
    )


@router.post("/encryption/setup")
async def encryption_setup(
    payload: EncryptionSetupPayload, user: CurrentUser, db: DbSession
) -> dict:
    """第一次設定 master password — 儲 salt + verifier。

    一旦設定咗就唔可以改（改 master password 會令所有現有加密筆記無法讀取）。
    如果日後想 reset，要先用舊密碼解密所有筆記。"""
    if user.encryption_salt or user.encryption_verifier:
        raise HTTPException(
            status_code=400,
            detail="Master password already configured. 改密碼功能尚未實作。",
        )
    user.encryption_salt = payload.salt
    user.encryption_verifier = payload.verifier
    user.encryption_verifier_iv = payload.verifier_iv
    db.commit()
    log_action(
        db,
        action="create",
        user_id=user.id,
        resource_type="encryption",
        detail="Master password configured",
    )
    return {"ok": True}


@router.get("/gmail/status")
async def gmail_status(db: DbSession) -> dict:
    """檢查 Gmail 連接狀態（係咪已經有 refresh_token）。"""
    user = db.execute(
        select(User).where(User.gmail_refresh_token.isnot(None)).limit(1)
    ).scalar_one_or_none()
    if user is None:
        return {"connected": False}
    return {
        "connected": True,
        "email": user.email,
        "name": user.name,
    }
