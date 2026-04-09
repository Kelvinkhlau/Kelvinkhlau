"""APScheduler 設定 — 背景 email sync 等任務。"""

from apscheduler.schedulers.background import BackgroundScheduler

scheduler: BackgroundScheduler | None = None


def start_scheduler() -> None:
    """喺 FastAPI 啟動時起 scheduler。"""
    global scheduler
    if scheduler is not None:
        return

    scheduler = BackgroundScheduler(timezone="Asia/Hong_Kong")

    # TODO: 加入 email sync job
    # from app.services.email_sync import sync_gmail_inbox
    # scheduler.add_job(sync_gmail_inbox, "interval", minutes=5, id="email_sync")

    scheduler.start()


def stop_scheduler() -> None:
    """喺 FastAPI 關閉時停 scheduler。"""
    global scheduler
    if scheduler is not None:
        scheduler.shutdown(wait=False)
        scheduler = None
