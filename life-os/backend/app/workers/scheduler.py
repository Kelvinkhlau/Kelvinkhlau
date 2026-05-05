"""APScheduler 設定 — 背景 email sync 等任務。"""

from apscheduler.schedulers.background import BackgroundScheduler

scheduler: BackgroundScheduler | None = None


def start_scheduler() -> None:
    """喺 FastAPI 啟動時起 scheduler。"""
    global scheduler
    if scheduler is not None:
        return

    from app.services.email_sync import sync_gmail_inbox

    scheduler = BackgroundScheduler(timezone="Asia/Hong_Kong")

    # Gmail sync — 每 2 分鐘（用 History API 做 incremental sync，效率好高）
    scheduler.add_job(
        sync_gmail_inbox,
        "interval",
        minutes=2,
        id="email_sync",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )

    # Gmail 寄件備份 sync — 每 10 分鐘 pull 一次 SENT label（慳 API quota）
    def sync_gmail_sent():
        import logging
        from sqlalchemy import select
        from app.db import SessionLocal
        from app.models.user import User
        from app.services import email_sync

        logger = logging.getLogger(__name__)
        db = SessionLocal()
        try:
            users = db.execute(
                select(User).where(User.gmail_refresh_token.is_not(None))
            ).scalars().all()
            for user in users:
                try:
                    result = email_sync.sync_sent_for_user(db, user, limit=50)
                    if result.new:
                        logger.info(
                            "Sent sync: user=%s new=%d", user.email, result.new
                        )
                except Exception:
                    logger.exception("Sent sync failed for user %s", user.email)
        finally:
            db.close()

    scheduler.add_job(
        sync_gmail_sent,
        "interval",
        minutes=10,
        id="email_sent_sync",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )

    # iCloud sync — 每 5 分鐘做 fallback polling（主力靠 IDLE watcher 即時通知）
    def sync_icloud_inbox():
        from sqlalchemy import select
        from app.db import SessionLocal
        from app.models.email import Email
        from app.models.user import User
        from app.config import get_settings

        settings = get_settings()
        if not settings.icloud_email or not settings.icloud_app_password:
            return

        try:
            from app.services.icloud_client import ICloudClient
            client = ICloudClient()
            client.connect()
            messages = client.fetch_recent(limit=30)
            client.disconnect()
        except Exception:
            import logging
            logging.getLogger(__name__).exception("iCloud scheduled sync: 連接失敗")
            return

        db = SessionLocal()
        try:
            user = db.execute(select(User)).scalars().first()
            if not user:
                return

            new_emails: list = []
            for msg in messages:
                if not msg.message_id:
                    continue
                existing = db.execute(
                    select(Email).where(Email.gmail_message_id == msg.message_id)
                ).scalar_one_or_none()
                if existing:
                    continue
                email_obj = Email(
                    user_id=user.id,
                    gmail_message_id=msg.message_id,
                    gmail_thread_id=msg.message_id,
                    subject=msg.subject,
                    sender=msg.sender,
                    sender_email=msg.sender_email,
                    recipients=msg.recipients,
                    snippet=msg.snippet,
                    body_text=msg.body_text,
                    body_html=msg.body_html,
                    received_at=msg.received_at,
                    has_attachment=msg.has_attachment,
                    folder="icloud",
                )
                db.add(email_obj)
                db.flush()
                new_emails.append(email_obj)

            # 共用 pipeline：AI 分類 + 發票 + 訂閱
            from app.services.email_sync import process_new_emails, broadcast_new_emails
            classified, errs = process_new_emails(db, user, new_emails, classify=True, source_label="iCloud")
            db.commit()
            broadcast_new_emails(db, user, new_emails, source="icloud")
            if new_emails:
                import logging
                logging.getLogger(__name__).info(
                    "iCloud scheduled sync: %d 封新郵件, %d 已分類",
                    len(new_emails), classified,
                )
        finally:
            db.close()

    scheduler.add_job(
        sync_icloud_inbox,
        "interval",
        minutes=5,
        id="icloud_sync",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )

    # iCloud 寄件備份 sync — 每 10 分鐘 pull 一次「Sent Messages」folder
    def sync_icloud_sent():
        import logging as _log
        from sqlalchemy import select
        from app.db import SessionLocal
        from app.models.email import Email
        from app.models.user import User
        from app.config import get_settings

        logger = _log.getLogger(__name__)
        settings = get_settings()
        if not settings.icloud_email or not settings.icloud_app_password:
            return

        # iCloud IMAP sent folder 名叫 "Sent Messages"
        try:
            from app.services.icloud_client import ICloudClient
            client = ICloudClient()
            client.connect()
            try:
                messages = client.fetch_recent(limit=50, folder="Sent Messages")
            except Exception:
                # 試下 alternative folder 名
                try:
                    messages = client.fetch_recent(limit=50, folder="Sent")
                except Exception:
                    logger.exception("iCloud sent sync: 兩個 folder 名都試過唔 work")
                    messages = []
            client.disconnect()
        except Exception:
            logger.exception("iCloud sent sync: 連接失敗")
            return

        if not messages:
            return

        db = SessionLocal()
        try:
            user = db.execute(select(User)).scalars().first()
            if not user:
                return

            new_count = 0
            for msg in messages:
                if not msg.message_id:
                    continue
                existing = db.execute(
                    select(Email).where(Email.gmail_message_id == msg.message_id)
                ).scalar_one_or_none()
                if existing:
                    continue
                email_obj = Email(
                    user_id=user.id,
                    gmail_message_id=msg.message_id,
                    gmail_thread_id=msg.message_id,
                    subject=msg.subject,
                    sender=msg.sender,
                    sender_email=msg.sender_email,
                    recipients=msg.recipients,
                    snippet=msg.snippet,
                    body_text=msg.body_text,
                    body_html=msg.body_html,
                    received_at=msg.received_at,
                    has_attachment=msg.has_attachment,
                    folder="sent",
                    is_read=True,
                )
                db.add(email_obj)
                new_count += 1

            if new_count:
                db.commit()
                logger.info("iCloud sent sync: %d 封新寄件", new_count)
        finally:
            db.close()

    scheduler.add_job(
        sync_icloud_sent,
        "interval",
        minutes=10,
        id="icloud_sent_sync",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )

    # 每日清理垃圾桶：刪除 7 日前嘅軟刪除 email
    def purge_trash():
        from datetime import UTC, datetime, timedelta
        from sqlalchemy import delete
        from app.db import SessionLocal
        from app.models.email import Email

        cutoff = datetime.now(UTC) - timedelta(days=7)
        with SessionLocal() as db:
            result = db.execute(
                delete(Email).where(
                    Email.deleted_at.is_not(None),
                    Email.deleted_at < cutoff,
                )
            )
            db.commit()
            if result.rowcount:
                import logging
                logging.getLogger(__name__).info("Purged %d trashed emails", result.rowcount)

    scheduler.add_job(
        purge_trash,
        "cron",
        hour=3,
        minute=0,
        id="purge_trash",
        max_instances=1,
        replace_existing=True,
    )

    # 股票報價 refresh — 每 30 分鐘一次（Yahoo 延遲報價足夠）
    from app.api.stocks import scheduled_refresh as refresh_stock_quotes

    scheduler.add_job(
        refresh_stock_quotes,
        "interval",
        minutes=30,
        id="stock_refresh",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )

    # 每日朝早 08:00 HKT — 推送當日到期 / 逾期嘅 todo 提醒
    def push_todo_deadlines() -> None:
        from datetime import date, timedelta

        from sqlalchemy import select

        from app.db import SessionLocal
        from app.models.todo import Todo
        from app.models.user import User
        from app.services import push_service

        if not push_service.is_configured():
            return

        today = date.today()
        tomorrow = today + timedelta(days=1)

        with SessionLocal() as db:
            users = list(db.execute(select(User)).scalars())
            for user in users:
                stmt = select(Todo).where(
                    Todo.user_id == user.id,
                    Todo.done.is_(False),
                    Todo.due_at.is_not(None),
                )
                todos = list(db.execute(stmt).scalars())
                overdue = [t for t in todos if t.due_at and t.due_at.date() < today]
                due_today = [t for t in todos if t.due_at and t.due_at.date() == today]
                due_tomorrow = [
                    t for t in todos if t.due_at and t.due_at.date() == tomorrow
                ]

                total = len(overdue) + len(due_today) + len(due_tomorrow)
                if total == 0:
                    continue

                parts = []
                if overdue:
                    parts.append(f"逾期 {len(overdue)}")
                if due_today:
                    parts.append(f"今日 {len(due_today)}")
                if due_tomorrow:
                    parts.append(f"聽日 {len(due_tomorrow)}")
                body = "、".join(parts)
                title = "⏰ 待辦提醒"
                try:
                    push_service.send_to_user(
                        db, user.id, title=title, body=body, url="/todos",
                        tag="lifeos-todo-deadline",
                    )
                except Exception:
                    import logging

                    logging.getLogger(__name__).exception("push todo deadlines failed")

    scheduler.add_job(
        push_todo_deadlines,
        "cron",
        hour=8,
        minute=0,
        id="push_todo_deadlines",
        max_instances=1,
        replace_existing=True,
    )

    # 每日 00:10 HKT — 掃描 auto_create_expense subscription，補建缺失嘅 expense
    def generate_recurring_expenses_job() -> None:
        try:
            from app.services.recurring_expense import generate_recurring_expenses

            result = generate_recurring_expenses()
            if result["generated"]:
                import logging as _log
                _log.getLogger(__name__).info(
                    "Recurring expenses: processed=%d generated=%d",
                    result["processed"], result["generated"],
                )
        except Exception:
            import logging as _log
            _log.getLogger(__name__).exception("generate_recurring_expenses_job failed")

    scheduler.add_job(
        generate_recurring_expenses_job,
        "cron",
        hour=0,
        minute=10,
        id="recurring_expenses",
        max_instances=1,
        replace_existing=True,
    )

    # 每日 09:00 HKT — 檢查 vault 到期檔案 + 推送提醒；清除 30 日以上 trash
    def vault_daily_maintenance() -> None:
        try:
            from datetime import UTC, date, datetime, timedelta

            from sqlalchemy import select

            from app.config import get_settings as _get_settings
            from app.db import SessionLocal
            from app.models.user import User
            from app.models.vault import VaultFile
            from app.services import push_service, vault_storage

            settings = _get_settings()
            today = date.today()
            purge_before = datetime.now(tz=UTC).replace(tzinfo=None) - timedelta(days=30)

            with SessionLocal() as db:
                # 1. Purge trash > 30 日
                trashed = list(
                    db.execute(
                        select(VaultFile).where(
                            VaultFile.deleted_at.is_not(None),
                            VaultFile.deleted_at < purge_before,
                        )
                    ).scalars()
                )
                for f in trashed:
                    vault_storage.delete_file(settings.data_dir, f.storage_path)
                    db.delete(f)
                if trashed:
                    db.commit()

                # 2. Expiry push — 按 per-file reminder_days_before 決定
                #    null = 用 default buckets (7, 1, 0 日)
                #    整數 N = N 日前開始每日推（到到期日為止）
                DEFAULT_BUCKETS = {7, 1, 0}
                users = list(db.execute(select(User)).scalars())
                for user in users:
                    files = list(
                        db.execute(
                            select(VaultFile).where(
                                VaultFile.user_id == user.id,
                                VaultFile.deleted_at.is_(None),
                                VaultFile.expiry_date.is_not(None),
                            )
                        ).scalars()
                    )

                    # 需要提醒嘅檔案：today.days_until ∈ reminder buckets
                    hits: list[VaultFile] = []
                    for f in files:
                        if f.expiry_date is None:
                            continue
                        days = (f.expiry_date - today).days
                        if days < 0:
                            continue  # 已經過期，唔再推
                        if f.reminder_days_before is None:
                            if days in DEFAULT_BUCKETS:
                                hits.append(f)
                        else:
                            # 當 days == reminder_days_before 或 0（到期日當日）時提醒
                            if days == f.reminder_days_before or days == 0:
                                hits.append(f)

                    if not hits:
                        continue
                    if not push_service.is_configured():
                        continue

                    # Group by 到期時長
                    today_due = [f for f in hits if (f.expiry_date - today).days == 0]
                    tomorrow_due = [f for f in hits if (f.expiry_date - today).days == 1]
                    other = [
                        f for f in hits
                        if (f.expiry_date - today).days not in (0, 1)
                    ]
                    parts = []
                    if today_due:
                        parts.append(f"今日到期 {len(today_due)}")
                    if tomorrow_due:
                        parts.append(f"聽日到期 {len(tomorrow_due)}")
                    if other:
                        parts.append(f"即將到期 {len(other)}")

                    # Body 入面列首 3 個檔案嘅 title 或 filename
                    sample = hits[:3]
                    names = "、".join(
                        (f.title or f.filename) for f in sample
                    )
                    if len(hits) > 3:
                        names += f" 等 {len(hits)} 項"

                    body = "｜".join(parts) + "：" + names

                    try:
                        push_service.send_to_user(
                            db, user.id,
                            title="🔒 資料庫到期提醒",
                            body=body,
                            url="/vault?filter=expiring",
                            tag="lifeos-vault-expiry",
                        )
                    except Exception:
                        import logging as _log
                        _log.getLogger(__name__).exception("vault expiry push failed")
        except Exception:
            import logging as _log
            _log.getLogger(__name__).exception("vault_daily_maintenance failed")

    scheduler.add_job(
        vault_daily_maintenance,
        "cron",
        hour=9,
        minute=0,
        id="vault_daily_maintenance",
        max_instances=1,
        replace_existing=True,
    )

    # 每星期日 04:00 HKT — 完整系統備份（SQLite DB + vault 檔案）
    def weekly_full_backup() -> None:
        import logging as _log
        try:
            from app.services.backup import create_full_backup

            out = create_full_backup()
            _log.getLogger(__name__).info("Weekly backup created: %s", out.name)
        except Exception:
            _log.getLogger(__name__).exception("weekly_full_backup failed")

    scheduler.add_job(
        weekly_full_backup,
        "cron",
        day_of_week="sun",
        hour=4,
        minute=0,
        id="weekly_full_backup",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )

    # 每星期日 04:30 HKT — 完整 project 打包（source + data + config），放去 iCloud System-backup/
    def weekly_system_backup() -> None:
        import logging as _log
        try:
            from app.services.backup import create_system_backup

            out = create_system_backup()
            if out is None:
                _log.getLogger(__name__).info("Weekly system backup skipped (iCloud unavailable)")
            else:
                _log.getLogger(__name__).info("Weekly system backup created: %s", out.name)
        except Exception:
            _log.getLogger(__name__).exception("weekly_system_backup failed")

    scheduler.add_job(
        weekly_system_backup,
        "cron",
        day_of_week="sun",
        hour=4,
        minute=30,
        id="weekly_system_backup",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )

    scheduler.start()


def stop_scheduler() -> None:
    """喺 FastAPI 關閉時停 scheduler。"""
    global scheduler
    if scheduler is not None:
        scheduler.shutdown(wait=False)
        scheduler = None
