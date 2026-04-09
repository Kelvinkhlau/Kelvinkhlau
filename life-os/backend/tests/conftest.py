"""Pytest fixtures / test environment setup。

設計：
- 用 in-memory SQLite + StaticPool 共享 connection（唔會每個 session 開個新 DB）
- 自動建立 schema（metadata.create_all）
- 覆蓋 app.db.get_db dependency 指向 test session
- 阻擋 APScheduler 真係 start（避免 test 時 background job 干擾）
"""

from __future__ import annotations

import os
from collections.abc import Generator

# ─── 1. 喺 import app 之前 set env vars（好重要）─────────────────
os.environ["APP_ENV"] = "test"
os.environ["APP_SECRET_KEY"] = "test-secret-key-must-be-at-least-32-chars"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["OWNER_EMAIL"] = "test@example.com"
os.environ["OWNER_NAME"] = "Test User"
os.environ["WEBAUTHN_RP_ID"] = "localhost"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models.user import User
from app.services import jwt_service
from app.workers import scheduler as scheduler_module


# ─── 2. 阻擋 scheduler 喺 test 期間 start ────────────────────────
@pytest.fixture(autouse=True)
def _mock_scheduler(monkeypatch: pytest.MonkeyPatch) -> None:
    """Lifespan hook 唔好真係起 APScheduler。"""
    monkeypatch.setattr(scheduler_module, "start_scheduler", lambda: None)
    monkeypatch.setattr(scheduler_module, "stop_scheduler", lambda: None)


# ─── 3. 共享 in-memory DB engine ─────────────────────────────────
@pytest.fixture(scope="session")
def engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,  # 所有 session 共用同一個 in-memory DB
    )
    # 確保所有 models import 咗（令 metadata 識得佢哋）
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=eng)
    yield eng
    eng.dispose()


@pytest.fixture(autouse=True)
def _clean_tables(engine) -> None:
    """每個 test 之前清空所有 table（保持 isolation）。"""
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())


@pytest.fixture
def db_session(engine) -> Generator[Session, None, None]:
    """每個 test 自己個 session，test 完 rollback 保持乾淨。"""
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = session_factory()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def client(engine) -> Generator[TestClient, None, None]:
    """FastAPI TestClient — 覆蓋 get_db 指向 test DB。"""
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db() -> Generator[Session, None, None]:
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ─── 4. Helper：建立 user + JWT token ────────────────────────────
@pytest.fixture
def test_user(db_session: Session) -> User:
    """建立一個 test user（已經 commit）。"""
    user = User(email="test@example.com", name="Test User")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user: User) -> dict[str, str]:
    """返一個 dict 可以當 headers 用，已經簽好 JWT。"""
    token = jwt_service.issue_token(test_user.id)
    return {"Authorization": f"Bearer {token}"}
