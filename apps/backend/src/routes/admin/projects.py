"""
Admin Project Management API

Provides endpoints for viewing and managing all users' projects.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc
from datetime import datetime
from typing import List, Optional
import logging

from ...models.database import get_db
from ...models.models import User, Project, Target, AuditLog
from ...middleware.auth import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)


def require_admin(current_user: User = Depends(get_current_user)):
    """Middleware to require admin privileges"""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )
    return current_user


@router.get("")
async def get_all_projects(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    owner_id: Optional[int] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Get all projects across all users with filtering
    """
    try:
        # Build query
        query = select(Project)
        
        # Apply filters
        if owner_id:
            query = query.where(Project.created_by == owner_id)
        
        if status:
            query = query.where(Project.status == status)
        
        if search:
            query = query.where(Project.name.ilike(f"%{search}%"))
        
        # Apply pagination
        query = query.offset(skip).limit(limit).order_by(desc(Project.created_at))
        
        # Execute query
        result = await db.execute(query)
        projects = result.scalars().all()
        
        # Enrich with additional data
        projects_response = []
        for project in projects:
            # Get owner info
            owner_query = select(User).where(User.id == project.created_by)
            owner_result = await db.execute(owner_query)
            owner = owner_result.scalar_one_or_none()
            
            # Get target count
            target_count_query = select(func.count(Target.id)).where(
                Target.project_id == project.id
            )
            target_count_result = await db.execute(target_count_query)
            target_count = target_count_result.scalar()
            
            projects_response.append({
                "id": project.id,
                "name": project.name,
                "description": project.description,
                "status": project.status,
                "owner": {
                    "id": owner.id if owner else None,
                    "username": owner.username if owner else "Unknown"
                },
                "target_count": target_count,
                "created_at": project.created_at.isoformat(),
                "updated_at": project.updated_at.isoformat()
            })
        
        return {
            "projects": projects_response,
            "total": len(projects_response)
        }
        
    except Exception as e:
        logger.error(f"Error getting projects: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{project_id}/transfer")
async def transfer_project_ownership(
    project_id: int,
    new_owner_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Transfer project ownership to another user
    """
    try:
        # Get project
        project_query = select(Project).where(Project.id == project_id)
        project_result = await db.execute(project_query)
        project = project_result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get new owner
        new_owner_query = select(User).where(User.id == new_owner_id)
        new_owner_result = await db.execute(new_owner_query)
        new_owner = new_owner_result.scalar_one_or_none()
        
        if not new_owner:
            raise HTTPException(status_code=404, detail="New owner user not found")
        
        old_owner_id = project.created_by
        project.created_by = new_owner_id
        
        await db.commit()
        
        # Log admin action
        audit_log = AuditLog(
            user_id=admin.id,
            action="project_ownership_transferred",
            entity_type="project",
            entity_id=project.id,
            details={
                "project_name": project.name,
                "old_owner_id": old_owner_id,
                "new_owner_id": new_owner_id,
                "new_owner_username": new_owner.username
            },
            timestamp=datetime.utcnow()
        )
        db.add(audit_log)
        await db.commit()
        
        return {
            "message": f"Project '{project.name}' transferred to {new_owner.username}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error transferring project: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{project_id}")
async def delete_project_admin(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Delete a project (admin override)
    """
    try:
        # Get project
        project_query = select(Project).where(Project.id == project_id)
        project_result = await db.execute(project_query)
        project = project_result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        project_name = project.name
        project_owner = project.created_by
        
        # Log admin action before deletion
        audit_log = AuditLog(
            user_id=admin.id,
            action="project_deleted_by_admin",
            entity_type="project",
            entity_id=project.id,
            details={
                "project_name": project_name,
                "original_owner_id": project_owner
            },
            timestamp=datetime.utcnow()
        )
        db.add(audit_log)
        await db.commit()
        
        # Delete project (cascade should handle related data)
        await db.delete(project)
        await db.commit()
        
        return {
            "message": f"Project '{project_name}' deleted successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting project: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


