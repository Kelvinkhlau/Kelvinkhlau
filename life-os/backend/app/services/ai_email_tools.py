"""AI 電郵工具 — 翻譯 + 分析重點。

跟 ai_classifier.py / ai_reply.py 同樣嘅 dispatcher pattern。
兩個功能都用 claude_model_fast (Haiku) 控制成本。
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

_TRANSLATE_PROMPT_PATH = Path(__file__).parent.parent / "ai" / "prompts" / "translate_email.md"
_SUMMARIZE_PROMPT_PATH = Path(__file__).parent.parent / "ai" / "prompts" / "summarize_email.md"
_cached_translate_prompt: str | None = None
_cached_summarize_prompt: str | None = None


def _load_translate_prompt() -> str:
    global _cached_translate_prompt
    if _cached_translate_prompt is None:
        _cached_translate_prompt = _TRANSLATE_PROMPT_PATH.read_text(encoding="utf-8")
    return _cached_translate_prompt


def _load_summarize_prompt() -> str:
    global _cached_summarize_prompt
    if _cached_summarize_prompt is None:
        _cached_summarize_prompt = _SUMMARIZE_PROMPT_PATH.read_text(encoding="utf-8")
    return _cached_summarize_prompt


def _is_transient_openai(exc: BaseException) -> bool:
    from openai import APIConnectionError, APIStatusError, APITimeoutError, RateLimitError

    if isinstance(exc, (APIConnectionError, APITimeoutError, RateLimitError)):
        return True
    if isinstance(exc, APIStatusError):
        return exc.status_code >= 500 or exc.status_code == 429
    return False


def _is_transient_anthropic(exc: BaseException) -> bool:
    from anthropic import APIConnectionError, APIStatusError, APITimeoutError, RateLimitError

    if isinstance(exc, (APIConnectionError, APITimeoutError, RateLimitError)):
        return True
    if isinstance(exc, APIStatusError):
        return exc.status_code >= 500 or exc.status_code == 429
    return False


def _build_user_content(subject: str, sender: str, body: str) -> str:
    return (
        f"Subject: {subject}\n"
        f"From: {sender}\n"
        f"Body:\n{body[:4000]}"
    )


def _extract_json(text: str) -> dict:
    """由 LLM response 抽取 JSON object（robust）。"""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        return json.loads(match.group(1))

    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        return json.loads(match.group(0))

    raise ValueError(f"Cannot extract JSON from response: {text!r}")


# ─── Translation ─────────────────────────────────────────────────────────────


@dataclass
class TranslationResult:
    translation: str
    model: str


def _translate_openai(user_content: str) -> TranslationResult:
    settings = get_settings()
    from app.services.ai_classifier import _get_openai_client

    client = _get_openai_client()
    model = settings.openai_model_fast

    def _call():
        return client.chat.completions.create(
            model=model,
            max_tokens=2000,
            messages=[
                {"role": "system", "content": _load_translate_prompt()},
                {"role": "user", "content": user_content},
            ],
        )

    response = retry_call(
        _call, max_attempts=3, should_retry=_is_transient_openai, label="openai.translate_email",
    )
    raw = (response.choices[0].message.content or "").strip()
    return TranslationResult(translation=raw, model=model)


def _translate_anthropic(user_content: str) -> TranslationResult:
    settings = get_settings()
    from app.services.ai_classifier import _get_anthropic_client

    client = _get_anthropic_client()
    model = settings.claude_model_fast

    def _call():
        return client.messages.create(
            model=model,
            max_tokens=2000,
            system=_load_translate_prompt(),
            messages=[{"role": "user", "content": user_content}],
        )

    response = retry_call(
        _call, max_attempts=3, should_retry=_is_transient_anthropic, label="claude.translate_email",
    )
    parts = [b.text for b in response.content if hasattr(b, "text")]
    raw = "".join(parts).strip()
    return TranslationResult(translation=raw, model=model)


def translate_email(subject: str, sender: str, body: str) -> TranslationResult:
    """翻譯一封 email 做繁體中文。"""
    settings = get_settings()
    user_content = _build_user_content(subject, sender, body)
    provider = (settings.ai_provider or "auto").lower()

    if provider == "anthropic":
        return _translate_anthropic(user_content)
    if provider == "openai":
        return _translate_openai(user_content)
    if provider == "auto":
        try:
            return _translate_anthropic(user_content)
        except Exception as e:
            logger.warning("Anthropic failed, falling back to OpenAI: %s", e)
            return _translate_openai(user_content)

    raise RuntimeError(f"Unknown AI_PROVIDER: {settings.ai_provider!r}")


# ─── Summary ────────────────────────────────────────────────────────────────


@dataclass
class SummaryResult:
    tldr: str
    key_points: list[str]
    action_needed: str | None
    model: str


def _parse_summary(raw_text: str, model: str) -> SummaryResult:
    try:
        data = _extract_json(raw_text)
    except (ValueError, json.JSONDecodeError) as e:
        logger.warning("Failed to parse summary response: %s", raw_text)
        return SummaryResult(
            tldr="（解析失敗）",
            key_points=[f"AI 回應無法解析：{e}"],
            action_needed=None,
            model=model,
        )

    tldr = str(data.get("tldr", "")).strip()[:200]

    raw_points = data.get("key_points") or []
    if not isinstance(raw_points, list):
        raw_points = [str(raw_points)]
    key_points: list[str] = []
    for p in raw_points[:8]:
        text = str(p).strip()
        if text:
            key_points.append(text[:300])

    action = data.get("action_needed")
    if action is not None:
        action_str = str(action).strip()
        if action_str and action_str.lower() not in ("null", "none", ""):
            action_needed: str | None = action_str[:400]
        else:
            action_needed = None
    else:
        action_needed = None

    return SummaryResult(
        tldr=tldr,
        key_points=key_points,
        action_needed=action_needed,
        model=model,
    )


def _summarize_openai(user_content: str) -> SummaryResult:
    settings = get_settings()
    from app.services.ai_classifier import _get_openai_client

    client = _get_openai_client()
    model = settings.openai_model_fast

    def _call():
        return client.chat.completions.create(
            model=model,
            max_tokens=800,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _load_summarize_prompt()},
                {"role": "user", "content": user_content},
            ],
        )

    response = retry_call(
        _call, max_attempts=3, should_retry=_is_transient_openai, label="openai.summarize_email",
    )
    raw = (response.choices[0].message.content or "").strip()
    return _parse_summary(raw, model)


def _summarize_anthropic(user_content: str) -> SummaryResult:
    settings = get_settings()
    from app.services.ai_classifier import _get_anthropic_client

    client = _get_anthropic_client()
    model = settings.claude_model_fast

    def _call():
        return client.messages.create(
            model=model,
            max_tokens=800,
            system=_load_summarize_prompt(),
            messages=[{"role": "user", "content": user_content}],
        )

    response = retry_call(
        _call, max_attempts=3, should_retry=_is_transient_anthropic, label="claude.summarize_email",
    )
    parts = [b.text for b in response.content if hasattr(b, "text")]
    raw = "".join(parts).strip()
    return _parse_summary(raw, model)


def summarize_email(subject: str, sender: str, body: str) -> SummaryResult:
    """分析一封 email 嘅重點。"""
    settings = get_settings()
    user_content = _build_user_content(subject, sender, body)
    provider = (settings.ai_provider or "auto").lower()

    if provider == "anthropic":
        return _summarize_anthropic(user_content)
    if provider == "openai":
        return _summarize_openai(user_content)
    if provider == "auto":
        try:
            return _summarize_anthropic(user_content)
        except Exception as e:
            logger.warning("Anthropic failed, falling back to OpenAI: %s", e)
            return _summarize_openai(user_content)

    raise RuntimeError(f"Unknown AI_PROVIDER: {settings.ai_provider!r}")
