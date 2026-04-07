"""
Project management API routes for BountyFlow
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from typing import List, Optional
from datetime import datetime

from ..models.database import get_db
from ..models.models import Project, User, Target, KnowledgeNode, DiscoveredUser, AuditLog, Tool
from ..schemas.projects import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectListResponse,
    TargetCreate,
    TargetResponse
)
from ..middleware.auth import verify_token, get_current_user_optional
from ..services.neo4j_service import neo4j_service
from ..services.simple_database_service import simple_database_service
import logging

logger = logging.getLogger(__name__)

# Mock function for development
def get_current_user():
    """Mock function for development - returns a test user"""
    return {"user_id": "test_user", "username": "test_user"}

router = APIRouter()

@router.get("/", response_model=List[ProjectResponse])
async def get_projects(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
    status_filter: Optional[str] = None,
    company_filter: Optional[str] = None
):
    """Get all projects accessible to the current user"""
    projects = await simple_database_service.get_projects()
    return projects

@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Create a new project"""
    try:
        # Get user ID from current_user
        user_id = 1  # Default user ID
        if current_user and isinstance(current_user, dict):
            # Try to get user ID from the user dict or lookup by username
            if "user_id" in current_user and isinstance(current_user["user_id"], int):
                user_id = current_user["user_id"]
            elif "username" in current_user:
                # Lookup user by username
                user_result = await db.execute(select(User).where(User.username == current_user["username"]))
                user = user_result.scalar_one_or_none()
                if user:
                    user_id = user.id
        
        # Create project in database
        project = await simple_database_service.create_project({
            "name": project_data.name,
            "description": project_data.description,
            "company_name": project_data.company_name,
            "target_scope": project_data.target_scope,
            "out_of_scope": project_data.out_of_scope,
            "status": "active",
            "created_by": user_id
        })
        
        # Create audit log
        try:
            audit_log = AuditLog(
                user_id=user_id,
                project_id=project.get("id") if isinstance(project, dict) else project.id,
                action="project_created",
                resource_type="project",
                entity_id=str(project.get("id") if isinstance(project, dict) else project.id),
                details={
                    "project_name": project_data.name,
                    "company_name": project_data.company_name or ""
                },
                timestamp=datetime.utcnow()
            )
            db.add(audit_log)
            await db.commit()
        except Exception as e:
            logger.error(f"Failed to create audit log: {e}")
            # Don't fail the request if audit log fails

        return project
    except Exception as e:
        await db.rollback()
        logger.error(f"Error creating project: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get a specific project by ID"""
    project = await simple_database_service.get_project_by_id(project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return project

@router.put("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    project_data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Update a project"""
    # Mock implementation for development
    return ProjectResponse(
        id=project_id,
        name=project_data.name or "Updated Project",
        description=project_data.description or "Updated description",
        company_name=project_data.company_name or "Updated Company",
        target_scope={"in_scope": ["example.com"]},
        out_of_scope={"out_of_scope": ["*.google.com"]},
        status=project_data.status or "active",
        created_by=1,
        created_at=datetime.utcnow(),
        targets=[],
        users=[{"id": 1, "username": "test_user"}]
    )

@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Delete a project"""
    success = await simple_database_service.delete_project(project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
    return None

@router.post("/{project_id}/targets", response_model=TargetResponse, status_code=status.HTTP_201_CREATED)
async def add_target(
    project_id: int,
    target_data: TargetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Add a target to a project"""
    try:
        # Get user ID
        user_id = 1
        if current_user and isinstance(current_user, dict):
            if "user_id" in current_user and isinstance(current_user["user_id"], int):
                user_id = current_user["user_id"]
            elif "username" in current_user:
                user_result = await db.execute(select(User).where(User.username == current_user["username"]))
                user = user_result.scalar_one_or_none()
                if user:
                    user_id = user.id
        
        # Create target in database
        target = await simple_database_service.create_target(project_id, {
            "target_type": target_data.target_type,
            "target_value": target_data.target_value,
            "priority": target_data.priority,
            "notes": target_data.notes,
            "status": "pending"
        })
        
        # Create audit log
        try:
            target_id = target.get("id") if isinstance(target, dict) else target.id
            audit_log = AuditLog(
                user_id=user_id,
                project_id=project_id,
                action="target_created",
                resource_type="target",
                entity_id=str(target_id),
                details={
                    "target_type": target_data.target_type,
                    "target_value": target_data.target_value
                },
                timestamp=datetime.utcnow()
            )
            db.add(audit_log)
            await db.commit()
        except Exception as e:
            logger.error(f"Failed to create audit log for target: {e}")

        return target
    except Exception as e:
        await db.rollback()
        logger.error(f"Error creating target: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{project_id}/findings", response_model=dict, status_code=status.HTTP_201_CREATED)
async def add_finding(
    project_id: int,
    finding_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Add a finding to a project"""
    try:
        # Get user ID
        user_id = 1
        if current_user and isinstance(current_user, dict):
            if "user_id" in current_user and isinstance(current_user["user_id"], int):
                user_id = current_user["user_id"]
            elif "username" in current_user:
                user_result = await db.execute(select(User).where(User.username == current_user["username"]))
                user = user_result.scalar_one_or_none()
                if user:
                    user_id = user.id
        
        # Create finding in database
        finding = await simple_database_service.create_finding(project_id, {
            "title": finding_data.get("title"),
            "description": finding_data.get("description"),
            "severity": finding_data.get("severity"),
            "status": finding_data.get("status"),
            "target_id": finding_data.get("target_id"),
            "created_by": user_id
        })
        
        # Create audit log
        try:
            finding_id = finding.id if hasattr(finding, 'id') else None
            audit_log = AuditLog(
                user_id=user_id,
                project_id=project_id,
                action="finding_submitted",
                resource_type="finding",
                entity_id=str(finding_id) if finding_id else None,
                details={
                    "title": finding_data.get("title"),
                    "severity": finding_data.get("severity", "info")
                },
                timestamp=datetime.utcnow()
            )
            db.add(audit_log)
            await db.commit()
        except Exception as e:
            logger.error(f"Failed to create audit log for finding: {e}")

        return finding.node_data if hasattr(finding, 'node_data') else {"id": finding_id, "status": "created"}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error creating finding: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{project_id}/tools", response_model=dict, status_code=status.HTTP_201_CREATED)
async def add_tool(
    project_id: int,
    tool_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Add a tool to a project"""
    # Create tool in database
    tool = await simple_database_service.create_tool(project_id, {
        "name": tool_data.get("name"),
        "description": tool_data.get("description"),
        "command_template": tool_data.get("command"),
        "category": tool_data.get("category", "general"),
        "parameters": tool_data.get("parameters", {}),  # Include parameters (with selected_targets)
        "created_by": current_user.get("user_id", 1)
    })

    return {
        "id": tool.id,
        "name": tool.name,
        "description": tool.description,
        "command": tool.command_template,
        "category": tool.category,
        "parameters": tool.parameters or {},  # Return parameters
        "created_at": tool.created_at.isoformat()
    }

# Scan endpoint - must be defined before generic routes to ensure proper matching
@router.post("/{project_id}/targets/{target_id}/scan")
async def scan_target(
    project_id: int,
    target_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Scan a target to check connectivity/availability using Python modules only"""
    import asyncio
    import socket
    from urllib.parse import urlparse
    
    try:
        # Get target from database
        result = await db.execute(select(Target).where(
            and_(Target.id == target_id, Target.project_id == project_id)
        ))
        target = result.scalar_one_or_none()
        
        if not target:
            raise HTTPException(status_code=404, detail="Target not found")
        
        # Update status to scanning
        target.status = "scanning"
        await db.commit()
        await db.refresh(target)
        
        target_value = target.target_value.strip()
        target_type = target.target_type.lower()

        # For URL targets, parse the hostname out of the URL
        resolve_target = target_value
        is_url = target_type == 'url' or target_value.startswith(('http://', 'https://'))
        parsed_url = None
        if is_url:
            parsed_url = urlparse(target_value if '://' in target_value else f'https://{target_value}')
            resolve_target = parsed_url.hostname or target_value

        # Initialize scan results
        scan_result = {
            "ping": {"reachable": False, "response_time": None, "error": None},
            "port_80": {"open": False, "response_time": None, "error": None},
            "port_443": {"open": False, "response_time": None, "error": None},
            "http_check": {"reachable": False, "status_code": None, "response_time": None, "error": None},
            "scanned_at": datetime.utcnow().isoformat(),
            "target_value": target_value,
            "target_type": target_type
        }

        # Resolve hostname to IP (simulates ping reachability check)
        host_ip = None
        try:
            host_ip = socket.gethostbyname(resolve_target)
            scan_result["ping"]["reachable"] = True
            scan_result["ping"]["response_time"] = "DNS resolved"
        except socket.gaierror:
            scan_result["ping"]["error"] = f"DNS resolution failed for '{resolve_target}'"
        except Exception as e:
            scan_result["ping"]["error"] = f"Host resolution failed: {str(e)}"

        # For URL targets, also do an HTTP reachability check
        if is_url:
            try:
                import httpx
                check_url = target_value if '://' in target_value else f'https://{target_value}'
                start_time = asyncio.get_event_loop().time()
                async with httpx.AsyncClient(timeout=5.0, verify=False, follow_redirects=True) as client:
                    resp = await client.get(check_url)
                response_time = (asyncio.get_event_loop().time() - start_time) * 1000
                scan_result["http_check"]["reachable"] = True
                scan_result["http_check"]["status_code"] = resp.status_code
                scan_result["http_check"]["response_time"] = f"{response_time:.0f}ms"
            except ImportError:
                # httpx not installed, try urllib
                try:
                    import urllib.request
                    import ssl
                    check_url = target_value if '://' in target_value else f'https://{target_value}'
                    ctx = ssl.create_default_context()
                    ctx.check_hostname = False
                    ctx.verify_mode = ssl.CERT_NONE
                    start_time = asyncio.get_event_loop().time()
                    req = urllib.request.Request(check_url, method='GET')
                    req.add_header('User-Agent', 'BountyFlow/1.0')
                    resp = await asyncio.get_event_loop().run_in_executor(
                        None, lambda: urllib.request.urlopen(req, timeout=5, context=ctx)
                    )
                    response_time = (asyncio.get_event_loop().time() - start_time) * 1000
                    scan_result["http_check"]["reachable"] = True
                    scan_result["http_check"]["status_code"] = resp.status
                    scan_result["http_check"]["response_time"] = f"{response_time:.0f}ms"
                except Exception as e:
                    scan_result["http_check"]["error"] = f"HTTP check failed: {str(e)}"
            except Exception as e:
                scan_result["http_check"]["error"] = f"HTTP check failed: {str(e)}"

        # If we got an IP, proceed with port checks
        if host_ip:
            # Check port 80 (HTTP)
            try:
                start_time = asyncio.get_event_loop().time()
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(3.0)
                result_code = sock.connect_ex((host_ip, 80))
                response_time = (asyncio.get_event_loop().time() - start_time) * 1000
                sock.close()
                
                if result_code == 0:
                    scan_result["port_80"]["open"] = True
                    scan_result["port_80"]["response_time"] = f"{response_time:.0f}ms"
                else:
                    scan_result["port_80"]["error"] = "Port 80 closed or filtered"
            except socket.timeout:
                scan_result["port_80"]["error"] = "Port 80 connection timeout"
            except Exception as e:
                scan_result["port_80"]["error"] = f"Port 80 check failed: {str(e)}"
            
            # Check port 443 (HTTPS)
            try:
                start_time = asyncio.get_event_loop().time()
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(3.0)
                result_code = sock.connect_ex((host_ip, 443))
                response_time = (asyncio.get_event_loop().time() - start_time) * 1000
                sock.close()
                
                if result_code == 0:
                    scan_result["port_443"]["open"] = True
                    scan_result["port_443"]["response_time"] = f"{response_time:.0f}ms"
                else:
                    scan_result["port_443"]["error"] = "Port 443 closed or filtered"
            except socket.timeout:
                scan_result["port_443"]["error"] = "Port 443 connection timeout"
            except Exception as e:
                scan_result["port_443"]["error"] = f"Port 443 check failed: {str(e)}"
        
        # Determine overall online status
        is_online = (
            scan_result["ping"]["reachable"] or
            scan_result["port_80"]["open"] or
            scan_result["port_443"]["open"] or
            scan_result["http_check"]["reachable"]
        )
        
        # Update target status based on scan result
        if is_online:
            target.status = "active"
        else:
            target.status = "offline"
        
        # Store structured scan results in dedicated JSON column
        target.scan_results = scan_result

        # Clean up legacy scan data from notes if present
        if target.notes:
            import re
            scan_pattern = r'^\s*\[Scan[^\]]*\].*?(?:Ping|ping):.*?Port\s*80:.*?Port\s*443:.*$'
            lines = target.notes.split('\n')
            filtered_lines = [line for line in lines if not re.match(scan_pattern, line.strip(), re.IGNORECASE)]
            cleaned_notes = '\n'.join(filtered_lines).strip()
            target.notes = cleaned_notes if cleaned_notes else None
        
        target.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(target)
        
        return {
            "target_id": target_id,
            "online": is_online,
            "status": target.status,
            "scan_result": scan_result
        }
            
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error scanning target {target_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to scan target: {str(e)}")

@router.delete("/{project_id}/targets/{target_id}")
async def delete_target(
    project_id: int,
    target_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Delete a target from a project"""
    success = await simple_database_service.delete_target(target_id)
    if not success:
        raise HTTPException(status_code=404, detail="Target not found")
        
    # Auto-sync to Knowledge Graph
    try:
        from ..services.kg_auto_sync import kg_auto_sync
        await kg_auto_sync.sync_target_deleted(db, project_id, target_id)
        await db.commit()
    except Exception as e:
        logger.error(f"Failed to auto-sync target deletion to Knowledge Graph: {e}")
        
    return {"message": "Target deleted successfully"}

@router.delete("/{project_id}/findings/{finding_id}")
async def delete_finding(
    project_id: int,
    finding_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Delete a finding from a project"""
    success = await simple_database_service.delete_finding(finding_id)
    if not success:
        raise HTTPException(status_code=404, detail="Finding not found")
        
    # Auto-sync to Knowledge Graph
    try:
        from ..services.kg_auto_sync import kg_auto_sync
        # Create a dummy object since sync_finding_deleted expects a KnowledgeNode with an id
        class DummyFinding:
            pass
        dummy = DummyFinding()
        dummy.id = finding_id
        await kg_auto_sync.sync_finding_deleted(db, project_id, dummy)
        await db.commit()
    except Exception as e:
        logger.error(f"Failed to auto-sync finding deletion to Knowledge Graph: {e}")
        
    return {"message": "Finding deleted successfully"}

@router.delete("/{project_id}/tools/{tool_id}")
async def delete_tool(
    project_id: int,
    tool_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Delete a tool from a project"""
    success = await simple_database_service.delete_tool(tool_id)
    if not success:
        raise HTTPException(status_code=404, detail="Tool not found")
    return {"message": "Tool deleted successfully"}

@router.put("/{project_id}/targets/{target_id}")
async def update_target(
    project_id: int,
    target_id: int,
    target_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Update a target in a project"""
    try:
        target = await simple_database_service.update_target(target_id, target_data)
        if not target:
            raise HTTPException(status_code=404, detail="Target not found")
        
        # Auto-sync to Knowledge Graph
        try:
            from ..services.kg_auto_sync import kg_auto_sync
            await kg_auto_sync.sync_target_updated(db, project_id, target)
            await db.commit()
        except Exception as e:
            logger.error(f"Failed to auto-sync target update to Knowledge Graph: {e}")
        
        # Return complete target data with proper format
        return {
            "id": target.id,
            "project_id": target.project_id,
            "target_type": target.target_type,
            "target_value": target.target_value,
            "status": target.status,
            "priority": target.priority,
            "notes": target.notes,
            "scan_results": target.scan_results,
            "created_at": target.created_at.isoformat() if target.created_at else None,
            "updated_at": target.updated_at.isoformat() if target.updated_at else None
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update target: {str(e)}")

@router.put("/{project_id}/findings/{finding_id}")
async def update_finding(
    project_id: int,
    finding_id: int,
    finding_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Update a finding in a project"""
    finding = await simple_database_service.update_finding(finding_id, finding_data)
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    
    # Auto-sync to Knowledge Graph
    try:
        from ..services.kg_auto_sync import kg_auto_sync
        await kg_auto_sync.sync_finding_updated(db, project_id, finding)
        await db.commit()
    except Exception as e:
        logger.error(f"Failed to auto-sync finding update to Knowledge Graph: {e}")
    
    # Return complete finding data with id
    return {
        "id": finding.id,
        "project_id": finding.project_id,
        "node_type": finding.node_type,
        "target_id": finding.target_id,
        **finding.node_data,
        "created_at": finding.created_at.isoformat() if finding.created_at else None,
        "updated_at": finding.updated_at.isoformat() if finding.updated_at else None
    }

@router.put("/{project_id}/tools/{tool_id}")
async def update_tool(
    project_id: int,
    tool_id: int,
    tool_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Update a tool in a project"""
    try:
        # First verify the tool exists and belongs to this project (or is global)
        result = await db.execute(
            select(Tool).where(
                and_(
                    Tool.id == tool_id,
                    or_(
                        Tool.project_id == project_id,
                        Tool.project_id.is_(None)  # Global tools
                    )
                )
            )
        )
        tool = result.scalar_one_or_none()
        
        if not tool:
            raise HTTPException(status_code=404, detail="Tool not found")
        
        # Map frontend field names to database field names
        update_data = {}
        if 'name' in tool_data:
            update_data['name'] = tool_data['name']
        if 'description' in tool_data:
            update_data['description'] = tool_data.get('description') or ''
        if 'command' in tool_data:
            # Frontend uses 'command', backend uses 'command_template'
            update_data['command_template'] = tool_data['command']
        elif 'command_template' in tool_data:
            update_data['command_template'] = tool_data['command_template']
        if 'category' in tool_data:
            update_data['category'] = tool_data['category']
        if 'parameters' in tool_data:
            update_data['parameters'] = tool_data['parameters']
        
        # Update the tool
        updated_tool = await simple_database_service.update_tool(tool_id, update_data)
        if not updated_tool:
            raise HTTPException(status_code=500, detail="Failed to update tool")
        
        return {
            "id": updated_tool.id,
            "name": updated_tool.name,
            "description": updated_tool.description,
            "command": updated_tool.command_template,
            "command_template": updated_tool.command_template,
            "category": updated_tool.category,
            "parameters": updated_tool.parameters or {},
            "created_at": updated_tool.created_at.isoformat() if updated_tool.created_at else None,
            "updated_at": updated_tool.updated_at.isoformat() if updated_tool.updated_at else None
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating tool {tool_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update tool: {str(e)}")

@router.get("/{project_id}/targets", response_model=List[TargetResponse])
async def get_project_targets(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get all targets for a project"""
    targets = await simple_database_service.get_project_targets(project_id)
    return targets

@router.get("/{project_id}/findings", response_model=List[dict])
async def get_project_findings(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get all findings for a project"""
    findings = await simple_database_service.get_project_findings(project_id)
    return [finding.node_data for finding in findings]

@router.get("/{project_id}/tools", response_model=List[dict])
async def get_project_tools(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get all tools for a project"""
    tools = await simple_database_service.get_project_tools(project_id)
    return [
        {
            "id": tool.id,
            "name": tool.name,
            "description": tool.description,
            "command": tool.command_template,
            "command_template": tool.command_template,
            "category": tool.category,
            "parameters": tool.parameters or {},  # Include parameters
            "created_at": tool.created_at.isoformat()
        }
        for tool in tools
    ]

@router.put("/{project_id}/discovered-users/{user_id}")
async def update_discovered_user(
    project_id: int,
    user_id: int,
    user_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Update a discovered user in a project"""
    try:
        # Get existing user
        result = await db.execute(
            select(DiscoveredUser).where(
                and_(DiscoveredUser.id == user_id, DiscoveredUser.project_id == project_id)
            )
        )
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(status_code=404, detail="Discovered user not found")
        
        from sqlalchemy.orm.attributes import flag_modified
        
        # Update user fields
        for field, value in user_data.items():
            if hasattr(user, field) and value is not None:
                setattr(user, field, value)
                # Flag JSON fields as modified to ensure they are saved
                if field == 'additional_info':
                    flag_modified(user, "additional_info")
        
        # Save updated_at timestamp
        from datetime import datetime
        user.updated_at = datetime.utcnow()
        
        # Commit changes to database first
        await db.commit()
        await db.refresh(user)  # Refresh to get latest data
        
        # Auto-sync to Knowledge Graph AFTER commit and refresh
        try:
            from ..services.kg_auto_sync import kg_auto_sync
            await kg_auto_sync.sync_user_updated(db, project_id, user)
            # Commit sync changes
            await db.commit()
        except Exception as e:
            logger.error(f"Failed to auto-sync user update to Knowledge Graph: {e}", exc_info=True)
            # Don't fail the update if sync fails, but log the error
        
        return {
            "id": user.id,
            "project_id": user.project_id,
            "target_id": user.target_id,
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email,
            "domain": user.domain,
            "privilege_level": user.privilege_level,
            "account_status": user.account_status,
            "source": user.source,
            "notes": user.notes,
            "severity": user.severity,
            "created_at": user.created_at,
            "updated_at": user.updated_at
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update discovered user: {str(e)}")

@router.delete("/{project_id}/discovered-users/{user_id}")
async def delete_discovered_user(
    project_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Delete a discovered user from a project"""
    try:
        # Get existing user
        result = await db.execute(
            select(DiscoveredUser).where(
                and_(DiscoveredUser.id == user_id, DiscoveredUser.project_id == project_id)
            )
        )
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(status_code=404, detail="Discovered user not found")
        
        # Delete the user
        await db.delete(user)
        await db.commit()
        
        return {"message": "Discovered user deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete discovered user: {str(e)}")
