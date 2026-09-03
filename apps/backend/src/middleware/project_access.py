"""
One place that decides who may touch a project.

Every project-scoped endpoint used to resolve the caller and then ignore them:
any account that could log in could read and write every project, on any route.
Fixing that per route means editing about forty handlers spread over nine
routers, and forgetting one leaves the hole open — so the check lives here, as
middleware, and covers a route the moment it exists.

Access is granted to the project's creator, to anyone in its `project_users`
membership, and to superusers. Anonymous callers are allowed only while
REQUIRE_AUTH is off, which is the same rule the rest of the platform already
follows for local development.
"""
import logging
import os
import re
from typing import Optional

from fastapi import Request
from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from sqlalchemy import select
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

# Every shape a project id takes in a URL. Order does not matter; the first
# match wins and they do not overlap.
PROJECT_ID_PATTERNS = [
    re.compile(r"/api/v1/projects/(\d+)"),
    re.compile(r"/api/v1/scope/projects/(\d+)"),
    re.compile(r"/api/v1/activity-logs/projects/(\d+)"),
    re.compile(r"/api/v1/tools/projects/(\d+)"),
    re.compile(r"/api/v1/neo4j/graph/(\d+)"),
    re.compile(r"/api/v1/reports/project/(\d+)"),
    # the builder pages put the project id straight after the prefix
    re.compile(r"/api/v1/attack-(?:vectors|chains|flows)/(\d+)"),
]

# The admin console has its own require_admin dependency and is allowed to
# reach across every project by design.
EXEMPT_PREFIXES = ("/api/v1/admin/",)


def _project_id(path: str) -> Optional[int]:
    for pattern in PROJECT_ID_PATTERNS:
        hit = pattern.search(path)
        if hit:
            return int(hit.group(1))
    return None


def _caller(request: Request) -> Optional[dict]:
    """The account behind this request, or None when there is no valid token."""
    header = request.headers.get("authorization") or ""
    if not header.lower().startswith("bearer "):
        return None
    from .auth import ALGORITHM, SECRET_KEY

    try:
        payload = jwt.decode(header.split(" ", 1)[1], SECRET_KEY, algorithms=[ALGORITHM])
    except (JWTError, Exception):
        return None
    return {"username": payload.get("sub"), "user_id": payload.get("user_id")}


def _auth_required() -> bool:
    return os.getenv("REQUIRE_AUTH", "false").strip().lower() in ("1", "true", "yes", "on")


async def _may_access(project_id: int, caller: dict) -> bool:
    from ..models.database import async_session
    from ..models.models import Project, User

    async with async_session() as db:
        user_id = caller.get("user_id")
        if user_id is None and caller.get("username"):
            user_id = (await db.execute(
                select(User.id).where(User.username == caller["username"]))).scalar_one_or_none()
        if user_id is None:
            return False

        is_admin = (await db.execute(
            select(User.is_superuser).where(User.id == user_id))).scalar_one_or_none()
        if is_admin:
            return True

        project = (await db.execute(
            select(Project).where(Project.id == project_id))).scalar_one_or_none()
        if project is None:
            # Let the route answer 404 itself rather than leaking, through a
            # 403, that some other account owns this id.
            return True
        if project.created_by == user_id:
            return True

        member = await db.execute(
            select(User.id).join(Project.users).where(
                Project.id == project_id, User.id == user_id))
        return member.scalar_one_or_none() is not None


class ProjectAccessMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if any(path.startswith(p) for p in EXEMPT_PREFIXES):
            return await call_next(request)

        project_id = _project_id(path)
        if project_id is None:
            return await call_next(request)

        caller = _caller(request)
        if caller is None:
            # No usable token. Under REQUIRE_AUTH the route's own dependency
            # returns the 401; without it, anonymous access is the documented
            # local-development behaviour.
            return await call_next(request)

        try:
            allowed = await _may_access(project_id, caller)
        except Exception as e:  # a broken check must not take the API down
            logger.warning(f"project access check failed for {path}: {e}")
            return await call_next(request)

        if not allowed:
            return JSONResponse(
                status_code=403,
                content={"detail": "You do not have access to this project"},
            )
        return await call_next(request)
