"""
Admin System Settings API

Provides endpoints for managing system-wide settings.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional, Dict, Any
import logging
import os
import json

from ...models.database import get_db
from ...models.models import User, AuditLog
from ...middleware.auth import get_current_user
from datetime import datetime

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


# Pydantic models
class SecuritySettings(BaseModel):
    password_min_length: int = 8
    password_require_uppercase: bool = True
    password_require_numbers: bool = True
    password_require_symbols: bool = False
    session_timeout_minutes: int = 30
    max_concurrent_sessions: int = 3
    max_failed_login_attempts: int = 5
    lockout_duration_minutes: int = 15


class EmailSettings(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    from_email: Optional[str] = None


class SystemSettings(BaseModel):
    platform_name: str = "BountyFlow"
    timezone: str = "UTC"
    default_language: str = "en"


# In-memory settings storage (for demo; should use database in production)
settings_store = {
    "security": SecuritySettings().dict(),
    "email": EmailSettings().dict(),
    "system": SystemSettings().dict()
}


@router.get("/security")
async def get_security_settings(
    admin: User = Depends(require_admin)
):
    """Get current security settings"""
    return settings_store["security"]


@router.put("/security")
async def update_security_settings(
    settings: SecuritySettings,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Update security settings"""
    try:
        settings_store["security"] = settings.dict()
        
        # Log admin action
        audit_log = AuditLog(
            user_id=admin.id,
            action="security_settings_updated",
            entity_type="settings",
            entity_id=0,
            details=settings.dict(),
            timestamp=datetime.utcnow()
        )
        db.add(audit_log)
        await db.commit()
        
        return {
            "message": "Security settings updated successfully",
            "settings": settings.dict()
        }
        
    except Exception as e:
        logger.error(f"Error updating security settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/email")
async def get_email_settings(
    admin: User = Depends(require_admin)
):
    """Get current email settings (password masked)"""
    settings = settings_store["email"].copy()
    if settings.get("smtp_password"):
        settings["smtp_password"] = "********"
    return settings


@router.put("/email")
async def update_email_settings(
    settings: EmailSettings,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Update email settings"""
    try:
        settings_store["email"] = settings.dict()
        
        # Log admin action (without password)
        log_settings = settings.dict()
        if log_settings.get("smtp_password"):
            log_settings["smtp_password"] = "********"
        
        audit_log = AuditLog(
            user_id=admin.id,
            action="email_settings_updated",
            entity_type="settings",
            entity_id=0,
            details=log_settings,
            timestamp=datetime.utcnow()
        )
        db.add(audit_log)
        await db.commit()
        
        return {
            "message": "Email settings updated successfully"
        }
        
    except Exception as e:
        logger.error(f"Error updating email settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/system")
async def get_system_settings(
    admin: User = Depends(require_admin)
):
    """Get current system settings"""
    return settings_store["system"]


@router.put("/system")
async def update_system_settings(
    settings: SystemSettings,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Update system settings"""
    try:
        settings_store["system"] = settings.dict()
        
        # Log admin action
        audit_log = AuditLog(
            user_id=admin.id,
            action="system_settings_updated",
            entity_type="settings",
            entity_id=0,
            details=settings.dict(),
            timestamp=datetime.utcnow()
        )
        db.add(audit_log)
        await db.commit()
        
        return {
            "message": "System settings updated successfully",
            "settings": settings.dict()
        }
        
    except Exception as e:
        logger.error(f"Error updating system settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/all")
async def get_all_settings(
    admin: User = Depends(require_admin)
):
    """Get all settings"""
    settings = {
        "security": settings_store["security"],
        "email": settings_store["email"].copy(),
        "system": settings_store["system"]
    }
    
    # Mask password
    if settings["email"].get("smtp_password"):
        settings["email"]["smtp_password"] = "********"
    
    return settings


