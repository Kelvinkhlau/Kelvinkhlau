"""Email attachment model — Gmail inbound attachment metadata。

只儲 metadata（filename / mime / size / gmail attachment_id），唔會 eager download content。
用戶按「下載」時先 call Gmail API 攞 bytes。
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column


from app.db import Base


class EmailAttachment(Base):
    """一個 email 嘅 attachment (inbound Gmail)。"""

    __tablename__ = "email_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email_id: Mapped[int] = mapped_column(
        ForeignKey("emails.id", ondelete="CASCADE"), index=True, nullable=False
    )

    # Gmail API attachment id — 用嚟 lazy fetch bytes
    gmail_attachment_id: Mapped[str] = mapped_column(String(500), nullable=False)

    filename: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    mime_type: Mapped[str] = mapped_column(
        String(200), nullable=False, default="application/octet-stream"
    )
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # optional: cache 落 disk 嘅 path（先唔做，lazy 夠）
    local_path: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
