"""AI 助手 API — 自然語言 → 自動建 todo / idea / project。"""

from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends

from app.deps import CurrentUser, DbSession, current_user
from app.models.idea import Idea
from app.models.project import Project
from app.models.todo import Todo
from app.services.ai_assistant import ask_assistant

router = APIRouter(dependencies=[Depends(current_user)])


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)


class ChatResponse(BaseModel):
    action: str
    reply: str
    created_id: int | None = None
    created_type: str | None = None


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest, user: CurrentUser, db: DbSession
) -> dict:
    """用戶發一句話，AI 決定要做乜（建 todo / idea / project / 純回覆）。"""
    result = ask_assistant(payload.message)

    created_id = None
    created_type = None

    if result.action == "create_todo":
        todo = Todo(
            user_id=user.id,
            title=result.data.get("title", payload.message)[:500],
            priority=result.data.get("priority", "medium"),
        )
        db.add(todo)
        db.commit()
        db.refresh(todo)
        created_id = todo.id
        created_type = "todo"

    elif result.action == "create_idea":
        idea = Idea(
            user_id=user.id,
            title=result.data.get("title", payload.message)[:300],
            content=result.data.get("content"),
            tags=result.data.get("tags", ""),
        )
        db.add(idea)
        db.commit()
        db.refresh(idea)
        created_id = idea.id
        created_type = "idea"

    elif result.action == "create_project":
        project = Project(
            user_id=user.id,
            name=result.data.get("name", payload.message)[:200],
            description=result.data.get("description"),
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        created_id = project.id
        created_type = "project"

    return {
        "action": result.action,
        "reply": result.reply,
        "created_id": created_id,
        "created_type": created_type,
    }
