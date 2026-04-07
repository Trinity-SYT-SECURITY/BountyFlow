from fastapi import APIRouter
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

api_router.include_router(
    ai_router,
    prefix="/ai",
    tags=["ai", "artificial-intelligence"]
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