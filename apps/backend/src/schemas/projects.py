"""
Pydantic schemas for project-related API requests and responses
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class ProjectStatus(str, Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    PAUSED = "paused"
    CANCELLED = "cancelled"

class TargetStatus(str, Enum):
    PENDING = "pending"
    SCANNING = "scanning"
    COMPLETED = "completed"
    FAILED = "failed"

class TargetType(str, Enum):
    DOMAIN = "domain"
    IP = "ip"
    URL = "url"
    NETWORK = "network"
    SUBDOMAIN = "subdomain"

class ProjectBase(BaseModel):
    """Base project schema"""
    name: str = Field(..., min_length=1, max_length=100, description="Project name")
    description: Optional[str] = Field(None, description="Project description")
    company_name: Optional[str] = Field(None, max_length=100, description="Company/organization name")
    target_scope: Dict[str, Any] = Field(default_factory=dict, description="Authorized scope definition")
    out_of_scope: Dict[str, Any] = Field(default_factory=dict, description="Out of scope targets")

class ProjectCreate(ProjectBase):
    """Schema for creating a new project"""
    start_date: Optional[datetime] = Field(None, description="Project start date")

class ProjectUpdate(BaseModel):
    """Schema for updating a project"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    company_name: Optional[str] = Field(None, max_length=100)
    target_scope: Optional[Dict[str, Any]] = None
    out_of_scope: Optional[Dict[str, Any]] = None
    status: Optional[ProjectStatus] = None
    end_date: Optional[datetime] = None

class TargetBase(BaseModel):
    """Base target schema"""
    target_type: TargetType = Field(..., description="Type of target")
    target_value: str = Field(..., min_length=1, max_length=255, description="Target value (domain, IP, etc.)")
    priority: int = Field(1, ge=1, le=10, description="Target priority (1-10)")
    notes: Optional[str] = Field(None, description="Additional notes about the target")

class TargetCreate(TargetBase):
    """Schema for creating a new target"""
    pass

class TargetUpdate(BaseModel):
    """Schema for updating a target"""
    target_type: Optional[TargetType] = None
    target_value: Optional[str] = Field(None, min_length=1, max_length=255)
    priority: Optional[int] = Field(None, ge=1, le=10)
    notes: Optional[str] = None
    status: Optional[TargetStatus] = None

class UserInfo(BaseModel):
    """User information schema"""
    id: int
    username: str

class TargetResponse(TargetBase):
    """Response schema for targets"""
    id: int
    status: str
    scan_results: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True

class ProjectListResponse(BaseModel):
    """Response schema for project list items"""
    id: int
    name: str
    description: Optional[str]
    company_name: Optional[str]
    status: str
    created_at: datetime
    target_count: int
    user_count: int

    class Config:
        from_attributes = True

class ProjectResponse(ProjectBase):
    """Response schema for projects"""
    id: int
    status: str
    created_by: int
    created_at: datetime
    targets: List[TargetResponse] = []
    findings: List[dict] = []
    tools: List[dict] = []
    users: List[UserInfo] = []
    targets_count: int = 0
    findings_count: int = 0
    tools_count: int = 0

    class Config:
        from_attributes = True
