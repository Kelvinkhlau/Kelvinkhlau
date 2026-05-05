"""Note API schemas。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class NoteBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    content: str = ""
    content_format: str = Field("markdown", max_length=20)
    folder: str = Field("", max_length=100)
    tags: str = ""
    # E2E encryption（opt-in per note）
    # 當 is_encrypted=True 時，title/content/tags 應該係 placeholder
    # （例如 "🔒 加密筆記"），真正內容喺 encrypted_payload 入面。
    is_encrypted: bool = False
    encrypted_payload: str | None = None
    encryption_iv: str | None = Field(None, max_length=32)


class NoteCreate(NoteBase):
    pass


class NoteUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    content: str | None = None
    content_format: str | None = Field(None, max_length=20)
    folder: str | None = Field(None, max_length=100)
    tags: str | None = None
    pinned: bool | None = None
    archived: bool | None = None
    is_encrypted: bool | None = None
    encrypted_payload: str | None = None
    encryption_iv: str | None = Field(None, max_length=32)


class NoteAttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    note_id: int
    filename: str
    mime_type: str
    size_bytes: int
    created_at: datetime


class NoteOut(NoteBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pinned: bool
    archived: bool
    created_at: datetime
    updated_at: datetime
    attachments: list[NoteAttachmentOut] = []


# ─── Encryption setup / info ────────────────────────────────────────────────


class EncryptionSetupPayload(BaseModel):
    """第一次設定 master password — client 喺本地 derive key，
    只 send salt + verifier 上去 server。"""
    salt: str = Field(..., min_length=1, max_length=64)
    verifier: str = Field(..., min_length=1, max_length=255)
    verifier_iv: str = Field(..., min_length=1, max_length=32)


class EncryptionInfoResponse(BaseModel):
    """俾 client 驗證 master password。
    如果 configured=False 即係未 setup。"""
    configured: bool
    salt: str | None = None
    verifier: str | None = None
    verifier_iv: str | None = None
