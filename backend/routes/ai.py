"""AI assistant endpoints — placeholder until Phase 5."""

from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/cost-status")
def cost_status() -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="AI cost tracker arrives in Phase 5",
    )
