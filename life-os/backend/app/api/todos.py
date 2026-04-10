"""Todo API routes — 單用戶系統，簡單 CRUD + toggle done。"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import asc, desc, select

from app.deps import CurrentUser, DbSession, current_user
from app.models.project import Project
from app.models.todo import Todo, TodoPriority
from app.schemas.todo import TodoCreate, TodoOut, TodoUpdate
from app.services.audit import log_action

VALID_PRIORITIES = {p.value for p in TodoPriority}


def _validate_project(db, user_id: int, project_id: int | None) -> None:
    """確保 project_id 屬於呢個 user（或者係 None）。"""
    if project_id is None:
        return
    project = db.get(Project, project_id)
    if project is None or project.user_id != user_id:
        raise HTTPException(status_code=400, detail="Invalid project_id")

# 所有 todos endpoints 都要 JWT auth
router = APIRouter(dependencies=[Depends(current_user)])


@router.get("", response_model=list[TodoOut])
async def list_todos(
    user: CurrentUser,
    db: DbSession,
    done: bool | None = Query(None, description="只要 done=true / done=false"),
    project_id: int | None = Query(None, description="只要特定 project 嘅 todos"),
    limit: int = Query(200, le=500),
) -> list[Todo]:
    """列出 todos。未完成行先，按 due_at 同 created_at 排序。"""
    stmt = (
        select(Todo)
        .where(Todo.user_id == user.id)
        .order_by(
            asc(Todo.done),
            asc(Todo.due_at.is_(None)),  # 有 due_at 嘅先
            asc(Todo.due_at),
            desc(Todo.created_at),
        )
        .limit(limit)
    )
    if done is not None:
        stmt = stmt.where(Todo.done.is_(done))
    if project_id is not None:
        stmt = stmt.where(Todo.project_id == project_id)
    return list(db.execute(stmt).scalars().all())


@router.post("", response_model=TodoOut, status_code=201)
async def create_todo(
    payload: TodoCreate, user: CurrentUser, db: DbSession
) -> Todo:
    """新增 todo。"""
    if payload.priority not in VALID_PRIORITIES:
        raise HTTPException(
            status_code=400,
            detail=f"priority 要係 {sorted(VALID_PRIORITIES)}",
        )
    _validate_project(db, user.id, payload.project_id)
    todo = Todo(
        user_id=user.id,
        title=payload.title.strip(),
        description=payload.description,
        priority=payload.priority,
        due_at=payload.due_at,
        project_id=payload.project_id,
    )
    db.add(todo)
    db.commit()
    db.refresh(todo)
    log_action(db, action="create", user_id=user.id, resource_type="todo", resource_id=todo.id, detail=todo.title)
    return todo


@router.get("/{todo_id}", response_model=TodoOut)
async def get_todo(todo_id: int, user: CurrentUser, db: DbSession) -> Todo:
    todo = db.get(Todo, todo_id)
    if todo is None or todo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Todo not found")
    return todo


@router.patch("/{todo_id}", response_model=TodoOut)
async def update_todo(
    todo_id: int, payload: TodoUpdate, user: CurrentUser, db: DbSession
) -> Todo:
    todo = db.get(Todo, todo_id)
    if todo is None or todo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Todo not found")

    if payload.title is not None:
        todo.title = payload.title.strip()
    if payload.description is not None:
        todo.description = payload.description
    if payload.priority is not None:
        if payload.priority not in VALID_PRIORITIES:
            raise HTTPException(
                status_code=400, detail="Invalid priority"
            )
        todo.priority = payload.priority
    if payload.due_at is not None:
        todo.due_at = payload.due_at
    if payload.done is not None and payload.done != todo.done:
        todo.done = payload.done
        todo.completed_at = datetime.utcnow() if payload.done else None
    # project_id 用 model_fields_set 區分 "未提供" 同 "明確 set 做 null"
    if "project_id" in payload.model_fields_set:
        _validate_project(db, user.id, payload.project_id)
        todo.project_id = payload.project_id

    db.commit()
    db.refresh(todo)
    return todo


@router.delete("/{todo_id}", status_code=204)
async def delete_todo(
    todo_id: int, user: CurrentUser, db: DbSession
) -> None:
    todo = db.get(Todo, todo_id)
    if todo is None or todo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Todo not found")
    title = todo.title
    db.delete(todo)
    db.commit()
    log_action(db, action="delete", user_id=user.id, resource_type="todo", resource_id=todo_id, detail=title)
