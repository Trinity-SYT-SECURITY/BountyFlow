from fastapi import APIRouter, HTTPException, Depends
from ..middleware.auth import get_current_user_optional
from typing import Dict, Any, List
from ..services.neo4j_service import neo4j_service
import logging

logger = logging.getLogger(__name__)

# Mock function for development
def get_current_user(current_user: dict = Depends(get_current_user_optional)):
    """Resolve the caller from the bearer token.

    This used to be a hardcoded stub returning test_user, which silently made
    every endpoint in this module unauthenticated. It now delegates to the real
    dependency: anonymous is still allowed by default so local development keeps
    working, and setting REQUIRE_AUTH=true makes a valid token mandatory.
    """
    return current_user

router = APIRouter()

async def cleanup_duplicate_nodes(graph_data: Dict[str, Any], project_id: int) -> Dict[str, Any]:
    """Clean up duplicate nodes in graph data"""
    try:
        nodes = graph_data.get('nodes', [])
        relationships = graph_data.get('relationships', [])

        if not nodes:
            return graph_data

        # Group nodes by type and unique identifier
        node_groups = {
            'file': {},
            'user': {},
            'finding': {},
            'target': {}
        }

        # Identify duplicates
        duplicates_to_remove = set()

        for node in nodes:
            node_type = node.get('type', '').lower()
            if node_type not in node_groups:
                continue

            # Get unique identifier for each type
            unique_id = None
            node_data = node.get('node_data', {})

            if node_type == 'file':
                unique_id = node_data.get('discovered_file_id')
            elif node_type == 'user':
                unique_id = node_data.get('discovered_user_id')
            elif node_type == 'finding':
                unique_id = node_data.get('finding_id')
            elif node_type == 'target':
                unique_id = node_data.get('target_id') or node.get('id')

            if unique_id is not None:
                if unique_id in node_groups[node_type]:
                    # This is a duplicate - keep the first one, mark others for removal
                    existing_node = node_groups[node_type][unique_id]
                    print(f"Found duplicate {node_type} node: {node['id']} (duplicate of {existing_node['id']})")
                    duplicates_to_remove.add(node['id'])
                else:
                    node_groups[node_type][unique_id] = node

        # Remove duplicate nodes
        cleaned_nodes = [node for node in nodes if node['id'] not in duplicates_to_remove]

        # Update relationships to use the kept nodes (fix broken references)
        id_mapping = {}
        for node in nodes:
            if node['id'] in duplicates_to_remove:
                continue

            node_type = node.get('type', '').lower()
            if node_type in node_groups:
                node_data = node.get('node_data', {})
                if node_type == 'file':
                    unique_id = node_data.get('discovered_file_id')
                elif node_type == 'user':
                    unique_id = node_data.get('discovered_user_id')
                elif node_type == 'finding':
                    unique_id = node_data.get('finding_id')
                elif node_type == 'target':
                    unique_id = node_data.get('target_id') or node.get('id')

                if unique_id in node_groups[node_type]:
                    id_mapping[node['id']] = node_groups[node_type][unique_id]['id']

        # Update relationships with correct node IDs
        cleaned_relationships = []
        for rel in relationships:
            source_id = rel.get('from') or rel.get('source')
            target_id = rel.get('to') or rel.get('target')

            if source_id in id_mapping:
                source_id = id_mapping[source_id]
            if target_id in id_mapping:
                target_id = id_mapping[target_id]

            # Only keep relationships where both nodes still exist
            if source_id in [n['id'] for n in cleaned_nodes] and target_id in [n['id'] for n in cleaned_nodes]:
                cleaned_relationships.append({
                    **rel,
                    'from': source_id,
                    'to': target_id
                })

        result = {
            **graph_data,
            'nodes': cleaned_nodes,
            'relationships': cleaned_relationships,
            'totalNodes': len(cleaned_nodes),
            'totalRelationships': len(cleaned_relationships)
        }

        if duplicates_to_remove:
            print(f"Cleaned up {len(duplicates_to_remove)} duplicate nodes for project {project_id}")

        return result

    except Exception as e:
        logger.error(f"Failed to cleanup duplicate nodes: {e}")
        return graph_data

