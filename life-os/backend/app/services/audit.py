"""Audit log service — 記錄重要操作。"""

import logging

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


def log_action(
    db: Session,
    *,
    action: str,
    user_id: int | None = None,
    resource_type: str | None = None,
    resource_id: int | None = None,
    detail: str | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    """記錄一條審計 log。"""
    entry = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        detail=detail,
        ip_address=ip_address,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    logger.info(
        "audit: %s user=%s %s/%s",
        action,
        user_id,
        resource_type,
        resource_id,
    )
    return entry
