"""Phase D — 由月結表截圖抽出每個戶口嘅最新結餘（Claude Vision）。

只抽 owner + broker + 最新結餘（update balance），唔抽出入金（出入金係交易制，分開處理）。
返回 parsed list，由 caller 對返 broker。
"""

from __future__ import annotations

import base64
import json
import logging
import re

from app.config import get_settings
from app.services.ai_classifier import _get_anthropic_client

logger = logging.getLogger(__name__)

_PROMPT = """呢張係外匯戶口月結表截圖。每一行代表一個戶口，通常有欄位：
持有人(name)、broker(company)、last BALANCE(上月結餘)、update balance(最新結餘)、P/L 等。

請抽出每一行嘅：
- owner：持有人（name 欄，e.g. CANDY / Celia / Simon）
- broker：交易商（company 欄，e.g. EX / FXPRO / ICM）
- closing：**最新結餘**（用 "update balance" 嗰欄嘅數字，唔好用 last BALANCE）

規則：
- 跳過表頭同 total / 合計 行
- closing 係數字（去走逗號），如果該行 update balance 係空 / 0，就用 0
- 只輸出一個 JSON array，唔好加任何解釋或 markdown

格式範例：
[{"owner":"CANDY","broker":"EX","closing":6718.21},{"owner":"Celia","broker":"ICM","closing":2972.14}]"""


def _strip_json(text: str) -> str:
    t = text.strip()
    m = re.search(r"```(?:json)?\s*(.+?)\s*```", t, re.DOTALL)
    if m:
        return m.group(1).strip()
    return t


def extract_balances(image_bytes: bytes, media_type: str) -> list[dict]:
    """截圖 → [{owner, broker, closing}]。"""
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    b64 = base64.b64encode(image_bytes).decode("ascii")
    client = _get_anthropic_client()
    resp = client.messages.create(
        model=settings.claude_model_smart,
        max_tokens=4000,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": media_type, "data": b64},
                    },
                    {"type": "text", "text": _PROMPT},
                ],
            }
        ],
    )
    text = "".join(b.text for b in resp.content if hasattr(b, "text"))
    raw = _strip_json(text)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error("forex OCR: bad JSON: %s", raw[:500])
        raise ValueError(f"AI 回覆唔係有效 JSON：{e}") from e
    if not isinstance(data, list):
        raise ValueError("AI 回覆唔係 list")

    out: list[dict] = []
    for r in data:
        if not isinstance(r, dict) or not r.get("broker"):
            continue
        try:
            closing = float(str(r.get("closing", 0)).replace(",", "") or 0)
        except ValueError:
            closing = 0.0
        out.append({
            "owner": (str(r["owner"]).strip() if r.get("owner") else None),
            "broker": str(r["broker"]).strip(),
            "closing": closing,
        })
    return out
