"""AI 回覆建議 — 用 Haiku/GPT-4o-mini 生成簡短回覆草稿。

跟 ai_classifier.py 同樣嘅 dispatcher pattern。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

from app.config import get_settings
from app.utils.retry import retry_call

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent / "ai" / "prompts" / "suggest_reply.md"
_COMPOSE_PROMPT_PATH = Path(__file__).parent.parent / "ai" / "prompts" / "compose_email.md"
_cached_prompt: str | None = None
_cached_compose_prompt: str | None = None


def _load_prompt() -> str:
    global _cached_prompt
    if _cached_prompt is None:
        _cached_prompt = _PROMPT_PATH.read_text(encoding="utf-8")
    return _cached_prompt


def _load_compose_prompt() -> str:
    global _cached_compose_prompt
    if _cached_compose_prompt is None:
        _cached_compose_prompt = _COMPOSE_PROMPT_PATH.read_text(encoding="utf-8")
    return _cached_compose_prompt


@dataclass
class ReplyDraft:
    draft: str
    model: str


# ─── OpenAI provider ─────────────────────────────────────────────────────────

def _draft_openai(user_content: str) -> ReplyDraft:
    from openai import APIConnectionError, APIStatusError, APITimeoutError, RateLimitError

    settings = get_settings()
    # Reuse classifier's client pattern
    from app.services.ai_classifier import _get_openai_client

    client = _get_openai_client()
    model = settings.openai_model_fast

    def _call():
        return client.chat.completions.create(
            model=model,
            max_tokens=500,
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

    response = retry_call(
        _call,
        max_attempts=3,
        should_retry=_is_transient,
        label="openai.reply_draft",
    )
    raw = (response.choices[0].message.content or "").strip()
    return ReplyDraft(draft=raw, model=model)


# ─── Anthropic provider ──────────────────────────────────────────────────────

def _draft_anthropic(user_content: str) -> ReplyDraft:
    from anthropic import APIConnectionError, APIStatusError, APITimeoutError, RateLimitError

    settings = get_settings()
    from app.services.ai_classifier import _get_anthropic_client

    client = _get_anthropic_client()
    model = settings.claude_model_fast

    def _call():
        return client.messages.create(
            model=model,
            max_tokens=500,
            system=_load_prompt(),
            messages=[{"role": "user", "content": user_content}],
        )

    def _is_transient(exc: BaseException) -> bool:
        if isinstance(exc, (APIConnectionError, APITimeoutError, RateLimitError)):
            return True
        if isinstance(exc, APIStatusError):
            return exc.status_code >= 500 or exc.status_code == 429
        return False

    response = retry_call(
        _call,
        max_attempts=3,
        should_retry=_is_transient,
        label="claude.reply_draft",
    )
    parts = [b.text for b in response.content if hasattr(b, "text")]
    raw = "".join(parts).strip()
    return ReplyDraft(draft=raw, model=model)


# ─── Public dispatcher ───────────────────────────────────────────────────────

def generate_reply_draft(
    subject: str,
    sender: str,
    body: str,
    user_name: str,
    instructions: str | None = None,
) -> ReplyDraft:
    """生成回覆草稿 — 按 AI_PROVIDER 設定選擇 provider。"""
    settings = get_settings()
    user_content = (
        f"用戶名稱：{user_name}\n\n"
        f"原始電郵：\n"
        f"Subject: {subject}\n"
        f"From: {sender}\n"
        f"Body:\n{body[:2000]}"
    )
    if instructions:
        user_content += f"\n\n用戶要求：{instructions}"

    provider = (settings.ai_provider or "auto").lower()

    if provider == "anthropic":
        return _draft_anthropic(user_content)
    if provider == "openai":
        return _draft_openai(user_content)
    if provider == "auto":
        try:
            return _draft_anthropic(user_content)
        except Exception as e:
            logger.warning("Anthropic failed, falling back to OpenAI: %s", e)
            return _draft_openai(user_content)

    raise RuntimeError(f"Unknown AI_PROVIDER: {settings.ai_provider!r}")


# ─── AI Compose (new email) ─────────────────────────────────────────────────

@dataclass
class ComposeDraft:
    to: str
    subject: str
    body: str
    model: str


def _compose_openai(user_content: str) -> ComposeDraft:
    import json as _json
    from openai import APIConnectionError, APIStatusError, APITimeoutError, RateLimitError

    settings = get_settings()
    from app.services.ai_classifier import _get_openai_client

    client = _get_openai_client()
    model = settings.openai_model_smart

    def _call():
        return client.chat.completions.create(
            model=model,
            max_tokens=1000,
            messages=[
                {"role": "system", "content": _load_compose_prompt()},
                {"role": "user", "content": user_content},
            ],
        )

    def _is_transient(exc: BaseException) -> bool:
        if isinstance(exc, (APIConnectionError, APITimeoutError, RateLimitError)):
            return True
        if isinstance(exc, APIStatusError):
            return exc.status_code >= 500 or exc.status_code == 429
        return False

    response = retry_call(
        _call, max_attempts=3, should_retry=_is_transient, label="openai.compose_draft",
    )
    raw = (response.choices[0].message.content or "").strip()
    # 去掉 markdown code block
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        raw = raw.rsplit("```", 1)[0].strip()
    data = _json.loads(raw)
    return ComposeDraft(
        to=data.get("to", ""),
        subject=data.get("subject", ""),
        body=data.get("body", ""),
        model=model,
    )


def _compose_anthropic(user_content: str) -> ComposeDraft:
    import json as _json
    from anthropic import APIConnectionError, APIStatusError, APITimeoutError, RateLimitError

    settings = get_settings()
    from app.services.ai_classifier import _get_anthropic_client

    client = _get_anthropic_client()
    model = settings.claude_model_fast

    def _call():
        return client.messages.create(
            model=model,
            max_tokens=1000,
            system=_load_compose_prompt(),
            messages=[{"role": "user", "content": user_content}],
        )

    def _is_transient(exc: BaseException) -> bool:
        if isinstance(exc, (APIConnectionError, APITimeoutError, RateLimitError)):
            return True
        if isinstance(exc, APIStatusError):
            return exc.status_code >= 500 or exc.status_code == 429
        return False

    response = retry_call(
        _call, max_attempts=3, should_retry=_is_transient, label="claude.compose_draft",
    )
    parts = [b.text for b in response.content if hasattr(b, "text")]
    raw = "".join(parts).strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        raw = raw.rsplit("```", 1)[0].strip()
    data = _json.loads(raw)
    return ComposeDraft(
        to=data.get("to", ""),
        subject=data.get("subject", ""),
        body=data.get("body", ""),
        model=model,
    )


def generate_compose_draft(
    instructions: str,
    user_name: str,
) -> ComposeDraft:
    """AI 撰寫新電郵草稿。"""
    settings = get_settings()
    user_content = f"用戶名稱：{user_name}\n\n用戶指示：{instructions}"

    provider = (settings.ai_provider or "auto").lower()

    if provider == "anthropic":
        return _compose_anthropic(user_content)
    if provider == "openai":
        return _compose_openai(user_content)
    if provider == "auto":
        try:
            return _compose_anthropic(user_content)
        except Exception as e:
            logger.warning("Anthropic failed, falling back to OpenAI: %s", e)
            return _compose_openai(user_content)

    raise RuntimeError(f"Unknown AI_PROVIDER: {settings.ai_provider!r}")
