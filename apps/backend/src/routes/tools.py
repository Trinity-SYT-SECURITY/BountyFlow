"""
Tool management API routes for BountyFlow
"""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, delete
from typing import List, Optional, Dict, Any, Tuple
import asyncio
import subprocess
import json
import os
from datetime import datetime
import logging
from ..models.database import get_db, async_session
from ..models.models import Tool, ToolExecution, Project, Target, User, KnowledgeNode, KnowledgeEdge
from ..schemas.tools import (
    ToolCreate,
    ToolUpdate,
    ToolResponse,
    ToolExecutionCreate,
    ToolExecutionResponse,
    ToolChainCreate
)
from ..middleware.auth import verify_token, get_current_user_optional, get_current_user
from ..services.kg_extraction_service import kg_extraction_service
from ..services.neo4j_kg_service import neo4j_kg_service
from ..services.activity_log_service import activity_log_service

logger = logging.getLogger(__name__)

router = APIRouter()


# Background task for KG extraction from tool execution
async def extract_kg_from_tool_execution(
    execution_id: int,
    project_id: int,
    tool_id: int,
    command: str,
    output: str
):
    """
    Background task to extract knowledge graph from tool execution output
    Runs asynchronously after tool execution completes
    """
    try:
        logger.info(f"Starting KG extraction for execution {execution_id}")
        
        # Get tool and target information
        async with async_session() as db:
            # Get tool
            tool_result = await db.execute(
                select(Tool).where(Tool.id == tool_id)
            )
            tool = tool_result.scalar_one_or_none()
            
            if not tool:
                logger.warning(f"Tool {tool_id} not found, skipping KG extraction")
                return
            
            # Get execution details
            exec_result = await db.execute(
                select(ToolExecution).where(ToolExecution.id == execution_id)
            )
            execution = exec_result.scalar_one_or_none()
            
            if not execution:
                logger.warning(f"Execution {execution_id} not found")
                return
            
            # Get target if available
            target_value = None
            if execution.target_id:
                target_result = await db.execute(
                    select(Target).where(Target.id == execution.target_id)
                )
                target = target_result.scalar_one_or_none()
                if target:
                    target_value = target.target_value
            
            # Extract knowledge graph
            graph = await kg_extraction_service.extract_from_tool_output(
                tool_name=tool.name,
                command=command,
                output=output,
                target=target_value,
                context=f"Project ID: {project_id}"
            )
            
            if not graph:
                logger.warning(f"No KG extracted from execution {execution_id}")
                return
            
            # Convert to native format
            native_graph = kg_extraction_service.convert_to_native_format(graph)
            
            # Store nodes in SQLite
            for node_data in native_graph["nodes"]:
                kg_node = KnowledgeNode(
                    project_id=project_id,
                    target_id=execution.target_id,
                    node_type=node_data["type"],
                    node_data={
                        **node_data["data"],
                        "extracted_from_execution": execution_id,
                        "tool_name": tool.name
                    },
                    created_by=execution.executed_by
                )
                db.add(kg_node)

            await db.flush()

            # Create edges — build node_map from ALL project nodes (not just this execution)
            # Index by name, target_value, ip, domain for flexible matching
            node_map = {}  # Map entity names (case-insensitive) to node IDs
            all_nodes_result = await db.execute(
                select(KnowledgeNode).where(KnowledgeNode.project_id == project_id)
            )
            for node in all_nodes_result.scalars():
                if node.node_data:
                    # Index by all identifying fields
                    for field in ["name", "target_value", "ip", "domain", "hostname", "username", "title", "filename"]:
                        val = node.node_data.get(field)
                        if val and isinstance(val, str) and val.strip():
                            node_map[val] = node.id
                            node_map[val.lower()] = node.id

            logger.info(f"Node map for edge creation ({len(node_map)} entries): {list(node_map.keys())[:20]}")

            # Helper for fuzzy node lookup
            def find_node_id(name):
                if not name:
                    return None
                # Exact match
                if name in node_map:
                    return node_map[name]
                # Case-insensitive
                name_lower = name.lower()
                if name_lower in node_map:
                    return node_map[name_lower]
                # Partial match — check if name contains or is contained by a known entity
                for key, nid in node_map.items():
                    if name_lower in key.lower() or key.lower() in name_lower:
                        return nid
                return None

            edges_created = 0
            edges_skipped = 0
            for edge_data in native_graph["edges"]:
                source_name = edge_data["source"]
                target_name = edge_data["target"]
                source_id = find_node_id(source_name)
                target_id = find_node_id(target_name)

                if source_id and target_id:
                    kg_edge = KnowledgeEdge(
                        project_id=project_id,
                        source_node_id=source_id,
                        target_node_id=target_id,
                        edge_type=edge_data["type"],
                        edge_data=edge_data["data"]
                    )
                    db.add(kg_edge)
                    edges_created += 1
                else:
                    logger.warning(
                        f"Edge skipped: '{source_name}' -> '{target_name}' "
                        f"(source_id={source_id}, target_id={target_id})"
                    )
                    edges_skipped += 1

            await db.commit()
            logger.info(f"Edges: {edges_created} created, {edges_skipped} skipped")

            logger.info(
                f"✅ Stored KG from execution {execution_id}: "
                f"{len(native_graph['nodes'])} nodes, {len(native_graph['edges'])} edges"
            )

            # Upload to Neo4j if available
            if neo4j_kg_service.is_available():
                success = await neo4j_kg_service.upload_entities_and_relations(
                    project_id=project_id,
                    entities=graph.get('entities', []),
                    relations=graph.get('relations', [])
                )
                if success:
                    logger.info(f"✅ Uploaded KG to Neo4j for project {project_id}")

            # Broadcast graph update to frontend via WebSocket
            try:
                from ..services.websocket_service import websocket_manager
                await websocket_manager.broadcast_to_project(project_id, {
                    "type": "graph_update",
                    "data": {
                        "execution_id": execution_id,
                        "nodes_added": len(native_graph["nodes"]),
                        "edges_added": len(native_graph["edges"])
                    }
                })
                logger.info(f"Broadcasted graph update for project {project_id}")
            except Exception as ws_err:
                logger.warning(f"Failed to broadcast graph update: {ws_err}")

    except Exception as e:
        logger.error(f"Failed to extract KG from execution {execution_id}: {e}", exc_info=True)


