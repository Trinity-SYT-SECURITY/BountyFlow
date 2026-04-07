"""
Admin User Management API

Provides endpoints for managing all platform users.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr
import logging

from ...models.database import get_db
from ...models.models import User, Project, AuditLog
from ...middleware.auth import get_current_user
from passlib.context import CryptContext

router = APIRouter()
logger = logging.getLogger(__name__)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def require_admin(current_user: User = Depends(get_current_user)):
    """Middleware to require admin privileges"""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )
    return current_user


# Pydantic models
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    is_superuser: bool = False
    is_active: bool = True


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    is_superuser: Optional[bool] = None
    is_active: Optional[bool] = None


class PasswordReset(BaseModel):
    new_password: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: Optional[str]
    is_active: bool
    is_superuser: bool
    created_at: datetime
    project_count: int = 0
    last_activity: Optional[datetime] = None


@router.get("", response_model=List[UserResponse])
async def get_all_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    is_superuser: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Get all users with filtering and pagination
    
    Query Parameters:
    - skip: Number of records to skip (pagination)
    - limit: Maximum number of records to return
    - search: Search by username or email
    - is_active: Filter by active status
    - is_superuser: Filter by admin status
    """
    try:
        # Build query
        query = select(User)
        
        # Apply filters
        if search:
            query = query.where(
                or_(
                    User.username.ilike(f"%{search}%"),
                    User.email.ilike(f"%{search}%")
                )
            )
        
        if is_active is not None:
            query = query.where(User.is_active == is_active)
        
        if is_superuser is not None:
            query = query.where(User.is_superuser == is_superuser)
        
        # Apply pagination
        query = query.offset(skip).limit(limit).order_by(desc(User.created_at))
        
        # Execute query
        result = await db.execute(query)
        users = result.scalars().all()
        
        # Enrich with additional data
        users_response = []
        for user in users:
            # Get project count
            project_count_query = select(func.count(Project.id)).where(
                Project.created_by == user.id
            )
            project_count_result = await db.execute(project_count_query)
            project_count = project_count_result.scalar()
            
            # Get last activity
            last_activity_query = select(AuditLog.timestamp).where(
                AuditLog.user_id == user.id
            ).order_by(desc(AuditLog.timestamp)).limit(1)
            last_activity_result = await db.execute(last_activity_query)
            last_activity = last_activity_result.scalar_one_or_none()
            
            users_response.append(UserResponse(
                id=user.id,
                username=user.username,
                email=user.email,
                full_name=user.full_name,
                is_active=user.is_active,
                is_superuser=user.is_superuser,
                created_at=user.created_at,
                project_count=project_count,
                last_activity=last_activity
            ))
        
        return users_response
        
    except Exception as e:
        logger.error(f"Error getting users: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{user_id}")
