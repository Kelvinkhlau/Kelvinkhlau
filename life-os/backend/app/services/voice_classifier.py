"""Voice input 自動分類 — 將轉錄文字分類為 todo/idea/note。"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path

from app.config import get_settings
from app.utils.retry import retry_call

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent / "ai" / "prompts" / "classify_voice.md"
_cached_prompt: str | None = None


def _load_prompt() -> str:
    global _cached_prompt
    if _cached_prompt is None:
        _cached_prompt = _PROMPT_PATH.read_text(encoding="utf-8")
    return _cached_prompt


@dataclass
class VoiceClassification:
    type: str  # todo / idea / note
    title: str
    content: str
    priority: str = "medium"
    model: str = ""


def _extract_json(text: str) -> dict:
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[^{}]*\}", text, re.DOTALL)
    if match:
        return json.loads(match.group(0))
    raise ValueError(f"Cannot extract JSON: {text!r}")


def _parse_result(raw: str, model: str) -> VoiceClassification:
    try:
        data = _extract_json(raw)
    except (ValueError, json.JSONDecodeError):
        return VoiceClassification(type="note", title="語音筆記", content=raw, model=model)

    vtype = str(data.get("type", "note")).lower()
    if vtype not in ("todo", "idea", "note"):
        vtype = "note"

    return VoiceClassification(
        type=vtype,
        title=str(data.get("title", ""))[:200] or "語音輸入",
        content=str(data.get("content", "")),
        priority=str(data.get("priority", "medium")),
        model=model,
    )


def _classify_anthropic(text: str) -> VoiceClassification:
    from anthropic import APIConnectionError, APIStatusError, APITimeoutError, RateLimitError
    from app.services.ai_classifier import _get_anthropic_client

    settings = get_settings()
    client = _get_anthropic_client()
    model = settings.claude_model_fast

    def _call():
        return client.messages.create(
            model=model, max_tokens=500,
            system=_load_prompt(),
            messages=[{"role": "user", "content": text}],
        )

    def _is_transient(exc: BaseException) -> bool:
        if isinstance(exc, (APIConnectionError, APITimeoutError, RateLimitError)):
            return True
        if isinstance(exc, APIStatusError):
            return exc.status_code >= 500 or exc.status_code == 429
        return False

    response = retry_call(_call, max_attempts=3, should_retry=_is_transient, label="claude.voice_classify")
    parts = [b.text for b in response.content if hasattr(b, "text")]
    return _parse_result("".join(parts).strip(), model)


def _classify_openai(text: str) -> VoiceClassification:
    from openai import APIConnectionError, APIStatusError, APITimeoutError, RateLimitError
    from app.services.ai_classifier import _get_openai_client

    settings = get_settings()
    client = _get_openai_client()
    model = settings.openai_model_fast

    def _call():
        return client.chat.completions.create(
            model=model, max_tokens=500,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _load_prompt()},
                {"role": "user", "content": text},
            ],
        )

    def _is_transient(exc: BaseException) -> bool:
        if isinstance(exc, (APIConnectionError, APITimeoutError, RateLimitError)):
            return True
        if isinstance(exc, APIStatusError):
            return exc.status_code >= 500 or exc.status_code == 429
        return False

    response = retry_call(_call, max_attempts=3, should_retry=_is_transient, label="openai.voice_classify")
    raw = (response.choices[0].message.content or "").strip()
    return _parse_result(raw, model)


def classify_voice_input(text: str) -> VoiceClassification:
    """將語音轉錄文字分類為 todo/idea/note。"""
    settings = get_settings()
    provider = (settings.ai_provider or "auto").lower()

    if provider == "anthropic":
        return _classify_anthropic(text)
    if provider == "openai":
        return _classify_openai(text)
    if provider == "auto":
        try:
            return _classify_anthropic(text)
        except Exception as e:
            logger.warning("Anthropic failed for voice classify, fallback: %s", e)
            return _classify_openai(text)
    raise RuntimeError(f"Unknown AI_PROVIDER: {settings.ai_provider!r}")
