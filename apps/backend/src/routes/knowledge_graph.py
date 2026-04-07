"""
Enhanced Knowledge Graph API Routes
Provides advanced KG operations including Neo4j queries and graph analytics
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List, Optional, Dict, Any
from datetime import datetime

from ..models.database import get_db
from ..models.models import KnowledgeNode, KnowledgeEdge, Project
from ..core.security import get_current_user_optional
from ..services.kg_extraction_service import kg_extraction_service
from ..services.neo4j_kg_service import neo4j_kg_service
from ..services.graph_rag_service import graph_rag_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/projects/{project_id}/kg/extract-from-text")
async def extract_kg_from_text(
    project_id: int,
    text: str,
    context: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """
    Extract knowledge graph from arbitrary text
    Useful for processing external reports, notes, etc.
    """
    try:
        if not kg_extraction_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="Knowledge graph extraction service not available"
            )
        
        # Extract graph
        graph = await kg_extraction_service.extract_from_tool_output(
            tool_name="manual_extraction",
            command="N/A",
            output=text,
            context=context or f"Manual extraction for project {project_id}"
        )
        
        if not graph:
            return {"message": "No entities or relations extracted"}
        
        # Convert to native format
        native_graph = kg_extraction_service.convert_to_native_format(graph)
        
        return {
            "success": True,
            "entities_count": len(native_graph["nodes"]),
            "relations_count": len(native_graph["edges"]),
            "entities": list(graph.entities),
            "relations": [
                {"subject": s, "predicate": p, "object": o}
                for s, p, o in graph.relations
            ],
            "clusters": {
                "entities": native_graph.get("entity_clusters", {}),
                "edges": native_graph.get("edge_clusters", {})
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to extract KG: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_id}/kg/analytics")
async def get_graph_analytics(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """
    Get advanced analytics for project knowledge graph
    """
    try:
        analytics = {}
        
        # SQLite-based analytics
        nodes_result = await db.execute(
            select(KnowledgeNode).where(KnowledgeNode.project_id == project_id)
        )
        nodes = nodes_result.scalars().all()
        
        edges_result = await db.execute(
            select(KnowledgeEdge).where(KnowledgeEdge.project_id == project_id)
        )
        edges = edges_result.scalars().all()
        
        # Basic stats
        analytics["basic_stats"] = {
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "node_types": {}
        }
        
        # Count by node type
        for node in nodes:
            node_type = node.node_type
            analytics["basic_stats"]["node_types"][node_type] = \
                analytics["basic_stats"]["node_types"].get(node_type, 0) + 1
        
        # Neo4j-based analytics (if available)
        if neo4j_kg_service.is_available():
            # Get central entities
            central_entities = await neo4j_kg_service.get_central_entities(
                project_id=project_id,
                limit=10
            )
            analytics["central_entities"] = central_entities
            
            # Get Neo4j stats
            neo4j_stats = await neo4j_kg_service.get_graph_stats(project_id)
            analytics["neo4j_stats"] = neo4j_stats
        else:
            analytics["central_entities"] = []
            analytics["neo4j_available"] = False
        
        return analytics
        
    except Exception as e:
        logger.error(f"Failed to get graph analytics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_id}/kg/find-path")
async def find_attack_path(
    project_id: int,
    source_entity: str,
    target_entity: str,
    max_depth: int = 5,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """
    Find paths between two entities (e.g., attack paths)
    """
    try:
        if not neo4j_kg_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="Neo4j service required for path finding"
            )
        
        paths = await neo4j_kg_service.find_path_between_entities(
            project_id=project_id,
            source_entity=source_entity,
            target_entity=target_entity,
            max_depth=max_depth
        )
        
        return {
            "source": source_entity,
            "target": target_entity,
            "paths_found": len(paths),
            "paths": paths
        }
        
    except Exception as e:
        logger.error(f"Failed to find path: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_id}/kg/query-context")
async def query_graph_context(
    project_id: int,
    query: str,
    top_k: int = 5,
    depth: int = 2,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """
    Query knowledge graph for relevant context using Graph RAG
    """
    try:
        context = await graph_rag_service.retrieve_context_for_query(
            query=query,
            project_id=project_id,
            db=db,
            top_k=top_k,
            traversal_depth=depth
        )
        
        return {
            "query": query,
            "relevant_entities": context.get("relevant_entities", []),
            "nodes_retrieved": len(context.get("nodes", [])),
            "edges_retrieved": len(context.get("edges", [])),
            "context_text": context.get("context_text", ""),
            "retrieval_method": context.get("retrieval_method", "unknown")
        }
        
    except Exception as e:
        logger.error(f"Failed to query graph context: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_id}/kg/visualize")
async def get_visualization_data(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """
    Get knowledge graph data formatted for visualization
    """
    try:
        # Get all nodes
        nodes_result = await db.execute(
            select(KnowledgeNode).where(KnowledgeNode.project_id == project_id)
        )
        nodes = nodes_result.scalars().all()
        
        # Get all edges
        edges_result = await db.execute(
            select(KnowledgeEdge).where(KnowledgeEdge.project_id == project_id)
        )
        edges = edges_result.scalars().all()
        
        # Format for D3.js/Pyvis visualization
        viz_nodes = []
        for node in nodes:
            viz_nodes.append({
                "id": node.id,
                "label": node.node_data.get("name", f"Node-{node.id}"),
                "type": node.node_type,
                "group": node.node_type,
                "data": node.node_data,
                "title": f"{node.node_type}: {node.node_data.get('name', 'Unknown')}"
            })
        
        viz_edges = []
        for edge in edges:
            viz_edges.append({
                "id": edge.id,
                "source": edge.source_node_id,
                "target": edge.target_node_id,
                "label": edge.edge_type,
                "type": edge.edge_type,
                "data": edge.edge_data
            })
        
        return {
            "nodes": viz_nodes,
            "edges": viz_edges,
            "statistics": {
                "node_count": len(viz_nodes),
                "edge_count": len(viz_edges),
                "node_types": list(set(n["type"] for n in viz_nodes))
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to get visualization data: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/kg/service-status")
async def get_service_status():
    """Get status of KG-related services"""
    from ..services.ai_service import _get_active_provider

    return {
        "kg_extraction": kg_extraction_service.is_available(),
        "neo4j": neo4j_kg_service.is_available(),
        "graph_rag": True,  # Always available if extraction works
        "services": {
            "kg_extraction": {
                "available": kg_extraction_service.is_available(),
                "model": _get_active_provider() if kg_extraction_service.is_available() else None
            },
            "neo4j": {
                "available": neo4j_kg_service.is_available(),
                "uri": neo4j_kg_service.uri if neo4j_kg_service.is_available() else None
            }
        }
    }