async def get_user_details(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Get detailed information about a specific user
    """
    try:
        # Get user
        user_query = select(User).where(User.id == user_id)
        user_result = await db.execute(user_query)
        user = user_result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Get user's projects
        projects_query = select(Project).where(Project.created_by == user_id)
        projects_result = await db.execute(projects_query)
        projects = projects_result.scalars().all()
        
        # Get recent activities
        activities_query = select(AuditLog).where(
            AuditLog.user_id == user_id
        ).order_by(desc(AuditLog.timestamp)).limit(20)
        activities_result = await db.execute(activities_query)
        activities = activities_result.scalars().all()
        
        return {
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "full_name": user.full_name,
                "is_active": user.is_active,
                "is_superuser": user.is_superuser,
                "created_at": user.created_at.isoformat()
            },
            "projects": [
                {
                    "id": p.id,
                    "name": p.name,
                    "status": p.status,
                    "created_at": p.created_at.isoformat()
                }
                for p in projects
            ],
            "recent_activities": [
                {
                    "id": a.id,
                    "action": a.action,
                    "entity_type": a.entity_type,
                    "timestamp": a.timestamp.isoformat()
                }
                for a in activities
            ]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user details: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", status_code=201)
async def create_user(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Create a new user
    """
    try:
        # Check if username already exists
        existing_user_query = select(User).where(User.username == user_data.username)
        existing_user_result = await db.execute(existing_user_query)
        existing_user = existing_user_result.scalar_one_or_none()
        
        if existing_user:
            raise HTTPException(status_code=400, detail="Username already exists")
        
        # Hash password
        hashed_password = pwd_context.hash(user_data.password)
        
        # Create new user
        new_user = User(
            username=user_data.username,
            email=user_data.email,
            hashed_password=hashed_password,
            full_name=user_data.full_name,
            is_superuser=user_data.is_superuser,
            is_active=user_data.is_active,
            created_at=datetime.utcnow()
        )
        
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)
        
        # Log admin action
        audit_log = AuditLog(
            user_id=admin.id,
            action="user_created",
            entity_type="user",
            entity_id=new_user.id,
            details={"target_username": new_user.username},
            timestamp=datetime.utcnow()
        )
        db.add(audit_log)
        await db.commit()
        
        return {
            "id": new_user.id,
            "username": new_user.username,
            "email": new_user.email,
            "message": "User created successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{user_id}")
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Update user information
    """
    try:
        # Get user
        user_query = select(User).where(User.id == user_id)
        user_result = await db.execute(user_query)
        user = user_result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Update fields
        if user_data.email is not None:
            user.email = user_data.email
        if user_data.full_name is not None:
            user.full_name = user_data.full_name
        if user_data.is_superuser is not None:
            user.is_superuser = user_data.is_superuser
        if user_data.is_active is not None:
            user.is_active = user_data.is_active
        
        await db.commit()
        await db.refresh(user)
        
        # Log admin action
        audit_log = AuditLog(
            user_id=admin.id,
            action="user_updated",
            entity_type="user",
            entity_id=user.id,
            details={"target_username": user.username, "changes": user_data.dict(exclude_unset=True)},
            timestamp=datetime.utcnow()
        )
        db.add(audit_log)
        await db.commit()
        
        return {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "is_active": user.is_active,
            "is_superuser": user.is_superuser,
            "message": "User updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    password_data: PasswordReset,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Reset a user's password
    """
    try:
        # Get user
        user_query = select(User).where(User.id == user_id)
        user_result = await db.execute(user_query)
        user = user_result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Hash new password
        user.hashed_password = pwd_context.hash(password_data.new_password)
        
        await db.commit()
        
        # Log admin action
        audit_log = AuditLog(
            user_id=admin.id,
            action="password_reset",
            entity_type="user",
            entity_id=user.id,
            details={"target_username": user.username},
            timestamp=datetime.utcnow()
        )
        db.add(audit_log)
        await db.commit()
        
        return {
            "message": f"Password reset successfully for user {user.username}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting password: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    transfer_projects_to: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Delete a user
    
    Query Parameters:
    - transfer_projects_to: User ID to transfer projects to (optional)
    """
    try:
        # Get user
        user_query = select(User).where(User.id == user_id)
        user_result = await db.execute(user_query)
        user = user_result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Prevent deleting yourself
        if user.id == admin.id:
            raise HTTPException(status_code=400, detail="Cannot delete your own account")
        
        # Handle projects
        if transfer_projects_to:
            # Transfer projects to another user
            projects_query = select(Project).where(Project.created_by == user_id)
            projects_result = await db.execute(projects_query)
            projects = projects_result.scalars().all()
            
            for project in projects:
                project.created_by = transfer_projects_to
            
            await db.commit()
        
        # Log admin action before deletion
        audit_log = AuditLog(
            user_id=admin.id,
            action="user_deleted",
            entity_type="user",
            entity_id=user.id,
            details={
                "target_username": user.username,
                "projects_transferred_to": transfer_projects_to
            },
            timestamp=datetime.utcnow()
        )
        db.add(audit_log)
        await db.commit()
        
        # Delete user
        await db.delete(user)
        await db.commit()
        
        return {
            "message": f"User {user.username} deleted successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting user: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


