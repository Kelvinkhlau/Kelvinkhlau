"""Notebook OCR — 將 page 嘅 canvas PNG 送去 Claude Vision 做 OCR。

用 claude-sonnet-4-6（smart）做，因為識別手寫 + 中英混雜效果較好。
成本：每頁大約 <$0.01（sonnet 4.6 vision pricing）。
"""

from __future__ import annotations

import base64
import logging
import re

from app.config import get_settings
from app.services.ai_classifier import _get_anthropic_client

logger = logging.getLogger(__name__)

_OCR_PROMPT = """你係一個手寫筆記 OCR 助手。畫面入面可能有：
- 打字文字（tldraw text / rich text shapes）
- 手寫字（英文、中文繁體/簡體、廣東話）
- 簡單圖形、箭咀、框框

請抽取所有可讀嘅文字內容，用換行分隔唔同區塊。
- 唔好加解釋、標題、summary
- 如果有 #tag 樣式嘅標記（例如 #meeting、#工作），原樣保留
- 如果冇文字內容，返回空字串

只輸出純文字內容。"""


def _extract_base64_from_data_url(data_url: str) -> tuple[str, str]:
    """由 `data:image/png;base64,AAA...` 抽出 (mime, b64)。"""
    m = re.match(r"^data:(image/[\w+.-]+);base64,(.+)$", data_url, re.DOTALL)
    if not m:
        raise ValueError("Invalid data URL format")
    return m.group(1), m.group(2)


def ocr_page_image(image_data_url: str) -> str:
    """將 canvas PNG (data URL) 送去 Claude Vision，返回 extracted text。"""
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    mime, b64 = _extract_base64_from_data_url(image_data_url)
    # 驗證 base64 合法
    try:
        base64.b64decode(b64, validate=True)
    except Exception as e:
        raise ValueError(f"Invalid base64 image: {e}") from e

    client = _get_anthropic_client()
    model = settings.claude_model_smart

    try:
        response = client.messages.create(
            model=model,
            max_tokens=2000,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": mime,
                                "data": b64,
                            },
                        },
                        {"type": "text", "text": _OCR_PROMPT},
                    ],
                }
            ],
        )
    except Exception as e:
        logger.exception("Claude Vision OCR failed")
        raise RuntimeError(f"OCR failed: {e}") from e

    text_parts: list[str] = []
    for block in response.content:
        if hasattr(block, "text"):
            text_parts.append(block.text)
    return "".join(text_parts).strip()


# ─── Tag extraction ─────────────────────────────────────────────────────────
_TAG_RE = re.compile(r"#([A-Za-z0-9_\u4e00-\u9fff]{1,30})")


def extract_inline_tags(text: str) -> list[str]:
    """由 text_content 抽出 #tag。去重 + 保留出現順序。"""
    seen: dict[str, None] = {}
    for m in _TAG_RE.finditer(text or ""):
        tag = m.group(1)
        if tag not in seen:
            seen[tag] = None
    return list(seen.keys())
