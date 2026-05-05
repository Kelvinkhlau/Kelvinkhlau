"""AI 月度財務摘要。"""

from __future__ import annotations

import logging
from pathlib import Path

from app.config import get_settings
from app.utils.retry import retry_call

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent / "ai" / "prompts" / "financial_summary.md"
_cached_prompt: str | None = None


def _load_prompt() -> str:
    global _cached_prompt
    if _cached_prompt is None:
        _cached_prompt = _PROMPT_PATH.read_text(encoding="utf-8")
    return _cached_prompt


def generate_financial_summary(data_text: str) -> str:
    """用 AI 生成月度財務摘要。"""
    settings = get_settings()
    user_content = _load_prompt() + "\n\n" + data_text

    def _call_anthropic():
        from app.services.ai_classifier import _get_anthropic_client
        client = _get_anthropic_client()
        resp = client.messages.create(
            model=settings.claude_model_fast,
            max_tokens=500,
            messages=[{"role": "user", "content": user_content}],
        )
        return "".join(b.text for b in resp.content if hasattr(b, "text")).strip()

    def _call_openai():
        from app.services.ai_classifier import _get_openai_client
        client = _get_openai_client()
        resp = client.chat.completions.create(
            model=settings.openai_model_fast,
            max_tokens=500,
            messages=[{"role": "user", "content": user_content}],
        )
        return (resp.choices[0].message.content or "").strip()

    provider = (settings.ai_provider or "auto").lower()

    try:
        if provider == "anthropic":
            return _call_anthropic()
        if provider == "openai":
            return _call_openai()
        try:
            return _call_anthropic()
        except Exception:
            return _call_openai()
    except Exception:
        logger.exception("AI financial summary failed")
        return ""
