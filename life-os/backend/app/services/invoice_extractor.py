"""Invoice / 賬單自動提取 — 從 email 內容提取消費記錄。

跟 ai_classifier.py 同樣嘅 dispatcher pattern。
只喺分類為 important 嘅 email 上面跑。
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from app.config import get_settings
from app.utils.retry import retry_call

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent / "ai" / "prompts" / "extract_invoice.md"
_cached_prompt: str | None = None


def _load_prompt() -> str:
    global _cached_prompt
    if _cached_prompt is None:
        _cached_prompt = _PROMPT_PATH.read_text(encoding="utf-8")
    return _cached_prompt


@dataclass
class InvoiceResult:
    has_invoice: bool
    confidence: float
    amount: float | None = None
    currency: str = "HKD"
    category: str = "other"
    merchant: str | None = None
    description: str | None = None
    spent_date: date | None = None
    model: str = ""


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


def _parse_result(raw_text: str, model: str) -> InvoiceResult:
    try:
        data = _extract_json(raw_text)
    except (ValueError, json.JSONDecodeError) as e:
        logger.warning("Failed to parse invoice extraction response: %s", raw_text)
        return InvoiceResult(has_invoice=False, confidence=0.0, model=model)

    has_invoice = bool(data.get("has_invoice", False))
    confidence = max(0.0, min(1.0, float(data.get("confidence", 0.0))))

    if not has_invoice:
        return InvoiceResult(has_invoice=False, confidence=confidence, model=model)

    # Parse amount
    amount = None
    raw_amount = data.get("amount")
    if raw_amount is not None:
        try:
            amount = float(raw_amount)
        except (TypeError, ValueError):
            pass

    # Parse date
    spent_date = None
    raw_date = data.get("spent_date")
    if raw_date:
        try:
            spent_date = date.fromisoformat(str(raw_date))
        except ValueError:
            pass

    return InvoiceResult(
        has_invoice=True,
        confidence=confidence,
        amount=amount,
        currency=str(data.get("currency", "HKD"))[:3].upper(),
        category=str(data.get("category", "other")),
        merchant=data.get("merchant"),
        description=data.get("description"),
        spent_date=spent_date,
        model=model,
    )


# ─── OpenAI provider ─────────────────────────────────────────────────────────

def _extract_openai(user_content: str) -> InvoiceResult:
    from openai import APIConnectionError, APIStatusError, APITimeoutError, RateLimitError
    from app.services.ai_classifier import _get_openai_client

    settings = get_settings()
    client = _get_openai_client()
    model = settings.openai_model_fast

    def _call():
        return client.chat.completions.create(
            model=model,
            max_tokens=400,
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

    response = retry_call(_call, max_attempts=3, should_retry=_is_transient, label="openai.invoice_extract")
    raw = (response.choices[0].message.content or "").strip()
    return _parse_result(raw, model)


# ─── Anthropic provider ──────────────────────────────────────────────────────

def _extract_anthropic(user_content: str) -> InvoiceResult:
    from anthropic import APIConnectionError, APIStatusError, APITimeoutError, RateLimitError
    from app.services.ai_classifier import _get_anthropic_client

    settings = get_settings()
    client = _get_anthropic_client()
    model = settings.claude_model_fast

    def _call():
        return client.messages.create(
            model=model,
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

    response = retry_call(_call, max_attempts=3, should_retry=_is_transient, label="claude.invoice_extract")
    parts = [b.text for b in response.content if hasattr(b, "text")]
    raw = "".join(parts).strip()
    return _parse_result(raw, model)


# ─── Public dispatcher ───────────────────────────────────────────────────────

def extract_invoice(
    subject: str,
    sender: str,
    body: str,
) -> InvoiceResult:
    """從 email 內容提取發票/賬單資料。"""
    settings = get_settings()
    user_content = f"Subject: {subject}\nFrom: {sender}\n\n{body[:2000]}"

    provider = (settings.ai_provider or "auto").lower()

    if provider == "anthropic":
        return _extract_anthropic(user_content)
    if provider == "openai":
        return _extract_openai(user_content)
    if provider == "auto":
        try:
            return _extract_anthropic(user_content)
        except Exception as e:
            logger.warning("Anthropic failed for invoice extraction, falling back to OpenAI: %s", e)
            return _extract_openai(user_content)

    raise RuntimeError(f"Unknown AI_PROVIDER: {settings.ai_provider!r}")
