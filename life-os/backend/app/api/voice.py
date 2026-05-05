"""Voice API — 語音轉文字 + 自動分類 endpoint。"""

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, UploadFile

from app.deps import CurrentUser, DbSession, current_user
from app.services.rate_limit import rate_limit
from app.services.voice import transcribe_audio

router = APIRouter(dependencies=[Depends(current_user)])

# 語音 transcription 貴（Whisper）+ 要防 abuse — 每分鐘 10 次、每小時 100 次
_voice_limit = rate_limit("voice", max_per_minute=10, max_per_hour=100)

# 最大音頻大小：10 MB
MAX_SIZE = 10 * 1024 * 1024


@router.post("/transcribe", dependencies=[Depends(_voice_limit)])
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


class SmartTranscribeResponse(BaseModel):
    text: str
    type: str  # todo / idea / note
    title: str
    content: str
    priority: str
    created_id: int | None = None
    created_type: str | None = None


@router.post("/smart-transcribe", response_model=SmartTranscribeResponse, dependencies=[Depends(_voice_limit)])
async def smart_transcribe(
    file: UploadFile, user: CurrentUser, db: DbSession
) -> SmartTranscribeResponse:
    """語音轉文字 + AI 分類 + 自動建立 todo/idea/note。"""
    if not file.content_type or not file.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="只接受音頻檔案")

    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="音頻檔案太大（上限 10MB）")
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="空白音頻")

    # Step 1: Transcribe
    try:
        text = transcribe_audio(data, filename=file.filename or "audio.webm")
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"轉錄失敗：{e}") from e

    if not text.strip():
        raise HTTPException(status_code=400, detail="轉錄結果為空")

    # Step 2: AI classify
    from app.services.voice_classifier import classify_voice_input

    result = classify_voice_input(text)

    # Step 3: Auto-create
    created_id = None
    created_type = result.type

    if result.type == "todo":
        from app.models.todo import Todo
        todo = Todo(
            user_id=user.id,
            title=result.title,
            description=result.content,
            priority=result.priority if result.priority in ("low", "medium", "high") else "medium",
        )
        db.add(todo)
        db.commit()
        db.refresh(todo)
        created_id = todo.id

    elif result.type == "idea":
        from app.models.idea import Idea
        idea = Idea(
            user_id=user.id,
            title=result.title,
            content=result.content,
        )
        db.add(idea)
        db.commit()
        db.refresh(idea)
        created_id = idea.id

    elif result.type == "note":
        from app.models.note import Note
        note = Note(
            user_id=user.id,
            title=result.title,
            content=result.content,
            folder="語音筆記",
        )
        db.add(note)
        db.commit()
        db.refresh(note)
        created_id = note.id

    return SmartTranscribeResponse(
        text=text,
        type=result.type,
        title=result.title,
        content=result.content,
        priority=result.priority,
        created_id=created_id,
        created_type=created_type,
    )
