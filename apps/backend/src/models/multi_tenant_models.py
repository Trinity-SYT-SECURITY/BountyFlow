"""
Multi-tenant database models for BountyFlow Platform
Implements account-based data isolation
"""

from sqlalchemy import String, Integer, Boolean, DateTime, Text, JSON, Float, ForeignKey, Table, Column
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from typing import Optional, List, Dict, Any
from datetime import datetime
from .database import Base

# Association table for many-to-many relationships with account isolation
project_users = Table(
    "project_users",
    Base.metadata,
    Column("project_id", Integer, ForeignKey("projects.id"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
)

tool_dependencies = Table(
    "tool_dependencies",
    Base.metadata,
    Column("tool_id", Integer, ForeignKey("tools.id"), primary_key=True),
    Column("depends_on_tool_id", Integer, ForeignKey("tools.id"), primary_key=True),
)

class Account(Base):
    """Account model for multi-tenant isolation"""
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    settings: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    users: Mapped[List["User"]] = relationship("User", back_populates="account")
    projects: Mapped[List["Project"]] = relationship("Project", back_populates="account")
    ai_conversations: Mapped[List["AIConversation"]] = relationship("AIConversation", back_populates="account")

class User(Base):
    """User model with account isolation"""
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    account_id: Mapped[int] = mapped_column(Integer, ForeignKey("accounts.id"), index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[Optional[str]] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    account: Mapped["Account"] = relationship("Account", back_populates="users")
    projects: Mapped[List["Project"]] = relationship(
        "Project", secondary=project_users, back_populates="users"
    )
    created_projects: Mapped[List["Project"]] = relationship(
        "Project", back_populates="created_by_user"
    )
    tool_executions: Mapped[List["ToolExecution"]] = relationship(
        "ToolExecution", back_populates="executed_by_user"
    )
    knowledge_nodes: Mapped[List["KnowledgeNode"]] = relationship(
        "KnowledgeNode", back_populates="created_by_user"
    )

class Project(Base):
    """Project model with account isolation"""
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    account_id: Mapped[int] = mapped_column(Integer, ForeignKey("accounts.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[Optional[str]] = mapped_column(Text)
    company_name: Mapped[Optional[str]] = mapped_column(String(100))
    target_scope: Mapped[Dict[str, Any]] = mapped_column(JSON)  # IPs, domains, etc.
    out_of_scope: Mapped[Dict[str, Any]] = mapped_column(JSON)  # Out of scope targets
    status: Mapped[str] = mapped_column(String(20), default="active")  # active, completed, paused
    start_date: Mapped[Optional[datetime]] = mapped_column(DateTime)
    end_date: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    account: Mapped["Account"] = relationship("Account", back_populates="projects")
    created_by_user: Mapped["User"] = relationship("User", back_populates="created_projects")
    users: Mapped[List["User"]] = relationship(
        "User", secondary=project_users, back_populates="projects"
    )
    targets: Mapped[List["Target"]] = relationship("Target", back_populates="project")
    tool_executions: Mapped[List["ToolExecution"]] = relationship(
        "ToolExecution", back_populates="project"
    )
    knowledge_nodes: Mapped[List["KnowledgeNode"]] = relationship(
        "KnowledgeNode", back_populates="project"
    )
    discovered_users: Mapped[List["DiscoveredUser"]] = relationship(
        "DiscoveredUser", back_populates="project"
    )
    discovered_files: Mapped[List["DiscoveredFile"]] = relationship(
        "DiscoveredFile", back_populates="project"
    )

class Target(Base):
    """Target model with account isolation"""
    __tablename__ = "targets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"))
    target_type: Mapped[str] = mapped_column(String(20))  # domain, ip, url, etc.
    target_value: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, scanning, completed, etc.
    priority: Mapped[int] = mapped_column(Integer, default=1)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="targets")
    tool_executions: Mapped[List["ToolExecution"]] = relationship(
        "ToolExecution", back_populates="target"
    )
    knowledge_nodes: Mapped[List["KnowledgeNode"]] = relationship(
        "KnowledgeNode", back_populates="target"
    )
    discovered_users: Mapped[List["DiscoveredUser"]] = relationship(
        "DiscoveredUser", back_populates="target"
    )

class DiscoveredUser(Base):
    """Discovered user model with account isolation"""
    __tablename__ = "discovered_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"))
    target_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("targets.id"))
    username: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[Optional[str]] = mapped_column(String(255))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    password_hash: Mapped[Optional[str]] = mapped_column(Text)  # If discovered/cracked
    password_plaintext: Mapped[Optional[str]] = mapped_column(Text)  # If discovered in plaintext
    domain: Mapped[Optional[str]] = mapped_column(String(255))  # Domain/system where found
    privilege_level: Mapped[Optional[str]] = mapped_column(String(50))  # admin, user, guest, etc.
    account_status: Mapped[Optional[str]] = mapped_column(String(50))  # active, disabled, locked, etc.
    source: Mapped[Optional[str]] = mapped_column(String(100))  # How discovered (ldap, database, file, etc.)
    additional_info: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON)  # Groups, permissions, last login, etc.
    notes: Mapped[Optional[str]] = mapped_column(Text)
    severity: Mapped[Optional[str]] = mapped_column(String(20))  # critical, high, medium, low (if compromised)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="discovered_users")
    target: Mapped[Optional["Target"]] = relationship("Target", back_populates="discovered_users")

