"""Email 分類 — 支援 OpenAI 或 Anthropic Claude。

根據 settings.ai_provider 決定用邊個：
- "openai": gpt-4o-mini（平，JSON mode 保證 valid JSON）
- "anthropic": claude-haiku-4-5
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path

from app.config import get_settings
from app.utils.retry import retry_call

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


# ─── Shared JSON parsing ─────────────────────────────────────────────────────
def _extract_json(text: str) -> dict:
    """由 LLM response 抽取 JSON object（robust）。"""
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass

    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        return json.loads(match.group(1))

    match = re.search(r"\{[^{}]*\}", text, re.DOTALL)
    if match:
        return json.loads(match.group(0))

    raise ValueError(f"Cannot extract JSON from response: {text!r}")


def _parse_result(raw_text: str, model: str) -> ClassificationResult:
    """統一 parse + 驗證邏輯。"""
    try:
        data = _extract_json(raw_text)
    except (ValueError, json.JSONDecodeError) as e:
        logger.warning("Failed to parse AI response: %s", raw_text)
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


# ─── OpenAI provider ─────────────────────────────────────────────────────────
_openai_client = None  # type: ignore[var-annotated]


def _get_openai_client():
    global _openai_client
    if _openai_client is None:
        from openai import OpenAI  # lazy import

        settings = get_settings()
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY not set")
        _openai_client = OpenAI(api_key=settings.openai_api_key)
    return _openai_client


def _classify_openai(user_content: str) -> ClassificationResult:
    from openai import APIConnectionError, APIStatusError, APITimeoutError, RateLimitError

    settings = get_settings()
    client = _get_openai_client()
    model = settings.openai_model_fast

    def _call():
        return client.chat.completions.create(
            model=model,
            max_tokens=300,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _load_prompt()},
                {"role": "user", "content": user_content},
            ],
        )

    def _is_transient(exc: BaseException) -> bool:
        if isinstance(exc, (APIConnectionError, APITimeoutError, RateLimitError)):
            return True
        if isinstance(exc, APIStatusError):
            return exc.status_code >= 500 or exc.status_code == 429
        return False

    try:
        response = retry_call(
            _call,
            max_attempts=3,
            should_retry=_is_transient,
            label="openai.chat.completions.create",
        )
    except Exception as e:
        logger.exception("OpenAI API call failed")
        raise RuntimeError(f"OpenAI API failed: {e}") from e

    raw_text = (response.choices[0].message.content or "").strip()
    return _parse_result(raw_text, model)


# ─── Anthropic provider ──────────────────────────────────────────────────────
_anthropic_client = None  # type: ignore[var-annotated]


def _get_anthropic_client():
    global _anthropic_client
    if _anthropic_client is None:
        from anthropic import Anthropic  # lazy import

        settings = get_settings()
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY not set")
        _anthropic_client = Anthropic(api_key=settings.anthropic_api_key)
    return _anthropic_client


def _classify_anthropic(user_content: str) -> ClassificationResult:
    from anthropic import (
        APIConnectionError,
        APIStatusError,
        APITimeoutError,
        RateLimitError,
    )

    settings = get_settings()
    client = _get_anthropic_client()
    model = settings.claude_model_fast

    def _call():
        return client.messages.create(
            model=model,
            max_tokens=300,
            system=_load_prompt(),
            messages=[{"role": "user", "content": user_content}],
        )

    def _is_transient(exc: BaseException) -> bool:
        if isinstance(exc, (APIConnectionError, APITimeoutError, RateLimitError)):
            return True
        if isinstance(exc, APIStatusError):
            return exc.status_code >= 500 or exc.status_code == 429
        return False

    try:
        response = retry_call(
            _call,
            max_attempts=3,
            should_retry=_is_transient,
            label="claude.messages.create",
        )
    except Exception as e:
        logger.exception("Anthropic API call failed")
        raise RuntimeError(f"Claude API failed: {e}") from e

    text_parts: list[str] = []
    for block in response.content:
        if hasattr(block, "text"):
            text_parts.append(block.text)
    raw_text = "".join(text_parts).strip()
    return _parse_result(raw_text, model)


# ─── Public dispatcher ───────────────────────────────────────────────────────
def classify_email(
    subject: str,
    sender: str,
    snippet: str,
) -> ClassificationResult:
    """用 configured provider 分類一封 email。

    返回 category in {important, normal, promotional}，confidence 0.0-1.0。
    """
    settings = get_settings()
    user_content = f"Subject: {subject}\nFrom: {sender}\n\n{snippet}"

    provider = (settings.ai_provider or "auto").lower()

    if provider == "anthropic":
        return _classify_anthropic(user_content)
    if provider == "openai":
        return _classify_openai(user_content)
    if provider == "auto":
        # Anthropic 行先，失敗 fallback OpenAI
        try:
            return _classify_anthropic(user_content)
        except Exception as e:
            logger.warning("Anthropic failed, falling back to OpenAI: %s", e)
            return _classify_openai(user_content)

    raise RuntimeError(
        f"Unknown AI_PROVIDER: {settings.ai_provider!r} (要係 auto / anthropic / openai)"
    )
