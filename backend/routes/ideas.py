"""Idea endpoints — placeholder until Phase 4."""

from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/ideas", tags=["ideas"])


@router.get("")
def list_ideas() -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Idea module arrives in Phase 4",
    )
