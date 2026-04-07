"""
API routes for discovered users (users found during penetration testing)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from typing import List, Optional
import logging

from ..models.database import get_db
from ..models.models import DiscoveredUser, Target, Project, KnowledgeNode
from ..schemas.discovered_users import (
    DiscoveredUserCreate,
    DiscoveredUserUpdate,
    DiscoveredUserResponse,
    DiscoveredUserWithTarget
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/discovered-users", response_model=List[DiscoveredUserWithTarget])
async def get_all_discovered_users(
    db: AsyncSession = Depends(get_db)
):
    """
    Get all discovered users across all projects
    Only returns users from projects that still exist
    """
    try:
        # Query all discovered users with their targets and projects
        query = select(DiscoveredUser, Target, Project).outerjoin(
            Target, DiscoveredUser.target_id == Target.id
        ).outerjoin(
            Project, DiscoveredUser.project_id == Project.id
        ).where(
            Project.id.isnot(None)  # Only include users from existing projects
        ).order_by(DiscoveredUser.created_at.desc())

        result = await db.execute(query)
        rows = result.all()

        # Format response
        users_with_target = []
        for discovered_user, target, project in rows:
            user_dict = {
                "id": discovered_user.id,
                "project_id": discovered_user.project_id,
                "target_id": discovered_user.target_id,
                "username": discovered_user.username,
                "full_name": discovered_user.full_name,
                "email": discovered_user.email,
                "password_hash": discovered_user.password_hash,
                "password_plaintext": discovered_user.password_plaintext,
                "domain": discovered_user.domain,
                "privilege_level": discovered_user.privilege_level,
                "account_status": discovered_user.account_status,
                "source": discovered_user.source,
                "additional_info": discovered_user.additional_info,
                "notes": discovered_user.notes,
                "severity": discovered_user.severity,
                "created_at": discovered_user.created_at.isoformat() if discovered_user.created_at else None,
                "updated_at": discovered_user.updated_at.isoformat() if discovered_user.updated_at else None,
                "target_value": target.target_value if target else None,
                "target_type": target.target_type if target else None,
                "project_name": project.name if project else None,
            }
            users_with_target.append(user_dict)

        return users_with_target

    except Exception as e:
        logger.error(f"Error getting all discovered users: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_id}/discovered-users", response_model=List[DiscoveredUserWithTarget])
async def get_discovered_users(
    project_id: int,
    target_id: Optional[int] = Query(None, description="Filter by target ID"),
    username: Optional[str] = Query(None, description="Search by username"),
    domain: Optional[str] = Query(None, description="Filter by domain"),
    privilege_level: Optional[str] = Query(None, description="Filter by privilege level"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all discovered users for a project with optional filters
    """
    try:
        # Build query
        query = select(DiscoveredUser, Target).outerjoin(
            Target, DiscoveredUser.target_id == Target.id
        ).where(DiscoveredUser.project_id == project_id)

        # Apply filters
        if target_id:
            query = query.where(DiscoveredUser.target_id == target_id)
        if username:
            escaped_username = username.replace("%", r"\%").replace("_", r"\_")
            query = query.where(DiscoveredUser.username.ilike(f"%{escaped_username}%", escape="\\"))
        if domain:
            escaped_domain = domain.replace("%", r"\%").replace("_", r"\_")
            query = query.where(DiscoveredUser.domain.ilike(f"%{escaped_domain}%", escape="\\"))
        if privilege_level:
            query = query.where(DiscoveredUser.privilege_level == privilege_level)

        # Execute query
        result = await db.execute(query)
        rows = result.all()

        # Format response
        users_with_target = []
        for discovered_user, target in rows:
            user_dict = {
                "id": discovered_user.id,
                "project_id": discovered_user.project_id,
                "target_id": discovered_user.target_id,
                "username": discovered_user.username,
                "full_name": discovered_user.full_name,
                "email": discovered_user.email,
                "password_hash": discovered_user.password_hash,
                "password_plaintext": discovered_user.password_plaintext,
                "domain": discovered_user.domain,
                "privilege_level": discovered_user.privilege_level,
                "account_status": discovered_user.account_status,
                "source": discovered_user.source,
                "additional_info": discovered_user.additional_info,
                "notes": discovered_user.notes,
                "severity": discovered_user.severity,
                "created_at": discovered_user.created_at.isoformat() if discovered_user.created_at else None,
                "updated_at": discovered_user.updated_at.isoformat() if discovered_user.updated_at else None,
                "target_value": target.target_value if target else None,
                "target_type": target.target_type if target else None,
            }
            users_with_target.append(user_dict)

        return users_with_target

    except Exception as e:
        logger.error(f"Error getting discovered users: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_id}/discovered-users", response_model=DiscoveredUserResponse)
