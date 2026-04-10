"""Idea API routes — CRUD + pin / archive / tag 搜尋。"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select

from app.deps import CurrentUser, DbSession, current_user
from app.models.idea import Idea
from app.schemas.idea import IdeaCreate, IdeaOut, IdeaUpdate

router = APIRouter(dependencies=[Depends(current_user)])


@router.get("", response_model=list[IdeaOut])
async def list_ideas(
    user: CurrentUser,
    db: DbSession,
    archived: bool = Query(False, description="顯示已封存"),
    tag: str | None = Query(None, description="篩選 tag（substring match）"),
    project_id: int | None = Query(None, description="篩選 project"),
    q: str | None = Query(None, description="搜尋 title / content"),
    limit: int = Query(200, le=500),
) -> list[Idea]:
    """列出 ideas — pinned 行先，按 updated_at 排序。"""
    stmt = (
        select(Idea)
        .where(Idea.user_id == user.id, Idea.archived.is_(archived))
        .order_by(desc(Idea.pinned), desc(Idea.updated_at))
        .limit(limit)
    )
    if tag:
        stmt = stmt.where(Idea.tags.contains(tag))
    if project_id is not None:
        stmt = stmt.where(Idea.project_id == project_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Idea.title.ilike(like) | Idea.content.ilike(like))
    return list(db.execute(stmt).scalars().all())


@router.post("", response_model=IdeaOut, status_code=201)
async def create_idea(
    payload: IdeaCreate, user: CurrentUser, db: DbSession
) -> Idea:
    idea = Idea(
        user_id=user.id,
        title=payload.title.strip(),
        content=payload.content,
        tags=payload.tags.strip(),
        project_id=payload.project_id,
    )
    db.add(idea)
    db.commit()
    db.refresh(idea)
    return idea


@router.get("/{idea_id}", response_model=IdeaOut)
async def get_idea(idea_id: int, user: CurrentUser, db: DbSession) -> Idea:
    idea = db.get(Idea, idea_id)
    if idea is None or idea.user_id != user.id:
        raise HTTPException(status_code=404, detail="Idea not found")
    return idea


@router.patch("/{idea_id}", response_model=IdeaOut)
async def update_idea(
    idea_id: int, payload: IdeaUpdate, user: CurrentUser, db: DbSession
) -> Idea:
    idea = db.get(Idea, idea_id)
    if idea is None or idea.user_id != user.id:
        raise HTTPException(status_code=404, detail="Idea not found")

    if payload.title is not None:
        idea.title = payload.title.strip()
    if payload.content is not None:
        idea.content = payload.content
    if payload.tags is not None:
        idea.tags = payload.tags.strip()
    if payload.pinned is not None:
        idea.pinned = payload.pinned
    if payload.archived is not None:
        idea.archived = payload.archived
    if "project_id" in payload.model_fields_set:
        idea.project_id = payload.project_id

    db.commit()
    db.refresh(idea)
    return idea


@router.delete("/{idea_id}", status_code=204)
async def delete_idea(
    idea_id: int, user: CurrentUser, db: DbSession
) -> None:
    idea = db.get(Idea, idea_id)
    if idea is None or idea.user_id != user.id:
        raise HTTPException(status_code=404, detail="Idea not found")
    db.delete(idea)
    db.commit()
