"""FastAPI 入口。"""

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import assistant, audit, auth, calendar, emails, expenses, export, ideas, muted, notes, projects, report, todos, vip, voice, ws
from app.config import get_settings
from app.services.ws_manager import manager as ws_manager
from app.workers.scheduler import start_scheduler, stop_scheduler

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """App 啟動 / 關閉時嘅 hook。"""
    # 綁定主 event loop，俾 background thread broadcast 事件
    ws_manager.bind_loop(asyncio.get_running_loop())
    # 啟動時：起背景 scheduler
    start_scheduler()
    yield
    # 關閉時：停 scheduler
    stop_scheduler()


app = FastAPI(
    title="life-os",
    description="個人生活整合管理系統",
    version="0.1.0",
    lifespan=lifespan,
)

# 開發環境允許 Next.js dev server
if not settings.is_production:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# API routes
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(emails.router, prefix="/api/emails", tags=["emails"])
app.include_router(todos.router, prefix="/api/todos", tags=["todos"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(ideas.router, prefix="/api/ideas", tags=["ideas"])
app.include_router(calendar.router, prefix="/api/calendar", tags=["calendar"])
app.include_router(vip.router, prefix="/api/vip", tags=["vip"])
app.include_router(muted.router, prefix="/api/muted", tags=["muted"])
app.include_router(expenses.router, prefix="/api/expenses", tags=["expenses"])
app.include_router(notes.router, prefix="/api/notes", tags=["notes"])
app.include_router(voice.router, prefix="/api/voice", tags=["voice"])
app.include_router(report.router, prefix="/api/report", tags=["report"])
app.include_router(audit.router, prefix="/api/audit", tags=["audit"])
app.include_router(export.router, prefix="/api/export", tags=["export"])
app.include_router(assistant.router, prefix="/api/assistant", tags=["assistant"])
app.include_router(ws.router, prefix="/ws", tags=["ws"])


@app.get("/api/health")
async def health() -> dict[str, str]:
    """Health check。"""
    return {"status": "ok", "env": settings.app_env}


@app.get("/api/ai-test")
async def ai_test_public() -> dict:
    """測試 AI API 連線（唔需要 auth，方便 curl 診斷）。"""
    import logging

    from app.services import ai_classifier

    logger = logging.getLogger(__name__)
    provider = (settings.ai_provider or "auto").lower()

    try:
        result = ai_classifier.classify_email(
            subject="Test: 50% off all items today only!",
            sender="promo@testshop.com",
            snippet="Don't miss our biggest sale of the year. Use code SAVE50 at checkout.",
        )
        return {
            "ok": True,
            "provider": provider,
            "model": result.model,
            "category": result.category,
            "confidence": result.confidence,
            "reason": result.reason,
        }
    except Exception as e:
        logger.exception("AI test failed")
        return {
            "ok": False,
            "provider": provider,
            "error": str(e),
        }


# Production：serve frontend static files（同一個 origin）
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
