"""
One place that decides who may touch a project, and how much.

Every project-scoped endpoint used to resolve the caller and then ignore them:
any account that could log in could read and write every project, on any route.
Fixing that per route means editing about forty handlers spread over nine
routers, and forgetting one leaves the hole open — so the check lives here, as
middleware, and covers a route the moment it exists.

Roles, from `project_users.role`:

    owner   everything, including managing members and deleting the project
    editor  all normal testing work: targets, findings, tools, reports
    viewer  read only — any method that changes something is refused

A superuser overrides all three. The project's creator is always an owner.
Anonymous callers are allowed only while REQUIRE_AUTH is off, which is the rule
the rest of the platform already follows for local development.
"""
import logging
import os
import re
from typing import Optional, Tuple

from fastapi import Request
from fastapi.responses import JSONResponse
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

READ_METHODS = {"GET", "HEAD", "OPTIONS"}

# Managing who is on a project is the owner's job, not an editor's.
OWNER_ONLY = re.compile(r"/api/v1/projects/\d+/members")


def _project_id(path: str) -> Optional[int]:
    for pattern in PROJECT_ID_PATTERNS:
        hit = pattern.search(path)
        if hit:
            return int(hit.group(1))
    return None


async def _caller(request: Request) -> Optional[dict]:
    """The account behind this request, or None when there is no usable credential.

    Accepts both a session token and an API key, so tooling driving the platform
    through the MCP server is subject to exactly the same project rules as a
    browser.
    """
    header = request.headers.get("authorization") or ""
    if not header.lower().startswith("bearer "):
        return None

    from .auth import resolve_credential

    return await resolve_credential(header.split(" ", 1)[1].strip())


def _auth_required() -> bool:
    return os.getenv("REQUIRE_AUTH", "false").strip().lower() in ("1", "true", "yes", "on")


async def project_role(project_id: int, caller: dict) -> Tuple[Optional[str], bool]:
    """This caller's role on this project, and whether the project exists.

    Returns ("owner" | "editor" | "viewer" | "admin" | None, project_exists).
    "admin" is a superuser, who is not a member of anything and may do everything.
    """
    from ..models.database import async_session
    from ..models.models import Project, User, project_users

    async with async_session() as db:
        user_id = caller.get("user_id")
        if user_id is None and caller.get("username"):
            user_id = (await db.execute(
                select(User.id).where(User.username == caller["username"]))
            ).scalar_one_or_none()
        if user_id is None:
            return None, True

        is_admin = (await db.execute(
            select(User.is_superuser).where(User.id == user_id))).scalar_one_or_none()
        if is_admin:
            return "admin", True

        project = (await db.execute(
            select(Project).where(Project.id == project_id))).scalar_one_or_none()
        if project is None:
            # Let the route answer 404 itself rather than leaking, through a
            # 403, that some other account owns this id.
            return None, False
        if project.created_by == user_id:
            return "owner", True

        role = (await db.execute(
            select(project_users.c.role).where(
                project_users.c.project_id == project_id,
                project_users.c.user_id == user_id))).scalar_one_or_none()
        return role, True


async def visible_project_ids(user_id: Optional[int], include_all: bool = False):
    """Project ids this account may see: the ones it created plus the ones it
    was added to. `include_all` is for superusers."""
    from ..models.database import async_session
    from ..models.models import Project, project_users

    async with async_session() as db:
        if include_all or user_id is None:
            rows = await db.execute(select(Project.id))
            return [row[0] for row in rows.all()]

        created = await db.execute(select(Project.id).where(Project.created_by == user_id))
        member = await db.execute(
            select(project_users.c.project_id).where(project_users.c.user_id == user_id))
        return sorted({row[0] for row in created.all()} | {row[0] for row in member.all()})


class ProjectAccessMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if any(path.startswith(p) for p in EXEMPT_PREFIXES):
            return await call_next(request)

        project_id = _project_id(path)
        if project_id is None:
            return await call_next(request)

        caller = await _caller(request)
        if caller is None:
            # No usable credential. Under REQUIRE_AUTH the route's own dependency
            # returns the 401; without it, anonymous access is the documented
            # local-development behaviour.
            return await call_next(request)

        try:
            role, exists = await project_role(project_id, caller)
        except Exception as e:  # a broken check must not take the API down
            logger.warning(f"project access check failed for {path}: {e}")
            return await call_next(request)

        if not exists:
            return await call_next(request)

        if role is None:
            return self._refuse("You do not have access to this project")

        writing = request.method.upper() not in READ_METHODS

        if role == "viewer" and writing:
            return self._refuse(
                "You have view-only access to this project. Ask an owner for "
                "editor access to make changes.")

        if OWNER_ONLY.search(path) and writing and role not in ("owner", "admin"):
            return self._refuse("Only a project owner can manage its members")

        request.state.project_role = role
        return await call_next(request)

    @staticmethod
    def _refuse(detail: str) -> JSONResponse:
        return JSONResponse(status_code=403, content={"detail": detail})
