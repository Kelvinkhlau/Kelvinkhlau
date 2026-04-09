"""ORM models。Import all models here so Alembic can detect them."""

from app.models.email import Email, EmailClassification
from app.models.user import User

__all__ = ["User", "Email", "EmailClassification"]
