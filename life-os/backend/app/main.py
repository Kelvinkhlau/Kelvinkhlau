"""FastAPI 入口。"""

import asyncio
import mimetypes
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from app.api import assistant, audit, auth, bank_accounts, budgets, calendar, emails, expenses, export, family_members, ideas, ledgers, loans, muted, notebooks, notes, projects, push, relations, report, smart_labels, stocks, subscriptions, today, todos, transfers, vault, vip, voice, ws
from app.config import get_settings
from app.services.ws_manager import manager as ws_manager
from app.services.icloud_idle_watcher import start_icloud_idle_watcher, stop_icloud_idle_watcher
from app.workers.scheduler import start_scheduler, stop_scheduler

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """App 啟動 / 關閉時嘅 hook。"""
    # 綁定主 event loop，俾 background thread broadcast 事件
    ws_manager.bind_loop(asyncio.get_running_loop())
    # 啟動時：起背景 scheduler + iCloud IDLE watcher
    start_scheduler()
    start_icloud_idle_watcher()
    yield
    # 關閉時：停 scheduler + IDLE watcher
    stop_icloud_idle_watcher()
    stop_scheduler()


app = FastAPI(
    title="life-os",
    description="個人生活整合管理系統",
    version="0.1.0",
    lifespan=lifespan,
)

# 開發環境允許 Next.js dev server — 用白名單，唔用 "*"
if not settings.is_production:
    _origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
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
app.include_router(transfers.router, prefix="/api/transfers", tags=["transfers"])
app.include_router(subscriptions.router, prefix="/api/subscriptions", tags=["subscriptions"])
app.include_router(budgets.router, prefix="/api/budgets", tags=["budgets"])
app.include_router(bank_accounts.router, prefix="/api/bank-accounts", tags=["bank-accounts"])
app.include_router(stocks.router, prefix="/api/stocks", tags=["stocks"])
app.include_router(notes.router, prefix="/api/notes", tags=["notes"])
app.include_router(notebooks.router, prefix="/api/notebooks", tags=["notebooks"])
app.include_router(voice.router, prefix="/api/voice", tags=["voice"])
app.include_router(report.router, prefix="/api/report", tags=["report"])
app.include_router(audit.router, prefix="/api/audit", tags=["audit"])
app.include_router(export.router, prefix="/api/export", tags=["export"])
app.include_router(smart_labels.router, prefix="/api/smart-labels", tags=["smart-labels"])
app.include_router(assistant.router, prefix="/api/assistant", tags=["assistant"])
app.include_router(relations.router, prefix="/api/relations", tags=["relations"])
app.include_router(today.router, prefix="/api/today", tags=["today"])
app.include_router(ledgers.router, prefix="/api/ledgers", tags=["ledgers"])
app.include_router(loans.router, prefix="/api/loans", tags=["loans"])
app.include_router(family_members.router, prefix="/api/family-members", tags=["family-members"])
app.include_router(vault.router, prefix="/api/vault", tags=["vault"])
app.include_router(push.router, prefix="/api", tags=["push"])
app.include_router(ws.router, prefix="/ws", tags=["ws"])


@app.post("/api/recurring/generate")
async def generate_recurring_now() -> dict:
    """手動觸發 recurring expense 產生 — 無 auth，方便 curl 測試。"""
    from app.services.recurring_expense import generate_recurring_expenses

    return generate_recurring_expenses()


@app.get("/api/health")
async def health() -> dict[str, str]:
    """Health check。"""
    return {"status": "ok", "env": settings.app_env}


