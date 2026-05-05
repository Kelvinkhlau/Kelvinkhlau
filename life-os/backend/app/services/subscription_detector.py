"""AI 訂閱偵測 — 分析 email 判斷係唔係訂閱收費通知。"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path

from app.config import get_settings
from app.utils.retry import retry_call

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent / "ai" / "prompts" / "detect_subscription.md"
_cached_prompt: str | None = None


def _load_prompt() -> str:
    global _cached_prompt
    if _cached_prompt is None:
        _cached_prompt = _PROMPT_PATH.read_text(encoding="utf-8")
    return _cached_prompt


@dataclass
class SubscriptionResult:
    is_subscription: bool
    name: str = ""
    amount: float = 0
    currency: str = "HKD"
    cycle: str = "monthly"


def _parse_result(raw: str) -> SubscriptionResult:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r'\{[^}]*"is_subscription"[^}]*\}', raw)
        if m:
            try:
                data = json.loads(m.group(0))
            except json.JSONDecodeError:
                return SubscriptionResult(is_subscription=False)
        else:
            return SubscriptionResult(is_subscription=False)

    if not data.get("is_subscription"):
        return SubscriptionResult(is_subscription=False)

    return SubscriptionResult(
        is_subscription=True,
        name=data.get("name", ""),
        amount=float(data.get("amount", 0)),
        currency=data.get("currency", "HKD"),
        cycle=data.get("cycle", "monthly"),
    )


def detect_subscription(subject: str, sender: str, body: str) -> SubscriptionResult:
    """分析 email 判斷係唔係訂閱通知。"""
    settings = get_settings()
    user_content = f"Subject: {subject}\nFrom: {sender}\nBody:\n{body[:1500]}"

    def _call_anthropic():
        from app.services.ai_classifier import _get_anthropic_client
        client = _get_anthropic_client()
        resp = client.messages.create(
            model=settings.claude_model_fast,
            max_tokens=200,
            system=_load_prompt(),
            messages=[{"role": "user", "content": user_content}],
        )
        return "".join(b.text for b in resp.content if hasattr(b, "text")).strip()

    def _call_openai():
        from app.services.ai_classifier import _get_openai_client
        client = _get_openai_client()
        resp = client.chat.completions.create(
            model=settings.openai_model_fast,
            max_tokens=200,
            messages=[
                {"role": "system", "content": _load_prompt()},
                {"role": "user", "content": user_content},
            ],
        )
        return (resp.choices[0].message.content or "").strip()

    provider = (settings.ai_provider or "auto").lower()

    try:
        if provider == "anthropic":
            raw = _call_anthropic()
        elif provider == "openai":
            raw = _call_openai()
        else:
            try:
                raw = _call_anthropic()
            except Exception:
                raw = _call_openai()
        return _parse_result(raw)
    except Exception:
        logger.exception("Subscription detection failed")
        return SubscriptionResult(is_subscription=False)
