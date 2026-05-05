"""Relations API — polymorphic cross-module links。

Endpoints:
  GET    /api/relations?type=<entity_type>&id=<entity_id>
           → 列出 entity 所有相關連結（expanded into RelatedLink）
  POST   /api/relations
           → 建立 link；自動 dedupe（同方向 unique）
  DELETE /api/relations/{relation_id}
           → 刪除 link
  GET    /api/relations/search?q=<query>&types=todo,note
           → 跨模組 search（俾 RelationPicker 用）

所有 endpoint 都：
  1. 要 JWT
  2. 驗證 user_id 擁有 source + target entity
  3. 防止自連（source == target）
"""

from __future__ import annotations

from typing import Callable, Sequence

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, or_, select

from app.deps import CurrentUser, DbSession, current_user
from app.models.calendar_event import CalendarEvent
from app.models.email import Email
from app.models.expense import Expense
from app.models.idea import Idea
from app.models.note import Note
from app.models.project import Project
from app.models.relation import RELATION_ENTITY_TYPES, Relation
from app.models.todo import Todo
from app.schemas.relation import (
    RelatedEntity,
    RelatedLink,
    RelationCreate,
    RelationOut,
)

router = APIRouter(dependencies=[Depends(current_user)])


# ─── Entity resolver — expand (type, id) → RelatedEntity ──────────────────

EntityFetcher = Callable[[object, int, int], RelatedEntity | None]


def _fetch_email(db, user_id: int, entity_id: int) -> RelatedEntity | None:
    obj = db.get(Email, entity_id)
    if obj is None or obj.user_id != user_id:
        return None
    return RelatedEntity(
        type="email",
        id=obj.id,
        title=obj.subject or "(無主題)",
        subtitle=obj.sender,
        href=f"/inbox/detail?id={obj.id}",
    )


def _fetch_todo(db, user_id: int, entity_id: int) -> RelatedEntity | None:
    obj = db.get(Todo, entity_id)
    if obj is None or obj.user_id != user_id:
        return None
    return RelatedEntity(
        type="todo",
        id=obj.id,
        title=obj.title,
        subtitle="已完成" if obj.done else "未完成",
        href="/todos",
    )


def _fetch_note(db, user_id: int, entity_id: int) -> RelatedEntity | None:
    obj = db.get(Note, entity_id)
    if obj is None or obj.user_id != user_id:
        return None
    return RelatedEntity(
        type="note",
        id=obj.id,
        title=obj.title or "(無標題)",
        subtitle=obj.folder or None,
        href=f"/notes/detail?id={obj.id}",
    )


def _fetch_idea(db, user_id: int, entity_id: int) -> RelatedEntity | None:
    obj = db.get(Idea, entity_id)
    if obj is None or obj.user_id != user_id:
        return None
    return RelatedEntity(
        type="idea",
        id=obj.id,
        title=obj.title,
        subtitle=obj.tags or None,
        href="/ideas",
    )


def _fetch_project(db, user_id: int, entity_id: int) -> RelatedEntity | None:
    obj = db.get(Project, entity_id)
    if obj is None or obj.user_id != user_id:
        return None
    return RelatedEntity(
        type="project",
        id=obj.id,
        title=obj.name,
        subtitle=obj.status if hasattr(obj, "status") else None,
        href=f"/projects/detail?id={obj.id}",
    )


def _fetch_event(db, user_id: int, entity_id: int) -> RelatedEntity | None:
    obj = db.get(CalendarEvent, entity_id)
    if obj is None or obj.user_id != user_id:
        return None
    return RelatedEntity(
        type="event",
        id=obj.id,
        title=obj.title or "(無標題)",
        subtitle=obj.start_at.isoformat() if obj.start_at else None,
        href="/calendar",
    )


def _fetch_expense(db, user_id: int, entity_id: int) -> RelatedEntity | None:
    obj = db.get(Expense, entity_id)
    if obj is None or obj.user_id != user_id:
        return None
    return RelatedEntity(
        type="expense",
        id=obj.id,
        title=obj.description or obj.category or "(消費)",
        subtitle=f"${obj.amount:.2f}",
        href="/expenses",
    )


FETCHERS: dict[str, EntityFetcher] = {
    "email": _fetch_email,
    "todo": _fetch_todo,
    "note": _fetch_note,
    "idea": _fetch_idea,
    "project": _fetch_project,
    "event": _fetch_event,
    "expense": _fetch_expense,
}


