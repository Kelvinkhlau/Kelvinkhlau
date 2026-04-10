"""語音轉文字 — 用 OpenAI Whisper API 做廣東話 / 中文語音輸入。"""

import logging
from io import BytesIO

from app.config import get_settings

logger = logging.getLogger(__name__)


def transcribe_audio(audio_data: bytes, filename: str = "audio.webm") -> str:
    """將音頻 bytes 送去 OpenAI Whisper API，回傳文字。

    支援 webm、mp4、mp3、wav、m4a 格式。
    預設 language="zh" 優化廣東話 / 普通話辨識。
    """
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY not configured — voice input unavailable")

    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)

    buf = BytesIO(audio_data)
    buf.name = filename

    response = client.audio.transcriptions.create(
        model="whisper-1",
        file=buf,
        language="zh",
    )
    text = response.text.strip()
    logger.info("Whisper transcribed %d bytes → %d chars", len(audio_data), len(text))
    return text
