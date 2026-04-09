"""FastAPI 入口。"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import auth, emails
from app.config import get_settings
from app.workers.scheduler import start_scheduler, stop_scheduler

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """App 啟動 / 關閉時嘅 hook。"""
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
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# API routes
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(emails.router, prefix="/api/emails", tags=["emails"])


@app.get("/api/health")
async def health() -> dict[str, str]:
    """Health check。"""
    return {"status": "ok", "env": settings.app_env}


# Production：serve frontend static files（同一個 origin）
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
