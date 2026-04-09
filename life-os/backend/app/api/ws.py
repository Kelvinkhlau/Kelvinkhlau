"""WebSocket routes — 實時 push 新 email / 事件。"""

import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from app.services import jwt_service
from app.services.ws_manager import manager

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/emails")
async def ws_emails(
    websocket: WebSocket,
    token: str | None = Query(None, description="JWT — 由 client localStorage 傳入"),
) -> None:
    """Frontend connect 呢度攞實時事件。

    驗證：query string `?token=<jwt>` — 因為 browser WebSocket API
    唔支援自定義 headers。

    Message 格式：
    - `{"type": "hello"}` — 連接成功
    - `{"type": "email.new", "email": {...}}` — 新 email 入庫
    - `{"type": "sync.done", "new": N, "classified": N}` — sync 完成
    """
    # Auth check before accept
    if not token or jwt_service.decode_token(token) is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(websocket)
    try:
        await websocket.send_json({"type": "hello"})
        while True:
            # 我哋唔期望 client 發訊息，但要 receive 先保持連線活躍
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket)
