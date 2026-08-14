"""
Pydantic schemas for discovered users
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime


class DiscoveredUserBase(BaseModel):
    """Base schema for discovered user"""
    username: str = Field(..., min_length=1, max_length=255, description="Username found on target")
    full_name: Optional[str] = Field(None, max_length=255, description="Full name if available")
    email: Optional[str] = Field(None, max_length=255, description="Email address if available")
    password_hash: Optional[str] = Field(None, description="Password hash if discovered")
    password_plaintext: Optional[str] = Field(None, description="Plaintext password if discovered")
    domain: Optional[str] = Field(None, max_length=255, description="Domain/system where user was found")
    privilege_level: Optional[str] = Field(None, max_length=50, description="User privilege level (admin, user, guest, etc.)")
    account_status: Optional[str] = Field(None, max_length=50, description="Account status (active, disabled, locked, etc.)")
    source: Optional[str] = Field(None, max_length=100, description="How user was discovered (ldap, database, file, etc.)")
    additional_info: Optional[Dict[str, Any]] = Field(None, description="Additional information (groups, permissions, etc.)")
    notes: Optional[str] = Field(None, description="Notes about this user")
    severity: Optional[str] = Field(None, description="Severity if compromised (critical, high, medium, low)")


class DiscoveredUserCreate(DiscoveredUserBase):
    """Schema for creating a new discovered user"""
    project_id: int = Field(..., description="Project ID where user was discovered")
    target_id: Optional[int] = Field(None, description="Target ID where user was discovered")


class DiscoveredUserUpdate(BaseModel):
    """Schema for updating a discovered user"""
    username: Optional[str] = Field(None, min_length=1, max_length=255)
    full_name: Optional[str] = Field(None, max_length=255)
    email: Optional[str] = Field(None, max_length=255)
    password_hash: Optional[str] = None
    password_plaintext: Optional[str] = None
    domain: Optional[str] = Field(None, max_length=255)
    privilege_level: Optional[str] = Field(None, max_length=50)
    account_status: Optional[str] = Field(None, max_length=50)
    source: Optional[str] = Field(None, max_length=100)
    additional_info: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None
    severity: Optional[str] = None
    target_id: Optional[int] = None


class DiscoveredUserResponse(DiscoveredUserBase):
    """Schema for discovered user response"""
    id: int
    project_id: int
    target_id: Optional[int]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DiscoveredUserWithTarget(DiscoveredUserResponse):
    """Schema for discovered user with target information"""
    target_value: Optional[str] = None  # Target domain/IP where user was found
    target_type: Optional[str] = None  # Target type

    class Config:
        from_attributes = True


