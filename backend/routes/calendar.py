"""Calendar endpoints — placeholder until Phase 6."""

from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("/events")
def list_events() -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Calendar module arrives in Phase 6",
    )
