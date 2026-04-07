"""
Admin API Routes

This module provides administrative endpoints for managing the BountyFlow platform.
Only users with is_superuser=True can access these endpoints.
"""

from fastapi import APIRouter
from .users import router as users_router
from .projects import router as projects_router
from .audit_logs import router as audit_logs_router
from .dashboard import router as dashboard_router
from .settings import router as settings_router

# Create main admin router
router = APIRouter()

# Include sub-routers with prefixes
router.include_router(dashboard_router, prefix="/dashboard", tags=["admin-dashboard"])
router.include_router(users_router, prefix="/users", tags=["admin-users"])
router.include_router(projects_router, prefix="/projects", tags=["admin-projects"])
router.include_router(audit_logs_router, prefix="/audit-logs", tags=["admin-audit"])
router.include_router(settings_router, prefix="/settings", tags=["admin-settings"])

__all__ = ["router"]


