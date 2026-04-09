"""WebSocket broadcast manager — 俾 backend 將實時事件 push 俾所有連住嘅 clients。

簡單版本：in-memory、單 process。Mac mini 單用戶系統夠用。
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WSManager:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()
        # 主 event loop — 由 startup 時設定，俾同步 code 可以 schedule broadcast
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._clients.add(ws)
        logger.info("WS client connected, total=%d", len(self._clients))

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(ws)
        logger.info("WS client disconnected, total=%d", len(self._clients))

    async def broadcast(self, message: dict[str, Any]) -> None:
        async with self._lock:
            clients = list(self._clients)
        dead: list[WebSocket] = []
        for ws in clients:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self._clients.discard(ws)

    def broadcast_threadsafe(self, message: dict[str, Any]) -> None:
        """俾同步 code（例如 APScheduler background job）call。"""
        loop = self._loop
        if loop is None or loop.is_closed():
            logger.debug("WS loop not ready; skip broadcast")
            return
        try:
            asyncio.run_coroutine_threadsafe(self.broadcast(message), loop)
        except Exception:
            logger.exception("broadcast_threadsafe failed")


manager = WSManager()
