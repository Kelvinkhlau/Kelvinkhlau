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
    action_required: bool = False
    action_summary: str | None = None
    action_deadline: str | None = None


class SmartLabelBrief(BaseModel):
    id: int
    name: str
    color: str


class EmailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subject: str
    sender: str
    sender_email: str
    recipients: str = ""
    snippet: str
    received_at: datetime
    is_read: bool
    is_archived: bool = False
    has_attachment: bool
    folder: str = "inbox"
    classification: EmailClassificationOut | None
    smart_label: SmartLabelBrief | None = None


class EmailDetail(EmailOut):
    body_text: str
    body_html: str | None
    recipients: str


from typing import Literal


class CategoryUpdate(BaseModel):
    category: Literal["important", "normal", "promotional"]


class EmailReplyPayload(BaseModel):
    body: str


class EmailComposePayload(BaseModel):
    to: str
    subject: str
    body: str


class EmailSendResponse(BaseModel):
    ok: bool
    gmail_message_id: str | None = None
    error: str | None = None


class AiReplyRequest(BaseModel):
    instructions: str | None = None


class AiReplyDraft(BaseModel):
    draft: str
    model: str


class AiComposeRequest(BaseModel):
    instructions: str


class AiComposeDraft(BaseModel):
    to: str
    subject: str
    body: str
    model: str


class EmailTranslation(BaseModel):
    translation: str
    model: str


class EmailSummary(BaseModel):
    tldr: str
    key_points: list[str]
    action_needed: str | None = None
    model: str