class DiscoveredFile(Base):
    """Discovered file model with account isolation"""
    __tablename__ = "discovered_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"))
    target_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("targets.id"))
    
    # File information
    filename: Mapped[str] = mapped_column(String(255))
    file_path: Mapped[str] = mapped_column(String(500))
    file_type: Mapped[str] = mapped_column(String(50))  # document, image, script, config, etc.
    file_size: Mapped[Optional[int]] = mapped_column(Integer)
    file_hash: Mapped[Optional[str]] = mapped_column(String(64))  # MD5 or SHA256
    
    # Content information
    content_preview: Mapped[Optional[str]] = mapped_column(Text)
    content_analysis: Mapped[Optional[str]] = mapped_column(Text)
    
    # Metadata
    discovered_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    source: Mapped[str] = mapped_column(String(50), default="manual")  # manual, scan, tool
    severity: Mapped[str] = mapped_column(String(20), default="info")  # info, low, medium, high, critical
    
    # Additional information
    notes: Mapped[Optional[str]] = mapped_column(Text)
    tags: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON)  # Array of tags
    is_sensitive: Mapped[str] = mapped_column(String(10), default="false")  # true, false
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="discovered_files")
    target: Mapped[Optional["Target"]] = relationship("Target")

class KnowledgeNode(Base):
    """Knowledge graph node with account isolation"""
    __tablename__ = "knowledge_nodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"))
    target_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("targets.id"))
    node_type: Mapped[str] = mapped_column(String(50))  # service, vulnerability, user, file, etc.
    node_data: Mapped[Dict[str, Any]] = mapped_column(JSON)  # Node-specific data
    confidence_score: Mapped[Optional[float]] = mapped_column(Float)
    source_tool_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("tool_executions.id"))
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="knowledge_nodes")
    target: Mapped[Optional["Target"]] = relationship("Target", back_populates="knowledge_nodes")
    source_tool: Mapped[Optional["ToolExecution"]] = relationship("ToolExecution")
    created_by_user: Mapped["User"] = relationship("User", back_populates="knowledge_nodes")

class KnowledgeEdge(Base):
    """Knowledge graph edge with account isolation"""
    __tablename__ = "knowledge_edges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"))
    source_node_id: Mapped[int] = mapped_column(Integer, ForeignKey("knowledge_nodes.id"))
    target_node_id: Mapped[int] = mapped_column(Integer, ForeignKey("knowledge_nodes.id"))
    edge_type: Mapped[str] = mapped_column(String(50))  # discovered_on, exploits, contains, etc.
    edge_data: Mapped[Dict[str, Any]] = mapped_column(JSON)  # Edge-specific data
    confidence_score: Mapped[Optional[float]] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    project: Mapped["Project"] = relationship("Project")
    source_node: Mapped["KnowledgeNode"] = relationship(
        "KnowledgeNode", foreign_keys=[source_node_id]
    )
    target_node: Mapped["KnowledgeNode"] = relationship(
        "KnowledgeNode", foreign_keys=[target_node_id]
    )

class ToolExecution(Base):
    """Tool execution with account isolation"""
    __tablename__ = "tool_executions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"))
    target_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("targets.id"))
    tool_id: Mapped[int] = mapped_column(Integer, ForeignKey("tools.id"))
    executed_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    command_executed: Mapped[str] = mapped_column(Text)
    execution_status: Mapped[str] = mapped_column(String(20))  # pending, running, completed, failed
    start_time: Mapped[Optional[datetime]] = mapped_column(DateTime)
    end_time: Mapped[Optional[datetime]] = mapped_column(DateTime)
    output: Mapped[Optional[Text]] = mapped_column(Text)
    error_output: Mapped[Optional[Text]] = mapped_column(Text)
    exit_code: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="tool_executions")
    target: Mapped[Optional["Target"]] = relationship("Target", back_populates="tool_executions")
    tool: Mapped["Tool"] = relationship("Tool", back_populates="executions")
    executed_by_user: Mapped["User"] = relationship("User", back_populates="tool_executions")

class Tool(Base):
    """Tool model (global, not account-specific)"""
    __tablename__ = "tools"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[Optional[str]] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(50))  # reconnaissance, scanning, exploitation, etc.
    command_template: Mapped[str] = mapped_column(Text)  # Template for command execution
    parameters: Mapped[Dict[str, Any]] = mapped_column(JSON)  # Tool parameters
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_system_tool: Mapped[bool] = mapped_column(Boolean, default=False)  # System vs user-defined
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    created_by_user: Mapped[Optional["User"]] = relationship("User")
    dependencies: Mapped[List["Tool"]] = relationship(
        "Tool",
        secondary=tool_dependencies,
        primaryjoin="Tool.id == tool_dependencies.c.tool_id",
        secondaryjoin="Tool.id == tool_dependencies.c.depends_on_tool_id",
        back_populates="dependents"
    )
    dependents: Mapped[List["Tool"]] = relationship(
        "Tool",
        secondary=tool_dependencies,
        primaryjoin="Tool.id == tool_dependencies.c.depends_on_tool_id",
        secondaryjoin="Tool.id == tool_dependencies.c.tool_id",
        back_populates="dependencies"
    )
    executions: Mapped[List["ToolExecution"]] = relationship(
        "ToolExecution", back_populates="tool"
    )

class AIConversation(Base):
    """AI conversation with account isolation"""
    __tablename__ = "ai_conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    account_id: Mapped[int] = mapped_column(Integer, ForeignKey("accounts.id"), index=True)
    project_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("projects.id"))
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"))
    page_context: Mapped[Optional[str]] = mapped_column(String(100))  # Which page
    user_message: Mapped[str] = mapped_column(Text)
    ai_response: Mapped[str] = mapped_column(Text)
    context_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    account: Mapped["Account"] = relationship("Account", back_populates="ai_conversations")
    project: Mapped[Optional["Project"]] = relationship("Project")
    user: Mapped[Optional["User"]] = relationship("User")
