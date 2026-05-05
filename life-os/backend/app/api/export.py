"""Data export + import API — JSON 備份 / 還原 + 版本歷史。"""

import json
import logging
from datetime import UTC, date, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy import select

logger = logging.getLogger(__name__)

from app.deps import CurrentUser, DbSession, current_user
from app.models.calendar_event import CalendarEvent
from app.models.expense import Expense
from app.models.idea import Idea
from app.models.note import Note
from app.models.project import Project
from app.models.todo import Todo
from app.models.vip import VipSender
from app.services.audit import log_action

router = APIRouter(dependencies=[Depends(current_user)])

# Model mapping for import
_IMPORT_MODELS = {
    "todos": Todo,
    "projects": Project,
    "ideas": Idea,
    "notes": Note,
    "expenses": Expense,
    "vip_senders": VipSender,
}

# Fields to skip during import (auto-generated or user-specific)
_SKIP_FIELDS = {"id", "user_id", "created_at", "updated_at"}


def _serialize(obj) -> dict:
    """將 ORM object 嘅所有 column 轉成 JSON-safe dict。"""
    result = {}
    for col in obj.__table__.columns:
        val = getattr(obj, col.name)
        if isinstance(val, (datetime, date)):
            val = val.isoformat()
        result[col.name] = val
    return result


