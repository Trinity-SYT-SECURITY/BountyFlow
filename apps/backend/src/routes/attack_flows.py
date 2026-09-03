"""
Attack vectors, chains and flows.

The three builder pages — /vectors, /attack-chain-builder, /attack-flow-builder
— have always called /api/v1/attack-vectors/{project_id},
/attack-chains/{project_id} and /attack-flows/{project_id}. None of the three
existed, so every page fell back to an empty canvas and anything built on it
was gone on reload.

All three store the same record, so one table backs all three and `kind` tells
them apart. Each prefix below is the same CRUD over its own kind.
"""
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..middleware.auth import get_current_user_optional
from ..models.database import get_db
from ..models.models import AttackFlow, Project, User

logger = logging.getLogger(__name__)

KINDS = {"attack-vectors": "vector", "attack-chains": "chain", "attack-flows": "flow"}


class AttackFlowBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    severity: int = Field(5, ge=1, le=10)
    plausibility: int = Field(5, ge=1, le=10)
    risk: int = Field(5, ge=1, le=10)
    status: str = "active"
    # The vector and chain builders send arrays of nodes and connections; the
    # flow builder sends the two halves of a flowchart, which are objects keyed
    # by id. Both are stored as-is.
    nodes: Any = Field(default_factory=list)
    connections: Any = Field(default_factory=list)


class AttackFlowCreate(AttackFlowBase):
    project_id: int


class AttackFlowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[int] = Field(None, ge=1, le=10)
    plausibility: Optional[int] = Field(None, ge=1, le=10)
    risk: Optional[int] = Field(None, ge=1, le=10)
    status: Optional[str] = None
    nodes: Optional[Any] = None
    connections: Optional[Any] = None


def _serialise(row: AttackFlow) -> Dict[str, Any]:
    return {
        "id": row.id,
        "project_id": row.project_id,
        "kind": row.kind,
        "name": row.name,
        "description": row.description or "",
        "severity": row.severity,
        "plausibility": row.plausibility,
        "risk": row.risk,
        "status": row.status,
        "nodes": row.nodes if row.nodes is not None else [],
        "connections": row.connections if row.connections is not None else [],
        "created": row.created_at.isoformat() if row.created_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


async def _caller_id(db: AsyncSession, current_user: Optional[dict]) -> Optional[int]:
    if not current_user:
        return None
    user_id = current_user.get("user_id")
    if user_id is None and current_user.get("username"):
        user_id = (await db.execute(
            select(User.id).where(User.username == current_user["username"]))
        ).scalar_one_or_none()
    return user_id


def build_router(kind: str) -> APIRouter:
    """One CRUD router for one kind. Registered three times under three prefixes."""
    router = APIRouter()

    @router.get("/{project_id}")
    async def list_for_project(
        project_id: int,
        db: AsyncSession = Depends(get_db),
        current_user: dict = Depends(get_current_user_optional),
    ):
        """Everything of this kind in a project.

        The builder pages call this with the project id directly in the path,
        which is the shape they have always used.
        """
        result = await db.execute(
            select(AttackFlow)
            .where(AttackFlow.project_id == project_id, AttackFlow.kind == kind)
            .order_by(AttackFlow.id)
        )
        return [_serialise(row) for row in result.scalars().all()]

    @router.post("", status_code=201)
    @router.post("/", status_code=201, include_in_schema=False)
    async def create(
        payload: AttackFlowCreate,
        db: AsyncSession = Depends(get_db),
        current_user: dict = Depends(get_current_user_optional),
    ):
        project = (await db.execute(
            select(Project).where(Project.id == payload.project_id))).scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        row = AttackFlow(
            project_id=payload.project_id,
            kind=kind,
            name=payload.name,
            description=payload.description,
            severity=payload.severity,
            plausibility=payload.plausibility,
            risk=payload.risk,
            status=payload.status,
            nodes=payload.nodes,
            connections=payload.connections,
            created_by=await _caller_id(db, current_user),
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return _serialise(row)

    @router.get("/item/{flow_id}")
    async def read(
        flow_id: int,
        db: AsyncSession = Depends(get_db),
        current_user: dict = Depends(get_current_user_optional),
    ):
        row = await _load(db, flow_id, kind)
        return _serialise(row)

    @router.put("/item/{flow_id}")
    async def update(
        flow_id: int,
        payload: AttackFlowUpdate,
        db: AsyncSession = Depends(get_db),
        current_user: dict = Depends(get_current_user_optional),
    ):
        row = await _load(db, flow_id, kind)
        for field, value in payload.dict(exclude_unset=True).items():
            if value is not None:
                setattr(row, field, value)
        row.updated_at = datetime.utcnow()
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return _serialise(row)

    @router.delete("/item/{flow_id}", status_code=204)
    async def delete(
        flow_id: int,
        db: AsyncSession = Depends(get_db),
        current_user: dict = Depends(get_current_user_optional),
    ):
        row = await _load(db, flow_id, kind)
        await db.delete(row)
        await db.commit()

    return router


async def _load(db: AsyncSession, flow_id: int, kind: str) -> AttackFlow:
    row = (await db.execute(
        select(AttackFlow).where(AttackFlow.id == flow_id, AttackFlow.kind == kind))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Attack {kind} not found")
    return row
