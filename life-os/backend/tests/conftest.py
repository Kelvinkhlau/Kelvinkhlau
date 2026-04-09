"""Pytest fixtures / test environment setup。"""

import os

# 喺 import app 之前 set test env vars，避免需要 .env
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault(
    "APP_SECRET_KEY", "test-secret-key-must-be-at-least-32-chars"
)
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
