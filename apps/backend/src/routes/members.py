"""
Who is on a project, and what everyone has been doing on it.

The platform had a membership table and no way to put anyone in it: an
engagement belonged to whoever typed it in, and a second tester could not be
given sight of it at all. These endpoints are what "A puts B, C and D on this
project" means, and the team view is how those four avoid repeating each
other's work.
"""
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..middleware.auth import get_current_user_optional, verify_token
from ..middleware.project_access import project_role
from ..models.database import get_db
from ..models.models import (
    ActivityLog,
    DiscoveredFile,
    DiscoveredUser,
    KnowledgeNode,
    PROJECT_ROLES,
    Project,
    Target,
    ToolExecution,
    User,
    project_users,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class MemberAdd(BaseModel):
    user_id: Optional[int] = None
    username: Optional[str] = None
    role: str = Field("editor", description="owner, editor or viewer")


class MemberRole(BaseModel):
    role: str


class BulkAssign(BaseModel):
    """Put several people on a project in one go — the shape of "assign this to
    B, C and D"."""
    user_ids: List[int] = Field(default_factory=list)
    usernames: List[str] = Field(default_factory=list)
    role: str = "editor"


async def _resolve_user(db: AsyncSession, user_id: Optional[int],
                        username: Optional[str]) -> User:
    query = None
    if user_id is not None:
        query = select(User).where(User.id == user_id)
    elif username:
        query = select(User).where(User.username == username)
    if query is None:
        raise HTTPException(status_code=400, detail="Give a user_id or a username")
    user = (await db.execute(query)).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


async def _caller_id(db: AsyncSession, current_user: Optional[dict]) -> Optional[int]:
    if not current_user:
        return None
    user_id = current_user.get("user_id")
    if user_id is None and current_user.get("username"):
        user_id = (await db.execute(
            select(User.id).where(User.username == current_user["username"]))
        ).scalar_one_or_none()
    return user_id


async def _project_or_404(db: AsyncSession, project_id: int) -> Project:
    project = (await db.execute(
        select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _check_role(role: str) -> str:
    if role not in PROJECT_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown role '{role}'. Use one of: {', '.join(PROJECT_ROLES)}")
    return role


async def _members(db: AsyncSession, project: Project) -> List[Dict[str, Any]]:
    rows = (await db.execute(
        select(project_users, User)
        .join(User, User.id == project_users.c.user_id)
        .where(project_users.c.project_id == project.id))).all()

    members = []
    seen = set()
    for row in rows:
        user = row[-1]
        seen.add(user.id)
        members.append({
            "user_id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email,
            "role": row.role or "editor",
            "assigned_by": row.assigned_by,
            "assigned_at": row.assigned_at.isoformat()
            if isinstance(row.assigned_at, datetime) else row.assigned_at,
            "is_creator": user.id == project.created_by,
        })

    # The creator is an owner whether or not a membership row exists yet.
    if project.created_by and project.created_by not in seen:
        creator = (await db.execute(
            select(User).where(User.id == project.created_by))).scalar_one_or_none()
        if creator:
            members.insert(0, {
                "user_id": creator.id,
                "username": creator.username,
                "full_name": creator.full_name,
                "email": creator.email,
                "role": "owner",
                "assigned_by": None,
                "assigned_at": project.created_at.isoformat() if project.created_at else None,
                "is_creator": True,
            })
    return members


@router.get("/projects/{project_id}/members")
async def list_members(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional),
):
    """Everyone on this project and the role each of them has."""
    project = await _project_or_404(db, project_id)
    return {"project_id": project_id, "members": await _members(db, project)}


@router.post("/projects/{project_id}/members", status_code=201)
async def add_member(
    project_id: int,
    payload: MemberAdd,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(verify_token),
):
    """Put one person on this project."""
    project = await _project_or_404(db, project_id)
    role = _check_role(payload.role)
    user = await _resolve_user(db, payload.user_id, payload.username)

    if user.id == project.created_by:
        raise HTTPException(
            status_code=400,
            detail="The project's creator is already its owner")

    existing = (await db.execute(
        select(project_users.c.user_id).where(
            project_users.c.project_id == project_id,
            project_users.c.user_id == user.id))).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Already a member of this project")

    await db.execute(insert(project_users).values(
        project_id=project_id, user_id=user.id, role=role,
        assigned_by=await _caller_id(db, current_user),
        assigned_at=datetime.utcnow()))
    await db.commit()

    return {"project_id": project_id, "user_id": user.id,
            "username": user.username, "role": role}


@router.post("/projects/{project_id}/members/bulk")
async def add_members(
    project_id: int,
    payload: BulkAssign,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(verify_token),
):
    """Put several people on this project at once.

    Assigning the same engagement to three people is one action, not three, and
    it should not half-succeed: anyone already on the project is reported as
    skipped rather than failing the whole request.
    """
    project = await _project_or_404(db, project_id)
    role = _check_role(payload.role)
    assigned_by = await _caller_id(db, current_user)

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
            skipped.append(user.username)
            continue
        await db.execute(insert(project_users).values(
            project_id=project_id, user_id=user.id, role=role,
            assigned_by=assigned_by, assigned_at=datetime.utcnow()))
        added.append(user.username)

    await db.commit()
    return {"project_id": project_id, "role": role, "added": added,
            "already_members": skipped, "unknown": unknown}


@router.put("/projects/{project_id}/members/{user_id}")
async def change_role(
    project_id: int,
    user_id: int,
    payload: MemberRole,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(verify_token),
):
    """Promote or demote someone on this project."""
    project = await _project_or_404(db, project_id)
    role = _check_role(payload.role)

    if user_id == project.created_by:
        raise HTTPException(
            status_code=400,
            detail="The project's creator is always an owner")

    result = await db.execute(
        update(project_users)
        .where(project_users.c.project_id == project_id,
               project_users.c.user_id == user_id)
        .values(role=role))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Not a member of this project")
    await db.commit()
    return {"project_id": project_id, "user_id": user_id, "role": role}


@router.delete("/projects/{project_id}/members/{user_id}", status_code=204)
async def remove_member(
    project_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(verify_token),
):
    """Take someone off this project."""
    project = await _project_or_404(db, project_id)
    if user_id == project.created_by:
        raise HTTPException(
            status_code=400,
            detail="The project's creator cannot be removed from it; "
                   "transfer ownership first")

    result = await db.execute(
        delete(project_users).where(
            project_users.c.project_id == project_id,
            project_users.c.user_id == user_id))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Not a member of this project")

    # Anything they had claimed goes back into the pool rather than staying
    # assigned to someone who can no longer see it.
    await db.execute(
        update(Target)
        .where(Target.project_id == project_id, Target.assigned_to == user_id)
        .values(assigned_to=None))
    await db.commit()


@router.get("/projects/{project_id}/team")
async def team_activity(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional),
):
    """Who is on this project and what each of them has done on it.

    This is the answer to "do not repeat each other's work": every member's
    claimed targets, tool runs and recorded findings in one place, plus what is
    still unclaimed.
    """
    project = await _project_or_404(db, project_id)
    members = await _members(db, project)

    exec_counts = dict((await db.execute(
        select(ToolExecution.executed_by, func.count(ToolExecution.id))
        .where(ToolExecution.project_id == project_id)
        .group_by(ToolExecution.executed_by))).all())

    finding_counts = dict((await db.execute(
        select(KnowledgeNode.created_by, func.count(KnowledgeNode.id))
        .where(KnowledgeNode.project_id == project_id,
               KnowledgeNode.node_type == "finding")
        .group_by(KnowledgeNode.created_by))).all())

    claimed_counts = dict((await db.execute(
        select(Target.assigned_to, func.count(Target.id))
        .where(Target.project_id == project_id, Target.assigned_to.isnot(None))
        .group_by(Target.assigned_to))).all())

    for member in members:
        uid = member["user_id"]
        member["tool_executions"] = exec_counts.get(uid, 0)
        member["findings_recorded"] = finding_counts.get(uid, 0)
        member["targets_claimed"] = claimed_counts.get(uid, 0)

    unclaimed = (await db.execute(
        select(func.count(Target.id)).where(
            Target.project_id == project_id, Target.assigned_to.is_(None)))).scalar() or 0
    total_targets = (await db.execute(
        select(func.count(Target.id)).where(
            Target.project_id == project_id))).scalar() or 0

    recent = (await db.execute(
        select(ActivityLog)
        .where(ActivityLog.project_id == project_id)
        .order_by(ActivityLog.timestamp.desc())
        .limit(20))).scalars().all()

    return {
        "project_id": project_id,
        "project_name": project.name,
        "members": members,
        "targets": {"total": total_targets, "claimed": total_targets - unclaimed,
                    "unclaimed": unclaimed},
        "recent_activity": [
            {
                "id": a.id,
                "timestamp": a.timestamp.isoformat() if a.timestamp else None,
                "tool_name": a.tool_name,
                "command": a.command,
                "summary": a.ai_summary,
            }
            for a in recent
        ],
    }


class Claim(BaseModel):
    # null hands it back to the pool
    assigned_to: Optional[int] = None


@router.put("/projects/{project_id}/targets/{target_id}/assignee")
async def claim_target(
    project_id: int,
    target_id: int,
    payload: Claim,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(verify_token),
):
    """Claim a target, hand it to a teammate, or put it back in the pool."""
    project = await _project_or_404(db, project_id)
    target = (await db.execute(
        select(Target).where(Target.id == target_id,
                             Target.project_id == project_id))).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="Target not found in this project")

    if payload.assigned_to is not None:
        assignee = (await db.execute(
            select(User).where(User.id == payload.assigned_to))).scalar_one_or_none()
        if assignee is None:
            raise HTTPException(status_code=404, detail="User not found")
        role, _ = await project_role(project_id, {"user_id": assignee.id})
        if role is None:
            raise HTTPException(
                status_code=400,
                detail=f"{assignee.username} is not on this project; add them first")

    target.assigned_to = payload.assigned_to
    db.add(target)
    await db.commit()
    await db.refresh(target)
    return {"target_id": target.id, "assigned_to": target.assigned_to}