@router.post("/graph/{project_id}/cleanup-duplicates")
async def cleanup_duplicate_nodes_endpoint(
    project_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Clean up duplicate nodes in project's knowledge graph"""
    try:
        # Get current graph data
        graph_data = await neo4j_service.get_project_graph_from_db(project_id)

        # Clean up duplicates
        cleaned_data = await cleanup_duplicate_nodes(graph_data, project_id)

        # Clear cache to ensure fresh data. The cache is a module-level dict with
        # its own invalidator; reaching for it as an attribute of the service
        # raised AttributeError and turned every cleanup into a 500.
        from ..services.neo4j_service import invalidate_graph_cache
        invalidate_graph_cache(project_id)

        return {
            "message": "Duplicate nodes cleaned up successfully",
            "originalNodes": len(graph_data.get('nodes', [])),
            "cleanedNodes": len(cleaned_data.get('nodes', [])),
            "originalRelationships": len(graph_data.get('relationships', [])),
            "cleanedRelationships": len(cleaned_data.get('relationships', [])),
            "duplicatesRemoved": len(graph_data.get('nodes', [])) - len(cleaned_data.get('nodes', []))
        }

    except Exception as e:
        logger.error(f"Failed to cleanup duplicates for project {project_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to cleanup duplicates: {str(e)}")

@router.get("/graph/{project_id}")
async def get_project_graph(
    project_id: int,
    force_refresh: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Get project's knowledge graph with timeout and error handling"""
    try:
        # Add timeout protection
        import asyncio
        if force_refresh:
            # Force refresh by calling the non-cached method
            graph_data = await asyncio.wait_for(
                neo4j_service.get_project_graph_from_db(project_id),
                timeout=10.0  # 10 second timeout
            )
        else:
            graph_data = await asyncio.wait_for(
                neo4j_service.get_project_graph_cached(project_id),
                timeout=10.0  # 10 second timeout
            )

        # Clean up duplicate nodes in the response
        cleaned_data = await cleanup_duplicate_nodes(graph_data, project_id)
        return cleaned_data
    except asyncio.TimeoutError:
        logger.error(f"Timeout getting project graph for project {project_id}")
        # Return empty graph instead of crashing
        return {
            'nodes': [],
            'relationships': [],
            'totalNodes': 0,
            'totalRelationships': 0,
            'error': 'Request timeout - graph data is too large or database is slow'
        }
    except Exception as e:
        logger.error(f"Failed to get project graph for project {project_id}: {e}")
        # Return empty graph instead of crashing
        return {
            'nodes': [],
            'relationships': [],
            'totalNodes': 0,
            'totalRelationships': 0,
            'error': f'Failed to load graph data: {str(e)}'
        }

async def _record_node(project_id: int, node_type: str, node_data: Dict[str, Any],
                       current_user: dict) -> None:
    """Write a node into the store GET /graph/{project_id} actually reads.

    The four writers below hand their node to Neo4j, but the reader builds its
    answer from the knowledge_nodes table, so anything written through the API
    answered "added successfully" and was never seen again. Writing both keeps
    the two stores saying the same thing.
    """
    from ..models.database import async_session
    from ..models.models import KnowledgeNode, User
    from sqlalchemy import select

    async with async_session() as db:
        created_by = None
        if current_user:
            created_by = current_user.get("user_id")
            if created_by is None and current_user.get("username"):
                row = await db.execute(
                    select(User.id).where(User.username == current_user["username"]))
                created_by = row.scalar_one_or_none()
        if created_by is None:
            row = await db.execute(select(User.id).order_by(User.id).limit(1))
            created_by = row.scalar_one_or_none()

        target_id = node_data.get("target_id")
        db.add(KnowledgeNode(
            project_id=project_id,
            target_id=target_id if isinstance(target_id, int) else None,
            node_type=node_type,
            node_data=node_data,
            created_by=created_by,
        ))
        await db.commit()

    from ..services.neo4j_service import invalidate_graph_cache
    invalidate_graph_cache(project_id)

@router.post("/graph/{project_id}/user")
async def add_user_to_graph(project_id: int, user_data: Dict[str, Any], current_user: dict = Depends(get_current_user)):
    """Add user to project graph"""
    try:
        neo4j_service.add_user_node(project_id, user_data)
        await _record_node(project_id, "user", user_data, current_user)
        return {"message": "User added to graph successfully"}
    except Exception as e:
        logger.error(f"Failed to add user to graph: {e}")
        raise HTTPException(status_code=500, detail="Failed to add user to graph")

@router.post("/graph/{project_id}/server")
async def add_server_to_graph(project_id: int, server_data: Dict[str, Any], current_user: dict = Depends(get_current_user)):
    """Add server to project graph"""
    try:
        neo4j_service.add_server_node(project_id, server_data)
        await _record_node(project_id, "server", server_data, current_user)
        return {"message": "Server added to graph successfully"}
    except Exception as e:
        logger.error(f"Failed to add server to graph: {e}")
        raise HTTPException(status_code=500, detail="Failed to add server to graph")

@router.post("/graph/{project_id}/target")
async def add_target_to_graph(project_id: int, target_data: Dict[str, Any], current_user: dict = Depends(get_current_user)):
    """Add target to project graph"""
    try:
        neo4j_service.add_target_node(project_id, target_data)
        await _record_node(project_id, "target", target_data, current_user)
        return {"message": "Target added to graph successfully"}
    except Exception as e:
        logger.error(f"Failed to add target to graph: {e}")
        raise HTTPException(status_code=500, detail="Failed to add target to graph")

@router.post("/graph/{project_id}/finding")
async def add_finding_to_graph(project_id: int, finding_data: Dict[str, Any], current_user: dict = Depends(get_current_user)):
    """Add finding to project graph"""
    try:
        neo4j_service.add_finding_node(project_id, finding_data)
        await _record_node(project_id, "finding", finding_data, current_user)
        return {"message": "Finding added to graph successfully"}
    except Exception as e:
        logger.error(f"Failed to add finding to graph: {e}")
        raise HTTPException(status_code=500, detail="Failed to add finding to graph")

@router.post("/graph/{project_id}/relationship")
async def create_relationship(
    project_id: int,
    from_node: str,
    to_node: str,
    relationship_type: str,
    properties: Dict[str, Any] = None,
    current_user: dict = Depends(get_current_user)
):
    """Create relationship between nodes"""
    try:
        await neo4j_service.create_relationship(project_id, from_node, to_node, relationship_type, properties)
        return {"message": "Relationship created successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create relationship: {e}")
        raise HTTPException(status_code=500, detail="Failed to create relationship")

@router.get("/graph/{project_id}/attack-paths")
async def get_attack_paths(project_id: int, current_user: dict = Depends(get_current_user)):
    """Get attack paths"""
    try:
        paths = await neo4j_service.get_attack_paths(project_id)
        return {"attack_paths": paths}
    except Exception as e:
        logger.error(f"Failed to get attack paths: {e}")
        raise HTTPException(status_code=500, detail="Failed to get attack paths")

@router.get("/graph/{project_id}/critical-nodes")
async def get_critical_nodes(project_id: int, current_user: dict = Depends(get_current_user)):
    """Get critical nodes"""
    try:
        nodes = await neo4j_service.get_critical_nodes(project_id)
        return {"critical_nodes": nodes}
    except Exception as e:
        logger.error(f"Failed to get critical nodes: {e}")
        raise HTTPException(status_code=500, detail="Failed to get critical nodes")

@router.put("/graph/{project_id}/node/{node_id}/position")
async def update_node_position(
    project_id: int,
    node_id: str,
    x: float,
    y: float,
    current_user: dict = Depends(get_current_user)
):
    """Update node position"""
    try:
        await neo4j_service.update_node_position(project_id, node_id, x, y)
        return {"message": "Node position updated successfully"}
    except LookupError:
        raise HTTPException(status_code=404, detail="Node not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to update node position: {e}")
        raise HTTPException(status_code=500, detail="Failed to update node position")

@router.delete("/graph/{project_id}/node/{node_id}")
async def delete_node(project_id: int, node_id: str, current_user: dict = Depends(get_current_user)):
    """Delete node"""
    try:
        await neo4j_service.delete_node(project_id, node_id)
        return {"message": "Node deleted successfully"}
    except LookupError:
        raise HTTPException(status_code=404, detail="Node not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to delete node: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete node")


@router.post("/graph/{project_id}/init")
async def initialize_project_graph(project_id: int, project_name: str, current_user: dict = Depends(get_current_user)):
    """Initialize project graph"""
    try:
        neo4j_service.create_project_graph(project_id, project_name)
        return {"message": "Project graph initialized successfully"}
    except Exception as e:
        logger.error(f"Failed to initialize project graph: {e}")
        raise HTTPException(status_code=500, detail="Failed to initialize project graph")