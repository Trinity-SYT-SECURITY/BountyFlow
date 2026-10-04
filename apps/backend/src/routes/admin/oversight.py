"""
What the administrator can see and do that nobody else can.

A superuser is outside the membership model: they are on no project and may
open all of them. These endpoints are the reason that matters — every
engagement on the instance with its team and its progress, every account with
what it is working on, and the ability to put anyone on anything without being
its owner.
"""
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ...middleware.auth import require_admin
from ...models.database import get_db
from ...models.models import (
    ActivityLog,
    AuditLog,
    DiscoveredFile,
    DiscoveredUser,
    KnowledgeNode,
    PROJECT_ROLES,
    Project,
    Report,
    Target,
    Tool,
    ToolExecution,
    User,
    project_users,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _iso(value) -> Optional[str]:
    return value.isoformat() if isinstance(value, datetime) else None


async def _counts(db: AsyncSession, model, column, ids) -> Dict[int, int]:
    if not ids:
        return {}
    rows = await db.execute(
        select(column, func.count(model.id)).where(column.in_(ids)).group_by(column))
    return dict(rows.all())


@router.get("/overview")
async def projects_overview(
    include_empty: bool = Query(True, description="Include projects with nothing in them"),
    owner_id: Optional[int] = Query(None, description="Only projects created by this user"),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Every project on the instance, its team, and how far along it is.

    One request rather than one per project, because the answer to "what is
    everyone working on" should not take thirty round trips.
    """
    query = select(Project)
    if owner_id is not None:
        query = query.where(Project.created_by == owner_id)
    if status:
        query = query.where(Project.status == status)
    projects = (await db.execute(query.order_by(Project.id))).scalars().all()
    ids = [p.id for p in projects]

    targets = await _counts(db, Target, Target.project_id, ids)
    executions = await _counts(db, ToolExecution, ToolExecution.project_id, ids)
    disc_users = await _counts(db, DiscoveredUser, DiscoveredUser.project_id, ids)
    disc_files = await _counts(db, DiscoveredFile, DiscoveredFile.project_id, ids)
    reports = await _counts(db, Report, Report.project_id, ids)

    findings: Dict[int, int] = {}
    if ids:
        findings = dict((await db.execute(
            select(KnowledgeNode.project_id, func.count(KnowledgeNode.id))
            .where(KnowledgeNode.project_id.in_(ids),
                   KnowledgeNode.node_type == "finding")
            .group_by(KnowledgeNode.project_id))).all())

    # Targets nobody has taken: the clearest signal a project has stalled.
    unclaimed: Dict[int, int] = {}
    if ids:
        unclaimed = dict((await db.execute(
            select(Target.project_id, func.count(Target.id))
            .where(Target.project_id.in_(ids), Target.assigned_to.is_(None))
            .group_by(Target.project_id))).all())

    # The whole membership table at once, then grouped in memory.
    members_by_project: Dict[int, List[Dict[str, Any]]] = {}
    if ids:
        rows = (await db.execute(
            select(project_users, User)
            .join(User, User.id == project_users.c.user_id)
            .where(project_users.c.project_id.in_(ids)))).all()
        for row in rows:
            user = row[-1]
            members_by_project.setdefault(row.project_id, []).append({
                "user_id": user.id, "username": user.username,
                "role": row.role or "editor", "assigned_by": row.assigned_by,
                "assigned_at": _iso(row.assigned_at),
            })

    owners = dict((await db.execute(
        select(User.id, User.username).where(
            User.id.in_({p.created_by for p in projects if p.created_by})))).all()) \
        if projects else {}

    last_activity: Dict[int, Any] = {}
    if ids:
        last_activity = dict((await db.execute(
            select(ActivityLog.project_id, func.max(ActivityLog.timestamp))
            .where(ActivityLog.project_id.in_(ids))
            .group_by(ActivityLog.project_id))).all())

    out = []
    for project in projects:
        counts = {
            "targets": targets.get(project.id, 0),
            "findings": findings.get(project.id, 0),
            "tool_executions": executions.get(project.id, 0),
            "discovered_users": disc_users.get(project.id, 0),
            "discovered_files": disc_files.get(project.id, 0),
            "reports": reports.get(project.id, 0),
        }
        if not include_empty and not any(counts.values()):
            continue

        team = members_by_project.get(project.id, [])
        if project.created_by and not any(
                m["user_id"] == project.created_by for m in team):
            team.insert(0, {
                "user_id": project.created_by,
                "username": owners.get(project.created_by),
                "role": "owner", "assigned_by": None,
                "assigned_at": _iso(project.created_at),
            })

        out.append({
            "id": project.id,
            "name": project.name,
            "company_name": project.company_name,
            "status": project.status,
            "created_by": project.created_by,
            "owner": owners.get(project.created_by),
            "created_at": _iso(project.created_at),
            "last_activity": _iso(last_activity.get(project.id)),
            "team_size": len(team),
            "team": team,
            "counts": counts,
            "unclaimed_targets": unclaimed.get(project.id, 0),
        })

    return {
        "projects": out,
        "total": len(out),
        "totals": {
            "projects": len(out),
            "targets": sum(p["counts"]["targets"] for p in out),
            "findings": sum(p["counts"]["findings"] for p in out),
            "tool_executions": sum(p["counts"]["tool_executions"] for p in out),
        },
    }


@router.get("/users/{user_id}/workload")
async def user_workload(
    user_id: int,
    days: int = Query(30, ge=1, le=365, description="Window for the activity counts"),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """One person: every project they are on, their role, and what they have done.

    The view for deciding who has capacity and who is buried.
    """
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    created = (await db.execute(
        select(Project).where(Project.created_by == user_id))).scalars().all()
    member_rows = (await db.execute(
        select(project_users.c.project_id, project_users.c.role,
               project_users.c.assigned_by, project_users.c.assigned_at)
        .where(project_users.c.user_id == user_id))).all()

    roles = {p.id: "owner" for p in created}
    assigned_by = {}
    for pid, role, by, at in member_rows:
        roles.setdefault(pid, role or "editor")
        assigned_by[pid] = {"assigned_by": by, "assigned_at": _iso(at)}

    projects = []
    if roles:
        rows = (await db.execute(
            select(Project).where(Project.id.in_(list(roles))))).scalars().all()
        for project in rows:
            claimed = (await db.execute(
                select(func.count(Target.id)).where(
                    Target.project_id == project.id,
                    Target.assigned_to == user_id))).scalar() or 0
            projects.append({
                "project_id": project.id,
                "name": project.name,
                "status": project.status,
                "role": roles[project.id],
                "is_creator": project.created_by == user_id,
                "assigned_targets": claimed,
                **assigned_by.get(project.id, {}),
            })

    since = datetime.utcnow() - timedelta(days=days)
    recent_executions = (await db.execute(
        select(func.count(ToolExecution.id)).where(
            ToolExecution.executed_by == user_id,
            ToolExecution.created_at >= since))).scalar() or 0
    recent_findings = (await db.execute(
        select(func.count(KnowledgeNode.id)).where(
            KnowledgeNode.created_by == user_id,
            KnowledgeNode.node_type == "finding",
            KnowledgeNode.created_at >= since))).scalar() or 0

    audit = (await db.execute(
        select(AuditLog).where(AuditLog.user_id == user_id)
        .order_by(AuditLog.timestamp.desc()).limit(20))).scalars().all()

    return {
        "user": {
            "id": user.id, "username": user.username, "email": user.email,
            "full_name": user.full_name, "is_active": user.is_active,
            "is_superuser": user.is_superuser,
        },
        "projects": sorted(projects, key=lambda p: p["project_id"]),
        "window_days": days,
        "activity": {
            "tool_executions": recent_executions,
            "findings_recorded": recent_findings,
            "projects_created": len(created),
            "projects_member_of": len(member_rows),
            "targets_claimed": sum(p["assigned_targets"] for p in projects),
        },
        "recent_actions": [
            {"id": a.id, "action": a.action, "resource_type": a.resource_type,
             "resource_id": a.resource_id, "timestamp": _iso(a.timestamp)}
            for a in audit
        ],
    }


class AdminAssign(BaseModel):
    """An administrator putting people on a project they do not own."""
    user_ids: List[int] = Field(default_factory=list)
    usernames: List[str] = Field(default_factory=list)
    role: str = "editor"


@router.get("/projects/{project_id}/members")
async def admin_list_members(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """The team on any project, without being on it."""
    project = (await db.execute(
        select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    rows = (await db.execute(
        select(project_users, User)
        .join(User, User.id == project_users.c.user_id)
        .where(project_users.c.project_id == project_id))).all()

    members = [{
        "user_id": row[-1].id, "username": row[-1].username,
        "full_name": row[-1].full_name, "role": row.role or "editor",
        "assigned_by": row.assigned_by, "assigned_at": _iso(row.assigned_at),
        "is_creator": row[-1].id == project.created_by,
    } for row in rows]

    if project.created_by and not any(m["user_id"] == project.created_by for m in members):
        creator = (await db.execute(
            select(User).where(User.id == project.created_by))).scalar_one_or_none()
        if creator:
            members.insert(0, {
                "user_id": creator.id, "username": creator.username,
                "full_name": creator.full_name, "role": "owner",
                "assigned_by": None, "assigned_at": _iso(project.created_at),
                "is_creator": True,
            })

    return {"project_id": project_id, "project_name": project.name, "members": members}


@router.post("/projects/{project_id}/members")
async def admin_assign(
    project_id: int,
    payload: AdminAssign,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Put one or more people on any project."""
    project = (await db.execute(
        select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if payload.role not in PROJECT_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown role '{payload.role}'. Use: {', '.join(PROJECT_ROLES)}")

    added, skipped, unknown = [], [], []
    for identifier in list(payload.user_ids) + list(payload.usernames):
        query = (select(User).where(User.id == identifier)
                 if isinstance(identifier, int)
                 else select(User).where(User.username == identifier))
        user = (await db.execute(query)).scalar_one_or_none()
        if user is None:
            unknown.append(identifier)
            continue
        if user.id == project.created_by:
            skipped.append(user.username)
            continue
        exists = (await db.execute(
            select(project_users.c.user_id).where(
                project_users.c.project_id == project_id,
                project_users.c.user_id == user.id))).scalar_one_or_none()
        if exists is not None:
            await db.execute(
                update(project_users)
                .where(project_users.c.project_id == project_id,
                       project_users.c.user_id == user.id)
                .values(role=payload.role))
            skipped.append(user.username)
            continue
        await db.execute(insert(project_users).values(
            project_id=project_id, user_id=user.id, role=payload.role,
            assigned_by=admin.id, assigned_at=datetime.utcnow()))
        added.append(user.username)

    db.add(AuditLog(
        user_id=admin.id, project_id=project_id,
        action="project_members_assigned", resource_type="project",
        resource_id=str(project_id),
        details={"added": added, "role": payload.role, "updated": skipped},
        timestamp=datetime.utcnow()))
    await db.commit()

    return {"project_id": project_id, "role": payload.role, "added": added,
            "role_updated": skipped, "unknown": unknown}


@router.delete("/projects/{project_id}/members/{user_id}", status_code=204)
async def admin_remove_member(
    project_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Take someone off any project."""
    project = (await db.execute(
        select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if user_id == project.created_by:
        raise HTTPException(
            status_code=400,
            detail="The creator cannot be removed; transfer ownership first")

    result = await db.execute(delete(project_users).where(
        project_users.c.project_id == project_id,
        project_users.c.user_id == user_id))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Not a member of this project")

    await db.execute(
        update(Target)
        .where(Target.project_id == project_id, Target.assigned_to == user_id)
        .values(assigned_to=None))
    db.add(AuditLog(
        user_id=admin.id, project_id=project_id,
        action="project_member_removed", resource_type="project",
        resource_id=str(project_id), details={"removed_user_id": user_id},
        timestamp=datetime.utcnow()))
    await db.commit()


@router.get("/team-load")
async def team_load(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Every account, how many projects it is on, and how much it has done.

    The one screen for "who is on what", which is what makes it possible to
    hand the next engagement to whoever is free.
    """
    users = (await db.execute(select(User).order_by(User.id))).scalars().all()
    ids = [u.id for u in users]

    created = dict((await db.execute(
        select(Project.created_by, func.count(Project.id))
        .where(Project.created_by.in_(ids)).group_by(Project.created_by))).all()) \
        if ids else {}
    member = dict((await db.execute(
        select(project_users.c.user_id, func.count(project_users.c.project_id))
        .where(project_users.c.user_id.in_(ids))
        .group_by(project_users.c.user_id))).all()) if ids else {}
    claimed = dict((await db.execute(
        select(Target.assigned_to, func.count(Target.id))
        .where(Target.assigned_to.in_(ids)).group_by(Target.assigned_to))).all()) \
        if ids else {}
    executions = dict((await db.execute(
        select(ToolExecution.executed_by, func.count(ToolExecution.id))
        .where(ToolExecution.executed_by.in_(ids))
        .group_by(ToolExecution.executed_by))).all()) if ids else {}
    findings = dict((await db.execute(
        select(KnowledgeNode.created_by, func.count(KnowledgeNode.id))
        .where(KnowledgeNode.created_by.in_(ids),
               KnowledgeNode.node_type == "finding")
        .group_by(KnowledgeNode.created_by))).all()) if ids else {}

    return {
        "users": [
            {
                "user_id": u.id,
                "username": u.username,
                "full_name": u.full_name,
                "is_active": u.is_active,
                "is_superuser": u.is_superuser,
                "projects_created": created.get(u.id, 0),
                "projects_assigned": member.get(u.id, 0),
                "targets_claimed": claimed.get(u.id, 0),
                "tool_executions": executions.get(u.id, 0),
                "findings_recorded": findings.get(u.id, 0),
            }
            for u in users
        ]
    }
