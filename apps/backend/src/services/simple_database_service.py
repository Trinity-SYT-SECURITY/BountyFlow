"""
Simplified database service for persistent data storage
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert, update, delete, func, and_, or_
from typing import List, Dict, Any, Optional
from datetime import datetime
import logging

from ..models.database import get_db
from ..models.models import Project, User, Target, Tool, ToolExecution, KnowledgeNode, KnowledgeEdge, DiscoveredUser, DiscoveredFile

logger = logging.getLogger(__name__)

class SimpleDatabaseService:
    """Simplified service for database operations"""

    @staticmethod
    def _extract_last_scan_from_notes(notes: Optional[str]) -> Optional[str]:
        """Extract the last scan timestamp from notes field"""
        if not notes or '[Scan' not in notes:
            return None
        
        import re
        # Find all scan lines - check both newline-separated and inline formats
        scan_lines = [line for line in notes.split('\n') if '[Scan' in line]
        if not scan_lines:
            # If no newline-separated scan lines, check if the entire notes contains [Scan
            if '[Scan' in notes:
                scan_lines = [notes]
            else:
                return None
        
        # Get the last scan line
        last_scan_line = scan_lines[-1].strip()
        # Extract timestamp from [Scan YYYY-MM-DD HH:MM:SS] format
        # Try both match (start of string) and search (anywhere in string)
        match = re.search(r'\[Scan\s+([^\]]+)\]', last_scan_line)
        if match:
            timestamp_str = match.group(1).strip()
            # Convert to ISO format if needed (format: YYYY-MM-DD HH:MM:SS)
            try:
                from datetime import datetime
                dt = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')
                return dt.isoformat()
            except ValueError:
                # If parsing fails, return the raw timestamp string
                return timestamp_str
        return None

    @staticmethod
    async def create_project(data: Dict[str, Any]) -> Project:
        """Create a new project in database"""
        from ..models.database import async_session
        
        async with async_session() as session:
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
                # Convert to dict to avoid session issues
                return {
                    "id": project.id,
                    "name": project.name,
                    "description": project.description,
                    "company_name": project.company_name,
                    "target_scope": project.target_scope,
                    "out_of_scope": project.out_of_scope,
                    "status": project.status,
                    "created_by": project.created_by,
                    "created_at": project.created_at,
                    "updated_at": project.updated_at,
                    "targets": [],
                    "findings": [],
                    "tools": [],
                    "users": []
                }
            except Exception as e:
                await session.rollback()
                logger.error(f"Failed to create project: {e}")
                raise

    @staticmethod
    async def get_projects() -> List[Project]:
        """Get all projects from database"""
        from ..models.database import async_session

        async with async_session() as session:
            try:
                result = await session.execute(select(Project))
                projects = result.scalars().all()

                project_list = []
                for p in projects:
                    # Get counts for each project
                    targets_count = await session.execute(
                        select(func.count(Target.id)).where(Target.project_id == p.id)
                    )
                    findings_count = await session.execute(
                        select(func.count(KnowledgeNode.id)).where(
                            KnowledgeNode.project_id == p.id,
                            KnowledgeNode.node_type == "finding"
                        )
                    )
                    tools_count = await session.execute(
                        select(func.count(Tool.id)).where(
                            and_(
                                Tool.is_active == True,
                                Tool.project_id == p.id
                            )
                        )
                    )

                    # Get actual data for each project
                    targets_result = await session.execute(
                        select(Target).where(Target.project_id == p.id)
                    )
                    targets = targets_result.scalars().all()
                    
                    findings_result = await session.execute(
                        select(KnowledgeNode).where(
                            KnowledgeNode.project_id == p.id,
                            KnowledgeNode.node_type == "finding"
                        )
                    )
                    findings = findings_result.scalars().all()
                    
                    tools_result = await session.execute(
                        select(Tool).where(
                            and_(
                                Tool.is_active == True,
                                Tool.project_id == p.id
                            )
                        )
                    )
                    tools = tools_result.scalars().all()

                    # Convert to dict to avoid session issues
                    project_dict = {
                        "id": p.id,
                        "name": p.name,
                        "description": p.description,
                        "company_name": p.company_name,
                        "target_scope": p.target_scope,
                        "out_of_scope": p.out_of_scope,
                        "status": p.status,
                        "created_by": 1 if isinstance(p.created_by, str) else p.created_by,  # Convert string to int
                        "created_at": p.created_at.isoformat() if p.created_at else None,
                        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
                        "targets": [
                            {
                                "id": t.id,
                                "target_type": t.target_type,
                                "target_value": t.target_value,
                                "status": t.status,
                                "priority": t.priority,
                                "notes": t.notes,
                                "scan_results": t.scan_results if hasattr(t, 'scan_results') else None,
                                "last_scan": (t.scan_results or {}).get('scanned_at') if hasattr(t, 'scan_results') and t.scan_results else SimpleDatabaseService._extract_last_scan_from_notes(t.notes),
                                "created_at": t.created_at.isoformat() if t.created_at else None,
                                "updated_at": t.updated_at.isoformat() if t.updated_at else None
                            }
                            for t in targets
                        ],
                        "findings": [
                            {
                                "id": f.id,
                                "title": f.node_data.get("title", ""),
                                "description": f.node_data.get("description", ""),
                                "severity": f.node_data.get("severity", "medium"),
                                "status": f.node_data.get("status", "open"),
                                "discovered_at": f.node_data.get("discovered_at", ""),
                                "created_at": f.created_at.isoformat() if f.created_at else None,
                                "updated_at": f.updated_at.isoformat() if f.updated_at else None
                            }
                            for f in findings
                        ],
                        "tools": [
                            {
                                "id": t.id,
                                "name": t.name,
                                "description": t.description,
                                "command": t.command_template,
                                "category": t.category,
                                "created_at": t.created_at.isoformat() if t.created_at else None,
                                "updated_at": t.updated_at.isoformat() if t.updated_at else None
                            }
                            for t in tools
                        ],
                        "users": [],
                        # Add counts for display in project list
                        "targets_count": targets_count.scalar(),
                        "findings_count": findings_count.scalar(),
                        "tools_count": tools_count.scalar()
                    }
                    project_list.append(project_dict)

                logger.info(f"Successfully loaded {len(project_list)} projects")
                return project_list
            except Exception as e:
                logger.error(f"Failed to get projects: {e}", exc_info=True)
                import traceback
                traceback.print_exc()
                return []

    @staticmethod
    async def get_project_by_id(project_id: int) -> Optional[Project]:
        """Get a specific project by ID"""
        from ..models.database import async_session
        
        async with async_session() as session:
            try:
                result = await session.execute(
                    select(Project).where(Project.id == project_id)
                )
                project = result.scalar_one_or_none()
                if project:
                    # Get related data
                    targets_result = await session.execute(
                        select(Target).where(Target.project_id == project_id)
                    )
                    targets = targets_result.scalars().all()
                    
                    findings_result = await session.execute(
                        select(KnowledgeNode).where(
                            KnowledgeNode.project_id == project_id,
                            KnowledgeNode.node_type == "finding"
                        )
                    )
                    findings = findings_result.scalars().all()
                    
                    # Get project-specific tools AND global tools (project_id is None)
                    tools_result = await session.execute(
                        select(Tool).where(
                            and_(
                                Tool.is_active == True,
                                or_(
                                    Tool.project_id == project_id,
                                    Tool.project_id.is_(None)  # Include global tools
                                )
                            )
                        )
                    )
                    tools = tools_result.scalars().all()
                    
                    # Get discovered users
                    users_result = await session.execute(
                        select(DiscoveredUser).where(DiscoveredUser.project_id == project_id)
                    )
                    discovered_users = users_result.scalars().all()
                    
                    # Get discovered files
                    files_result = await session.execute(
                        select(DiscoveredFile).where(DiscoveredFile.project_id == project_id)
                    )
                    discovered_files = files_result.scalars().all()
                    
                    # Convert to dict to avoid session issues
                    return {
                        "id": project.id,
                        "name": project.name,
                        "description": project.description,
                        "company_name": project.company_name,
                        "target_scope": project.target_scope,
                        "out_of_scope": project.out_of_scope,
                        "status": project.status,
                        "created_by": project.created_by,
                        "created_at": project.created_at.isoformat() if project.created_at else None,
                        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
                        "targets": [
                            {
                                "id": t.id,
                                "target_type": t.target_type,
                                "target_value": t.target_value,
                                "status": t.status,
                                "priority": t.priority,
                                "notes": t.notes,
                                "scan_results": t.scan_results if hasattr(t, 'scan_results') else None,
                                "last_scan": (t.scan_results or {}).get('scanned_at') if hasattr(t, 'scan_results') and t.scan_results else SimpleDatabaseService._extract_last_scan_from_notes(t.notes),
                                "created_at": t.created_at.isoformat() if t.created_at else None,
                                "updated_at": t.updated_at.isoformat() if t.updated_at else None
                            }
                            for t in targets
                        ],
                        "findings": [
                            {
                                "id": f.id,
                                "title": f.node_data.get("title", ""),
                                "description": f.node_data.get("description", ""),
                                "severity": f.node_data.get("severity", ""),
                                "status": f.node_data.get("status", ""),
                                "target_id": f.target_id or f.node_data.get("target_id"),  # Add target_id support
                                "created_at": f.created_at.isoformat() if f.created_at else None,
                                "updated_at": f.updated_at.isoformat() if f.updated_at else None
                            }
                            for f in findings
                        ],
                        "tools": [
                            {
                                "id": t.id,
                                "name": t.name,
                                "description": t.description,
                                "command": t.command_template,
                                "command_template": t.command_template,  # Also include for compatibility
                                "category": t.category,
                                "parameters": t.parameters or {},  # Include parameters with selected_targets
                                "created_at": t.created_at.isoformat() if t.created_at else None,
                                "updated_at": t.updated_at.isoformat() if t.updated_at else None
                            }
                            for t in tools
                        ],
                        "users": [
                            {
                                "id": u.id,
                                "username": u.username,
                                "full_name": u.full_name,
                                "email": u.email,
                                "domain": u.domain,
                                "privilege_level": u.privilege_level,
                                "account_status": u.account_status,
                                "password_plaintext": u.password_plaintext,
                                "target_id": u.target_id,
                                "source": u.source,
                                "notes": u.notes,
                                "severity": u.severity,
                                "created_at": u.created_at.isoformat() if u.created_at else None,
                                "updated_at": u.updated_at.isoformat() if u.updated_at else None
                            }
                            for u in discovered_users
                        ],
                        "discovered_files": [
                            {
                                "id": f.id,
                                "filename": f.filename,
                                "file_path": f.file_path,
                                "file_type": f.file_type,
                                "file_size": f.file_size,
                                "file_hash": f.file_hash,
                                "content_preview": f.content_preview,
                                "content_analysis": f.content_analysis,
                                "source": f.source,
                                "severity": f.severity,
                                "notes": f.notes,
                                "tags": f.tags,
                                "is_sensitive": f.is_sensitive,
                                "target_id": f.target_id,
                                "discovered_at": f.discovered_at.isoformat() if f.discovered_at else None,
                                "created_at": f.created_at.isoformat() if f.created_at else None,
                                "updated_at": f.updated_at.isoformat() if f.updated_at else None
                            }
                            for f in discovered_files
                        ]
                    }
                return None
            except Exception as e:
                logger.error(f"Failed to get project {project_id}: {e}")
                return None

    @staticmethod
    async def create_target(project_id: int, data: Dict[str, Any]) -> Target:
        """Create a new target in database"""
        from ..models.database import async_session
        
        async with async_session() as session:
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

                # Auto-sync to Knowledge Graph
                try:
                    from ..services.kg_auto_sync import kg_auto_sync
                    await kg_auto_sync.sync_target_created(session, project_id, target)
                except Exception as e:
                    logger.error(f"Failed to auto-sync target to Knowledge Graph: {e}")


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
        from ..models.database import async_session
        
        async with async_session() as session:
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
        from ..models.database import async_session
        
        async with async_session() as session:
            try:
                finding = KnowledgeNode(
                    project_id=project_id,
                    target_id=data.get("target_id"),  # Add target_id support
                    node_type="finding",
                    node_data={
                        "title": data["title"],
                        "description": data["description"],
                        "severity": data["severity"],
                        "status": data["status"],
                        "target_id": data.get("target_id")  # Store target_id in node_data too
                    },
                    confidence_score=0.8,
                    created_by=data.get("created_by", 1)
                )
                session.add(finding)
                await session.flush()

                # Auto-sync to Knowledge Graph (will create finding-target relationship if target exists)
                try:
                    from ..services.kg_auto_sync import kg_auto_sync
                    await kg_auto_sync.sync_finding_created(session, project_id, finding)
                    logger.info(f"✅ Auto-synced finding {finding.id} to Knowledge Graph")
                except Exception as e:
                    logger.error(f"Failed to auto-sync finding to Knowledge Graph: {e}")

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
        from ..models.database import async_session
        
        async with async_session() as session:
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
        from ..models.database import async_session
        
        async with async_session() as session:
            try:
                tool = Tool(
                    name=data["name"],
                    description=data.get("description"),
                    category=data.get("category", "general"),
                    command_template=data.get("command_template", ""),
                    parameters=data.get("parameters", {}),
                    is_active=True,
                    is_system_tool=False,
                    project_id=project_id,  # Store project_id for project-specific tools
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
        """Get all tools for a project (project-specific tools only)"""
        from ..models.database import async_session
        
        async with async_session() as session:
            try:
                result = await session.execute(
                    select(Tool).where(
                        and_(
                            Tool.is_active == True,
                            Tool.project_id == project_id
                        )
                    )
                )
                return result.scalars().all()
            except Exception as e:
                logger.error(f"Failed to get tools for project {project_id}: {e}")
                return []

    @staticmethod
    async def update_target(target_id: int, data: Dict[str, Any]) -> Optional[Target]:
        """Update a target in database"""
        from ..models.database import async_session
        
        async with async_session() as session:
            try:
                result = await session.execute(
                    select(Target).where(Target.id == target_id)
                )
                target = result.scalar_one_or_none()

                if not target:
                    return None

                # Update fields with proper type conversion
                for key, value in data.items():
                    if hasattr(target, key):
                        # Handle datetime fields
                        if key in ['created_at', 'updated_at'] and isinstance(value, str):
                            try:
                                from datetime import datetime
                                value = datetime.fromisoformat(value.replace('Z', '+00:00'))
                            except ValueError:
                                logger.warning(f"Invalid datetime format for {key}: {value}")
                                continue
                        setattr(target, key, value)

                from datetime import datetime
                target.updated_at = datetime.utcnow()
                
                # Auto-sync to Knowledge Graph
                try:
                    from ..services.kg_auto_sync import kg_auto_sync
                    await kg_auto_sync.sync_target_updated(session, target.project_id, target)
                except Exception as e:
                    logger.error(f"Failed to auto-sync target update to Knowledge Graph: {e}")
                
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
        from ..models.database import async_session
        from sqlalchemy.orm.attributes import flag_modified
        
        async with async_session() as session:
            try:
                result = await session.execute(
                    select(KnowledgeNode).where(KnowledgeNode.id == finding_id)
                )
                finding = result.scalar_one_or_none()

                if not finding:
                    return None

                # Create a new dict to ensure SQLAlchemy detects the change
                updated_node_data = dict(finding.node_data) if finding.node_data else {}
                
                # Update node_data
                if "title" in data:
                    updated_node_data["title"] = data["title"]
                if "description" in data:
                    updated_node_data["description"] = data["description"]
                if "severity" in data:
                    updated_node_data["severity"] = data["severity"]
                if "status" in data:
                    updated_node_data["status"] = data["status"]
                if "target_id" in data:
                    finding.target_id = data["target_id"]
                    updated_node_data["target_id"] = data["target_id"]

                # Assign the new dict and flag as modified
                finding.node_data = updated_node_data
                flag_modified(finding, "node_data")
                
                finding.updated_at = datetime.utcnow()
                
                # Auto-sync to Knowledge Graph
                try:
                    from ..services.kg_auto_sync import kg_auto_sync
                    await kg_auto_sync.sync_finding_updated(session, finding.project_id, finding)
                except Exception as e:
                    logger.error(f"Failed to auto-sync finding update to Knowledge Graph: {e}")
                
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
        from ..models.database import async_session
        from sqlalchemy.orm.attributes import flag_modified
        
        async with async_session() as session:
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
                        # Flag JSON fields as modified to ensure they are saved
                        if key == 'parameters':
                            flag_modified(tool, "parameters")

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
        from ..models.database import async_session
        
        async with async_session() as session:
            try:
                # Get target info before deletion for sync
                result = await session.execute(
                    select(Target).where(Target.id == target_id)
                )
                target = result.scalar_one_or_none()
                
                if not target:
                    return False
                
                # Auto-sync to Knowledge Graph before deletion
                try:
                    from ..services.kg_auto_sync import kg_auto_sync
                    await kg_auto_sync.sync_target_deleted(session, target.project_id, target.id)
                except Exception as e:
                    logger.error(f"Failed to auto-sync target deletion from Knowledge Graph: {e}")
                
                # Delete the target
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
        from ..models.database import async_session
        
        async with async_session() as session:
            try:
                # Get finding info before deletion for sync
                result = await session.execute(
                    select(KnowledgeNode).where(KnowledgeNode.id == finding_id)
                )
                finding = result.scalar_one_or_none()
                
                if not finding:
                    return False
                
                # Auto-sync to Knowledge Graph before deletion
                try:
                    from ..services.kg_auto_sync import kg_auto_sync
                    await kg_auto_sync.sync_finding_deleted(session, finding.project_id, finding)
                except Exception as e:
                    logger.error(f"Failed to auto-sync finding deletion from Knowledge Graph: {e}")
                
                # Delete the finding
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
        from ..models.database import async_session
        
        async with async_session() as session:
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

    @staticmethod
    async def delete_project(project_id: int) -> bool:
        """Delete a project from database"""
        from ..models.database import async_session
        
        async with async_session() as session:
            try:
                # First delete related records in correct order
                
                # 1. Delete Knowledge Graph edges first (foreign key constraints)
                await session.execute(
                    delete(KnowledgeEdge).where(KnowledgeEdge.project_id == project_id)
                )
                
                # 2. Delete Knowledge Graph nodes
                await session.execute(
                    delete(KnowledgeNode).where(KnowledgeNode.project_id == project_id)
                )
                
                # 3. Delete discovered users (with KG auto-sync)
                result = await session.execute(
                    select(DiscoveredUser).where(DiscoveredUser.project_id == project_id)
                )
                discovered_users = result.scalars().all()
                
                for user in discovered_users:
                    # Auto-sync to Knowledge Graph before deletion
                    try:
                        from ..services.kg_auto_sync import kg_auto_sync
                        await kg_auto_sync.sync_user_deleted(session, project_id, user.id)
                    except Exception as e:
                        logger.error(f"Failed to auto-sync user {user.id} deletion: {e}")
                
                await session.execute(
                    delete(DiscoveredUser).where(DiscoveredUser.project_id == project_id)
                )
                
                # 4. Delete discovered files (with KG auto-sync)
                result = await session.execute(
                    select(DiscoveredFile).where(DiscoveredFile.project_id == project_id)
                )
                discovered_files = result.scalars().all()
                
                for file in discovered_files:
                    # Auto-sync to Knowledge Graph before deletion
                    try:
                        from ..services.kg_auto_sync import kg_auto_sync
                        await kg_auto_sync.sync_file_deleted(session, project_id, file.id)
                    except Exception as e:
                        logger.error(f"Failed to auto-sync file {file.id} deletion: {e}")
                
                await session.execute(
                    delete(DiscoveredFile).where(DiscoveredFile.project_id == project_id)
                )
                
                # 5. Delete targets
                await session.execute(
                    delete(Target).where(Target.project_id == project_id)
                )
                
                # 6. Delete tool executions
                await session.execute(
                    delete(ToolExecution).where(ToolExecution.project_id == project_id)
                )
                
                # 7. Delete project-specific tools (set project_id to NULL or delete)
                # We'll mark them as inactive instead of deleting, to preserve execution history
                await session.execute(
                    update(Tool)
                    .where(Tool.project_id == project_id)
                    .values(
                        is_active=False,
                        project_id=None  # Clear project reference
                    )
                )
                
                # 8. Finally delete the project
                result = await session.execute(
                    delete(Project).where(Project.id == project_id)
                )
                await session.commit()
                
                logger.info(f"Successfully deleted project {project_id} and all related data")
                return result.rowcount > 0
            except Exception as e:
                await session.rollback()
                logger.error(f"Failed to delete project {project_id}: {e}")
                return False

# Global database service instance
simple_database_service = SimpleDatabaseService()
