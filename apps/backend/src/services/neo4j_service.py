"""
Neo4j Service for Knowledge Graph Management
Handles graph operations with fallback to mock data when Neo4j is not available
"""

from typing import List, Dict, Any, Optional
import logging
from datetime import datetime
import json
import time
import os
from dotenv import load_dotenv
from pathlib import Path

logger = logging.getLogger(__name__)

# Simple in-memory cache for graph data
_graph_cache = {}
_cache_ttl = 30  # Cache for 30 seconds

class Neo4jService:
    def __init__(self, uri: str = None, user: str = None, password: str = None):
        # Ensure .env file is loaded
        env_path = Path(__file__).parent.parent.parent / ".env"
        if env_path.exists():
            load_dotenv(env_path, override=False)
        
        # Get credentials from environment or use provided values
        self.uri = uri or os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.user = user or os.getenv("NEO4J_USERNAME", "neo4j")
        self.password = password or os.getenv("NEO4J_PASSWORD")
        
        self.driver = None
        self.mock_mode = True
        self.mock_data = {}  # Store mock graph data by project_id
        
        # Debug logging
        logger.info(f"Neo4j (legacy) config - URI: {self.uri}, User: {self.user}, Password: {'***' if self.password else 'NOT SET'}")
        
        try:
            from neo4j import GraphDatabase
            self.driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
            # Test connection
            with self.driver.session() as session:
                session.run("RETURN 1")
            self.mock_mode = False
            logger.info("Neo4j connected successfully")
        except Exception as e:
            logger.warning(f"Neo4j connection failed, using mock mode: {e}")
            self.mock_mode = True
    
    def close(self):
        if self.driver:
            self.driver.close()
    
    def create_project_graph(self, project_id: int, project_name: str):
        """Create independent graph space for project"""
        if self.mock_mode:
            self.mock_data[project_id] = {
                'nodes': [],
                'relationships': []
            }
            logger.info(f"Created mock graph for project {project_id}")
            return
        
        with self.driver.session() as session:
            session.run(
                "MERGE (p:Project {id: $project_id}) SET p.name = $project_name, p.created_at = datetime()",
                project_id=project_id, project_name=project_name
            )
    
    def add_user_node(self, project_id: int, user_data: Dict[str, Any]):
        """Add user node to project knowledge graph"""
        if self.mock_mode:
            if project_id not in self.mock_data:
                self.mock_data[project_id] = {'nodes': [], 'relationships': []}
            
            node = {
                'id': f"user_{user_data.get('id')}",
                'type': 'User',
                'label': user_data.get('username', 'Unknown User'),
                'properties': {
                    'username': user_data.get('username'),
                    'email': user_data.get('email'),
                    'privilege': user_data.get('privilege', 'user'),
                    'status': user_data.get('status', 'active'),
                    'last_login': user_data.get('last_login')
                },
                'x': len(self.mock_data[project_id]['nodes']) * 150 + 100,
                'y': 200
            }
            self.mock_data[project_id]['nodes'].append(node)
            logger.info(f"Added mock user node for project {project_id}: {node['id']}")
            return
        
        with self.driver.session() as session:
            session.run("""
                MATCH (p:Project {id: $project_id})
                MERGE (u:User {id: $user_id, project_id: $project_id})
                SET u.username = $username,
                    u.email = $email,
                    u.privilege = $privilege,
                    u.status = $status,
                    u.last_login = $last_login,
                    u.created_at = datetime()
                MERGE (p)-[:HAS_USER]->(u)
            """, 
            project_id=project_id,
            user_id=str(user_data.get('id')),
            username=user_data.get('username'),
            email=user_data.get('email'),
            privilege=user_data.get('privilege', 'user'),
            status=user_data.get('status', 'active'),
            last_login=user_data.get('last_login')
            )
    
    def add_server_node(self, project_id: int, server_data: Dict[str, Any]):
        """Add server node to project knowledge graph"""
        if self.mock_mode:
            if project_id not in self.mock_data:
                self.mock_data[project_id] = {'nodes': [], 'relationships': []}
            
            node = {
                'id': f"server_{server_data.get('id')}",
                'type': 'Server',
                'label': server_data.get('hostname', server_data.get('ip', 'Unknown Server')),
                'properties': {
                    'ip': server_data.get('ip'),
                    'hostname': server_data.get('hostname'),
                    'os': server_data.get('os'),
                    'status': server_data.get('status', 'active'),
                    'open_ports': server_data.get('open_ports', []),
                    'last_scan': server_data.get('last_scan')
                },
                'x': len(self.mock_data[project_id]['nodes']) * 150 + 100,
                'y': 400
            }
            self.mock_data[project_id]['nodes'].append(node)
            logger.info(f"Added mock server node for project {project_id}: {node['id']}")
            return
        
        with self.driver.session() as session:
            session.run("""
                MATCH (p:Project {id: $project_id})
                MERGE (s:Server {id: $server_id, project_id: $project_id})
                SET s.ip = $ip,
                    s.hostname = $hostname,
                    s.os = $os,
                    s.status = $status,
                    s.open_ports = $open_ports,
                    s.last_scan = $last_scan
                MERGE (p)-[:HAS_SERVER]->(s)
            """, 
            project_id=project_id,
            server_id=str(server_data.get('id')),
            ip=server_data.get('ip'),
            hostname=server_data.get('hostname'),
            os=server_data.get('os'),
            status=server_data.get('status', 'active'),
            open_ports=server_data.get('open_ports', []),
            last_scan=server_data.get('last_scan')
            )
    
    def add_target_node(self, project_id: int, target_data: Dict[str, Any]):
        """Add target node to project knowledge graph"""
        if self.mock_mode:
            if project_id not in self.mock_data:
                self.mock_data[project_id] = {'nodes': [], 'relationships': []}
            
            node = {
                'id': f"target_{target_data.get('id')}",
                'type': 'Target',
                'label': target_data.get('name', target_data.get('ip', target_data.get('domain', 'Unknown Target'))),
                'properties': {
                    'name': target_data.get('name'),
                    'type': target_data.get('type'),
                    'ip': target_data.get('ip'),
                    'domain': target_data.get('domain'),
                    'status': target_data.get('status', 'active'),
                    'last_scan': target_data.get('last_scan')
                },
                'x': len(self.mock_data[project_id]['nodes']) * 150 + 100,
                'y': 300
            }
            self.mock_data[project_id]['nodes'].append(node)
            logger.info(f"Added mock target node for project {project_id}: {node['id']}")
            return
        
        with self.driver.session() as session:
            session.run("""
                MATCH (p:Project {id: $project_id})
                MERGE (t:Target {id: $target_id, project_id: $project_id})
                SET t.name = $name,
                    t.type = $type,
                    t.ip = $ip,
                    t.domain = $domain,
                    t.status = $status,
                    t.last_scan = $last_scan
                MERGE (p)-[:HAS_TARGET]->(t)
            """, 
            project_id=project_id,
            target_id=str(target_data.get('id')),
            name=target_data.get('name'),
            type=target_data.get('type'),
            ip=target_data.get('ip'),
            domain=target_data.get('domain'),
            status=target_data.get('status', 'active'),
            last_scan=target_data.get('last_scan')
            )
    
    def add_finding_node(self, project_id: int, finding_data: Dict[str, Any]):
        """Add finding node to project knowledge graph"""
        if self.mock_mode:
            if project_id not in self.mock_data:
                self.mock_data[project_id] = {'nodes': [], 'relationships': []}
            
            node = {
                'id': f"finding_{finding_data.get('id')}",
                'type': 'Finding',
                'label': finding_data.get('title', 'Unknown Finding'),
                'properties': {
                    'title': finding_data.get('title'),
                    'description': finding_data.get('description'),
                    'severity': finding_data.get('severity'),
                    'status': finding_data.get('status', 'open'),
                    'discovered_at': finding_data.get('discovered_at')
                },
                'x': len(self.mock_data[project_id]['nodes']) * 150 + 100,
                'y': 500
            }
            self.mock_data[project_id]['nodes'].append(node)
            logger.info(f"Added mock finding node for project {project_id}: {node['id']}")
            return
        
        with self.driver.session() as session:
            session.run("""
                MATCH (p:Project {id: $project_id})
                MERGE (f:Finding {id: $finding_id, project_id: $project_id})
                SET f.title = $title,
                    f.description = $description,
                    f.severity = $severity,
                    f.status = $status,
                    f.discovered_at = $discovered_at
                MERGE (p)-[:HAS_FINDING]->(f)
            """, 
            project_id=project_id,
            finding_id=str(finding_data.get('id')),
            title=finding_data.get('title'),
            description=finding_data.get('description'),
            severity=finding_data.get('severity'),
            status=finding_data.get('status', 'open'),
            discovered_at=finding_data.get('discovered_at')
            )
    
    async def get_project_graph_cached(self, project_id: int) -> Dict[str, Any]:
        """Get project graph with caching"""
        cache_key = f"kg_graph_{project_id}"
        current_time = time.time()
        
        # Check cache first
        if cache_key in _graph_cache:
            cached_data, cache_time = _graph_cache[cache_key]
            if current_time - cache_time < _cache_ttl:
                logger.info(f"Cache hit for project {project_id}")
                return cached_data
        
        # Cache miss - fetch from database
        logger.info(f"Cache miss for project {project_id}")
        result = await self.get_project_graph_from_db(project_id)
        
        # Cache the result
        _graph_cache[cache_key] = (result, current_time)
        
        return result

    async def get_project_graph_from_db(self, project_id: int) -> Dict[str, Any]:
        """Get complete graph data from SQLAlchemy database"""
        from ..models.database import async_session
        from ..models.models import KnowledgeNode, KnowledgeEdge
        from sqlalchemy import select
        
        try:
            async with async_session() as db:
                # Get all knowledge nodes for this project
                nodes_result = await db.execute(
                    select(KnowledgeNode).where(KnowledgeNode.project_id == project_id)
                )
                db_nodes = nodes_result.scalars().all()
                
                # Get all knowledge edges for this project
                edges_result = await db.execute(
                    select(KnowledgeEdge).where(KnowledgeEdge.project_id == project_id)
                )
                db_edges = edges_result.scalars().all()
                
                # Transform nodes to frontend format
                nodes = []
                for idx, node in enumerate(db_nodes):
                    node_data = node.node_data if node.node_data else {}
                    
                    # Determine proper display name based on node type
                    display_name = node_data.get('name', '')
                    if not display_name:
                        if node.node_type == 'user':
                            display_name = node_data.get('username', f'User {node.id}')
                        elif node.node_type == 'finding':
                            display_name = node_data.get('title', f'Finding {node.id}')
                        elif node.node_type == 'target':
                            display_name = node_data.get('target_value', f'Target {node.id}')
                        elif node.node_type == 'file':
                            display_name = node_data.get('filename', f'File {node.id}')
                        else:
                            display_name = f'{node.node_type.capitalize()} {node.id}'
                    
                    nodes.append({
                        'id': f"{node.node_type}_{node.id}",
                        'type': node.node_type.capitalize(),
                        'label': display_name,
                        'target_id': node.target_id,
                        'properties': node_data,
                        'x': (idx % 5) * 200 + 100,  # Simple layout
                        'y': (idx // 5) * 200 + 100
                    })
                
                # Transform edges to frontend format
                relationships = []
                
                # Create a lookup dictionary for nodes by ID (O(1) lookup instead of O(n))
                node_lookup = {node.id: node for node in db_nodes}
                
                for edge in db_edges:
                    edge_data = edge.edge_data if edge.edge_data else {}
                    # Find source and target node IDs using O(1) lookup
                    source_node = node_lookup.get(edge.source_node_id)
                    target_node = node_lookup.get(edge.target_node_id)
                    
                    if source_node and target_node:
                        relationships.append({
                            'id': f"edge_{edge.id}",
                            'type': edge.edge_type,
                            'from': f"{source_node.node_type}_{source_node.id}",
                            'to': f"{target_node.node_type}_{target_node.id}",
                            'properties': edge_data
                        })
                
                logger.info(f"Retrieved {len(nodes)} nodes and {len(relationships)} relationships from database for project {project_id}")
                return {
                    'nodes': nodes,
                    'relationships': relationships,
                    'totalNodes': len(nodes),
                    'totalRelationships': len(relationships)
                }
        except Exception as e:
            logger.error(f"Failed to get graph from database: {e}")
            import traceback
            traceback.print_exc()
            return {
                'nodes': [],
                'relationships': [],
                'totalNodes': 0,
                'totalRelationships': 0
            }
    
    def get_project_graph(self, project_id: int) -> Dict[str, Any]:
        """Get complete graph data for project"""
        # First try to get from SQLAlchemy database
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # If loop is already running, we can't use asyncio.run()
                # This happens in async context, we should use the async version directly
                logger.warning("get_project_graph called from async context, this should use get_project_graph_from_db instead")
            else:
                # Run async function in sync context
                return asyncio.run(self.get_project_graph_from_db(project_id))
        except Exception as e:
            logger.error(f"Failed to get graph from database, trying mock/neo4j: {e}")
        
        if self.mock_mode:
            if project_id not in self.mock_data:
                self.mock_data[project_id] = {'nodes': [], 'relationships': []}
            
            data = self.mock_data[project_id]
            logger.info(f"Returning mock graph data for project {project_id}: {len(data['nodes'])} nodes, {len(data['relationships'])} relationships")
            return {
                'nodes': data['nodes'],
                'relationships': data['relationships'],
                'totalNodes': len(data['nodes']),
                'totalRelationships': len(data['relationships'])
            }
        
        with self.driver.session() as session:
            result = session.run("""
                MATCH (n {project_id: $project_id})
                OPTIONAL MATCH (n)-[r]->(m {project_id: $project_id})
                RETURN n, r, m
            """, project_id=project_id)
            
            nodes = []
            relationships = []
            node_ids = set()
            
            for record in result:
                if record['n']:
                    node = dict(record['n'])
                    node_id = node.get('id')
                    if node_id and node_id not in node_ids:
                        nodes.append({
                            'id': node_id,
                            'type': list(record['n'].labels)[0] if hasattr(record['n'], 'labels') else 'Unknown',
                            'label': node.get('name') or node.get('username') or node.get('title') or node_id,
                            'properties': {k: v for k, v in node.items() if k not in ['id', 'project_id']},
                            'x': node.get('x', 0),
                            'y': node.get('y', 0)
                        })
                        node_ids.add(node_id)
                
                if record['r'] and record['m']:
                    from_id = dict(record['n']).get('id')
                    to_id = dict(record['m']).get('id')
                    if from_id and to_id:
                        rel = dict(record['r'])
                        relationships.append({
                            'id': f"{from_id}_{to_id}",
                            'type': list(record['r'].type)[0] if hasattr(record['r'], 'type') else 'RELATED',
                            'from': from_id,
                            'to': to_id,
                            'properties': {k: v for k, v in rel.items()}
                        })
            
            return {
                'nodes': nodes,
                'relationships': relationships,
                'totalNodes': len(nodes),
                'totalRelationships': len(relationships)
            }

# Global instance
neo4j_service = Neo4jService()
