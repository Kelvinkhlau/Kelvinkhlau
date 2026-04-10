"""Email API schemas。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class EmailClassificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ai_category: str
    ai_confidence: float
    ai_reason: str | None
    user_category: str | None
    final_category: str


class EmailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subject: str
    sender: str
    sender_email: str
    snippet: str
    received_at: datetime
    is_read: bool
    is_archived: bool = False
    has_attachment: bool
    classification: EmailClassificationOut | None


class EmailDetail(EmailOut):
    body_text: str
    body_html: str | None
    recipients: str


class CategoryUpdate(BaseModel):
    category: str  # important / normal / promotional
