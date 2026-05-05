"""Vault 檔案儲存 service — disk IO + MIME 檢測。

- 儲存路徑：`<data_dir>/vault/<user_id>/<YYYY>/<MM>/<uuid>.<ext>`
- MIME detection：用 magic bytes（頭 12 bytes）+ client-provided + 副檔名 fallback
- SHA256：用嚟做完整性 check + dedupe
"""

from __future__ import annotations

import hashlib
import mimetypes
import uuid
from datetime import UTC, datetime
from pathlib import Path

# Magic-byte signatures — 用嚟對照 client-provided MIME，防偽裝。
# Ref: https://en.wikipedia.org/wiki/List_of_file_signatures
_MAGIC_SIGNATURES: list[tuple[bytes, str]] = [
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"RIFF", "image/webp"),  # 會再 double-check 第 8 byte
    (b"%PDF-", "application/pdf"),
    (b"PK\x03\x04", "application/zip"),  # zip, docx, xlsx, pptx
    (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", "application/x-ole"),  # doc/xls
]

# 允許嘅 MIME types — 白名單
ALLOWED_MIME_PREFIXES = ("image/", "text/", "application/pdf", "application/json")
ALLOWED_MIME_EXACT = {
    "application/zip",
    "application/x-zip-compressed",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/rtf",
    "application/x-ole",
}

# 單檔 50 MB max
MAX_FILE_BYTES = 50 * 1024 * 1024


def is_allowed_mime(mime: str) -> bool:
    if any(mime.startswith(p) for p in ALLOWED_MIME_PREFIXES):
        return True
    return mime in ALLOWED_MIME_EXACT


def detect_mime(data: bytes, client_mime: str | None, filename: str | None) -> str:
    """Detect MIME type。優先級：magic bytes → client-provided → 副檔名。"""
    # 1. Magic bytes
    if len(data) >= 12:
        if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
            return "image/webp"
        for sig, mime in _MAGIC_SIGNATURES:
            if data.startswith(sig):
                # zip 可能係 docx/xlsx — 用 client-provided 細分
                if mime == "application/zip" and client_mime:
                    c = client_mime.lower()
                    if "officedocument" in c or c in ALLOWED_MIME_EXACT:
                        return c
                return mime

    # 2. Client-provided
    if client_mime:
        c = client_mime.lower().strip()
        if c and c != "application/octet-stream":
            return c

    # 3. Guess from filename
    if filename:
        guessed, _ = mimetypes.guess_type(filename)
        if guessed:
            return guessed

    return "application/octet-stream"


def build_storage_path(user_id: int, ext: str) -> Path:
    """Relative path: vault/<user_id>/<YYYY>/<MM>/<uuid>.<ext>。"""
    now = datetime.now(tz=UTC)
    safe_ext = "".join(c for c in ext if c.isalnum() or c == ".")[:10]
    if safe_ext and not safe_ext.startswith("."):
        safe_ext = "." + safe_ext
    file_uuid = uuid.uuid4().hex
    return Path("vault") / str(user_id) / f"{now.year:04d}" / f"{now.month:02d}" / f"{file_uuid}{safe_ext}"


def extract_ext(filename: str | None) -> str:
    if not filename or "." not in filename:
        return ""
    return "." + filename.rsplit(".", 1)[-1].lower()[:10]


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_file(data_dir: Path, rel_path: Path, data: bytes) -> None:
    abs_path = data_dir / rel_path
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(data)


def abs_path(data_dir: Path, rel_path: str | Path) -> Path:
    return data_dir / rel_path


def delete_file(data_dir: Path, rel_path: str | Path) -> None:
    p = data_dir / rel_path
    try:
        p.unlink(missing_ok=True)
    except OSError:
        pass