def _validate_entity(db, user_id: int, entity_type: str, entity_id: int) -> None:
    """確保 entity 存在 + 屬於呢個 user。唔存在 → 404。"""
    if entity_type not in RELATION_ENTITY_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid entity type: {entity_type}. "
            f"Valid: {sorted(RELATION_ENTITY_TYPES)}",
        )
    fetcher = FETCHERS[entity_type]
    if fetcher(db, user_id, entity_id) is None:
        raise HTTPException(
            status_code=404,
            detail=f"{entity_type} #{entity_id} not found",
        )


# ─── Endpoints ──────────────────────────────────────────────────────────────


@router.get("", response_model=list[RelatedLink])
async def list_relations(
    user: CurrentUser,
    db: DbSession,
    type: str = Query(..., description="Entity type"),
    id: int = Query(..., gt=0, description="Entity ID"),
) -> list[RelatedLink]:
    """雙向查詢 — 返回同呢個 entity 相關嘅所有 links（expanded）。

    無論 entity 係 source 定 target 都會查到，方便 UI 顯示「相關」section。
    """
    if type not in RELATION_ENTITY_TYPES:
        raise HTTPException(
            status_code=400, detail=f"Invalid type: {type}"
        )
    _validate_entity(db, user.id, type, id)

    # 查 source == entity OR target == entity
    stmt = (
        select(Relation)
        .where(
            and_(
                Relation.user_id == user.id,
                or_(
                    and_(Relation.source_type == type, Relation.source_id == id),
                    and_(Relation.target_type == type, Relation.target_id == id),
                ),
            )
        )
        .order_by(Relation.created_at.desc())
    )
    relations: Sequence[Relation] = db.execute(stmt).scalars().all()

    links: list[RelatedLink] = []
    for r in relations:
        # "對方" = 唔係自己嗰面
        if r.source_type == type and r.source_id == id:
            other_type, other_id = r.target_type, r.target_id
        else:
            other_type, other_id = r.source_type, r.source_id

        fetcher = FETCHERS.get(other_type)
        if fetcher is None:
            continue
        entity = fetcher(db, user.id, other_id)
        if entity is None:
            # 對方 entity 已刪 — 順手 cascade 清走
            db.delete(r)
            continue

        links.append(
            RelatedLink(
                relation_id=r.id,
                kind=r.kind,
                note=r.note,
                entity=entity,
                created_at=r.created_at,
            )
        )

    # 如果有 skip 過（dangling relations），commit 清理
    db.commit()
    return links


@router.post("", response_model=RelationOut, status_code=201)
async def create_relation(
    payload: RelationCreate, user: CurrentUser, db: DbSession
) -> Relation:
    """建立 link — dedupe：同方向 unique。"""
    # 禁止自連
    if (
        payload.source_type == payload.target_type
        and payload.source_id == payload.target_id
    ):
        raise HTTPException(status_code=400, detail="Cannot link entity to itself")

    _validate_entity(db, user.id, payload.source_type, payload.source_id)
    _validate_entity(db, user.id, payload.target_type, payload.target_id)

    # Dedupe：如果同方向已存在 → 返回現有
    existing_stmt = select(Relation).where(
        Relation.user_id == user.id,
        Relation.source_type == payload.source_type,
        Relation.source_id == payload.source_id,
        Relation.target_type == payload.target_type,
        Relation.target_id == payload.target_id,
    )
    existing = db.execute(existing_stmt).scalar_one_or_none()
    if existing is not None:
        # 如果 kind / note 有變就 update
        changed = False
        if existing.kind != payload.kind:
            existing.kind = payload.kind
            changed = True
        if existing.note != payload.note:
            existing.note = payload.note
            changed = True
        if changed:
            db.commit()
            db.refresh(existing)
        return existing

    relation = Relation(
        user_id=user.id,
        source_type=payload.source_type,
        source_id=payload.source_id,
        target_type=payload.target_type,
        target_id=payload.target_id,
        kind=payload.kind,
        note=payload.note,
    )
    db.add(relation)
    db.commit()
    db.refresh(relation)
    return relation


@router.delete("/{relation_id}", status_code=204)
async def delete_relation(
    relation_id: int, user: CurrentUser, db: DbSession
) -> None:
    relation = db.get(Relation, relation_id)
    if relation is None or relation.user_id != user.id:
        raise HTTPException(status_code=404, detail="Relation not found")
    db.delete(relation)
    db.commit()


# ─── Cross-module search — 俾 RelationPicker 用 ─────────────────────────────


