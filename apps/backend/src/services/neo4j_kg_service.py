"""
Neo4j Knowledge Graph Service for BountyFlow
Simple Neo4j integration without external dependencies
"""

import logging
import os
from typing import Dict, Any, List, Optional
from datetime import datetime
from dotenv import load_dotenv
from pathlib import Path

logger = logging.getLogger(__name__)

# Try to import neo4j, but don't fail if not available
try:
    from neo4j import GraphDatabase, Driver
    NEO4J_AVAILABLE = True
except ImportError:
    NEO4J_AVAILABLE = False
    logger.warning("Neo4j driver not available, Neo4j features disabled")


class Neo4jKnowledgeGraphService:
    """
    Service for managing knowledge graphs in Neo4j
    Falls back gracefully if Neo4j is not available
    """
    
    def __init__(
        self,
        uri: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        database: str = "neo4j"
    ):
        """
        Initialize Neo4j Knowledge Graph Service
        
        Args:
            uri: Neo4j connection URI (default: from env or bolt://localhost:7687)
            username: Database username (default: from env or 'neo4j')
            password: Database password (default: from env)
            database: Database name
        """
        # Ensure .env file is loaded
        env_path = Path(__file__).parent.parent.parent / ".env"
        if env_path.exists():
            load_dotenv(env_path, override=False)  # Don't override existing env vars
        
        self.uri = uri or os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.username = username or os.getenv("NEO4J_USERNAME", "neo4j")
        self.password = password or os.getenv("NEO4J_PASSWORD")
        self.database = database
        self.driver: Optional[Driver] = None
        self._is_connected = False
        
        # Debug logging
        logger.info(f"Neo4j config - URI: {self.uri}, Username: {self.username}, Password: {'***' if self.password else 'NOT SET'}")
        
        # Try to connect if credentials are available and Neo4j driver is installed
        if NEO4J_AVAILABLE and self.password:
            self.connect()
    
    def is_available(self) -> bool:
        """Check if Neo4j service is available"""
        return NEO4J_AVAILABLE and self._is_connected
    
    def connect(self) -> bool:
        """
        Establish connection to Neo4j database
        
        Returns:
            bool: True if connection successful
        """
        if not NEO4J_AVAILABLE:
            logger.warning("Neo4j driver not installed")
            return False
        
        try:
            self.driver = GraphDatabase.driver(
                self.uri,
                auth=(self.username, self.password)
            )
            # Test the connection
            with self.driver.session(database=self.database) as session:
                session.run("RETURN 1")
            
            self._is_connected = True
            logger.info(f"Successfully connected to Neo4j at {self.uri}")
            return True
        except Exception as e:
            logger.warning(f"Failed to connect to Neo4j: {e}. Will use SQLite fallback.")
            self._is_connected = False
            return False
    
    def close(self):
        """Close Neo4j connection"""
        if self.driver:
            self.driver.close()
        self._is_connected = False
        logger.info("Neo4j connection closed")
    
    async def upload_entities_and_relations(
        self,
        project_id: int,
        entities: List[Dict[str, Any]],
        relations: List[Dict[str, Any]]
    ) -> bool:
        """
        Upload entities and relations to Neo4j
        
        Args:
            project_id: Project ID
            entities: List of entity dicts with 'name', 'type', 'attributes'
            relations: List of relation dicts with 'source', 'target', 'type'
            
        Returns:
            bool: True if upload successful
        """
        if not self.is_available():
            logger.warning("Neo4j not available, skipping upload")
            return False
        
        try:
            with self.driver.session(database=self.database) as session:
                # Create entities as nodes
                for entity in entities:
                    name = entity.get('name', '')
                    entity_type = entity.get('type', 'entity')
                    attributes = entity.get('attributes', {})
                    
                    query = """
                    MERGE (n:Entity {name: $name, project_id: $project_id})
                    SET n.type = $entity_type,
                        n.attributes = $attributes,
                        n.updated_at = datetime()
                    """
                    
                    session.run(
                        query,
                        name=name,
                        project_id=project_id,
                        entity_type=entity_type,
                        attributes=str(attributes)
                    )
                
                # Create relationships
                for relation in relations:
                    source = relation.get('source', '')
                    target = relation.get('target', '')
                    rel_type = relation.get('type', 'RELATED_TO').replace(' ', '_').replace('-', '_').upper()
                    
                    query = f"""
                    MATCH (s:Entity {{name: $source, project_id: $project_id}})
                    MATCH (t:Entity {{name: $target, project_id: $project_id}})
                    MERGE (s)-[r:{rel_type}]->(t)
                    SET r.created_at = datetime()
                    """
                    
                    session.run(
                        query,
                        source=source,
                        target=target,
                        project_id=project_id
                    )
                
                logger.info(
                    f"Uploaded {len(entities)} entities and {len(relations)} relations "
                    f"to Neo4j for project {project_id}"
                )
                return True
                
        except Exception as e:
            logger.error(f"Failed to upload to Neo4j: {e}", exc_info=True)
            return False
    
    async def query_project_graph(
        self,
        project_id: int,
        cypher_query: str,
        parameters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Execute a Cypher query on a project's knowledge graph
        
        Args:
            project_id: Project ID
            cypher_query: Cypher query string
            parameters: Query parameters
            
        Returns:
            List of result records
        """
        if not self.is_available():
            return []
        
        try:
            params = parameters or {}
            params["project_id"] = project_id
            
            with self.driver.session(database=self.database) as session:
                result = session.run(cypher_query, params)
                return [record.data() for record in result]
        except Exception as e:
            logger.error(f"Query failed: {e}")
            return []
    
    async def get_graph_stats(self, project_id: int) -> Dict[str, int]:
        """Get statistics about a project's knowledge graph"""
        if not self.is_available():
            return {"node_count": 0, "relationship_count": 0}
        
        query = """
        MATCH (n:Entity {project_id: $project_id})
        OPTIONAL MATCH (n)-[r]->()
        RETURN 
            count(DISTINCT n) AS node_count,
            count(DISTINCT r) AS relationship_count
        """
        
        try:
            results = await self.query_project_graph(project_id, query)
            if results:
                return results[0]
            return {"node_count": 0, "relationship_count": 0}
        except Exception as e:
            logger.error(f"Failed to get graph stats: {e}")
            return {"node_count": 0, "relationship_count": 0}


# Global instance
neo4j_kg_service = Neo4jKnowledgeGraphService()
