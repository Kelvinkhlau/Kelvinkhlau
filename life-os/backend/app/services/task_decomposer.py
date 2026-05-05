"""AI 任務拆解 — 將大任務拆成可執行嘅子任務。"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path

from app.config import get_settings
from app.utils.retry import retry_call

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent / "ai" / "prompts" / "decompose_task.md"
_cached_prompt: str | None = None


def _load_prompt() -> str:
    global _cached_prompt
    if _cached_prompt is None:
        _cached_prompt = _PROMPT_PATH.read_text(encoding="utf-8")
    return _cached_prompt


def _parse_subtasks(raw: str) -> list[str]:
    try:
        data = json.loads(raw)
        return [str(s) for s in data.get("subtasks", [])]
    except (json.JSONDecodeError, ValueError):
        pass
    m = re.search(r'\{[^}]*"subtasks"\s*:\s*\[([^\]]*)\][^}]*\}', raw)
    if m:
        try:
            data = json.loads(m.group(0))
            return [str(s) for s in data.get("subtasks", [])]
        except (json.JSONDecodeError, ValueError):
            pass
    return []


def _decompose_openai(user_content: str) -> list[str]:
    from openai import APIConnectionError, APIStatusError, APITimeoutError, RateLimitError
    from app.services.ai_classifier import _get_openai_client

    settings = get_settings()
    client = _get_openai_client()

    def _call():
        return client.chat.completions.create(
            model=settings.openai_model_fast,
            max_tokens=400,
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

    response = retry_call(_call, max_attempts=3, should_retry=_is_transient, label="openai.decompose")
    return _parse_subtasks((response.choices[0].message.content or "").strip())


def _decompose_anthropic(user_content: str) -> list[str]:
    from anthropic import APIConnectionError, APIStatusError, APITimeoutError, RateLimitError
    from app.services.ai_classifier import _get_anthropic_client

    settings = get_settings()
    client = _get_anthropic_client()

    def _call():
        return client.messages.create(
            model=settings.claude_model_fast,
            max_tokens=400,
            system=_load_prompt(),
            messages=[{"role": "user", "content": user_content}],
        )

    def _is_transient(exc: BaseException) -> bool:
        if isinstance(exc, (APIConnectionError, APITimeoutError, RateLimitError)):
            return True
        if isinstance(exc, APIStatusError):
            return exc.status_code >= 500 or exc.status_code == 429
        return False

    response = retry_call(_call, max_attempts=3, should_retry=_is_transient, label="claude.decompose")
    parts = [b.text for b in response.content if hasattr(b, "text")]
    return _parse_subtasks("".join(parts).strip())


def decompose_task(title: str, description: str | None = None) -> list[str]:
    """將任務拆解成子任務。"""
    settings = get_settings()
    user_content = f"任務：{title}"
    if description:
        user_content += f"\n描述：{description}"

    provider = (settings.ai_provider or "auto").lower()

    try:
        if provider == "anthropic":
            return _decompose_anthropic(user_content)
        if provider == "openai":
            return _decompose_openai(user_content)
        try:
            return _decompose_anthropic(user_content)
        except Exception as e:
            logger.warning("Anthropic failed, falling back to OpenAI: %s", e)
            return _decompose_openai(user_content)
    except Exception:
        logger.exception("AI task decomposition failed")
        return []
