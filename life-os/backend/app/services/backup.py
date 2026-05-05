"""系統備份服務 — SQLite DB + vault 檔案一齊打包。

備份內容：
  * SQLite DB（用 sqlite3 `.backup()` API，safe，live connection 都 OK）
  * data_dir/vault/ 所有用戶上載嘅檔案

輸出：
  * 本機：~/.life-os/backups/lifeos-full-<timestamp>.tar.gz
  * iCloud Drive 鏡像：~/Library/Mobile Documents/com~apple~CloudDocs/life-os-backups/
    （macOS 會自動 sync 上 iCloud；Mac 以外嘅裝置 skip）
"""

from __future__ import annotations

import logging
import shutil
import sqlite3
import tarfile
import tempfile
from datetime import datetime
from pathlib import Path

from app.config import get_settings

logger = logging.getLogger(__name__)

DEFAULT_KEEP = 12  # 保留最近 12 份（weekly = 約 3 個月）


def _default_backup_dir() -> Path:
    return Path.home() / ".life-os" / "backups"


def _default_icloud_backup_dir() -> Path:
    """iCloud Drive 鏡像目錄。iCloud Drive 冇開嘅話，parent 唔會存在，copy step 自動 skip。"""
    return (
        Path.home()
        / "Library"
        / "Mobile Documents"
        / "com~apple~CloudDocs"
        / "life-os-backups"
    )


def _mirror_to_icloud(src: Path, keep: int, icloud_dir: Path | None = None) -> Path | None:
    """將備份檔 copy 去 iCloud Drive，同時 prune 舊嘅。返回 iCloud 檔案路徑（或 None 如果 skip）。"""
    idir = icloud_dir or _default_icloud_backup_dir()
    # iCloud Drive 唔存在（用戶冇開 iCloud Drive / 非 macOS）就 skip
    if not idir.parent.exists():
        logger.info("iCloud Drive not available, skip mirror: %s", idir.parent)
        return None
    try:
        idir.mkdir(parents=True, exist_ok=True)
        dst = idir / src.name
        shutil.copy2(src, dst)
        # Prune 舊嘅 iCloud copy
        mirror_files = sorted(idir.glob("lifeos-full-*.tar.gz"), reverse=True)
        for old in mirror_files[keep:]:
            try:
                old.unlink()
            except OSError as e:
                logger.warning("Failed to prune iCloud mirror %s: %s", old, e)
        logger.info("Mirrored to iCloud: %s", dst)
        return dst
    except OSError as e:
        # iCloud copy 失敗唔應該搞崩個主要備份流程
        logger.warning("iCloud mirror failed (non-fatal): %s", e)
        return None


def _resolve_db_path() -> Path:
    """攞 SQLite DB 嘅 absolute path。"""
    settings = get_settings()
    raw = settings.database_url.replace("sqlite:///", "")
    p = Path(raw)
    if not p.is_absolute():
        # relative to backend cwd — backend 通常 cwd 係 life-os/backend
        p = Path.cwd() / p
    return p.resolve()


def create_full_backup(
    *,
    keep: int = DEFAULT_KEEP,
    backup_dir: Path | None = None,
) -> Path:
    """建立完整備份（DB + vault）。返回備份檔案路徑。

    Args:
        keep: 保留幾多份舊備份（舊嘅會自動刪）。
        backup_dir: 備份目錄，default ~/.life-os/backups。
    """
    settings = get_settings()
    data_dir = settings.data_dir
    bdir = backup_dir or _default_backup_dir()
    bdir.mkdir(parents=True, exist_ok=True)

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    out_path = bdir / f"lifeos-full-{ts}.tar.gz"

    db_path = _resolve_db_path()
    if not db_path.exists():
        raise FileNotFoundError(f"SQLite DB 搵唔到：{db_path}")

    # Step 1: SQLite online snapshot（safe，唔會鎖住 live connection）
    with tempfile.TemporaryDirectory() as tmpdir:
        snapshot_path = Path(tmpdir) / "lifeos.db"
        src = sqlite3.connect(str(db_path))
        try:
            dst = sqlite3.connect(str(snapshot_path))
            try:
                src.backup(dst)
            finally:
                dst.close()
        finally:
            src.close()

        # Step 2: Tar DB snapshot + vault 目錄 + 其他 data_dir 重要嘢
        with tarfile.open(out_path, "w:gz") as tar:
            tar.add(snapshot_path, arcname="lifeos.db")

            vault_dir = data_dir / "vault"
            if vault_dir.exists() and vault_dir.is_dir():
                tar.add(vault_dir, arcname="vault")

            # note attachments（如果有）
            note_dir = data_dir / "notes"
            if note_dir.exists() and note_dir.is_dir():
                tar.add(note_dir, arcname="notes")

            # .env 檔（API keys / secrets）— 用 resolved DB path 拎 backend/ 絕對路徑
            backend_dir = db_path.parent.parent.resolve()  # db = backend/data/lifeos.db → backend/
            backend_env = backend_dir / ".env"
            if backend_env.exists() and backend_env.is_file():
                tar.add(backend_env, arcname="env/backend.env")
            # project root .env（scripts 用）
            root_env = backend_dir.parent / ".env"
            if root_env.exists() and root_env.is_file():
                tar.add(root_env, arcname="env/root.env")

    # Step 3: 清走舊備份
    backups = sorted(bdir.glob("lifeos-full-*.tar.gz"), reverse=True)
    pruned = 0
    for old in backups[keep:]:
        try:
            old.unlink()
            pruned += 1
        except OSError as e:
            logger.warning("Failed to prune %s: %s", old, e)

    size_mb = out_path.stat().st_size / 1024 / 1024
    logger.info(
        "Full backup OK: %s (%.1f MB), pruned %d old",
        out_path.name, size_mb, pruned,
    )

    # Step 4: 鏡像去 iCloud Drive（best-effort，失敗唔會 raise）
    _mirror_to_icloud(out_path, keep=keep)

    return out_path


