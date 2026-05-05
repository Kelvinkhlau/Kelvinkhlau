"""SmartLabel model — 智能標籤，按寄件者自動分組郵件。"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SmartLabel(Base):
    """用戶定義嘅智能標籤 — 根據 sender_email pattern 自動標記。"""

    __tablename__ = "smart_labels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="blue")
    # 匹配規則 — 每行一個 pattern，匹配 sender_email
    # 例如: "dbs.com\n@dbs.com.hk" 會匹配所有 DBS 嘅 email
    match_patterns: Mapped[str] = mapped_column(Text, nullable=False, default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