@app.get("/api/ai-test")
async def ai_test_public() -> dict:
    """測試 AI API 連線（唔需要 auth，方便 curl 診斷）。"""
    import logging

    logger = logging.getLogger(__name__)
    provider = (settings.ai_provider or "auto").lower()

    # 顯示 key 配置狀態（唔顯示完整 key）
    anthropic_key = settings.anthropic_api_key or ""
    openai_key = settings.openai_api_key or ""
    key_info = {
        "anthropic_key_set": bool(anthropic_key),
        "anthropic_key_prefix": anthropic_key[:12] + "..." if len(anthropic_key) > 12 else "(empty)",
        "openai_key_set": bool(openai_key),
        "openai_key_prefix": openai_key[:8] + "..." if len(openai_key) > 8 else "(empty)",
    }

    # 分開測試每個 provider
    results = {}

    # Test Anthropic
    if anthropic_key:
        try:
            from app.services.ai_classifier import _classify_anthropic
            r = _classify_anthropic("Subject: Test sale\nFrom: test@shop.com\n\n50% off today")
            results["anthropic"] = {"ok": True, "model": r.model, "category": r.category}
        except Exception as e:
            results["anthropic"] = {"ok": False, "error": str(e)}
    else:
        results["anthropic"] = {"ok": False, "error": "ANTHROPIC_API_KEY not set"}

    # Test OpenAI
    if openai_key:
        try:
            from app.services.ai_classifier import _classify_openai
            r = _classify_openai("Subject: Test sale\nFrom: test@shop.com\n\n50% off today")
            results["openai"] = {"ok": True, "model": r.model, "category": r.category}
        except Exception as e:
            results["openai"] = {"ok": False, "error": str(e)}
    else:
        results["openai"] = {"ok": False, "error": "OPENAI_API_KEY not set"}

    any_ok = any(r.get("ok") for r in results.values())
    return {
        "ok": any_ok,
        "provider_setting": provider,
        "keys": key_info,
        "results": results,
    }


@app.post("/api/classify-now")
async def classify_now_public(limit: int = 50) -> dict:
    """開發用：批量分類未分類嘅 emails（唔需要 auth）。"""
    import logging

    from sqlalchemy import desc, select

    from app.db import SessionLocal
    from app.models.email import Email, EmailClassification
    from app.services import ai_classifier, email_sync

    logger = logging.getLogger(__name__)
    db = SessionLocal()
    try:
        subq = select(EmailClassification.email_id)
        stmt = (
            select(Email)
            .where(Email.id.notin_(subq))
            .order_by(desc(Email.received_at))
            .limit(limit)
        )
        emails = db.execute(stmt).scalars().all()
        total = len(emails)

        if total == 0:
            return {"total_unclassified": 0, "classified": 0, "errors": []}

        examples = email_sync._get_recent_corrections(db, limit=5)
        classified = 0
        archived = 0
        errors: list[str] = []

        for email in emails:
            try:
                result = ai_classifier.classify_email(
                    subject=email.subject,
                    sender=email.sender,
                    snippet=email.snippet or (email.body_text or "")[:500],
                    examples=examples,
                )
                cls = EmailClassification(
                    email_id=email.id,
                    ai_category=result.category,
                    ai_confidence=result.confidence,
                    ai_reason=result.reason,
                    ai_model=result.model,
                )
                db.add(cls)
                classified += 1
                # 廣告高信心 → 自動 archive
                if result.category == "promotional" and result.confidence >= 0.75:
                    email.is_archived = True
                    archived += 1
            except Exception as e:
                errors.append(f"email {email.id}: {e}")
                logger.exception("classify failed for email %d", email.id)

        db.commit()
        return {
            "total_unclassified": total,
            "classified": classified,
            "archived": archived,
            "errors": errors,
        }
    finally:
        db.close()


@app.post("/api/sync-now")
async def sync_now_public(limit: int = 500, classify: bool = True) -> dict:
    """開發用：拉 Gmail 郵件 + AI 分類（唔需要 auth）。"""
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models.user import User
    from app.services import email_sync

    db = SessionLocal()
    try:
        user = db.execute(
            select(User).where(User.gmail_refresh_token.is_not(None)).limit(1)
        ).scalar_one_or_none()
        if user is None:
            return {"error": "冇 user record — 請先註冊"}
        if not user.gmail_refresh_token:
            return {
                "error": f"User {user.email} 冇 Gmail refresh token — 請去 http://localhost:5200 重新連接 Gmail",
                "user_email": user.email,
                "has_token": False,
            }

        # 唔清 history_id — 用 use_history=False 就會 fallback 到 list recent
        result = email_sync.sync_for_user(
            db, user, limit=limit, use_history=False, classify=classify,
        )
        return {
            "fetched": result.fetched,
            "new": result.new,
            "classified": result.classified,
            "errors": result.errors[:10],  # 最多顯示 10 個 error
        }
    finally:
        db.close()