@router.get("")
async def export_all(user: CurrentUser, db: DbSession) -> JSONResponse:
    """匯出所有用戶數據為 JSON — 用作備份或遷移。"""
    data = {
        "exported_at": datetime.now(UTC).isoformat(),
        "user": {"email": user.email, "name": user.name},
        "todos": [
            _serialize(t)
            for t in db.execute(
                select(Todo).where(Todo.user_id == user.id)
            ).scalars().all()
        ],
        "projects": [
            _serialize(p)
            for p in db.execute(
                select(Project).where(Project.user_id == user.id)
            ).scalars().all()
        ],
        "ideas": [
            _serialize(i)
            for i in db.execute(
                select(Idea).where(Idea.user_id == user.id)
            ).scalars().all()
        ],
        "notes": [
            _serialize(n)
            for n in db.execute(
                select(Note).where(Note.user_id == user.id)
            ).scalars().all()
        ],
        "expenses": [
            _serialize(e)
            for e in db.execute(
                select(Expense).where(Expense.user_id == user.id)
            ).scalars().all()
        ],
        "calendar_events": [
            _serialize(c)
            for c in db.execute(
                select(CalendarEvent).where(CalendarEvent.user_id == user.id)
            ).scalars().all()
        ],
        "vip_senders": [
            _serialize(v)
            for v in db.execute(
                select(VipSender).where(VipSender.user_id == user.id)
            ).scalars().all()
        ],
    }
    filename = f"lifeos-backup-{date.today().isoformat()}.json"
    return JSONResponse(
        content=data,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


BACKUP_DIR = Path(__file__).parent.parent.parent / "backups"


class BackupVersion(BaseModel):
    filename: str
    date: str
    size_kb: float


@router.post("/snapshot")
async def create_snapshot(user: CurrentUser, db: DbSession) -> dict:
    """建立備份 snapshot — 儲存到 backups/ 目錄，保留 30 日。"""
    BACKUP_DIR.mkdir(exist_ok=True)

    # Generate export data (reuse export logic)
    data = {
        "exported_at": datetime.now(UTC).isoformat(),
        "user": {"email": user.email, "name": user.name},
        "todos": [_serialize(t) for t in db.execute(select(Todo).where(Todo.user_id == user.id)).scalars().all()],
        "projects": [_serialize(p) for p in db.execute(select(Project).where(Project.user_id == user.id)).scalars().all()],
        "ideas": [_serialize(i) for i in db.execute(select(Idea).where(Idea.user_id == user.id)).scalars().all()],
        "notes": [_serialize(n) for n in db.execute(select(Note).where(Note.user_id == user.id)).scalars().all()],
        "expenses": [_serialize(e) for e in db.execute(select(Expense).where(Expense.user_id == user.id)).scalars().all()],
        "calendar_events": [_serialize(c) for c in db.execute(select(CalendarEvent).where(CalendarEvent.user_id == user.id)).scalars().all()],
        "vip_senders": [_serialize(v) for v in db.execute(select(VipSender).where(VipSender.user_id == user.id)).scalars().all()],
    }

    filename = f"lifeos-backup-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}.json"
    filepath = BACKUP_DIR / filename
    filepath.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    # 清理超過 30 日嘅 backup
    cutoff = datetime.now(UTC).timestamp() - (30 * 86400)
    for old in BACKUP_DIR.glob("lifeos-backup-*.json"):
        if old.stat().st_mtime < cutoff:
            old.unlink()
            logger.info("Deleted old backup: %s", old.name)

    return {"ok": True, "filename": filename, "size_kb": round(filepath.stat().st_size / 1024, 1)}


@router.get("/versions", response_model=list[BackupVersion])
async def list_versions(user: CurrentUser) -> list[BackupVersion]:
    """列出所有備份版本。"""
    if not BACKUP_DIR.exists():
        return []
    versions = []
    for f in sorted(BACKUP_DIR.glob("lifeos-backup-*.json"), reverse=True):
        # Extract date from filename
        name = f.stem.replace("lifeos-backup-", "")
        versions.append(BackupVersion(
            filename=f.name,
            date=name,
            size_kb=round(f.stat().st_size / 1024, 1),
        ))
    return versions


@router.get("/versions/{filename}")
async def get_version(filename: str, user: CurrentUser) -> JSONResponse:
    """下載指定版本嘅備份。"""
    filepath = BACKUP_DIR / filename
    if not filepath.exists() or not filename.startswith("lifeos-backup-"):
        raise HTTPException(status_code=404, detail="Backup not found")
    data = json.loads(filepath.read_text(encoding="utf-8"))
    return JSONResponse(
        content=data,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class SystemBackupInfo(BaseModel):
    name: str
    size_bytes: int
    created_at: str


@router.post("/system-backup", response_model=SystemBackupInfo)
async def trigger_system_backup(user: CurrentUser, db: DbSession) -> SystemBackupInfo:
    """手動觸發完整系統備份（SQLite DB + vault 所有檔案）。

    背景每個星期日 04:00 HKT 自動 run，此 endpoint 可以即時補 run 一次。
    """
    from app.services.backup import create_full_backup

    try:
        out = create_full_backup()
    except Exception as e:
        logger.exception("Manual system backup failed")
        raise HTTPException(status_code=500, detail=f"備份失敗：{e}") from e

    st = out.stat()
    log_action(
        db, action="system_backup", user_id=user.id,
        detail=f"{out.name} ({st.st_size / 1024 / 1024:.1f} MB)",
    )
    return SystemBackupInfo(
        name=out.name,
        size_bytes=st.st_size,
        created_at=datetime.fromtimestamp(st.st_mtime).isoformat(),
    )


@router.get("/system-backups", response_model=list[SystemBackupInfo])
async def list_system_backups(user: CurrentUser) -> list[SystemBackupInfo]:
    """列出所有完整系統備份（新→舊）。"""
    from app.services.backup import list_backups

    return [
        SystemBackupInfo(
            name=b["name"],
            size_bytes=b["size_bytes"],
            created_at=b["created_at"],
        )
        for b in list_backups()
    ]


@router.get("/system-backups/{name}/download")
async def download_system_backup(name: str, user: CurrentUser) -> FileResponse:
    """下載指定嘅完整備份 tar.gz 檔案。"""
    from app.services.backup import _default_backup_dir

    # 防路徑注入 — 只接受 lifeos-full-<digits>.tar.gz 格式
    if not (name.startswith("lifeos-full-") and name.endswith(".tar.gz")):
        raise HTTPException(status_code=400, detail="無效備份名")
    if "/" in name or ".." in name:
        raise HTTPException(status_code=400, detail="無效備份名")

    path = _default_backup_dir() / name
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="備份唔存在")
    return FileResponse(
        path=path,
        filename=name,
        media_type="application/gzip",
    )


class ImportResult(BaseModel):
    imported: dict[str, int]
    skipped: dict[str, int]


@router.post("/import", response_model=ImportResult)
async def import_data(
    file: UploadFile, user: CurrentUser, db: DbSession
) -> ImportResult:
    """匯入 JSON 備份 — 將數據還原到當前用戶。

    注意：唔會刪除現有數據，只會新增。重複數據需要手動處理。
    """
    import json

    if not file.content_type or "json" not in file.content_type:
        raise HTTPException(status_code=400, detail="只接受 JSON 檔案")

    raw = await file.read()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"JSON 解析失敗：{e}") from e

    imported: dict[str, int] = {}
    skipped: dict[str, int] = {}

    for key, model_cls in _IMPORT_MODELS.items():
        items = data.get(key, [])
        if not isinstance(items, list):
            continue
        count = 0
        skip = 0
        columns = {c.name for c in model_cls.__table__.columns}
        for item in items:
            if not isinstance(item, dict):
                skip += 1
                continue
            fields = {
                k: v for k, v in item.items()
                if k in columns and k not in _SKIP_FIELDS
            }
            fields["user_id"] = user.id
            try:
                obj = model_cls(**fields)
                db.add(obj)
                count += 1
            except Exception:
                skip += 1
        imported[key] = count
        skipped[key] = skip

    db.commit()
    log_action(
        db, action="import", user_id=user.id,
        detail=f"Imported: {imported}",
    )
    return ImportResult(imported=imported, skipped=skipped)
