"""簡單嘅 retry helper — 指數退避。

唔用 `tenacity` 是為了 keep deps 細。同步版本夠用：
Gmail / Claude API call 都係同步 HTTP，喺 APScheduler thread 或 request handler
block 冇問題。
"""

from __future__ import annotations

import logging
import random
import time
from collections.abc import Callable
from typing import TypeVar

T = TypeVar("T")
logger = logging.getLogger(__name__)


def retry_call(
    fn: Callable[[], T],
    *,
    max_attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 16.0,
    retry_on: tuple[type[BaseException], ...] = (Exception,),
    should_retry: Callable[[BaseException], bool] | None = None,
    label: str = "call",
) -> T:
    """Call `fn()` 最多 `max_attempts` 次。

    - 指數退避：delay = min(base_delay * 2**(attempt-1), max_delay) + jitter
    - `retry_on`：只對呢啲 exception type retry（default 所有 Exception）
    - `should_retry(exc)`：再細部 filter（例如 HTTP 5xx retry，4xx 唔 retry）
    """
    last_exc: BaseException | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return fn()
        except retry_on as e:
            last_exc = e
            if should_retry is not None and not should_retry(e):
                raise
            if attempt == max_attempts:
                logger.warning(
                    "%s failed after %d attempts: %s", label, max_attempts, e
                )
                raise
            delay = min(base_delay * (2 ** (attempt - 1)), max_delay)
            delay += random.uniform(0, delay * 0.2)  # jitter
            logger.info(
                "%s attempt %d/%d failed (%s); retrying in %.1fs",
                label,
                attempt,
                max_attempts,
                e,
                delay,
            )
            time.sleep(delay)

    # Shouldn't reach — 但為咗 type checker
    assert last_exc is not None
    raise last_exc
