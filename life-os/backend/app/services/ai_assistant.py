"""AI 助手 — 自然語言 → 結構化 action。

用 configured AI provider（同 classifier 共用 provider switch）。
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from app.config import get_settings
from app.services.ai_classifier import _extract_json

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent / "ai" / "prompts" / "assistant.md"
_cached_prompt: str | None = None

_WEEKDAY_CHT = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]


def _load_prompt_template() -> str:
    global _cached_prompt
    if _cached_prompt is None:
        _cached_prompt = _PROMPT_PATH.read_text(encoding="utf-8")
    return _cached_prompt


def _render_prompt() -> str:
    """把 `{{now_date}}` / `{{now_weekday}}` / `{{now_time}}` 填入 prompt。"""
    now = datetime.now(ZoneInfo("Asia/Hong_Kong"))
    return (
        _load_prompt_template()
        .replace("{{now_date}}", now.strftime("%Y-%m-%d"))
        .replace("{{now_weekday}}", _WEEKDAY_CHT[now.weekday()])
        .replace("{{now_time}}", now.strftime("%H:%M"))
    )


@dataclass
class AssistantResult:
    action: str  # create_todo / create_idea / create_project / chat
    reply: str
    data: dict  # action-specific fields


def _call_openai(user_message: str) -> str:
    from openai import OpenAI

    settings = get_settings()
    client = OpenAI(api_key=settings.openai_api_key)
    response = client.chat.completions.create(
        model=settings.openai_model_fast,
        max_tokens=800,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _render_prompt()},
            {"role": "user", "content": user_message},
        ],
    )
    return (response.choices[0].message.content or "").strip()


def _call_anthropic(user_message: str) -> str:
    from anthropic import Anthropic

    settings = get_settings()
    client = Anthropic(api_key=settings.anthropic_api_key)
    response = client.messages.create(
        model=settings.claude_model_fast,
        max_tokens=800,
        system=_render_prompt(),
        messages=[{"role": "user", "content": user_message}],
    )
    return "".join(
        block.text for block in response.content if hasattr(block, "text")
    ).strip()


def ask_assistant(user_message: str) -> AssistantResult:
    """用 AI 理解用戶嘅自然語言，返回結構化 action。"""
    settings = get_settings()
    provider = (settings.ai_provider or "auto").lower()

    raw_text = ""
    try:
        if provider == "anthropic":
            raw_text = _call_anthropic(user_message)
        elif provider == "openai":
            raw_text = _call_openai(user_message)
        else:  # auto
            try:
                raw_text = _call_anthropic(user_message)
            except Exception:
                logger.warning("Anthropic failed for assistant, falling back to OpenAI")
                raw_text = _call_openai(user_message)
    except Exception as e:
        logger.exception("AI assistant call failed")
        return AssistantResult(
            action="chat",
            reply=f"AI 暫時用唔到：{e}",
            data={},
        )

    try:
        data = _extract_json(raw_text)
    except (ValueError, json.JSONDecodeError):
        return AssistantResult(
            action="chat",
            reply=raw_text or "唔好意思，我理解唔到",
            data={},
        )

    action = str(data.pop("action", "chat"))
    reply = str(data.pop("reply", ""))

    return AssistantResult(action=action, reply=reply, data=data)
