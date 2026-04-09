"""SQLAlchemy engine + session 設定。"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

settings = get_settings()


class Base(DeclarativeBase):
    """所有 ORM model 嘅 base class。"""

    pass


# SQLite 需要 check_same_thread=False 配 FastAPI 嘅多 thread
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    echo=settings.app_env == "development",
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency — 每個 request 一個 session。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
