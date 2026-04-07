"""
Graph-Enhanced RAG (Retrieval Augmented Generation) Service
Simple implementation using our existing stack
"""

import logging
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from ..models.models import KnowledgeNode, KnowledgeEdge

logger = logging.getLogger(__name__)


class GraphRAGService:
    """
    Simple graph-enhanced RAG service for intelligent information retrieval
    Uses basic text matching and graph structure
    """
    
    async def retrieve_context_for_query(
        self,
        query: str,
        project_id: int,
        db: AsyncSession,
        top_k: int = 5,
        traversal_depth: int = 2
    ) -> Dict[str, Any]:
        """
        Retrieve relevant context for a query using simple keyword matching and graph traversal
        
        Args:
            query: User query
            project_id: Project ID
            db: Database session
            top_k: Number of top relevant nodes to retrieve
            traversal_depth: Depth of graph traversal for context expansion
            
        Returns:
            Dict with retrieved nodes, edges, and formatted context text
        """
        try:
            # Step 1: Get all knowledge nodes for the project
            nodes_result = await db.execute(
                select(KnowledgeNode).where(
                    KnowledgeNode.project_id == project_id
                )
            )
            all_nodes = nodes_result.scalars().all()
            
            if not all_nodes:
                logger.warning(f"No knowledge nodes found for project {project_id}")
                return {
                    "nodes": [],
                    "edges": [],
                    "context_text": "",
                    "relevant_entities": []
                }
            
            # Step 2: Simple keyword matching to find relevant nodes
            query_lower = query.lower()
            query_words = set(query_lower.split())
            
            node_scores = []
            for node in all_nodes:
                # Create node text representation
                node_text = self._node_to_text(node).lower()
                
                # Simple scoring: count matching words
                matching_words = sum(1 for word in query_words if word in node_text)
                if matching_words > 0:
                    node_scores.append((node, matching_words))
            
            # Sort by score and get top k
            node_scores.sort(key=lambda x: x[1], reverse=True)
            top_nodes = [node for node, _ in node_scores[:top_k]]
            
            if not top_nodes:
                # If no matches, return some random nodes
                top_nodes = all_nodes[:top_k]
            
            logger.info(
                f"Retrieved {len(top_nodes)} relevant nodes for query: '{query[:50]}...'"
            )
            
            # Step 3: Expand context using graph traversal
            expanded_context = await self._expand_context_sqlite(
                db=db,
                project_id=project_id,
                seed_nodes=top_nodes,
                depth=traversal_depth
            )
            
            # Step 4: Format context text
            context_text = self._format_context_text(
                nodes=expanded_context["nodes"],
                edges=expanded_context["edges"]
            )
            
            return {
                "nodes": expanded_context["nodes"],
                "edges": expanded_context["edges"],
                "context_text": context_text,
                "relevant_entities": [
                    node.node_data.get("name", f"Node-{node.id}")
                    for node in top_nodes
                ],
                "retrieval_method": "keyword_matching"
            }
            
        except Exception as e:
            logger.error(f"Failed to retrieve graph context: {e}", exc_info=True)
            return {
                "nodes": [],
                "edges": [],
                "context_text": "",
                "relevant_entities": []
            }
    
    def _node_to_text(self, node: KnowledgeNode) -> str:
        """Convert knowledge node to text representation"""
        parts = [
            f"Type: {node.node_type}",
            f"Name: {node.node_data.get('name', 'Unknown')}"
        ]
        
        # Add relevant fields based on node type
        if node.node_type == "finding":
            parts.append(f"Severity: {node.node_data.get('severity', 'Unknown')}")
            parts.append(f"Description: {node.node_data.get('description', '')[:200]}")
        elif node.node_type == "target":
            parts.append(f"Target: {node.node_data.get('target_value', 'Unknown')}")
            parts.append(f"Status: {node.node_data.get('status', 'Unknown')}")
        elif node.node_type == "entity":
            parts.append(f"Entity: {node.node_data.get('name', 'Unknown')}")
            parts.append(f"Entity Type: {node.node_data.get('entity_type', 'Unknown')}")
        
        return " | ".join(parts)
    
    async def _expand_context_sqlite(
        self,
        db: AsyncSession,
        project_id: int,
        seed_nodes: List[KnowledgeNode],
        depth: int
    ) -> Dict[str, Any]:
        """Expand context using SQLite graph traversal (BFS)"""
        visited_nodes = set()
        nodes_to_visit = [(node, 0) for node in seed_nodes]
        all_edges = []
        
        while nodes_to_visit:
            current_node, current_depth = nodes_to_visit.pop(0)
            
            if current_node.id in visited_nodes or current_depth >= depth:
                continue
            
            visited_nodes.add(current_node.id)
            
            # Get outgoing edges
            outgoing_result = await db.execute(
                select(KnowledgeEdge).where(
                    and_(
                        KnowledgeEdge.project_id == project_id,
                        KnowledgeEdge.source_node_id == current_node.id
                    )
                )
            )
            outgoing_edges = outgoing_result.scalars().all()
            all_edges.extend(outgoing_edges)
            
            # Get target nodes
            for edge in outgoing_edges:
                if edge.target_node_id not in visited_nodes:
                    target_result = await db.execute(
                        select(KnowledgeNode).where(
                            KnowledgeNode.id == edge.target_node_id
                        )
                    )
                    target_node = target_result.scalar_one_or_none()
                    if target_node:
                        nodes_to_visit.append((target_node, current_depth + 1))
            
            # Get incoming edges
            incoming_result = await db.execute(
                select(KnowledgeEdge).where(
                    and_(
                        KnowledgeEdge.project_id == project_id,
                        KnowledgeEdge.target_node_id == current_node.id
                    )
                )
            )
            incoming_edges = incoming_result.scalars().all()
            all_edges.extend(incoming_edges)
            
            # Get source nodes
            for edge in incoming_edges:
                if edge.source_node_id not in visited_nodes:
                    source_result = await db.execute(
                        select(KnowledgeNode).where(
                            KnowledgeNode.id == edge.source_node_id
                        )
                    )
                    source_node = source_result.scalar_one_or_none()
                    if source_node:
                        nodes_to_visit.append((source_node, current_depth + 1))
        
        # Get all visited node objects
        all_nodes = []
        for node_id in visited_nodes:
            node_result = await db.execute(
                select(KnowledgeNode).where(KnowledgeNode.id == node_id)
            )
            node = node_result.scalar_one_or_none()
            if node:
                all_nodes.append(node)
        
        logger.info(
            f"Expanded context: {len(all_nodes)} nodes, {len(all_edges)} edges "
            f"(depth: {depth})"
        )
        
        return {
            "nodes": all_nodes,
            "edges": all_edges
        }
    
    def _format_context_text(
        self,
        nodes: List[KnowledgeNode],
        edges: List[KnowledgeEdge]
    ) -> str:
        """Format nodes and edges into natural language context"""
        context_parts = []
        
        # Format nodes
        if nodes:
            context_parts.append("**Entities and Information:**")
            for node in nodes[:20]:  # Limit to avoid token overflow
                node_text = self._node_to_text(node)
                context_parts.append(f"- {node_text}")
        
        # Format relationships
        if edges:
            context_parts.append("\n**Relationships:**")
            # Get node map for quick lookup
            node_map = {node.id: node for node in nodes}
            
            for edge in edges[:30]:  # Limit to avoid token overflow
                source_node = node_map.get(edge.source_node_id)
                target_node = node_map.get(edge.target_node_id)
                
                if source_node and target_node:
                    source_name = source_node.node_data.get("name", f"Node-{source_node.id}")
                    target_name = target_node.node_data.get("name", f"Node-{target_node.id}")
                    edge_type = edge.edge_type
                    
                    context_parts.append(f"- {source_name} --[{edge_type}]--> {target_name}")
        
        return "\n".join(context_parts)


# Global instance
graph_rag_service = GraphRAGService()
