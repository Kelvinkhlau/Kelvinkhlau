"""Claude API 郵件分類 — MVP Week 3 實作。"""

from __future__ import annotations

from dataclasses import dataclass

from app.config import get_settings


@dataclass
class ClassificationResult:
    category: str  # important / normal / promotional
    confidence: float  # 0.0 - 1.0
    reason: str
    model: str


def classify_email(subject: str, sender: str, snippet: str) -> ClassificationResult:
    """用 Claude haiku 分類一封 email。

    返回三層信心：
    - >0.85：自動歸類
    - 0.5-0.85：顯示「建議」
    - <0.5：keep unclassified
    """
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    # TODO: MVP Week 3
    # from anthropic import Anthropic
    # client = Anthropic(api_key=settings.anthropic_api_key)
    # response = client.messages.create(
    #     model=settings.claude_model_fast,
    #     max_tokens=200,
    #     system=CLASSIFY_PROMPT,
    #     messages=[{"role": "user", "content": f"Subject: {subject}\nFrom: {sender}\n\n{snippet}"}],
    # )
    raise NotImplementedError("MVP Week 3")