# 賽馬系統 reverse proxy — 將 /racing-proxy/* 轉發去 localhost:8000
_racing_client = httpx.AsyncClient(base_url="http://127.0.0.1:8000", timeout=30.0)


@app.api_route("/racing-proxy/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def racing_proxy(request: Request, path: str) -> Response:
    """Reverse proxy to horse racing system on port 8000."""
    url = f"/{path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"

    headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in ("host", "connection", "transfer-encoding")
    }

    body = await request.body() if request.method in ("POST", "PUT") else None

    resp = await _racing_client.request(
        method=request.method,
        url=url,
        headers=headers,
        content=body,
    )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers={
            k: v for k, v in resp.headers.items()
            if k.lower() not in ("transfer-encoding", "connection", "content-encoding")
        },
    )


# Production：serve frontend static files（同一個 origin）
# 用自訂 SPA handler 取代 StaticFiles，解決 Safari back 鍵 404 問題
_static_dir = Path(__file__).parent / "static"

if _static_dir.exists():
    # /_next 等靜態資源用 StaticFiles（高效能 + cache headers）
    _next_dir = _static_dir / "_next"
    if _next_dir.exists():
        app.mount("/_next", StaticFiles(directory=str(_next_dir)), name="next-assets")
    _icons_dir = _static_dir / "icons"
    if _icons_dir.exists():
        app.mount("/icons", StaticFiles(directory=str(_icons_dir)), name="icons")

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str) -> Response:
        """SPA fallback — 解決 Safari back 鍵 404 問題。

        優先順序：
        1. 精確匹配靜態檔案（.js, .css, .png, manifest.json 等）
        2. 嘗試 {path}.html（Next.js static export 格式）
        3. 嘗試 {path}/index.html
        4. Fallback 到 404.html（Next.js 404 頁面）

        API paths (/api/*, /ws/*) 唔會經呢度 — 如果 router 冇 match，
        就要返 JSON 404，唔好俾 frontend 當 HTML 再塞入 error message。
        """
        if full_path.startswith("api/") or full_path.startswith("ws/"):
            return Response(
                content='{"detail":"Not Found"}',
                media_type="application/json",
                status_code=404,
            )
        # 安全檢查：防止路徑穿越
        try:
            resolved = (_static_dir / full_path).resolve()
            if not str(resolved).startswith(str(_static_dir.resolve())):
                return FileResponse(
                    _static_dir / "404.html", media_type="text/html", status_code=404
                )
        except (ValueError, OSError):
            return FileResponse(
                _static_dir / "404.html", media_type="text/html", status_code=404
            )

        # 1. 精確匹配（靜態資源：.js, .css, .png, .json, .ico 等）
        exact = _static_dir / full_path
        if exact.is_file():
            content_type = mimetypes.guess_type(str(exact))[0] or "application/octet-stream"
            return FileResponse(exact, media_type=content_type)

        # 2. 嘗試 {path}.html（Next.js static export: /inbox/detail → /inbox/detail.html）
        html_file = _static_dir / f"{full_path}.html"
        if html_file.is_file():
            return FileResponse(html_file, media_type="text/html")

        # 3. 嘗試 {path}/index.html
        index_file = _static_dir / full_path / "index.html"
        if index_file.is_file():
            return FileResponse(index_file, media_type="text/html")

        # 4. Root path
        if full_path == "" or full_path == "/":
            root_index = _static_dir / "index.html"
            if root_index.is_file():
                return FileResponse(root_index, media_type="text/html")

        # 5. Fallback → 404.html
        not_found = _static_dir / "404.html"
        if not_found.is_file():
            return FileResponse(not_found, media_type="text/html", status_code=404)

        return Response("Not Found", status_code=404)
