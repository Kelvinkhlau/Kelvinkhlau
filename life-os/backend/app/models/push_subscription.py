"""PushSubscription model — Web Push (VAPID) browser subscription。

每個裝置 / 瀏覽器 subscribe 一次，存返 endpoint + keys，
背景 job / API 要 push notification 嗰陣 iterate 該 user 所有 subscriptions。
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )

    # endpoint 係 push service URL，browser 每次 subscribe 都會變，所以 unique
    endpoint: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    p256dh_key: Mapped[str] = mapped_column(String(255), nullable=False)
    auth_key: Mapped[str] = mapped_column(String(255), nullable=False)

    # 用戶自訂嘅裝置名（例：「我嘅 iPhone」）— 留空就 frontend 由 user_agent 推斷
    label: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    user_agent: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    # 用戶可以喺 UI 暫時 mute 而唔使真係 unsubscribe
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
