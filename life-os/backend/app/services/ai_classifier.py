"""Claude API 郵件分類。

用 haiku model 做快速分類（~$0.0001 / 封）。
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path

from anthropic import Anthropic

from app.config import get_settings

logger = logging.getLogger(__name__)

VALID_CATEGORIES = {"important", "normal", "promotional"}


@dataclass
class ClassificationResult:
    category: str
    confidence: float
    reason: str
    model: str


_PROMPT_PATH = Path(__file__).parent.parent / "ai" / "prompts" / "classify_email.md"
_cached_prompt: str | None = None


def _load_prompt() -> str:
    global _cached_prompt
    if _cached_prompt is None:
        _cached_prompt = _PROMPT_PATH.read_text(encoding="utf-8")
    return _cached_prompt


_client: Anthropic | None = None


def _get_client() -> Anthropic:
    global _client
    if _client is None:
        settings = get_settings()
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY not set")
        _client = Anthropic(api_key=settings.anthropic_api_key)
    return _client


def _extract_json(text: str) -> dict:
    """由 Claude response 抽取 JSON object。

    Claude 有時會 wrap 喺 ```json ... ``` block，要 robust 處理。
    """
    # 試直接 parse
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass

    # 試搵 ```json ... ``` block
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        return json.loads(match.group(1))

    # 試搵第一個 { ... }
    match = re.search(r"\{[^{}]*\}", text, re.DOTALL)
    if match:
        return json.loads(match.group(0))

    raise ValueError(f"Cannot extract JSON from response: {text!r}")


def classify_email(
    subject: str,
    sender: str,
    snippet: str,
) -> ClassificationResult:
    """用 Claude haiku 分類一封 email。

    返回 category in {important, normal, promotional}，confidence 0.0-1.0。
    """
    settings = get_settings()
    client = _get_client()
    model = settings.claude_model_fast

    user_content = (
        f"Subject: {subject}\n"
        f"From: {sender}\n\n"
        f"{snippet}"
    )

    try:
        response = client.messages.create(
            model=model,
            max_tokens=300,
            system=_load_prompt(),
            messages=[{"role": "user", "content": user_content}],
        )
    except Exception as e:
        logger.exception("Anthropic API call failed")
        raise RuntimeError(f"Claude API failed: {e}") from e

    # Extract text content
    text_parts: list[str] = []
    for block in response.content:
        if hasattr(block, "text"):
            text_parts.append(block.text)
    raw_text = "".join(text_parts).strip()

    try:
        data = _extract_json(raw_text)
    except (ValueError, json.JSONDecodeError) as e:
        logger.warning("Failed to parse Claude response: %s", raw_text)
        # Fallback：當一般
        return ClassificationResult(
            category="normal",
            confidence=0.3,
            reason=f"Parse failed: {e}",
            model=model,
        )

    category = str(data.get("category", "normal")).lower().strip()
    if category not in VALID_CATEGORIES:
        category = "normal"

    try:
        confidence = float(data.get("confidence", 0.5))
    except (TypeError, ValueError):
        confidence = 0.5
    confidence = max(0.0, min(1.0, confidence))

    reason = str(data.get("reason", ""))[:500]

    return ClassificationResult(
        category=category,
        confidence=confidence,
        reason=reason,
        model=model,
    )
