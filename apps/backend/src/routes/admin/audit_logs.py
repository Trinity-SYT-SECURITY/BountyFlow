"""
Admin Audit Logs API

Provides endpoints for viewing and analyzing audit logs.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import datetime, timedelta
from typing import Optional
import logging

from ...models.database import get_db
from ...models.models import User, AuditLog
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
async def get_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Get audit logs with filtering
    
    Query Parameters:
    - skip: Pagination offset
    - limit: Maximum records to return
    - user_id: Filter by user
    - action: Filter by action type
    - entity_type: Filter by entity type
    - days: Number of days to look back (default 7)
    """
    try:
        # Build query
        query = select(AuditLog)
        
        # Apply time filter
        start_date = datetime.utcnow() - timedelta(days=days)
        query = query.where(AuditLog.timestamp >= start_date)
        
        # Apply filters
        if user_id:
            query = query.where(AuditLog.user_id == user_id)
        
        if action:
            query = query.where(AuditLog.action == action)
        
        if entity_type:
            query = query.where(AuditLog.entity_type == entity_type)
        
        # Apply pagination
        query = query.offset(skip).limit(limit).order_by(desc(AuditLog.timestamp))
        
        # Execute query
        result = await db.execute(query)
        logs = result.scalars().all()
        
        # Enrich with user info
        logs_response = []
        for log in logs:
            # Get user info
            user_query = select(User).where(User.id == log.user_id)
            user_result = await db.execute(user_query)
            user = user_result.scalar_one_or_none()
            
            logs_response.append({
                "id": log.id,
                "timestamp": log.timestamp.isoformat(),
                "user": {
                    "id": user.id if user else None,
                    "username": user.username if user else "Unknown"
                },
                "action": log.action,
                "entity_type": log.entity_type,
                "entity_id": log.entity_id,
                "details": log.details
            })
        
        # Get total count
        count_query = select(func.count(AuditLog.id))
        count_query = count_query.where(AuditLog.timestamp >= start_date)
        if user_id:
            count_query = count_query.where(AuditLog.user_id == user_id)
        if action:
            count_query = count_query.where(AuditLog.action == action)
        if entity_type:
            count_query = count_query.where(AuditLog.entity_type == entity_type)
        
        count_result = await db.execute(count_query)
        total = count_result.scalar()
        
        return {
            "logs": logs_response,
            "total": total,
            "page_size": len(logs_response)
        }
        
    except Exception as e:
        logger.error(f"Error getting audit logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/statistics")
async def get_audit_statistics(
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Get audit log statistics
    """
    try:
        start_date = datetime.utcnow() - timedelta(days=days)
        
        # Total actions
        total_query = select(func.count(AuditLog.id)).where(
            AuditLog.timestamp >= start_date
        )
        total_result = await db.execute(total_query)
        total_actions = total_result.scalar()
        
        # Failed logins
        failed_logins_query = select(func.count(AuditLog.id)).where(
            AuditLog.action == 'login_failed',
            AuditLog.timestamp >= start_date
        )
        failed_logins_result = await db.execute(failed_logins_query)
        failed_logins = failed_logins_result.scalar()
        
        # Most active users
        # Get all unique user IDs with their action counts
        users_query = select(User)
        users_result = await db.execute(users_query)
        users = users_result.scalars().all()
        
        user_activity = []
        for user in users:
            count_query = select(func.count(AuditLog.id)).where(
                AuditLog.user_id == user.id,
                AuditLog.timestamp >= start_date
            )
            count_result = await db.execute(count_query)
            count = count_result.scalar()
            
            if count > 0:
                user_activity.append({
                    "user_id": user.id,
                    "username": user.username,
                    "action_count": count
                })
        
        # Sort by action count
        user_activity.sort(key=lambda x: x['action_count'], reverse=True)
        
        return {
            "period_days": days,
            "total_actions": total_actions,
            "failed_logins": failed_logins,
            "most_active_users": user_activity[:10],  # Top 10
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting audit statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


