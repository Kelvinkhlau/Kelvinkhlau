"""Auth endpoints — placeholder until Phase 2 wires up Google OAuth."""

from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/status")
def auth_status() -> dict:
    # Phase 1 is single-user on the Mac mini; no auth required yet.
    return {"authenticated": True, "mode": "single-user"}


@router.post("/google/login")
def google_login() -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Google OAuth arrives in Phase 2",
    )