# Background task for creating activity log from tool execution
async def create_activity_log_from_execution(
    execution_id: int,
    project_id: int
):
    """
    Background task to create activity log entry from tool execution
    Runs asynchronously after tool execution completes
    """
    try:
        logger.info(f"Creating activity log for execution {execution_id}")
        
        async with async_session() as db:
            # Get execution details
            exec_result = await db.execute(
                select(ToolExecution).where(ToolExecution.id == execution_id)
            )
            execution = exec_result.scalar_one_or_none()
            
            if not execution:
                logger.warning(f"Execution {execution_id} not found, skipping activity log creation")
                return
            
            # Only create log for completed executions
            if execution.execution_status != "completed":
                logger.info(f"Execution {execution_id} status is {execution.execution_status}, skipping activity log")
                return
            
            # Create activity log
            await activity_log_service.create_from_tool_execution(
                db=db,
                tool_execution=execution,
                analyze_with_ai=True
            )
            
            logger.info(f"Activity log created for execution {execution_id}")
            
    except Exception as e:
        logger.error(f"Error creating activity log from execution {execution_id}: {e}", exc_info=True)


# Utility functions for tool validation
async def check_command_executable(command: str) -> Tuple[bool, str]:
    """
    Check if a command/binary is executable in the system PATH.
    Returns (is_executable: bool, error_message: str)
    """
    try:
        import platform
        import shutil
        
        # Extract the base command (first word before space or special chars)
        base_command = command.split()[0] if command else ""
        
        # Remove any special characters that might be part of the command
        # (e.g., "nmap", "./script.sh", "/usr/bin/tool")
        if not base_command:
            return False, "Empty command"
        
        # Check if it's an absolute path
        if os.path.isabs(base_command):
            if os.path.isfile(base_command) and os.access(base_command, os.X_OK):
                return True, ""
            return False, f"Command not executable or not found: {base_command}"
        
        # Check if command exists in PATH
        command_path = shutil.which(base_command)
        if command_path:
            # Verify it's executable
            if os.access(command_path, os.X_OK):
                return True, ""
            return False, f"Command found but not executable: {command_path}"
        
        return False, f"Command not found in PATH: {base_command}"
        
    except Exception as e:
        logger.error(f"Error checking command executable: {e}")
        return False, f"Error checking command: {str(e)}"

async def extract_base_command(command_template: str) -> str:
    """Extract the base command/binary name from a command template"""
    if not command_template:
        return ""
    
    # Remove placeholders like {target}, {port}, etc.
    import re
    # Remove all {placeholder} patterns
    cleaned = re.sub(r'\{[^}]+\}', '', command_template)
    
    # Get first word (the command/binary)
    parts = cleaned.strip().split()
    return parts[0] if parts else ""

async def validate_and_get_tool(
    tool_id: int,
    db: AsyncSession,
    create_if_missing: bool = False,
    tool_name: Optional[str] = None,
    command_template: Optional[str] = None,
    project_id: Optional[int] = None
) -> Tuple[Optional[Tool], bool, str]:
    """
    Validate tool exists and optionally create if missing.
    Returns (tool, was_created, error_message)
    """
    # Try to get existing tool
    tool_result = await db.execute(select(Tool).where(Tool.id == tool_id))
    tool = tool_result.scalar_one_or_none()
    
    if tool:
        # Tool exists, verify it's executable
        base_cmd = await extract_base_command(tool.command_template or "")
        if base_cmd:
            is_executable, error_msg = await check_command_executable(base_cmd)
            if not is_executable:
                logger.warning(f"Tool {tool_id} command may not be executable: {error_msg}")
                # Don't fail, just warn - might work if path is set differently at runtime
        return tool, False, ""
    
    # Tool doesn't exist
    if not create_if_missing:
        return None, False, f"Tool {tool_id} not found"
    
    # Create tool if requested (requires additional info)
    if not tool_name or not command_template:
        return None, False, f"Tool {tool_id} not found and insufficient data to create (need name and command_template)"
    
    try:
        # Use existing create_tool logic
        from ..schemas.tools import ToolCreate, ToolCategory
        from ..middleware.auth import get_current_user_optional
        
        tool_data = ToolCreate(
            name=tool_name,
            description=f"Auto-created tool for command: {command_template}",
            category=ToolCategory.general if hasattr(ToolCategory, 'general') else "general",
            command_template=command_template,
            parameters={}
        )
        
        # Check if executable before creating
        base_cmd = await extract_base_command(command_template)
        if base_cmd:
            is_executable, error_msg = await check_command_executable(base_cmd)
            if not is_executable:
                logger.warning(f"Creating tool but command may not be executable: {error_msg}")
        
        # Create the tool using existing function logic
        new_tool = Tool(
            name=tool_data.name,
            description=tool_data.description,
            category=tool_data.category.value if hasattr(tool_data.category, 'value') else str(tool_data.category),
            command_template=tool_data.command_template,
            parameters=tool_data.parameters or {},
            is_active=True,
            is_system_tool=False,
            project_id=project_id,
            created_by=1  # Default user, could be enhanced
        )
        
        db.add(new_tool)
        await db.commit()
        await db.refresh(new_tool)
        
        logger.info(f"Auto-created tool {new_tool.id} for command: {command_template}")
        return new_tool, True, ""
        
    except Exception as e:
        await db.rollback()
        logger.error(f"Error auto-creating tool: {e}")
        return None, False, f"Failed to create tool: {str(e)}"

