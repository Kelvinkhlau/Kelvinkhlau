"""認證 routes — Passkey (WebAuthn) + Gmail OAuth2。

呢個係 stub，MVP Week 3 會完整實作。
"""

from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.post("/passkey/register/start")
async def passkey_register_start() -> dict:
    """開始 Passkey 註冊流程 — 返回 challenge。"""
    raise HTTPException(status_code=501, detail="MVP Week 3 implementation")


@router.post("/passkey/register/finish")
async def passkey_register_finish() -> dict:
    """完成 Passkey 註冊。"""
    raise HTTPException(status_code=501, detail="MVP Week 3 implementation")


@router.post("/passkey/login/start")
async def passkey_login_start() -> dict:
    """開始 Passkey 登入。"""
    raise HTTPException(status_code=501, detail="MVP Week 3 implementation")


@router.post("/passkey/login/finish")
async def passkey_login_finish() -> dict:
    """完成 Passkey 登入 — 返回 JWT。"""
    raise HTTPException(status_code=501, detail="MVP Week 3 implementation")


@router.get("/gmail/authorize")
async def gmail_authorize() -> dict:
    """重新導向到 Google OAuth2 同意畫面。"""
    raise HTTPException(status_code=501, detail="MVP Week 1 implementation")


@router.get("/gmail/callback")
async def gmail_callback(code: str | None = None) -> dict:
    """Google OAuth2 redirect 回呼。"""
    raise HTTPException(status_code=501, detail="MVP Week 1 implementation")