@router.get("/search", response_model=list[RelatedEntity])
async def search_entities(
    user: CurrentUser,
    db: DbSession,
    q: str = Query("", description="搜尋 keyword"),
    types: str = Query(
        "todo,note,idea,project,email,event,expense",
        description="逗號分隔 entity type list",
    ),
    limit: int = Query(10, ge=1, le=50, description="每個 type 最多返幾多"),
) -> list[RelatedEntity]:
    """跨模組搜尋 — 俾 RelationPicker 用嚟揀要 link 邊個 entity。"""
    type_list = [t.strip() for t in types.split(",") if t.strip()]
    invalid = [t for t in type_list if t not in RELATION_ENTITY_TYPES]
    if invalid:
        raise HTTPException(
            status_code=400, detail=f"Invalid types: {invalid}"
        )

    query = (q or "").strip()
    results: list[RelatedEntity] = []

    for entity_type in type_list:
        rows = _search_one_type(db, user.id, entity_type, query, limit)
        results.extend(rows)

    return results


def _search_one_type(
    db, user_id: int, entity_type: str, q: str, limit: int
) -> list[RelatedEntity]:
    """Per-type LIKE search — 細規模數據夠快，唔用 FTS。"""
    like = f"%{q}%" if q else "%"
    rows: list[RelatedEntity] = []

    if entity_type == "todo":
        stmt = (
            select(Todo)
            .where(Todo.user_id == user_id, Todo.title.ilike(like))
            .order_by(Todo.created_at.desc())
            .limit(limit)
        )
        for t in db.execute(stmt).scalars().all():
            rows.append(
                RelatedEntity(
                    type="todo",
                    id=t.id,
                    title=t.title,
                    subtitle="已完成" if t.done else "未完成",
                    href="/todos",
                )
            )

    elif entity_type == "note":
        stmt = (
            select(Note)
            .where(
                Note.user_id == user_id,
                or_(Note.title.ilike(like), Note.content.ilike(like)),
            )
            .order_by(Note.updated_at.desc())
            .limit(limit)
        )
        for n in db.execute(stmt).scalars().all():
            rows.append(
                RelatedEntity(
                    type="note",
                    id=n.id,
                    title=n.title or "(無標題)",
                    subtitle=n.folder or None,
                    href=f"/notes/detail?id={n.id}",
                )
            )

    elif entity_type == "idea":
        stmt = (
            select(Idea)
            .where(Idea.user_id == user_id, Idea.title.ilike(like))
            .order_by(Idea.created_at.desc())
            .limit(limit)
        )
        for i in db.execute(stmt).scalars().all():
            rows.append(
                RelatedEntity(
                    type="idea",
                    id=i.id,
                    title=i.title,
                    subtitle=i.tags or None,
                    href="/ideas",
                )
            )

    elif entity_type == "project":
        stmt = (
            select(Project)
            .where(Project.user_id == user_id, Project.name.ilike(like))
            .order_by(Project.created_at.desc())
            .limit(limit)
        )
        for p in db.execute(stmt).scalars().all():
            rows.append(
                RelatedEntity(
                    type="project",
                    id=p.id,
                    title=p.name,
                    subtitle=getattr(p, "status", None),
                    href=f"/projects/detail?id={p.id}",
                )
            )

    elif entity_type == "email":
        stmt = (
            select(Email)
            .where(
                Email.user_id == user_id,
                or_(Email.subject.ilike(like), Email.sender.ilike(like)),
            )
            .order_by(Email.received_at.desc())
            .limit(limit)
        )
        for e in db.execute(stmt).scalars().all():
            rows.append(
                RelatedEntity(
                    type="email",
                    id=e.id,
                    title=e.subject or "(無主題)",
                    subtitle=e.sender,
                    href=f"/inbox/detail?id={e.id}",
                )
            )

    elif entity_type == "event":
        stmt = (
            select(CalendarEvent)
            .where(CalendarEvent.user_id == user_id, CalendarEvent.title.ilike(like))
            .order_by(CalendarEvent.start_at.desc())
            .limit(limit)
        )
        for ev in db.execute(stmt).scalars().all():
            rows.append(
                RelatedEntity(
                    type="event",
                    id=ev.id,
                    title=ev.title or "(無標題)",
                    subtitle=ev.start_at.isoformat() if ev.start_at else None,
                    href="/calendar",
                )
            )

    elif entity_type == "expense":
        stmt = (
            select(Expense)
            .where(
                Expense.user_id == user_id,
                or_(
                    Expense.description.ilike(like),
                    Expense.category.ilike(like),
                ),
            )
            .order_by(Expense.spent_at.desc())
            .limit(limit)
        )
        for x in db.execute(stmt).scalars().all():
            rows.append(
                RelatedEntity(
                    type="expense",
                    id=x.id,
                    title=x.description or x.category or "(消費)",
                    subtitle=f"${x.amount:.2f}",
                    href="/expenses",
                )
            )

    return rows