@router.get("/", response_model=List[ToolResponse])
async def get_tools(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional),
    category: Optional[str] = None,
    is_system: Optional[bool] = None,
    search: Optional[str] = None,
    project_id: Optional[int] = None
):
    """Get all available tools (global tools + project-specific tools if project_id provided)"""
    try:
        query = select(Tool).where(Tool.is_active == True)
        
        # If project_id provided, show project tools + global tools (project_id is None)
        # Otherwise, show all tools
        if project_id:
            query = query.where(
                or_(
                    Tool.project_id == project_id,
                    Tool.project_id.is_(None)  # Global tools
                )
            )
        
        if category:
            query = query.where(Tool.category == category)
        if is_system is not None:
            query = query.where(Tool.is_system_tool == is_system)
        if search:
            query = query.where(
                or_(
                    Tool.name.ilike(f"%{search}%"),
                    Tool.description.ilike(f"%{search}%")
                )
            )
        
        result = await db.execute(query)
        tools = result.scalars().all()
        
        # Get project info for project-specific tools
        tools_with_project = []
        for tool in tools:
            project_name = None
            if tool.project_id:
                project_result = await db.execute(select(Project).where(Project.id == tool.project_id))
                project = project_result.scalar_one_or_none()
                project_name = project.name if project else None
            
            # Ensure created_by is an integer, not a string
            created_by_int = None
            if tool.created_by is not None:
                if isinstance(tool.created_by, int):
                    created_by_int = tool.created_by
                elif isinstance(tool.created_by, str):
                    # Try to parse as int, or look up user ID
                    try:
                        created_by_int = int(tool.created_by)
                    except ValueError:
                        # If it's a username, look up user ID
                        user_result = await db.execute(select(User).where(User.username == tool.created_by))
                        user = user_result.scalar_one_or_none()
                        created_by_int = user.id if user else None
            
            tools_with_project.append(ToolResponse(
                id=tool.id,
                name=tool.name,
                description=tool.description or "",
                category=tool.category or "general",  # Default to "general" if None
                command_template=tool.command_template or "",
                parameters=tool.parameters or {},
                is_system_tool=tool.is_system_tool or False,
                created_by=created_by_int,
                created_at=tool.created_at,
                project_id=tool.project_id,
                project_name=project_name,
            dependencies=[]
            ))
        
        return tools_with_project
    except Exception as e:
        logger.error(f"Error getting tools: {e}")
        return []

