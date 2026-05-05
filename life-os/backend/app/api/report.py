"""Daily Report API — 智能日報 + AI 摘要。"""

from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.deps import CurrentUser, DbSession, current_user
from app.services.daily_report import generate_ai_summary, generate_daily_report

router = APIRouter(dependencies=[Depends(current_user)])


@router.get("")
async def daily_report(
    user: CurrentUser,
    db: DbSession,
    report_date: date | None = Query(None, description="日報日期（預設今日）"),
) -> dict:
    """產生某日嘅日報摘要。"""
    return generate_daily_report(db, user, report_date)


class AiSummaryResponse(BaseModel):
    summary: str


@router.get("/ai-summary", response_model=AiSummaryResponse)
async def ai_summary(
    user: CurrentUser,
    db: DbSession,
    report_date: date | None = Query(None),
) -> AiSummaryResponse:
    """用 AI 生成日報嘅自然語言摘要。"""
    report = generate_daily_report(db, user, report_date)
    summary = generate_ai_summary(report)
    return AiSummaryResponse(summary=summary)