async def create_discovered_user(
    project_id: int,
    user_data: DiscoveredUserCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new discovered user
    """
    try:
        # Verify project exists
        project_query = select(Project).where(Project.id == project_id)
        project_result = await db.execute(project_query)
        project = project_result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Verify target exists if target_id is provided
        if user_data.target_id:
            target_query = select(Target).where(
                and_(Target.id == user_data.target_id, Target.project_id == project_id)
            )
            target_result = await db.execute(target_query)
            target = target_result.scalar_one_or_none()
            
            if not target:
                raise HTTPException(status_code=404, detail="Target not found in this project")

        # Create discovered user
        new_user = DiscoveredUser(**user_data.model_dump())
        db.add(new_user)
        await db.flush()  # Get the ID before creating KnowledgeNode
        
        # Auto-sync to Knowledge Graph
        try:
            from ..services.kg_auto_sync import kg_auto_sync
            await kg_auto_sync.sync_user_created(db, project_id, new_user)
        except Exception as e:
            logger.error(f"Failed to auto-sync user to Knowledge Graph: {e}")
        
        await db.commit()
        await db.refresh(new_user)
        
        logger.info(f"Created DiscoveredUser {new_user.id} and KnowledgeNode for user {new_user.username}")

        return new_user

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error creating discovered user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/discovered-users/{user_id}", response_model=DiscoveredUserWithTarget)
async def get_discovered_user(
    user_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Get a specific discovered user by ID
    """
    try:
        query = select(DiscoveredUser, Target).outerjoin(
            Target, DiscoveredUser.target_id == Target.id
        ).where(DiscoveredUser.id == user_id)
        
        result = await db.execute(query)
        row = result.first()

        if not row:
            raise HTTPException(status_code=404, detail="Discovered user not found")

        discovered_user, target = row

        user_dict = {
            "id": discovered_user.id,
            "project_id": discovered_user.project_id,
            "target_id": discovered_user.target_id,
            "username": discovered_user.username,
            "full_name": discovered_user.full_name,
            "email": discovered_user.email,
            "password_hash": discovered_user.password_hash,
            "password_plaintext": discovered_user.password_plaintext,
            "domain": discovered_user.domain,
            "privilege_level": discovered_user.privilege_level,
            "account_status": discovered_user.account_status,
            "source": discovered_user.source,
            "additional_info": discovered_user.additional_info,
            "notes": discovered_user.notes,
            "severity": discovered_user.severity,
            "created_at": discovered_user.created_at,
            "updated_at": discovered_user.updated_at,
            "target_value": target.target_value if target else None,
            "target_type": target.target_type if target else None,
        }

        return user_dict

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting discovered user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/discovered-users/{user_id}", response_model=DiscoveredUserResponse)
async def update_discovered_user(
    user_id: int,
    user_data: DiscoveredUserUpdate,
    db: AsyncSession = Depends(get_db)
):
    """
    Update a discovered user
    """
    try:
        # Get existing user
        query = select(DiscoveredUser).where(DiscoveredUser.id == user_id)
        result = await db.execute(query)
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(status_code=404, detail="Discovered user not found")

        # Update fields
        update_data = user_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(user, field, value)

        # Save updated_at timestamp
        from datetime import datetime
        user.updated_at = datetime.utcnow()

        # Commit changes to database first
        await db.commit()
        await db.refresh(user)  # Refresh to get latest data

        # Auto-sync to Knowledge Graph AFTER commit and refresh
        try:
            from ..services.kg_auto_sync import kg_auto_sync
            await kg_auto_sync.sync_user_updated(db, user.project_id, user)
            # Commit sync changes
            await db.commit()
        except Exception as e:
            logger.error(f"Failed to auto-sync user update to Knowledge Graph: {e}", exc_info=True)
            # Don't fail the update if sync fails, but log the error

        return user

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating discovered user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/discovered-users/{user_id}")
async def delete_discovered_user(
    user_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Delete a discovered user
    """
    try:
        query = select(DiscoveredUser).where(DiscoveredUser.id == user_id)
        result = await db.execute(query)
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(status_code=404, detail="Discovered user not found")

        # Auto-sync to Knowledge Graph
        try:
            from ..services.kg_auto_sync import kg_auto_sync
            await kg_auto_sync.sync_user_deleted(db, user.project_id, user.id)
        except Exception as e:
            logger.error(f"Failed to auto-sync user deletion from Knowledge Graph: {e}")

        await db.delete(user)
        await db.commit()

        return {"message": "Discovered user deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error deleting discovered user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/discovered-users/search/duplicates", response_model=List[DiscoveredUserWithTarget])
async def find_duplicate_users(
    username: str = Query(..., description="Username to search for"),
    project_id: Optional[int] = Query(None, description="Limit search to specific project"),
    db: AsyncSession = Depends(get_db)
):
    """
    Find duplicate users across different targets (for knowledge graph relationships)
    This helps identify when the same user appears on multiple targets
    """
    try:
        query = select(DiscoveredUser, Target).outerjoin(
            Target, DiscoveredUser.target_id == Target.id
        ).where(DiscoveredUser.username == username)

        if project_id:
            query = query.where(DiscoveredUser.project_id == project_id)

        result = await db.execute(query)
        rows = result.all()

        # Format response
        users_with_target = []
        for discovered_user, target in rows:
            user_dict = {
                "id": discovered_user.id,
                "project_id": discovered_user.project_id,
                "target_id": discovered_user.target_id,
                "username": discovered_user.username,
                "full_name": discovered_user.full_name,
                "email": discovered_user.email,
                "password_hash": discovered_user.password_hash,
                "password_plaintext": discovered_user.password_plaintext,
                "domain": discovered_user.domain,
                "privilege_level": discovered_user.privilege_level,
                "account_status": discovered_user.account_status,
                "source": discovered_user.source,
                "additional_info": discovered_user.additional_info,
                "notes": discovered_user.notes,
                "severity": discovered_user.severity,
                "created_at": discovered_user.created_at.isoformat() if discovered_user.created_at else None,
                "updated_at": discovered_user.updated_at.isoformat() if discovered_user.updated_at else None,
                "target_value": target.target_value if target else None,
                "target_type": target.target_type if target else None,
            }
            users_with_target.append(user_dict)

        return users_with_target

    except Exception as e:
        logger.error(f"Error finding duplicate users: {e}")
        raise HTTPException(status_code=500, detail=str(e))

