"""Smart Label 自動匹配 — 根據 sender_email 自動歸檔郵件。"""

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.email import Email
from app.models.smart_label import SmartLabel

logger = logging.getLogger(__name__)


def match_email_to_label(db: Session, email: Email) -> SmartLabel | None:
    """為一封 email 搵匹配嘅 Smart Label。返回第一個 match 嘅 label。"""
    labels = db.execute(
        select(SmartLabel).where(SmartLabel.user_id == email.user_id)
    ).scalars().all()

    sender = (email.sender_email or "").lower()
    if not sender:
        return None

    for label in labels:
        patterns = [p.strip().lower() for p in label.match_patterns.split("\n") if p.strip()]
        for pattern in patterns:
            if pattern in sender:
                return label

    return None


def auto_label_email(db: Session, email: Email) -> bool:
    """自動幫一封 email 配對標籤。如果已有標籤就 skip。返回 True 如果有配對到。"""
    if email.smart_label_id is not None:
        return False

    label = match_email_to_label(db, email)
    if label:
        email.smart_label_id = label.id
        return True
    return False


def auto_label_batch(db: Session, user_id: int, limit: int = 500) -> int:
    """批量配對未標記嘅 email。返回配對數量。"""
    unlabeled = db.execute(
        select(Email).where(
            Email.user_id == user_id,
            Email.smart_label_id.is_(None),
        ).limit(limit)
    ).scalars().all()

    count = 0
    for email in unlabeled:
        if auto_label_email(db, email):
            count += 1

    if count > 0:
        db.commit()
        logger.info(f"Auto-labeled {count} emails for user {user_id}")

    return count
