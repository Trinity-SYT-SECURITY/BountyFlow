"""
Pydantic schemas for discovered files
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime

class DiscoveredFileBase(BaseModel):
    """Base schema for discovered file"""
    filename: str = Field(..., description="Name of the file")
    file_path: str = Field(..., description="Full path to the file")
    file_type: str = Field(..., description="Type of file (document, image, script, config, etc.)")
    file_size: Optional[int] = Field(None, description="Size of the file in bytes")
    file_hash: Optional[str] = Field(None, description="MD5 or SHA256 hash of the file")
    content_preview: Optional[str] = Field(None, description="Preview of file content")
    content_analysis: Optional[str] = Field(None, description="Analysis of file content")
    source: str = Field(default="manual", description="How the file was discovered")
    severity: str = Field(default="info", description="Severity level of the file")
    notes: Optional[str] = Field(None, description="Additional notes about the file")
    tags: Optional[List[str]] = Field(None, description="Tags associated with the file")
    is_sensitive: str = Field(default="false", description="Whether the file contains sensitive information")

class DiscoveredFileCreate(DiscoveredFileBase):
    """Schema for creating a discovered file"""
    project_id: int = Field(..., description="ID of the project this file belongs to")
    target_id: Optional[int] = Field(None, description="ID of the target where this file was found")

class DiscoveredFileUpdate(BaseModel):
    """Schema for updating a discovered file"""
    filename: Optional[str] = None
    file_path: Optional[str] = None
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    file_hash: Optional[str] = None
    content_preview: Optional[str] = None
    content_analysis: Optional[str] = None
    source: Optional[str] = None
    severity: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    is_sensitive: Optional[str] = None
    target_id: Optional[int] = None

class DiscoveredFileResponse(DiscoveredFileBase):
    """Schema for discovered file response"""
    id: int
    project_id: int
    target_id: Optional[int]
    discovered_at: datetime
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class DiscoveredFileWithTarget(DiscoveredFileResponse):
    """Schema for discovered file with target information"""
    target_value: Optional[str] = None
    target_type: Optional[str] = None
    project_name: Optional[str] = None

