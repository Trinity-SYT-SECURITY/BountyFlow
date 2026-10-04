from fastapi import APIRouter, Depends

from ..middleware.auth import verify_token
from .projects import router as projects_router
from .tools import router as tools_router
from .auth import router as auth_router
from .scope import router as scope_router
from .neo4j import router as neo4j_router
# Knowledge graph routes are available but not required for basic functionality
# from .knowledge_graph import router as kg_router
from .websocket import router as websocket_router
from .workflows import router as workflows_router
from .ai import router as ai_router
from .discovered_users import router as discovered_users_router
from .files import router as files_router
from .admin import router as admin_router
from .reports import router as reports_router
from .activity_logs import router as activity_logs_router
from .integrations import router as integrations_router
from .attack_flows import build_router as build_attack_router, KINDS as ATTACK_KINDS
from .members import router as members_router
from .search import router as search_router
from .api_keys import router as api_keys_router

api_router = APIRouter()

api_router.include_router(
    auth_router,
    prefix="/auth",
    tags=["authentication"]
)

api_router.include_router(
    projects_router,
    prefix="/projects",
    tags=["projects"]
)

api_router.include_router(
    tools_router,
    prefix="/tools",
    tags=["tools"]
)

api_router.include_router(
    scope_router,
    prefix="/scope",
    tags=["scope"]
)

api_router.include_router(
    neo4j_router,
    prefix="/neo4j",
    tags=["neo4j", "graph-legacy"]
)

# Optional knowledge graph routes (can be enabled if needed)
# api_router.include_router(
#     kg_router,
#     tags=["knowledge-graph", "advanced-kg"]
# )

api_router.include_router(
    websocket_router,
    tags=["websocket", "realtime"]
)

api_router.include_router(
    workflows_router,
    prefix="/workflows",
    tags=["workflows"]
)

# Every other router authenticates; this one declared no dependency at all, so
# an anonymous caller could read the whole conversation history, spend the
# configured model key, and clear the history with a fixed string in the query.
api_router.include_router(
    ai_router,
    prefix="/ai",
    tags=["ai", "artificial-intelligence"],
    dependencies=[Depends(verify_token)]
)

api_router.include_router(
    discovered_users_router,
    tags=["discovered-users", "penetration-testing"]
)

api_router.include_router(
    files_router,
    tags=["discovered-files", "penetration-testing"]
)

api_router.include_router(
    admin_router,
    prefix="/admin",
    tags=["admin", "administration"]
)

api_router.include_router(
    reports_router,
    prefix="/reports",
    tags=["reports", "report-generation"]
)

api_router.include_router(
    activity_logs_router,
    tags=["activity-logs", "activities"]
)

api_router.include_router(
    integrations_router,
    tags=["integrations", "external-tools"]
)

# Membership, assignment and the team view. No prefix: these hang off
# /projects/{id}/... alongside the project's own routes, which is also what
# makes the project-access middleware cover them without a new pattern.
api_router.include_router(
    members_router,
    tags=["collaboration", "members"]
)

# Search spans projects, so it sits at the top level and scopes itself.
api_router.include_router(
    search_router,
    tags=["search"]
)

api_router.include_router(
    api_keys_router,
    prefix="/auth",
    tags=["authentication", "api-keys"]
)

# The three builder pages each call their own prefix; they store the same
# record, so one CRUD router is registered once per kind.
for _prefix, _kind in ATTACK_KINDS.items():
    api_router.include_router(
        build_attack_router(_kind),
        prefix=f"/{_prefix}",
        tags=["attack-flows", _kind]
    )