def list_backups(backup_dir: Path | None = None) -> list[dict]:
    """列出所有備份檔案（新→舊）。"""
    bdir = backup_dir or _default_backup_dir()
    if not bdir.exists():
        return []
    out = []
    for p in sorted(bdir.glob("lifeos-full-*.tar.gz"), reverse=True):
        st = p.stat()
        out.append({
            "name": p.name,
            "path": str(p),
            "size_bytes": st.st_size,
            "created_at": datetime.fromtimestamp(st.st_mtime).isoformat(),
        })
    return out


# ─────────────────────────────────────────────────────────────────────────────
# System backup — 打包整個 life-os project folder（source + data + .env）
# 放去 iCloud Drive: life-os-backups/System-backup/
# ─────────────────────────────────────────────────────────────────────────────

SYSTEM_BACKUP_KEEP = 4  # 保留最近 4 份（weekly = 約 1 個月）

# 唔備份嘅目錄/檔案（cache、build artifact、可以重建）
_SYSTEM_BACKUP_EXCLUDES = {
    ".venv",
    "node_modules",
    ".next",
    "out",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".DS_Store",
    "dist",
    "build",
    ".turbo",
}


def _project_root() -> Path:
    """life-os repo 根目錄 — 從 backend/app/services/backup.py 向上 3 層。"""
    return Path(__file__).resolve().parents[3]


def _default_system_backup_dir() -> Path:
    """System backup 放去 iCloud Drive 嘅 life-os-backups/System-backup/。"""
    return _default_icloud_backup_dir() / "System-backup"


def _tar_filter(tarinfo: tarfile.TarInfo) -> tarfile.TarInfo | None:
    """Tar 過濾器 — 排除 cache / build dirs。"""
    # tarinfo.name 係 archive 入面嘅相對路徑
    parts = Path(tarinfo.name).parts
    for part in parts:
        if part in _SYSTEM_BACKUP_EXCLUDES:
            return None
    return tarinfo


def create_system_backup(
    *,
    keep: int = SYSTEM_BACKUP_KEEP,
    out_dir: Path | None = None,
) -> Path | None:
    """打包整個 life-os project folder 做 tar.gz，放去 iCloud。

    Skip cache / build dirs（.venv, node_modules, .next, __pycache__ 等）。
    返回 tarball 路徑，或者 None 如果 iCloud Drive 唔 available。
    """
    odir = out_dir or _default_system_backup_dir()
    # iCloud Drive 唔存在就 skip
    if not odir.parent.parent.exists():
        logger.info("iCloud Drive not available, skip system backup")
        return None

    odir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    out_path = odir / f"lifeos-system-{ts}.tar.gz"

    root = _project_root()
    logger.info("System backup start: %s → %s", root, out_path)

    with tarfile.open(out_path, "w:gz") as tar:
        tar.add(root, arcname="life-os", filter=_tar_filter)

    # Prune 舊嘅
    backups = sorted(odir.glob("lifeos-system-*.tar.gz"), reverse=True)
    pruned = 0
    for old in backups[keep:]:
        try:
            old.unlink()
            pruned += 1
        except OSError as e:
            logger.warning("Failed to prune system backup %s: %s", old, e)

    size_mb = out_path.stat().st_size / 1024 / 1024
    logger.info(
        "System backup OK: %s (%.1f MB), pruned %d old",
        out_path.name, size_mb, pruned,
    )
    return out_path


def list_system_backups(out_dir: Path | None = None) -> list[dict]:
    """列出所有 system backup（新→舊）。"""
    odir = out_dir or _default_system_backup_dir()
    if not odir.exists():
        return []
    out = []
    for p in sorted(odir.glob("lifeos-system-*.tar.gz"), reverse=True):
        st = p.stat()
        out.append({
            "name": p.name,
            "path": str(p),
            "size_bytes": st.st_size,
            "created_at": datetime.fromtimestamp(st.st_mtime).isoformat(),
        })
    return out
