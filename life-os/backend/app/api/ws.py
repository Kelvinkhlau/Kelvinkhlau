"""WebSocket routes — 實時 push 新 email / 事件。"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.ws_manager import manager

router = APIRouter()


@router.websocket("/emails")
async def ws_emails(websocket: WebSocket) -> None:
    """Frontend connect 呢度攞實時事件。

    Message 格式：
    - `{"type": "email.new", "email": {...}}` — 新 email 入庫
    - `{"type": "sync.done", "new": N, "classified": N}` — sync 完成
    - `{"type": "ping"}` — keep-alive
    """
    await manager.connect(websocket)
    try:
        # Hello message
        await websocket.send_json({"type": "hello"})
        while True:
            # 我哋唔期望 client 發訊息，但要 receive 先保持連線活躍
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket)
