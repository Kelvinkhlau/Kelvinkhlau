"""Card endpoints — placeholder until Phase 4."""

from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/cards", tags=["cards"])


@router.get("")
def list_cards() -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Card module arrives in Phase 4",
    )
