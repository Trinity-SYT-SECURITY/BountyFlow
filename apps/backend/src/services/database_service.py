"""
Database service for persistent data storage
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert, update, delete
from sqlalchemy.orm import selectinload
from typing import List, Dict, Any, Optional
from datetime import datetime
import logging

from ..models.database import get_db
from ..models.models import Project, User, Target, Tool, ToolExecution, KnowledgeNode, KnowledgeEdge, Report, AuditLog

logger = logging.getLogger(__name__)

class DatabaseService:
    """Service for database operations"""

    @staticmethod
    async def create_project(data: Dict[str, Any]) -> Project:
        """Create a new project in database"""
        async for session in get_db():
            try:
                project = Project(
                    name=data["name"],
                    description=data.get("description"),
                    company_name=data.get("company_name"),
                    target_scope=data.get("target_scope", {}),
                    out_of_scope=data.get("out_of_scope", {}),
                    status=data.get("status", "active"),
                    created_by=data.get("created_by", 1)
                )
                session.add(project)
                await session.flush()  # Get the project ID

                # Initialize Neo4j graph for the project
                try:
                    from ..services.neo4j_service import neo4j_service
                    neo4j_service.create_project_graph(project.id, project.name)
                except Exception as e:
                    logger.error(f"Failed to initialize Neo4j graph for project {project.id}: {e}")

                await session.commit()
                await session.refresh(project)
                return project
            except Exception as e:
                await session.rollback()
                logger.error(f"Failed to create project: {e}")
                raise

    @staticmethod
    async def get_projects() -> List[Project]:
        """Get all projects from database"""
        async for session in get_db():
            try:
                result = await session.execute(select(Project))
                return result.scalars().all()
            except Exception as e:
                logger.error(f"Failed to get projects: {e}")
                return []

    @staticmethod
    async def get_project_by_id(project_id: int) -> Optional[Project]:
        """Get a specific project by ID"""
        async for session in get_db():
            try:
                result = await session.execute(
                    select(Project).where(Project.id == project_id)
                )
                return result.scalar_one_or_none()
            except Exception as e:
                logger.error(f"Failed to get project {project_id}: {e}")
                return None

    @staticmethod
    async def create_target(project_id: int, data: Dict[str, Any]) -> Target:
        """Create a new target in database"""
        async for session in get_db():
            try:
                target = Target(
                    project_id=project_id,
                    target_type=data["target_type"],
                    target_value=data["target_value"],
                    priority=data.get("priority", 1),
                    notes=data.get("notes"),
                    status=data.get("status", "pending")
                )
                session.add(target)
                await session.flush()

                # Add to Neo4j graph
                try:
                    from ..services.neo4j_service import neo4j_service
                    from urllib.parse import urlparse
                    
                    domain_value = None
                    if data["target_type"] == 'domain':
                        domain_value = data["target_value"]
                    elif data["target_type"] == 'url':
                        target_url = data["target_value"]
                        parsed = urlparse(target_url if '://' in target_url else f'https://{target_url}')
                        domain_value = parsed.hostname
                        
                    target_graph_data = {
                        'id': str(target.id),
                        'name': data["target_value"],
                        'type': data["target_type"],
                        'ip': data["target_value"] if data["target_type"] == 'ip' else None,
                        'domain': domain_value,
                        'status': 'active',
                        'last_scan': datetime.utcnow().isoformat()
                    }
                    neo4j_service.add_target_node(project_id, target_graph_data)
                except Exception as e:
                    logger.error(f"Failed to add target to Neo4j graph: {e}")

                await session.commit()
                await session.refresh(target)
                return target
            except Exception as e:
                await session.rollback()
                logger.error(f"Failed to create target: {e}")
                raise

    @staticmethod
    async def get_project_targets(project_id: int) -> List[Target]:
        """Get all targets for a project"""
        async for session in get_db():
            try:
                result = await session.execute(
                    select(Target).where(Target.project_id == project_id)
                )
                return result.scalars().all()
            except Exception as e:
                logger.error(f"Failed to get targets for project {project_id}: {e}")
                return []

    @staticmethod
    async def create_finding(project_id: int, data: Dict[str, Any]) -> KnowledgeNode:
        """Create a new finding in database"""
        async for session in get_db():
            try:
                finding = KnowledgeNode(
                    project_id=project_id,
                    node_type="finding",
                    node_data={
                        "title": data["title"],
                        "description": data["description"],
                        "severity": data["severity"],
                        "status": data["status"]
                    },
                    confidence_score=0.8,
                    created_by=data.get("created_by", 1)
                )
                session.add(finding)
                await session.flush()

                # Add to Neo4j graph
                try:
                    from ..services.neo4j_service import neo4j_service
                    finding_graph_data = {
                        'id': str(finding.id),
                        'title': data["title"],
                        'description': data["description"],
                        'severity': data["severity"],
                        'status': data["status"],
                        'discovered_at': data.get("discovered_at")
                    }
                    neo4j_service.add_finding_node(project_id, finding_graph_data)
                except Exception as e:
                    logger.error(f"Failed to add finding to Neo4j graph: {e}")

                await session.commit()
                await session.refresh(finding)
                return finding
            except Exception as e:
                await session.rollback()
                logger.error(f"Failed to create finding: {e}")
                raise

    @staticmethod
    async def get_project_findings(project_id: int) -> List[KnowledgeNode]:
        """Get all findings for a project"""
        async for session in get_db():
            try:
                result = await session.execute(
                    select(KnowledgeNode).where(
                        KnowledgeNode.project_id == project_id,
                        KnowledgeNode.node_type == "finding"
                    )
                )
                return result.scalars().all()
            except Exception as e:
                logger.error(f"Failed to get findings for project {project_id}: {e}")
                return []

    @staticmethod
    async def create_tool(project_id: int, data: Dict[str, Any]) -> Tool:
        """Create a new tool in database"""
        async for session in get_db():
            try:
                tool = Tool(
                    name=data["name"],
                    description=data.get("description"),
                    category=data.get("category", "general"),
                    command_template=data.get("command_template", ""),
                    parameters=data.get("parameters", {}),
                    is_active=True,
                    is_system_tool=False,
                    created_by=data.get("created_by", 1)
                )
                session.add(tool)
                await session.commit()
                await session.refresh(tool)
                return tool
            except Exception as e:
                await session.rollback()
                logger.error(f"Failed to create tool: {e}")
                raise

    @staticmethod
    async def get_project_tools(project_id: int) -> List[Tool]:
        """Get all tools for a project"""
        async for session in get_db():
            try:
                result = await session.execute(
                    select(Tool).where(Tool.is_active == True)
                )
                return result.scalars().all()
            except Exception as e:
                logger.error(f"Failed to get tools for project {project_id}: {e}")
                return []

    @staticmethod
    async def update_target(target_id: int, data: Dict[str, Any]) -> Optional[Target]:
        """Update a target in database"""
        async for session in get_db():
            try:
                result = await session.execute(
                    select(Target).where(Target.id == target_id)
                )
                target = result.scalar_one_or_none()

                if not target:
                    return None

                # Update fields
                for key, value in data.items():
                    if hasattr(target, key):
                        setattr(target, key, value)

                target.updated_at = datetime.utcnow()
                await session.commit()
                await session.refresh(target)
                return target
            except Exception as e:
                await session.rollback()
                logger.error(f"Failed to update target {target_id}: {e}")
                return None

    @staticmethod
    async def update_finding(finding_id: int, data: Dict[str, Any]) -> Optional[KnowledgeNode]:
        """Update a finding in database"""
        async for session in get_db():
            try:
                result = await session.execute(
                    select(KnowledgeNode).where(KnowledgeNode.id == finding_id)
                )
                finding = result.scalar_one_or_none()

                if not finding:
                    return None

                # Update node_data
                if "title" in data:
                    finding.node_data["title"] = data["title"]
                if "description" in data:
                    finding.node_data["description"] = data["description"]
                if "severity" in data:
                    finding.node_data["severity"] = data["severity"]
                if "status" in data:
                    finding.node_data["status"] = data["status"]

                finding.updated_at = datetime.utcnow()
                await session.commit()
                await session.refresh(finding)
                return finding
            except Exception as e:
                await session.rollback()
                logger.error(f"Failed to update finding {finding_id}: {e}")
                return None

    @staticmethod
    async def update_tool(tool_id: int, data: Dict[str, Any]) -> Optional[Tool]:
        """Update a tool in database"""
        async for session in get_db():
            try:
                result = await session.execute(
                    select(Tool).where(Tool.id == tool_id)
                )
                tool = result.scalar_one_or_none()

                if not tool:
                    return None

                # Update fields
                for key, value in data.items():
                    if hasattr(tool, key):
                        setattr(tool, key, value)

                tool.updated_at = datetime.utcnow()
                await session.commit()
                await session.refresh(tool)
                return tool
            except Exception as e:
                await session.rollback()
                logger.error(f"Failed to update tool {tool_id}: {e}")
                return None

    @staticmethod
    async def delete_target(target_id: int) -> bool:
        """Delete a target from database"""
        async for session in get_db():
            try:
                result = await session.execute(
                    delete(Target).where(Target.id == target_id)
                )
                await session.commit()
                return result.rowcount > 0
            except Exception as e:
                await session.rollback()
                logger.error(f"Failed to delete target {target_id}: {e}")
                return False

    @staticmethod
    async def delete_finding(finding_id: int) -> bool:
        """Delete a finding from database"""
        async for session in get_db():
            try:
                result = await session.execute(
                    delete(KnowledgeNode).where(KnowledgeNode.id == finding_id)
                )
                await session.commit()
                return result.rowcount > 0
            except Exception as e:
                await session.rollback()
                logger.error(f"Failed to delete finding {finding_id}: {e}")
                return False

    @staticmethod
    async def delete_tool(tool_id: int) -> bool:
        """Delete a tool from database"""
        async for session in get_db():
            try:
                result = await session.execute(
                    delete(Tool).where(Tool.id == tool_id)
                )
                await session.commit()
                return result.rowcount > 0
            except Exception as e:
                await session.rollback()
                logger.error(f"Failed to delete tool {tool_id}: {e}")
                return False

# Global database service instance
database_service = DatabaseService()

