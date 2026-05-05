"""Project API routes — 單用戶系統，CRUD + todo count aggregation。"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, desc, func, select, update

from app.deps import CurrentUser, DbSession, current_user
from app.models.project import Project, ProjectStatus
from app.models.todo import Todo
from app.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate
from app.services.audit import log_action

VALID_STATUSES = {s.value for s in ProjectStatus}

router = APIRouter(dependencies=[Depends(current_user)])


def _serialize(project: Project, todo_count: int, done_count: int) -> dict:
    """將 Project ORM + counts 合併成 ProjectOut 嘅 dict。"""
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "color": project.color,
        "parent_id": project.parent_id,
        "todo_count": todo_count,
        "done_count": done_count,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
    }


def _count_map(db, user_id: int, project_ids: list[int]) -> dict[int, tuple[int, int]]:
    """一次過 query 每個 project 嘅 (todo_count, done_count)。"""
    if not project_ids:
        return {}
    stmt = (
        select(
            Todo.project_id,
            func.count(Todo.id),
            func.sum(case((Todo.done.is_(True), 1), else_=0)),
        )
        .where(Todo.user_id == user_id, Todo.project_id.in_(project_ids))
        .group_by(Todo.project_id)
    )
    result: dict[int, tuple[int, int]] = {}
    for pid, total, done in db.execute(stmt).all():
        result[pid] = (int(total or 0), int(done or 0))
    return result


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    user: CurrentUser,
    db: DbSession,
    status: str | None = Query(None, description="篩選 status"),
    limit: int = Query(200, le=500),
) -> list[dict]:
    """列出 projects — active 行先，按 updated_at 排序。"""
    stmt = (
        select(Project)
        .where(Project.user_id == user.id)
        .order_by(desc(Project.updated_at))
        .limit(limit)
    )
    if status is not None:
        stmt = stmt.where(Project.status == status)

    projects = list(db.execute(stmt).scalars().all())
    counts = _count_map(db, user.id, [p.id for p in projects])
    return [
        _serialize(p, *counts.get(p.id, (0, 0)))
        for p in projects
    ]


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(
    payload: ProjectCreate, user: CurrentUser, db: DbSession
) -> dict:
    if payload.status not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"status 要係 {sorted(VALID_STATUSES)}",
        )
    if payload.parent_id is not None:
        parent = db.get(Project, payload.parent_id)
        if parent is None or parent.user_id != user.id:
            raise HTTPException(status_code=400, detail="Invalid parent_id")
    project = Project(
        user_id=user.id,
        name=payload.name.strip(),
        description=payload.description,
        status=payload.status,
        color=payload.color,
        parent_id=payload.parent_id,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    log_action(db, action="create", user_id=user.id, resource_type="project", resource_id=project.id, detail=project.name)
    return _serialize(project, 0, 0)


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: int, user: CurrentUser, db: DbSession) -> dict:
    project = db.get(Project, project_id)
    if project is None or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    counts = _count_map(db, user.id, [project.id])
    total, done = counts.get(project.id, (0, 0))
    return _serialize(project, total, done)


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: int,
    payload: ProjectUpdate,
    user: CurrentUser,
    db: DbSession,
) -> dict:
    project = db.get(Project, project_id)
    if project is None or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found")

    if payload.name is not None:
        project.name = payload.name.strip()
    if payload.description is not None:
        project.description = payload.description
    if payload.status is not None:
        if payload.status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        project.status = payload.status
    if payload.color is not None:
        project.color = payload.color
    if "parent_id" in payload.model_fields_set:
        if payload.parent_id is not None:
            parent = db.get(Project, payload.parent_id)
            if parent is None or parent.user_id != user.id:
                raise HTTPException(status_code=400, detail="Invalid parent_id")
        project.parent_id = payload.parent_id

    db.commit()
    db.refresh(project)
    counts = _count_map(db, user.id, [project.id])
    total, done = counts.get(project.id, (0, 0))
    return _serialize(project, total, done)


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: int, user: CurrentUser, db: DbSession
) -> None:
    """刪除 project — 佢下面嘅 todos 會 project_id SET NULL（唔會跟住死）。"""
    project = db.get(Project, project_id)
    if project is None or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    # 先手動 unlink todos（SQLite 預設唔 enforce FK，so explicit 最穩陣）
    db.execute(
        update(Todo)
        .where(Todo.project_id == project.id)
        .values(project_id=None)
    )
    name = project.name
    db.delete(project)
    db.commit()
    log_action(db, action="delete", user_id=user.id, resource_type="project", resource_id=project_id, detail=name)
