"""Voice API — 語音轉文字 endpoint。"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile

from app.deps import CurrentUser, current_user
from app.services.voice import transcribe_audio

router = APIRouter(dependencies=[Depends(current_user)])

# 最大音頻大小：10 MB
MAX_SIZE = 10 * 1024 * 1024


@router.post("/transcribe")
async def transcribe(file: UploadFile, user: CurrentUser) -> dict[str, str]:
    """上傳音頻檔，回傳轉錄文字。

    支援 webm、mp4、mp3、wav、m4a。
    """
    if not file.content_type or not file.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="只接受音頻檔案")

    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="音頻檔案太大（上限 10MB）")
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="空白音頻")

    try:
        text = transcribe_audio(data, filename=file.filename or "audio.webm")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"轉錄失敗：{e}") from e

    return {"text": text}
