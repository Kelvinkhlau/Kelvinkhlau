"""認證 routes — Passkey (WebAuthn) + Gmail OAuth2。

Passkey 部分係 MVP Week 3 嘅 stub。
Gmail OAuth2 係 Week 1 完整實作。
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from app.config import get_settings
from app.deps import DbSession
from app.models.user import User
from app.services import gmail_client

router = APIRouter()
settings = get_settings()


# ===== Passkey (Week 3 stub) =====


@router.post("/passkey/register/start")
async def passkey_register_start() -> dict:
    raise HTTPException(status_code=501, detail="MVP Week 3 implementation")


@router.post("/passkey/register/finish")
async def passkey_register_finish() -> dict:
    raise HTTPException(status_code=501, detail="MVP Week 3 implementation")


@router.post("/passkey/login/start")
async def passkey_login_start() -> dict:
    raise HTTPException(status_code=501, detail="MVP Week 3 implementation")


@router.post("/passkey/login/finish")
async def passkey_login_finish() -> dict:
    raise HTTPException(status_code=501, detail="MVP Week 3 implementation")


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
