"""Daily Report API — 智能日報。"""

from datetime import date

from fastapi import APIRouter, Depends, Query

from app.deps import CurrentUser, DbSession, current_user
from app.services.daily_report import generate_daily_report

router = APIRouter(dependencies=[Depends(current_user)])


@router.get("")
async def daily_report(
    user: CurrentUser,
    db: DbSession,
    report_date: date | None = Query(None, description="日報日期（預設今日）"),
) -> dict:
    """產生某日嘅日報摘要。"""
    return generate_daily_report(db, user, report_date)
