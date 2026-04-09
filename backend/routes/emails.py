"""Email endpoints — placeholder until Phase 2 wires up Gmail/iCloud."""

from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/emails", tags=["emails"])


@router.get("")
def list_emails() -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Email module arrives in Phase 2",
    )