@router.post("/", response_model=ToolResponse, status_code=status.HTTP_201_CREATED)
async def create_tool(
    tool_data: ToolCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional),
    project_id: Optional[int] = Query(None)  # Optional: None = global tool (from query parameter)
):
    """Create a new custom tool (global if project_id is None, project-specific otherwise)"""
    try:
        user_id = 1
        if current_user and isinstance(current_user, dict):
            if "user_id" in current_user and isinstance(current_user["user_id"], int):
                user_id = current_user["user_id"]
            elif "username" in current_user:
                user_result = await db.execute(select(User).where(User.username == current_user["username"]))
                user = user_result.scalar_one_or_none()
                if user:
                    user_id = user.id
        
        tool = Tool(
        name=tool_data.name,
        description=tool_data.description,
            category=tool_data.category.value if hasattr(tool_data.category, 'value') else str(tool_data.category),
        command_template=tool_data.command_template,
            parameters=tool_data.parameters or {},
            is_active=True,
        is_system_tool=False,
            project_id=project_id,  # None for global tools
            created_by=user_id
        )
        
        db.add(tool)
        await db.commit()
        await db.refresh(tool)
        
        project_name = None
        if tool.project_id:
            project_result = await db.execute(select(Project).where(Project.id == tool.project_id))
            project = project_result.scalar_one_or_none()
            project_name = project.name if project else None
        
        # Ensure created_by is an integer
        created_by_int = None
        if tool.created_by is not None:
            if isinstance(tool.created_by, int):
                created_by_int = tool.created_by
            elif isinstance(tool.created_by, str):
                try:
                    created_by_int = int(tool.created_by)
                except ValueError:
                    user_result = await db.execute(select(User).where(User.username == tool.created_by))
                    user = user_result.scalar_one_or_none()
                    created_by_int = user.id if user else None
        
        return ToolResponse(
            id=tool.id,
            name=tool.name,
            description=tool.description or "",
            category=tool.category or "general",
            command_template=tool.command_template or "",
            parameters=tool.parameters or {},
            is_system_tool=tool.is_system_tool or False,
            created_by=created_by_int,
            created_at=tool.created_at,
            project_id=tool.project_id,
            project_name=project_name,
        dependencies=[]
    )
    except Exception as e:
        await db.rollback()
        logger.error(f"Error creating tool: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def _tool_response(db: AsyncSession, tool: Tool) -> ToolResponse:
    """Shape a Tool row the way every tool endpoint returns it."""
    project_name = None
    if tool.project_id:
        project_result = await db.execute(select(Project).where(Project.id == tool.project_id))
        project = project_result.scalar_one_or_none()
        project_name = project.name if project else None

    created_by_int = None
    if tool.created_by is not None:
        if isinstance(tool.created_by, int):
            created_by_int = tool.created_by
        elif isinstance(tool.created_by, str):
            try:
                created_by_int = int(tool.created_by)
            except ValueError:
                user_result = await db.execute(select(User).where(User.username == tool.created_by))
                user = user_result.scalar_one_or_none()
                created_by_int = user.id if user else None

    return ToolResponse(
        id=tool.id,
        name=tool.name,
        description=tool.description or "",
        category=tool.category or "general",
        command_template=tool.command_template or "",
        parameters=tool.parameters or {},
        is_system_tool=tool.is_system_tool or False,
        created_by=created_by_int,
        created_at=tool.created_at,
        project_id=tool.project_id,
        project_name=project_name,
        dependencies=[]
    )


@router.get("/{tool_id}", response_model=ToolResponse)
async def get_tool(
    tool_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Get a specific tool by ID"""
    result = await db.execute(select(Tool).where(Tool.id == tool_id))
    tool = result.scalar_one_or_none()
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool {tool_id} not found")
    return await _tool_response(db, tool)

@router.put("/{tool_id}", response_model=ToolResponse)
async def update_tool(
    tool_id: int,
    tool_data: ToolUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Update a tool. Only the fields present in the body are touched."""
    try:
        result = await db.execute(select(Tool).where(Tool.id == tool_id))
        tool = result.scalar_one_or_none()
        if not tool:
            raise HTTPException(status_code=404, detail=f"Tool {tool_id} not found")

        updates = tool_data.model_dump(exclude_unset=True) if hasattr(tool_data, "model_dump") \
            else tool_data.dict(exclude_unset=True)
        for field, value in updates.items():
            if value is None:
                continue
            if field == "category":
                value = value.value if hasattr(value, "value") else str(value)
            setattr(tool, field, value)

        await db.commit()
        await db.refresh(tool)
        logger.info(f"Updated tool {tool_id}: {sorted(updates.keys())}")
        return await _tool_response(db, tool)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating tool {tool_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{tool_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tool(
    tool_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Delete a tool. Executions keep their own copy of the command they ran."""
    try:
        result = await db.execute(select(Tool).where(Tool.id == tool_id))
        tool = result.scalar_one_or_none()
        if not tool:
            raise HTTPException(status_code=404, detail=f"Tool {tool_id} not found")
        if tool.is_system_tool:
            raise HTTPException(status_code=403, detail="System tools cannot be deleted")
        await db.delete(tool)
        await db.commit()
        logger.info(f"Deleted tool {tool_id}")
        return None
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error deleting tool {tool_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/executions/{execution_id}")
async def get_tool_execution_details(
    execution_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Get detailed execution results including output"""
    try:
        logger.info(f"Fetching execution details for execution_id: {execution_id}")
        result = await db.execute(
            select(ToolExecution).where(ToolExecution.id == execution_id)
        )
        execution = result.scalar_one_or_none()
        
        if not execution:
            logger.warning(f"Execution {execution_id} not found in database")
            raise HTTPException(status_code=404, detail=f"Execution {execution_id} not found")
        
        logger.info(f"Found execution {execution_id}: status={execution.execution_status}")
        
        return {
            "id": execution.id,
            "project_id": execution.project_id,
            "tool_id": execution.tool_id,
            "execution_status": execution.execution_status,
            "command_executed": execution.command_executed,
            "output": execution.output or "",
            "error_output": execution.error_output or "",
            "exit_code": execution.exit_code,
            "start_time": execution.start_time.isoformat() if execution.start_time else None,
            "end_time": execution.end_time.isoformat() if execution.end_time else None,
            "created_at": execution.created_at.isoformat() if execution.created_at else None
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting execution details for {execution_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/projects/{project_id}/tools/execute", response_model=ToolExecutionResponse, status_code=status.HTTP_201_CREATED)
async def execute_tools(
    project_id: int,
    execution_data: ToolChainCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Execute a chain of tools on project targets"""
    try:
        # Get user ID
        user_id = 1  # Default
        if current_user and isinstance(current_user, dict):
            if "user_id" in current_user and isinstance(current_user["user_id"], int):
                user_id = current_user["user_id"]
            elif "username" in current_user:
                user_result = await db.execute(select(User).where(User.username == current_user["username"]))
                user = user_result.scalar_one_or_none()
                if user:
                    user_id = user.id
        
        # Verify project exists
        project_result = await db.execute(select(Project).where(Project.id == project_id))
        project = project_result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get tool IDs from execution_data - support both ToolChainCreate format
        tool_ids = []
        if hasattr(execution_data, 'tools') and isinstance(execution_data.tools, list):
            # ToolChainCreate format: tools is a list of ToolExecutionBase
            tool_ids = [tool.tool_id for tool in execution_data.tools if hasattr(tool, 'tool_id')]
        elif hasattr(execution_data, 'tool_ids'):
            # Alternative format: tool_ids list
            tool_ids = execution_data.tool_ids if isinstance(execution_data.tool_ids, list) else []
        
        if not tool_ids:
            raise HTTPException(status_code=400, detail="No tools specified in execution data")
        
        # Get first tool to create execution record
        tool_result = await db.execute(select(Tool).where(Tool.id == tool_ids[0]))
        tool = tool_result.scalar_one_or_none()
        if not tool:
            raise HTTPException(status_code=404, detail=f"Tool {tool_ids[0]} not found")
        
        # Build command string from tool template and parameters
        command_str = tool.command_template  # Use tool's command template
        
        def apply_params_to_cmd(cmd, params):
            base_cmd = cmd.split()[0] if cmd else ""
            infra_tools = ['nmap', 'masscan', 'rustscan', 'ping', 'dig', 'nslookup', 'host']
            from urllib.parse import urlparse
            import re
            
            if params:
                enhanced_params = params.copy() if hasattr(params, 'copy') else dict(params)
                for key, value in params.items():
                    if key != 'command' and isinstance(value, str) and value.startswith(('http://', 'https://')):
                        parsed = urlparse(value)
                        domain_only = parsed.hostname
                        if base_cmd in infra_tools and domain_only:
                            enhanced_params[key] = domain_only
                for key, value in enhanced_params.items():
                    if key != 'command' and value:
                        cmd = cmd.replace(f'{{{key}}}', str(value))
            
            # Magic fallback for explicitly embedded URLs
            if base_cmd in infra_tools:
                urls = re.findall(r'https?://[^\s\"\']+', cmd)
                for url in urls:
                    parsed = urlparse(url)
                    if parsed.hostname:
                        cmd = cmd.replace(url, parsed.hostname)
                        
            return cmd

        if hasattr(execution_data, 'tools') and execution_data.tools:
            # Try to get command from first tool's parameters if available
            first_tool_data = execution_data.tools[0]
            if hasattr(first_tool_data, 'parameters') and isinstance(first_tool_data.parameters, dict):
                if 'command' in first_tool_data.parameters:
                    command_str = first_tool_data.parameters['command']
                command_str = apply_params_to_cmd(command_str, first_tool_data.parameters)
            elif isinstance(first_tool_data, dict) and 'parameters' in first_tool_data:
                if 'command' in first_tool_data['parameters']:
                    command_str = first_tool_data['parameters']['command']
                command_str = apply_params_to_cmd(command_str, first_tool_data['parameters'])
        
        # Also apply global parameters
        if hasattr(execution_data, 'parameters') and isinstance(execution_data.parameters, dict):
            command_str = apply_params_to_cmd(command_str, execution_data.parameters)
        
        # Extract target_id from the first tool in the chain
        target_id = None
        if hasattr(execution_data, 'tools') and execution_data.tools:
            first_tool = execution_data.tools[0]
            if hasattr(first_tool, 'target_id') and first_tool.target_id:
                target_id = first_tool.target_id
            elif isinstance(first_tool, dict) and first_tool.get('target_id'):
                target_id = first_tool['target_id']

        # Create tool execution record
        execution = ToolExecution(
            project_id=project_id,
            tool_id=tool.id,
            target_id=target_id,
            executed_by=user_id,
            command_executed=command_str,
            execution_status="pending",
            start_time=datetime.utcnow(),
            end_time=None,
            created_at=datetime.utcnow()
        )
        
        db.add(execution)
        await db.commit()
        await db.refresh(execution)
        
        logger.info(f"Created tool execution record: id={execution.id}, project_id={project_id}, tool_id={tool.id}, status={execution.execution_status}")
        
        # Create audit log
        try:
            from ..models.models import AuditLog
            audit_log = AuditLog(
                user_id=user_id,
                project_id=project_id,
                action="tool_executed",
                resource_type="tool_execution",
                entity_id=str(execution.id),
                details={
                    "tool_id": tool.id,
                    "tool_name": tool.name,
                    "tool_ids": tool_ids,
                    "execution_status": "pending"
                },
                timestamp=datetime.utcnow()
            )
            db.add(audit_log)
            await db.commit()
        except Exception as e:
            logger.error(f"Failed to create audit log for tool execution: {e}")
        
        # Schedule background execution with full execution data for command building
        background_tasks.add_task(
            execute_tool_chain, 
            execution.id, 
            project_id, 
            tool_ids, 
            execution_data.parameters or {},
            execution_data  # Pass full execution_data for command building
        )
        
        return ToolExecutionResponse(
            id=execution.id,
            project_id=project_id,
            tool_id=tool_ids[0] if tool_ids else None,  # Include first tool_id (most executions have one tool)
            execution_status=execution.execution_status,
            start_time=execution.start_time,
            end_time=execution.end_time,  # Include end_time (may be None for pending/running)
            created_at=execution.created_at
        )
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error executing tools: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def execute_tool_chain(
    execution_id: int,
    project_id: int,
    tool_ids: List[int],
    parameters: Dict[str, Any],
    execution_data: Any = None
):
    """Execute a chain of tools (background task)"""
    from ..models.database import async_session
    from ..services.websocket_service import websocket_manager

    async with async_session() as db:
        try:
            # Update execution status to running
            from sqlalchemy import update
            await db.execute(
                update(ToolExecution)
                .where(ToolExecution.id == execution_id)
                .values(execution_status='running')
            )
            await db.commit()
            
            # Import datetime here to avoid circular imports
            from datetime import datetime

            # Execute each tool in sequence
            for idx, tool_id in enumerate(tool_ids):
                # Get tool details with validation
                tool = None
                tool_created = False
                
                # Try to get tool info from execution_data for auto-creation
                tool_name = None
                tool_command = None
                if execution_data and hasattr(execution_data, 'tools') and execution_data.tools:
                    if idx < len(execution_data.tools):
                        tool_data = execution_data.tools[idx]
                        if hasattr(tool_data, 'parameters') and isinstance(tool_data.parameters, dict):
                            tool_command = tool_data.parameters.get('command')
                
                # Validate and optionally create tool
                tool, tool_created, error_msg = await validate_and_get_tool(
                    tool_id=tool_id,
                    db=db,
                    create_if_missing=False,  # Set to True to auto-create, but be careful with this
                    tool_name=tool_name,
                    command_template=tool_command,
                    project_id=project_id
                )
                
                if not tool:
                    error_msg = error_msg or f"Tool {tool_id} not found"
                    logger.error(error_msg)
                    # Update execution status to failed
                    await db.execute(
                        update(ToolExecution)
                        .where(ToolExecution.id == execution_id)
                        .values(
                            execution_status='failed',
                            end_time=datetime.utcnow(),
                            error_output=f"Tool validation failed: {error_msg}"
                        )
                    )
                    await db.commit()
                    await websocket_manager.send_execution_status(
                        execution_id, 
                        'failed', 
                        {'error': error_msg}
                    )
                    continue
                
                # Verify command is executable (warning only, don't fail)
                base_cmd = await extract_base_command(tool.command_template or "")
                if base_cmd:
                    is_executable, exec_error = await check_command_executable(base_cmd)
                    if not is_executable:
                        logger.warning(f"Tool {tool_id} ({tool.name}) command may not be executable: {exec_error}")
                        # Send warning via WebSocket but continue execution
                        await websocket_manager.send_execution_status(
                            execution_id,
                            'running',
                            {'warning': f'Command may not be executable: {exec_error}. Proceeding anyway...'}
                        )
                
                # Build command from template and parameters
                command = tool.command_template
                
                # Get tool-specific parameters from execution_data if available
                tool_params = parameters.copy() if parameters else {}
                if execution_data and hasattr(execution_data, 'tools') and execution_data.tools:
                    if idx < len(execution_data.tools):
                        tool_data = execution_data.tools[idx]
                        if hasattr(tool_data, 'parameters') and isinstance(tool_data.parameters, dict):
                            tool_params.update(tool_data.parameters)
                        elif isinstance(tool_data, dict) and 'parameters' in tool_data:
                            tool_params.update(tool_data['parameters'])
                        
                        # If command is provided directly, use it
                        if hasattr(tool_data, 'parameters') and isinstance(tool_data.parameters, dict):
                            if 'command' in tool_data.parameters:
                                command = tool_data.parameters['command']
                        elif isinstance(tool_data, dict) and 'parameters' in tool_data:
                            if 'command' in tool_data['parameters']:
                                command = tool_data['parameters']['command']
                
                # Prepare tool info
                from urllib.parse import urlparse
                import re
                base_cmd_tool = command.split()[0] if command else ""
                infra_tools_list = ['nmap', 'masscan', 'rustscan', 'ping', 'dig', 'nslookup', 'host']

                # Replace placeholders in command
                if tool_params:
                    enhanced_params = tool_params.copy()
                    for key, value in tool_params.items():
                        if key != 'command' and isinstance(value, str) and value.startswith(('http://', 'https://')):
                            parsed = urlparse(value)
                            domain_only = parsed.hostname
                            
                            if base_cmd_tool in infra_tools_list and domain_only:
                                enhanced_params[key] = domain_only
                                
                    for key, value in enhanced_params.items():
                        if key != 'command' and value:  # Skip 'command' key and empty values
                            command = command.replace(f'{{{key}}}', str(value))
                            
                # Magic fallback URL stripping for heavily hardcoded URLs inside command inputs
                if base_cmd_tool in infra_tools_list:
                    urls = re.findall(r'https?://[^\s\"\']+', command)
                    for url in urls:
                        parsed = urlparse(url)
                        if parsed.hostname:
                            command = command.replace(url, parsed.hostname)
                
                # For commands with multiple statements (semicolons), ensure each flushes
                # Wrap command to force immediate flushing of each statement
                if ';' in command or '&&' in command or '||' in command:
                    # Split by semicolons and wrap each to ensure flushing
                    # Use a wrapper that forces unbuffered output for each command
                    import re
                    # Don't split inside quotes
                    parts = re.split(r';(?=(?:[^"\']|"[^"]*"|\'[^\']*\')*$)', command)
                    if len(parts) > 1:
                        # Wrap each part to ensure it flushes
                        wrapped_parts = []
                        for part in parts:
                            part = part.strip()
                            if part:
                                # Add explicit flush for echo commands
                                if part.strip().startswith('echo '):
                                    # Ensure echo flushes immediately
                                    wrapped_parts.append(f"{part}; printf ''")
                                else:
                                    wrapped_parts.append(part)
                        command = '; '.join(wrapped_parts)
                
                logger.info(f"Executing tool {tool_id} with command: {command}")
                
                # Actually execute the tool in terminal/CMD (pass command for WebSocket display)
                await execute_tool_actual(execution_id, tool_id, command, db, project_id, command)

            logger.info(f"Tool chain execution {execution_id} completed successfully")

        except Exception as e:
            logger.error(f"Tool chain execution {execution_id} failed: {str(e)}")
            # Update execution status to failed
            from sqlalchemy import update
            from datetime import datetime
            try:
                await db.execute(
                    update(ToolExecution)
                    .where(ToolExecution.id == execution_id)
                    .values(
                        execution_status='failed',
                        end_time=datetime.utcnow(),
                        error_output=str(e)
                    )
                )
                await db.commit()
            except:
                pass

async def execute_tool_actual(execution_id: int, tool_id: int, command: str, db: AsyncSession, project_id: int, display_command: str = None):
    """Actually execute a tool command and capture output with WebSocket streaming"""
    try:
        import platform
        import asyncio
        from sqlalchemy import update
        from datetime import datetime
        from ..services.websocket_service import websocket_manager
        
        # Update status to running and notify via WebSocket
        await db.execute(
            update(ToolExecution)
            .where(ToolExecution.id == execution_id)
            .values(
                execution_status='running',
                start_time=datetime.utcnow()
            )
        )
        await db.commit()
        # Use display_command if provided, otherwise use command
        cmd_to_display = display_command if display_command else command
        await websocket_manager.send_execution_status(execution_id, 'running', {'command': cmd_to_display})
        
        logger.info(f"Executing tool {tool_id} with command: {command}")
        
        # Determine OS and execute command
        system = platform.system().lower()

        # Prepare environment with unbuffered output
        import os
        env = os.environ.copy()
        env['PYTHONUNBUFFERED'] = '1'
        env['UNBUFFERED'] = '1'
        # Force line buffering for stdout/stderr
        # Note: STDBUF env var doesn't work, but we use stdbuf command if available

        # Execute command and capture output
        if system == 'windows':
            # Windows - execute command directly
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                shell=True,
                executable='cmd.exe',
                env=env,
                bufsize=0  # Unbuffered
            )
        else:
            # Linux/Mac - use script command or unbuffer to force unbuffered output
            # This creates a pseudo-terminal which forces line buffering
            import shlex

            # Try multiple approaches for unbuffered output:
            # 1. Use 'script' command (available on most Unix systems)
            # 2. Use 'unbuffer' from expect package
            # 3. Use stdbuf as fallback
            # 4. Finally just use bash with specific flags

            wrapped_command = None

            # Try script command first (most reliable for pseudo-terminal)
            try:
                check_script = await asyncio.create_subprocess_shell(
                    'which script > /dev/null 2>&1',
                    shell=True
                )
                await check_script.wait()
                if check_script.returncode == 0:
                    # Use script with -q (quiet) and -c to execute command
                    # -f forces immediate flush (Linux)
                    # On macOS, script uses different flags - try both
                    # Linux: script -q -f -c "cmd" /dev/null
                    # macOS: script -q /dev/null cmd (no -f flag)
                    import platform
                    if platform.system().lower() == 'darwin':
                        # macOS - use script with flush option
                        wrapped_command = f"script -q /dev/null bash -c {shlex.quote(command)}"
                    else:
                        # Linux - use script with -f for flush
                        wrapped_command = f"script -q -f -c {shlex.quote(command)} /dev/null"
            except:
                pass

            # If script didn't work, try unbuffer
            if not wrapped_command:
                try:
                    check_unbuffer = await asyncio.create_subprocess_shell(
                        'which unbuffer > /dev/null 2>&1',
                        shell=True
                    )
                    await check_unbuffer.wait()
                    if check_unbuffer.returncode == 0:
                        wrapped_command = f"unbuffer sh -c {shlex.quote(command)}"
                except:
                    pass

            # If unbuffer didn't work, try stdbuf
            if not wrapped_command:
                try:
                    check_stdbuf = await asyncio.create_subprocess_shell(
                        'which stdbuf > /dev/null 2>&1',
                        shell=True
                    )
                    await check_stdbuf.wait()
                    if check_stdbuf.returncode == 0:
                        # Use stdbuf with line buffering and zero input buffer for immediate output
                        wrapped_command = f"stdbuf -oL -eL -i0 bash -c {shlex.quote(command)}"
                except:
                    pass

            # Final fallback: use bash with unbuffered output
            if not wrapped_command:
                # Use bash with explicit unbuffering
                # Set PYTHONUNBUFFERED and use stdbuf if available, otherwise use bash with -u flag
                # Wrap command to ensure unbuffered output
                wrapped_command = f"bash -c 'set -u; {command}'"
                # Try to add stdbuf if available (even if we didn't find it earlier, it might work)
                try:
                    check_stdbuf = await asyncio.create_subprocess_shell(
                        'which stdbuf > /dev/null 2>&1',
                        shell=True
                    )
                    await check_stdbuf.wait()
                    if check_stdbuf.returncode == 0:
                        wrapped_command = f"stdbuf -oL -eL -i0 bash -c {shlex.quote(command)}"
                except:
                    pass

            # Execute the wrapped command (use shell=True to execute the wrapped command string)
            process = await asyncio.create_subprocess_shell(
                wrapped_command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                shell=True,  # Use shell to execute the wrapped command
                env=env,
                bufsize=0  # Unbuffered
            )

        # Stream output in real-time (line-by-line for better responsiveness)
        output_chunks = []
        error_chunks = []

        async def read_stream(stream, stream_type):
            """Read from stream and send via WebSocket in real-time with aggressive flushing"""
            chunks = []
            buffer = b''
            last_send_time = asyncio.get_event_loop().time()
            flush_interval = 0.05  # Flush buffer every 50ms for more responsive streaming

            while True:
                try:
                    # Read very small chunks (16 bytes) for maximum responsiveness
                    chunk = await asyncio.wait_for(stream.read(16), timeout=0.05)
                    if not chunk:
                        # Flush any remaining buffer
                        if buffer:
                            decoded = buffer.decode('utf-8', errors='ignore')
                            chunks.append(decoded)
                            await websocket_manager.send_execution_output(execution_id, decoded, stream_type)
                        break

                    buffer += chunk
                    current_time = asyncio.get_event_loop().time()
                    time_since_last_send = current_time - last_send_time

                    # Send immediately if we have a newline
                    if b'\n' in buffer:
                        parts = buffer.split(b'\n', 1)
                        line = parts[0] + b'\n'
                        buffer = parts[1]
                        decoded = line.decode('utf-8', errors='ignore')
                        chunks.append(decoded)
                        await websocket_manager.send_execution_output(execution_id, decoded, stream_type)
                        last_send_time = current_time
                    # Send if buffer is getting large (32 bytes for faster streaming)
                    elif len(buffer) >= 32:
                        decoded = buffer.decode('utf-8', errors='ignore')
                        chunks.append(decoded)
                        await websocket_manager.send_execution_output(execution_id, decoded, stream_type)
                        buffer = b''
                        last_send_time = current_time
                    # Send if we haven't sent anything in a while (flush interval) - more aggressive
                    elif buffer and time_since_last_send >= flush_interval:
                        decoded = buffer.decode('utf-8', errors='ignore')
                        chunks.append(decoded)
                        await websocket_manager.send_execution_output(execution_id, decoded, stream_type)
                        buffer = b''
                        last_send_time = current_time

                except asyncio.TimeoutError:
                    # Timeout means no data available, but check if we should flush buffer
                    current_time = asyncio.get_event_loop().time()
                    time_since_last_send = current_time - last_send_time
                    if buffer and time_since_last_send >= flush_interval:
                        decoded = buffer.decode('utf-8', errors='ignore')
                        chunks.append(decoded)
                        await websocket_manager.send_execution_output(execution_id, decoded, stream_type)
                        buffer = b''
                        last_send_time = current_time
                    continue
                except Exception as e:
                    logger.error(f"Error reading stream: {e}")
                    # Flush buffer on error
                    if buffer:
                        decoded = buffer.decode('utf-8', errors='ignore')
                        chunks.append(decoded)
                        await websocket_manager.send_execution_output(execution_id, decoded, stream_type)
                    break

            return ''.join(chunks)

        # Read stdout and stderr concurrently
        stdout_task = asyncio.create_task(read_stream(process.stdout, 'stdout'))
        stderr_task = asyncio.create_task(read_stream(process.stderr, 'stderr'))

        # Wait for both streams to finish
        output, error_output = await asyncio.gather(stdout_task, stderr_task)

        # Wait for process to complete
        exit_code = await process.wait()
        
        # Combine stdout and stderr for full output (no labels, just merge)
        full_output = output
        if error_output:
            # Append stderr without labels, just add newline if needed
            if output and not output.endswith('\n'):
                full_output += '\n'
            full_output += error_output
        
        # Update execution record with results
        final_status = 'completed' if exit_code == 0 else 'failed'
        await db.execute(
            update(ToolExecution)
            .where(ToolExecution.id == execution_id)
            .values(
                execution_status=final_status,
                end_time=datetime.utcnow(),
                output=full_output,
                error_output=error_output,
                exit_code=exit_code
            )
        )
        await db.commit()
        
        # Send final status via WebSocket
        await websocket_manager.send_execution_status(
            execution_id, 
            final_status, 
            {'exit_code': exit_code, 'output_length': len(full_output)}
        )
        
        logger.info(f"Tool {tool_id} executed with exit code {exit_code}. Output length: {len(full_output)}")
        
        # Extract knowledge graph from tool output (async background task)
        if final_status == 'completed' and full_output:
            # Extract knowledge graph from tool output (background task)
            asyncio.create_task(
                extract_kg_from_tool_execution(
                    execution_id=execution_id,
                    project_id=project_id,
                    tool_id=tool_id,
                    command=command,
                    output=full_output
                )
            )
            
            # Create activity log entry (background task)
            asyncio.create_task(
                create_activity_log_from_execution(
                    execution_id=execution_id,
                    project_id=project_id
                )
            )
        
        return output, error_output, exit_code
        
    except Exception as e:
        logger.error(f"Error executing tool {tool_id}: {e}", exc_info=True)
        # Update execution status to failed
        from sqlalchemy import update
        from datetime import datetime
        error_msg = str(e)
        await db.execute(
            update(ToolExecution)
            .where(ToolExecution.id == execution_id)
            .values(
                execution_status='failed',
                end_time=datetime.utcnow(),
                error_output=error_msg,
                exit_code=-1
            )
        )
        await db.commit()
        raise

@router.get("/projects/{project_id}/tools/executions", response_model=List[ToolExecutionResponse])
async def get_tool_executions(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Get tool execution history for a project - shows all executions for the project"""
    try:
        # Show all executions for the project (no user filter - all team members see all)
        query = select(ToolExecution).where(ToolExecution.project_id == project_id)
        query = query.order_by(ToolExecution.created_at.desc()).limit(200)
        
        result = await db.execute(query)
        executions = result.scalars().all()
        
        logger.info(f"Found {len(executions)} tool executions for project {project_id}")
        
        return [
            ToolExecutionResponse(
                id=exec.id,
                project_id=exec.project_id,
                tool_id=exec.tool_id,  # Include tool_id in response
                execution_status=exec.execution_status,
                start_time=exec.start_time,
                end_time=exec.end_time,
                created_at=exec.created_at
            )
            for exec in executions
        ]
    except Exception as e:
        logger.error(f"Error getting tool executions: {e}", exc_info=True)
        return []

@router.delete("/executions/{execution_id}")
async def delete_tool_execution(
    execution_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Delete a tool execution - requires authentication, no ownership restriction"""
    try:
        # Get execution
        result = await db.execute(
            select(ToolExecution).where(ToolExecution.id == execution_id)
        )
        execution = result.scalar_one_or_none()

        if not execution:
            raise HTTPException(status_code=404, detail="Tool execution not found")

        # current_user is guaranteed to be authenticated by get_current_user dependency
        user_id = current_user.get("user_id")
        logger.info(f"Delete execution {execution_id} by user {current_user.get('username')} (id={user_id})")

        # Clean up KG nodes/edges linked to this execution
        kg_nodes = await db.execute(
            select(KnowledgeNode).where(KnowledgeNode.source_tool_id == execution_id)
        )
        node_ids = [n.id for n in kg_nodes.scalars().all()]
        if node_ids:
            await db.execute(
                delete(KnowledgeEdge).where(
                    or_(
                        KnowledgeEdge.source_node_id.in_(node_ids),
                        KnowledgeEdge.target_node_id.in_(node_ids)
                    )
                )
            )
            await db.execute(
                delete(KnowledgeNode).where(KnowledgeNode.id.in_(node_ids))
            )

        # Delete the execution
        await db.execute(delete(ToolExecution).where(ToolExecution.id == execution_id))
        await db.commit()

        return {"message": "Tool execution deleted successfully", "id": execution_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting tool execution: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete tool execution: {str(e)}")


@router.delete("/executions/project/{project_id}")
async def delete_all_project_executions(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Delete all tool executions for a project and their associated KG data"""
    try:
        logger.info(f"Deleting all executions for project {project_id} by user {current_user.get('username')}")

        # Get all execution IDs for this project
        exec_result = await db.execute(
            select(ToolExecution.id).where(ToolExecution.project_id == project_id)
        )
        exec_ids = [row[0] for row in exec_result.all()]

        if not exec_ids:
            return {"message": "No executions to delete", "deleted": 0}

        # Clean up KG nodes/edges linked to these executions
        kg_nodes = await db.execute(
            select(KnowledgeNode).where(KnowledgeNode.source_tool_id.in_(exec_ids))
        )
        node_ids = [n.id for n in kg_nodes.scalars().all()]
        if node_ids:
            await db.execute(
                delete(KnowledgeEdge).where(
                    or_(
                        KnowledgeEdge.source_node_id.in_(node_ids),
                        KnowledgeEdge.target_node_id.in_(node_ids)
                    )
                )
            )
            await db.execute(
                delete(KnowledgeNode).where(KnowledgeNode.id.in_(node_ids))
            )

        # Delete all executions
        await db.execute(
            delete(ToolExecution).where(ToolExecution.project_id == project_id)
        )
        await db.commit()

        return {
            "message": f"Deleted {len(exec_ids)} executions and {len(node_ids)} KG nodes",
            "deleted_executions": len(exec_ids),
            "deleted_kg_nodes": len(node_ids)
        }
    except Exception as e:
        logger.error(f"Error deleting all executions: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete executions: {str(e)}")


@router.get("/executions/{execution_id}")
async def get_tool_execution_details_v2(
    execution_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Get detailed execution results including output - only if owned by current user"""
    try:
        logger.info(f"Fetching execution details for execution_id: {execution_id}")
        result = await db.execute(
            select(ToolExecution).where(ToolExecution.id == execution_id)
        )
        execution = result.scalar_one_or_none()
        
        if not execution:
            logger.warning(f"Execution {execution_id} not found in database")
            raise HTTPException(status_code=404, detail=f"Execution {execution_id} not found")
        
        # IMPORTANT: Verify ownership before returning details
        user_id = None
        if current_user and isinstance(current_user, dict):
            if "user_id" in current_user and isinstance(current_user["user_id"], int):
                user_id = current_user["user_id"]
            elif "id" in current_user and isinstance(current_user["id"], int):
                user_id = current_user["id"]
        
        if user_id and execution.executed_by != user_id:
            logger.warning(f"User {user_id} attempted to access execution {execution_id} owned by user {execution.executed_by}")
            raise HTTPException(
                status_code=403,
                detail="You can only view your own tool executions"
            )
        
        logger.info(f"Found execution {execution_id}: status={execution.execution_status}")
        
        return {
            "id": execution.id,
            "project_id": execution.project_id,
            "tool_id": execution.tool_id,
            "execution_status": execution.execution_status,
            "command_executed": execution.command_executed,
            "output": execution.output or "",
            "error_output": execution.error_output or "",
            "exit_code": execution.exit_code,
            "start_time": execution.start_time.isoformat() if execution.start_time else None,
            "end_time": execution.end_time.isoformat() if execution.end_time else None,
            "created_at": execution.created_at.isoformat() if execution.created_at else None
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting execution details for {execution_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
