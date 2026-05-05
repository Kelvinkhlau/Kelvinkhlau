"""AI 相關筆記推薦 — 根據筆記內容搵出最相關嘅其他筆記。

跟 ai_classifier.py 同樣嘅 dispatcher pattern。
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from app.config import get_settings
from app.utils.retry import retry_call

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent / "ai" / "prompts" / "related_notes.md"
_cached_prompt: str | None = None


def _load_prompt() -> str:
    global _cached_prompt
    if _cached_prompt is None:
        _cached_prompt = _PROMPT_PATH.read_text(encoding="utf-8")
    return _cached_prompt


def _parse_ids(raw: str) -> list[int]:
    """從 AI 回覆 extract related_ids list。"""
    try:
        # Try direct JSON parse
        data = json.loads(raw)
        return [int(i) for i in data.get("related_ids", [])]
    except (json.JSONDecodeError, ValueError):
        pass
    # Try extracting JSON from markdown code block
    import re
    m = re.search(r"\{[^}]*\"related_ids\"\s*:\s*\[([^\]]*)\][^}]*\}", raw)
    if m:
        try:
            data = json.loads(m.group(0))
            return [int(i) for i in data.get("related_ids", [])]
        except (json.JSONDecodeError, ValueError):
            pass
    return []


# ─── OpenAI provider ─────────────────────────────────────────────────────────

def _recommend_openai(user_content: str) -> list[int]:
    from openai import APIConnectionError, APIStatusError, APITimeoutError, RateLimitError

    settings = get_settings()
    from app.services.ai_classifier import _get_openai_client

    client = _get_openai_client()
    model = settings.openai_model_fast

    def _call():
        return client.chat.completions.create(
            model=model,
            max_tokens=200,
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
        label="openai.related_notes",
    )
    raw = (response.choices[0].message.content or "").strip()
    return _parse_ids(raw)


# ─── Anthropic provider ──────────────────────────────────────────────────────

def _recommend_anthropic(user_content: str) -> list[int]:
    from anthropic import APIConnectionError, APIStatusError, APITimeoutError, RateLimitError

    settings = get_settings()
    from app.services.ai_classifier import _get_anthropic_client

    client = _get_anthropic_client()
    model = settings.claude_model_fast

    def _call():
        return client.messages.create(
            model=model,
            max_tokens=200,
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
        label="claude.related_notes",
    )
    parts = [b.text for b in response.content if hasattr(b, "text")]
    raw = "".join(parts).strip()
    return _parse_ids(raw)


# ─── Public dispatcher ───────────────────────────────────────────────────────

def find_related_notes(
    note_title: str,
    note_content: str,
    note_tags: str,
    note_folder: str,
    candidates: list[dict],
) -> list[int]:
    """搵出同目標筆記最相關嘅筆記 IDs。

    candidates: list of {"id": int, "title": str, "tags": str, "folder": str}
    Returns: list of note IDs (最多 5 個)。
    """
    if not candidates:
        return []

    settings = get_settings()

    # Build compact candidate list
    candidate_lines = []
    for c in candidates:
        parts = [f"id={c['id']}", c["title"]]
        if c.get("folder"):
            parts.append(f"folder={c['folder']}")
        if c.get("tags"):
            parts.append(f"tags={c['tags']}")
        candidate_lines.append(" | ".join(parts))

    user_content = (
        f"目標筆記：\n"
        f"標題：{note_title}\n"
        f"Folder：{note_folder}\n"
        f"Tags：{note_tags}\n"
        f"內容（截取）：{note_content[:500]}\n\n"
        f"其他筆記清單：\n" + "\n".join(candidate_lines)
    )

    provider = (settings.ai_provider or "auto").lower()

    try:
        if provider == "anthropic":
            return _recommend_anthropic(user_content)
        if provider == "openai":
            return _recommend_openai(user_content)
        # auto
        try:
            return _recommend_anthropic(user_content)
        except Exception as e:
            logger.warning("Anthropic failed, falling back to OpenAI: %s", e)
            return _recommend_openai(user_content)
    except Exception:
        logger.exception("AI related notes recommendation failed")
        return []
