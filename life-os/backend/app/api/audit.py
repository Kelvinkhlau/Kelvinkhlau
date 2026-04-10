"""Audit log API — 查詢審計記錄。"""

from datetime import date, datetime, time

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import desc, select

from app.deps import CurrentUser, DbSession, current_user
from app.models.audit_log import AuditLog

router = APIRouter(dependencies=[Depends(current_user)])


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int | None
    action: str
    resource_type: str | None
    resource_id: int | None
    detail: str | None
    ip_address: str | None
    created_at: datetime


@router.get("", response_model=list[AuditLogOut])
async def list_audit_logs(
    user: CurrentUser,
    db: DbSession,
    action: str | None = Query(None, description="篩選動作類型"),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
) -> list[AuditLog]:
    """列出審計記錄 — 按時間倒序。"""
    stmt = (
        select(AuditLog)
        .order_by(desc(AuditLog.created_at))
        .limit(limit)
        .offset(offset)
    )
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if date_from:
        stmt = stmt.where(AuditLog.created_at >= datetime.combine(date_from, time.min))
    if date_to:
        stmt = stmt.where(AuditLog.created_at <= datetime.combine(date_to, time.max))
    return list(db.execute(stmt).scalars().all())
