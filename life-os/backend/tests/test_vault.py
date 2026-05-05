"""Vault API integration tests。"""

from __future__ import annotations

import io
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User
from app.services import jwt_service


def _fresh_headers(user: User) -> dict[str, str]:
    """Fresh JWT（iat = now）— 可以通過 step-up。"""
    token = jwt_service.issue_token(user.id)
    return {"Authorization": f"Bearer {token}"}


def _stale_headers(user: User) -> dict[str, str]:
    """Stale JWT（iat = 1 小時前）— 應該觸發 step-up。"""
    now = datetime.now(tz=UTC)
    payload = {
        "sub": str(user.id),
        "iat": int((now - timedelta(hours=1)).timestamp()),
        "exp": int((now + timedelta(hours=1)).timestamp()),
    }
    from jose import jwt as jose_jwt
    from app.config import get_settings

    s = get_settings()
    token = jose_jwt.encode(
        payload, s.app_secret_key, algorithm=s.jwt_algorithm
    )
    return {"Authorization": f"Bearer {token}"}


def test_categories_autoseed(client: TestClient, auth_headers):
    """第一次 list categories → auto-seed 10 個 default。"""
    r = client.get("/api/vault/categories", headers=auth_headers)
    assert r.status_code == 200
    cats = r.json()
    assert len(cats) == 10
    names = [c["name"] for c in cats]
    assert "稅務財務" in names
    assert "車輛" in names
    assert "教育" in names


def test_upload_and_list(client: TestClient, auth_headers, test_user: User, db_session: Session):
    """上載 PNG → list → preview → download。"""
    # Upload
    png_magic = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
    r = client.post(
        "/api/vault/files",
        headers=auth_headers,
        files={"file": ("test.png", io.BytesIO(png_magic), "image/png")},
    )
    assert r.status_code == 201, r.text
    f = r.json()
    assert f["mime_type"] == "image/png"
    assert f["size_bytes"] == len(png_magic)
    assert f["filename"] == "test.png"
    assert f["sha256"]  # non-empty
    fid = f["id"]

    # List
    r = client.get("/api/vault/files", headers=auth_headers)
    assert r.status_code == 200
    files = r.json()
    assert any(x["id"] == fid for x in files)

    # Preview (no step-up required)
    r = client.get(f"/api/vault/files/{fid}/preview", headers=auth_headers)
    assert r.status_code == 200
    assert r.content == png_magic


def test_download_requires_step_up(client: TestClient, test_user: User):
    """Download 要 fresh JWT（step-up）。"""
    # Upload first with fresh token
    fresh = _fresh_headers(test_user)
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 50
    r = client.post(
        "/api/vault/files",
        headers=fresh,
        files={"file": ("a.png", io.BytesIO(png), "image/png")},
    )
    assert r.status_code == 201
    fid = r.json()["id"]

    # Stale token should get 401 step_up_required on download
    stale = _stale_headers(test_user)
    r = client.get(f"/api/vault/files/{fid}/download", headers=stale)
    assert r.status_code == 401
    assert "step_up_required" in r.json()["detail"]

    # Fresh token works
    r = client.get(f"/api/vault/files/{fid}/download", headers=fresh)
    assert r.status_code == 200
    assert r.content == png


def test_update_and_tags(client: TestClient, auth_headers):
    # Upload
    r = client.post(
        "/api/vault/files",
        headers=auth_headers,
        files={"file": ("doc.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
    )
    assert r.status_code == 201
    fid = r.json()["id"]

    # Create tags
    r = client.post("/api/vault/tags", headers=auth_headers, json={"name": "2026"})
    assert r.status_code == 201
    tag1 = r.json()["id"]
    r = client.post("/api/vault/tags", headers=auth_headers, json={"name": "報稅"})
    tag2 = r.json()["id"]

    # Update file with tags + notes + expiry
    r = client.patch(
        f"/api/vault/files/{fid}",
        headers=auth_headers,
        json={
            "filename": "2026 稅單.pdf",
            "notes": "IRD 第二期",
            "expiry_date": "2026-06-30",
            "tag_ids": [tag1, tag2],
        },
    )
    assert r.status_code == 200, r.text
    f = r.json()
    assert f["filename"] == "2026 稅單.pdf"
    assert f["notes"] == "IRD 第二期"
    assert f["expiry_date"] == "2026-06-30"
    assert set(f["tag_ids"]) == {tag1, tag2}
    assert f["days_until_expiry"] is not None

    # Filter by tag
    r = client.get(f"/api/vault/files?tag_id={tag1}", headers=auth_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_soft_delete_requires_step_up_then_restore(client: TestClient, test_user: User):
    fresh = _fresh_headers(test_user)
    r = client.post(
        "/api/vault/files",
        headers=fresh,
        files={"file": ("x.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    fid = r.json()["id"]

    # Stale → 401 step_up
    stale = _stale_headers(test_user)
    r = client.delete(f"/api/vault/files/{fid}", headers=stale)
    assert r.status_code == 401

    # Fresh → 204
    r = client.delete(f"/api/vault/files/{fid}", headers=fresh)
    assert r.status_code == 204

    # List (default) shouldn't include
    r = client.get("/api/vault/files", headers=fresh)
    assert all(x["id"] != fid for x in r.json())

    # List with include_deleted
    r = client.get("/api/vault/files?include_deleted=true", headers=fresh)
    assert any(x["id"] == fid for x in r.json())

    # Restore
    r = client.post(f"/api/vault/files/{fid}/restore", headers=fresh)
    assert r.status_code == 200
    assert r.json()["deleted_at"] is None


def test_summary(client: TestClient, auth_headers):
    # Upload 2 files
    client.post(
        "/api/vault/files",
        headers=auth_headers,
        files={"file": ("a.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 10), "image/png")},
    )
    client.post(
        "/api/vault/files",
        headers=auth_headers,
        files={"file": ("b.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
    )
    r = client.get("/api/vault/summary", headers=auth_headers)
    assert r.status_code == 200
    s = r.json()
    assert s["total_files"] == 2
    assert s["total_size_bytes"] > 0
    assert len(s["categories"]) == 10  # seeded


def test_upload_rejects_oversize(client: TestClient, auth_headers):
    big = b"\x89PNG\r\n\x1a\n" + b"\x00" * (51 * 1024 * 1024)
    r = client.post(
        "/api/vault/files",
        headers=auth_headers,
        files={"file": ("big.png", io.BytesIO(big), "image/png")},
    )
    assert r.status_code == 413


def test_upload_rejects_bad_mime(client: TestClient, auth_headers):
    r = client.post(
        "/api/vault/files",
        headers=auth_headers,
        files={
            "file": (
                "bin.exe",
                io.BytesIO(b"MZ\x00\x00"),
                "application/x-msdownload",
            )
        },
    )
    assert r.status_code == 415