@router.get("/my/assignments")
async def my_assignments(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(verify_token),
):
    """Every project this account is on, and what is waiting on them in each.

    The landing view for someone who has been assigned work across several
    engagements.
    """
    user_id = await _caller_id(db, current_user)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    created = {row[0] for row in (await db.execute(
        select(Project.id).where(Project.created_by == user_id))).all()}
    member_rows = (await db.execute(
        select(project_users.c.project_id, project_users.c.role)
        .where(project_users.c.user_id == user_id))).all()
    roles = {pid: role or "editor" for pid, role in member_rows}
    for pid in created:
        roles[pid] = "owner"

    if not roles:
        return {"projects": [], "total_assigned_targets": 0}

    projects = (await db.execute(
        select(Project).where(Project.id.in_(list(roles))))).scalars().all()

    out = []
    total = 0
    for project in projects:
        mine = (await db.execute(
            select(Target).where(Target.project_id == project.id,
                                 Target.assigned_to == user_id))).scalars().all()
        total += len(mine)
        out.append({
            "project_id": project.id,
            "project_name": project.name,
            "role": roles[project.id],
            "status": project.status,
            "assigned_targets": [
                {"id": t.id, "target_value": t.target_value, "status": t.status}
                for t in mine
            ],
        })

    return {"projects": sorted(out, key=lambda p: p["project_id"]),
            "total_assigned_targets": total}
