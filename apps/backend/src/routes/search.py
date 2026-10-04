"""
Search across every project the caller can see.

The question this answers is "which engagement was that host in", asked when
there are three hundred of them and the answer is not in anyone's head. It is
not only hosts: the same query runs over findings, discovered credentials and
files, tools, tool output, reports and the attack builders, so a port number, a
CVE, a username or a fragment of scan output all find their way home.

Results are scoped the same way everything else is — projects the caller
created or was added to, everything for a superuser — so search cannot be used
to see around the access rules.
"""
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import String, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..middleware.auth import verify_token
from ..middleware.project_access import visible_project_ids
from ..models.database import get_db
from ..models.models import (
    AttackFlow,
    DiscoveredFile,
    DiscoveredUser,
    KnowledgeNode,
    Project,
    Report,
    Target,
    Tool,
    ToolExecution,
    User,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# What a search can be narrowed to. "all" is the default.
ENTITY_TYPES = [
    "project", "target", "finding", "discovered_user", "discovered_file",
    "tool", "execution", "report", "attack_flow",
]


def _like(value: str) -> str:
    return f"%{value.lower()}%"


def _iso(value) -> Optional[str]:
    return value.isoformat() if isinstance(value, datetime) else None


@router.get("/search")
async def search(
    q: str = Query("", description="Free text. Matched against names, values, "
                                   "descriptions, output and notes."),
    types: Optional[str] = Query(None, description="Comma-separated subset of "
                                                   f"{','.join(ENTITY_TYPES)}"),
    project_id: Optional[int] = Query(None, description="Restrict to one project"),
    severity: Optional[str] = Query(None, description="Finding severity"),
    status: Optional[str] = Query(None, description="Target or finding status"),
    target_type: Optional[str] = Query(None, description="domain, ip, url, ..."),
    assigned_to: Optional[int] = Query(None, description="Targets claimed by this user"),
    created_by: Optional[int] = Query(None, description="Recorded by this user"),
    sensitive_only: bool = Query(False, description="Only files marked sensitive"),
    since: Optional[str] = Query(None, description="ISO date; created on or after"),
    until: Optional[str] = Query(None, description="ISO date; created on or before"),
    limit: int = Query(50, ge=1, le=500, description="Per entity type"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(verify_token),
):
    """One query, every kind of record, only the projects you can see."""
    user_id = current_user.get("user_id")
    username = current_user.get("username")
    if user_id is None and username:
        user_id = (await db.execute(
            select(User.id).where(User.username == username))).scalar_one_or_none()

    is_admin = bool((await db.execute(
        select(User.is_superuser).where(User.id == user_id))).scalar_one_or_none()) \
        if user_id is not None else False

    allowed = await visible_project_ids(user_id, include_all=is_admin)
    if project_id is not None:
        allowed = [pid for pid in allowed if pid == project_id]
    if not allowed:
        return {"query": q, "total": 0, "results": {}, "counts": {}}

    wanted = ([t.strip() for t in types.split(",") if t.strip()]
              if types else list(ENTITY_TYPES))
    unknown = [t for t in wanted if t not in ENTITY_TYPES]
    if unknown:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail=f"Unknown type(s) {unknown}. Use: {', '.join(ENTITY_TYPES)}")

    def parse(value, field):
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            from fastapi import HTTPException
            raise HTTPException(status_code=400,
                                detail=f"{field} is not an ISO date: {value}")

    since_dt, until_dt = parse(since, "since"), parse(until, "until")
    needle = _like(q) if q else None
    results: Dict[str, List[Dict[str, Any]]] = {}

    def window(query, column):
        if since_dt is not None:
            query = query.where(column >= since_dt)
        if until_dt is not None:
            query = query.where(column <= until_dt)
        return query

    # ---------------------------------------------------------------- projects
    if "project" in wanted:
        query = select(Project).where(Project.id.in_(allowed))
        if needle:
            query = query.where(or_(
                func.lower(Project.name).like(needle),
                func.lower(func.coalesce(Project.description, "")).like(needle),
                func.lower(func.coalesce(Project.company_name, "")).like(needle)))
        if status:
            query = query.where(Project.status == status)
        if created_by is not None:
            query = query.where(Project.created_by == created_by)
        query = window(query, Project.created_at).limit(limit)
        results["project"] = [
            {"id": p.id, "project_id": p.id, "name": p.name,
             "description": p.description, "company_name": p.company_name,
             "status": p.status, "created_at": _iso(p.created_at)}
            for p in (await db.execute(query)).scalars().all()
        ]

    project_names = {}
    if allowed:
        project_names = dict((await db.execute(
            select(Project.id, Project.name).where(Project.id.in_(allowed)))).all())

    def named(pid):
        return project_names.get(pid)

    # ----------------------------------------------------------------- targets
    if "target" in wanted:
        query = select(Target).where(Target.project_id.in_(allowed))
        if needle:
            query = query.where(or_(
                func.lower(Target.target_value).like(needle),
                func.lower(func.coalesce(Target.notes, "")).like(needle)))
        if status:
            query = query.where(Target.status == status)
        if target_type:
            query = query.where(Target.target_type == target_type)
        if assigned_to is not None:
            query = query.where(Target.assigned_to == assigned_to)
        query = window(query, Target.created_at).limit(limit)
        results["target"] = [
            {"id": t.id, "project_id": t.project_id, "project_name": named(t.project_id),
             "target_value": t.target_value, "target_type": t.target_type,
             "status": t.status, "priority": t.priority,
             "assigned_to": t.assigned_to, "notes": t.notes,
             "created_at": _iso(t.created_at)}
            for t in (await db.execute(query)).scalars().all()
        ]

    # ---------------------------------------------------------------- findings
    # Findings live in knowledge_nodes with their fields inside node_data, so
    # the text match runs over the serialised JSON.
    if "finding" in wanted:
        query = select(KnowledgeNode).where(
            KnowledgeNode.project_id.in_(allowed),
            KnowledgeNode.node_type == "finding")
        if needle:
            query = query.where(
                func.lower(func.cast(KnowledgeNode.node_data, String)).like(needle))
        if created_by is not None:
            query = query.where(KnowledgeNode.created_by == created_by)
        query = window(query, KnowledgeNode.created_at).limit(limit)
        rows = (await db.execute(query)).scalars().all()
        findings = []
        for node in rows:
            data = node.node_data or {}
            if severity and str(data.get("severity", "")).lower() != severity.lower():
                continue
            if status and str(data.get("status", "")).lower() != status.lower():
                continue
            findings.append({
                "id": node.id, "project_id": node.project_id,
                "project_name": named(node.project_id),
                "target_id": node.target_id,
                "title": data.get("title"), "severity": data.get("severity"),
                "status": data.get("status"), "description": data.get("description"),
                "created_by": node.created_by, "created_at": _iso(node.created_at),
            })
        results["finding"] = findings

    # ------------------------------------------------------ discovered assets
    if "discovered_user" in wanted:
        query = select(DiscoveredUser).where(DiscoveredUser.project_id.in_(allowed))
        if needle:
            query = query.where(or_(
                func.lower(DiscoveredUser.username).like(needle),
                func.lower(func.coalesce(DiscoveredUser.notes, "")).like(needle),
                func.lower(func.coalesce(DiscoveredUser.source, "")).like(needle)))
        query = window(query, DiscoveredUser.created_at).limit(limit)
        results["discovered_user"] = [
            {"id": u.id, "project_id": u.project_id, "project_name": named(u.project_id),
             "target_id": u.target_id, "username": u.username,
             "privilege_level": u.privilege_level, "source": u.source,
             "created_at": _iso(u.created_at)}
            for u in (await db.execute(query)).scalars().all()
        ]

    if "discovered_file" in wanted:
        query = select(DiscoveredFile).where(DiscoveredFile.project_id.in_(allowed))
        if needle:
            query = query.where(or_(
                func.lower(DiscoveredFile.filename).like(needle),
                func.lower(DiscoveredFile.file_path).like(needle),
                func.lower(func.coalesce(DiscoveredFile.notes, "")).like(needle)))
        if sensitive_only:
            query = query.where(func.lower(func.cast(
                DiscoveredFile.is_sensitive, String)).in_(("true", "1")))
        query = window(query, DiscoveredFile.created_at).limit(limit)
        results["discovered_file"] = [
            {"id": f.id, "project_id": f.project_id, "project_name": named(f.project_id),
             "target_id": f.target_id, "filename": f.filename,
             "file_path": f.file_path, "file_type": f.file_type,
             "is_sensitive": f.is_sensitive, "created_at": _iso(f.created_at)}
            for f in (await db.execute(query)).scalars().all()
        ]

    # ------------------------------------------------------- tools and output
    if "tool" in wanted:
        query = select(Tool)
        if needle:
            query = query.where(or_(
                func.lower(Tool.name).like(needle),
                func.lower(func.coalesce(Tool.description, "")).like(needle),
                func.lower(Tool.command_template).like(needle)))
        query = query.limit(limit)
        results["tool"] = [
            {"id": t.id, "name": t.name, "category": t.category,
             "command_template": t.command_template,
             "project_id": t.project_id, "project_name": named(t.project_id)}
            for t in (await db.execute(query)).scalars().all()
            if t.project_id is None or t.project_id in allowed
        ]

    if "execution" in wanted:
        query = select(ToolExecution).where(ToolExecution.project_id.in_(allowed))
        if needle:
            # Output is where a hostname usually turns up first, before anyone
            # has recorded it as a target.
            query = query.where(or_(
                func.lower(ToolExecution.command_executed).like(needle),
                func.lower(func.coalesce(ToolExecution.output, "")).like(needle)))
        if status:
            query = query.where(ToolExecution.execution_status == status)
        if created_by is not None:
            query = query.where(ToolExecution.executed_by == created_by)
        query = window(query, ToolExecution.created_at).limit(limit)
        results["execution"] = [
            {"id": e.id, "project_id": e.project_id, "project_name": named(e.project_id),
             "target_id": e.target_id, "tool_id": e.tool_id,
             "command_executed": e.command_executed,
             "status": e.execution_status, "exit_code": e.exit_code,
             "executed_by": e.executed_by,
             "output_excerpt": _excerpt(e.output, q),
             "created_at": _iso(e.created_at)}
            for e in (await db.execute(query)).scalars().all()
        ]

    # ----------------------------------------------------------------- reports
    if "report" in wanted:
        query = select(Report).where(Report.project_id.in_(allowed))
        if needle:
            query = query.where(or_(
                func.lower(Report.title).like(needle),
                func.lower(func.coalesce(Report.markdown_content, "")).like(needle)))
        if status:
            query = query.where(Report.status == status)
        query = window(query, Report.generated_at).limit(limit)
        results["report"] = [
            {"id": r.id, "project_id": r.project_id, "project_name": named(r.project_id),
             "title": r.title, "report_type": r.report_type, "status": r.status,
             "excerpt": _excerpt(r.markdown_content, q),
             "generated_at": _iso(r.generated_at)}
            for r in (await db.execute(query)).scalars().all()
        ]

    # ------------------------------------------------------------ attack flows
    if "attack_flow" in wanted:
        query = select(AttackFlow).where(AttackFlow.project_id.in_(allowed))
        if needle:
            query = query.where(or_(
                func.lower(AttackFlow.name).like(needle),
                func.lower(func.coalesce(AttackFlow.description, "")).like(needle)))
        if status:
            query = query.where(AttackFlow.status == status)
        query = window(query, AttackFlow.created_at).limit(limit)
        results["attack_flow"] = [
            {"id": a.id, "project_id": a.project_id, "project_name": named(a.project_id),
             "kind": a.kind, "name": a.name, "description": a.description,
             "severity": a.severity, "risk": a.risk,
             "created_at": _iso(a.created_at)}
            for a in (await db.execute(query)).scalars().all()
        ]

    counts = {key: len(rows) for key, rows in results.items()}
    return {
        "query": q,
        "filters": {k: v for k, v in {
            "types": types, "project_id": project_id, "severity": severity,
            "status": status, "target_type": target_type,
            "assigned_to": assigned_to, "created_by": created_by,
            "sensitive_only": sensitive_only or None,
            "since": since, "until": until}.items() if v is not None},
        "searched_projects": len(allowed),
        "counts": counts,
        "total": sum(counts.values()),
        "results": results,
    }


def _excerpt(text: Optional[str], needle: str, width: int = 160) -> Optional[str]:
    """The part of a long body the match was actually in.

    Returning a whole report or a megabyte of nmap output would make the
    response useless; returning nothing would make the hit unexplainable.
    """
    if not text:
        return None
    if not needle:
        return text[:width]
    at = text.lower().find(needle.lower())
    if at < 0:
        return text[:width]
    start = max(0, at - width // 3)
    end = min(len(text), at + width)
    return ("..." if start else "") + text[start:end] + ("..." if end < len(text) else "")


@router.get("/search/suggest")
async def suggest(
    q: str = Query(..., min_length=1),
    limit: int = Query(8, ge=1, le=25),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(verify_token),
):
    """A short list for a search box, cheap enough to run on every keystroke."""
    user_id = current_user.get("user_id")
    username = current_user.get("username")
    if user_id is None and username:
        user_id = (await db.execute(
            select(User.id).where(User.username == username))).scalar_one_or_none()
    is_admin = bool((await db.execute(
        select(User.is_superuser).where(User.id == user_id))).scalar_one_or_none()) \
        if user_id is not None else False
    allowed = await visible_project_ids(user_id, include_all=is_admin)
    if not allowed:
        return {"suggestions": []}

    needle = _like(q)
    out = []

    for project in (await db.execute(
            select(Project).where(Project.id.in_(allowed),
                                  func.lower(Project.name).like(needle))
            .limit(limit))).scalars().all():
        out.append({"type": "project", "id": project.id, "label": project.name,
                    "project_id": project.id, "project_name": project.name})

    for target in (await db.execute(
            select(Target).where(Target.project_id.in_(allowed),
                                 func.lower(Target.target_value).like(needle))
            .limit(limit))).scalars().all():
        out.append({"type": "target", "id": target.id, "label": target.target_value,
                    "project_id": target.project_id})

    return {"suggestions": out[:limit]}
