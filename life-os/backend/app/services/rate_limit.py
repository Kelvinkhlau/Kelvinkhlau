"""Simple in-memory rate limiter.

只適合 single-process (FastAPI + uvicorn 單 worker) 部署。
生產多 worker / 多 instance 要用 Redis。
life-os 係單用戶 self-host，完全夠。

用法：

    from app.services.rate_limit import rate_limit

    @router.post("/classify-all")
    async def classify_all(
        request: Request,
        _rl: None = Depends(rate_limit("classify-all", max_per_minute=2, max_per_hour=20)),
    ):
        ...
"""

from __future__ import annotations

import time
from collections import deque
from threading import Lock
from typing import Callable

from fastapi import HTTPException, Request, status

_buckets: dict[str, deque[float]] = {}
_lock = Lock()


def _check(key: str, window_secs: int, max_hits: int) -> tuple[bool, float]:
    """Return (allowed, retry_after_secs)."""
    now = time.time()
    cutoff = now - window_secs
    with _lock:
        dq = _buckets.setdefault(key, deque())
        # 清走過期記錄
        while dq and dq[0] < cutoff:
            dq.popleft()
        if len(dq) >= max_hits:
            retry = (dq[0] + window_secs) - now
            return False, max(retry, 1.0)
        dq.append(now)
        return True, 0.0


def rate_limit(
    name: str,
    max_per_minute: int | None = None,
    max_per_hour: int | None = None,
) -> Callable:
    """Return a FastAPI dependency that enforces per-IP + per-name rate limit.

    Args:
        name: Unique name for the limit bucket (e.g. "classify-all").
        max_per_minute: Max hits per 60s window, or None to skip.
        max_per_hour: Max hits per 3600s window, or None to skip.

    Raises 429 when exceeded.
    """

    def _dep(request: Request) -> None:
        ip = request.client.host if request.client else "unknown"
        base = f"{name}:{ip}"
        if max_per_minute is not None:
            ok, retry = _check(f"{base}:m", 60, max_per_minute)
            if not ok:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"請求太頻密，請 {int(retry)}s 後再試",
                    headers={"Retry-After": str(int(retry))},
                )
        if max_per_hour is not None:
            ok, retry = _check(f"{base}:h", 3600, max_per_hour)
            if not ok:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"今個小時請求達上限，請 {int(retry // 60)}分鐘後再試",
                    headers={"Retry-After": str(int(retry))},
                )

    return _dep
