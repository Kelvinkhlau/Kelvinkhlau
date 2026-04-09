"""Health check endpoint."""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from config import settings
from database import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    """Return API status and DB connectivity check."""
    db_status = "ok"
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:  # pragma: no cover - defensive
        db_status = f"error: {exc}"

    return {
        "status": "ok",
        "version": settings.APP_VERSION,
        "app": settings.APP_NAME,
        "db": db_status,
    }
