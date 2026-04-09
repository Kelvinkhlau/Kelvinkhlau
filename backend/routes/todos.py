"""Todo (Task) endpoints — placeholder until Phase 3."""

from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/todos", tags=["todos"])


@router.get("")
def list_todos() -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Todo module arrives in Phase 3",
    )
