"""
Pydantic schemas for tool-related API requests and responses
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class ToolCategory(str, Enum):
    RECONNAISSANCE = "reconnaissance"
    SCANNING = "scanning"
    ENUMERATION = "enumeration"
    VULNERABILITY = "vulnerability"
    EXPLOITATION = "exploitation"
    POST_EXPLOITATION = "post_exploitation"
    REPORTING = "reporting"
    UTILITY = "utility"
    GENERAL = "general"  # Support general category from database

class ExecutionStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class ToolBase(BaseModel):
    """Base tool schema"""
    name: str = Field(..., min_length=1, max_length=100, description="Tool name")
    description: Optional[str] = Field(None, description="Tool description")
    category: ToolCategory = Field(..., description="Tool category")
    command_template: str = Field(..., description="Command template for execution")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Tool parameters")

class ToolCreate(ToolBase):
    """Schema for creating a new tool"""
    pass

class ToolUpdate(BaseModel):
    """Schema for updating a tool"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    category: Optional[ToolCategory] = None
    command_template: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

class ToolResponse(BaseModel):
    """Response schema for tools"""
    id: int
    name: str
    description: Optional[str] = None
    category: str  # Allow any string category, not just enum
    command_template: str
    parameters: Dict[str, Any] = Field(default_factory=dict)
    is_system_tool: bool
    created_by: Optional[int] = None
    created_at: datetime
    project_id: Optional[int] = None  # None = global tool
    project_name: Optional[str] = None  # Project name if project-specific
    dependencies: List[int] = []

    class Config:
        from_attributes = True

class ToolExecutionBase(BaseModel):
    """Base tool execution schema"""
    tool_id: int = Field(..., description="ID of the tool to execute")
    target_id: Optional[int] = Field(None, description="Specific target to run tool against")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Execution parameters")

class ToolExecutionCreate(ToolExecutionBase):
    """Schema for creating a tool execution"""
    pass

class ToolChainCreate(BaseModel):
    """Schema for creating a tool execution chain"""
    tools: List[ToolExecutionBase] = Field(..., description="List of tools to execute in order")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Global execution parameters")

class ToolExecutionResponse(BaseModel):
    """Response schema for tool executions"""
    id: int
    project_id: int
    tool_id: Optional[int] = None  # Include tool_id to identify which tool was executed
    execution_status: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None  # Explicitly set default to None
    created_at: datetime

    class Config:
        from_attributes = True
