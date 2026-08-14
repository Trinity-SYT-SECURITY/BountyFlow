"""
Multi-database storage manager for BountyFlow
Separates data across SQLite, Neo4j, and Redis
"""

import asyncio
import json
from typing import Dict, Any, Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import redis.asyncio as redis
from neo4j import AsyncGraphDatabase
import structlog

logger = structlog.get_logger(__name__)

class StorageManager:
    """Manages data separation across different databases"""
    
    def __init__(self):
        self.redis_client = None
        self.neo4j_driver = None
        self.sqlite_session = None
    
    async def initialize(self):
        """Initialize all database connections"""
        try:
            # Initialize Redis connection
            self.redis_client = redis.Redis(
                host='localhost',
                port=6379,
                db=0,
                decode_responses=True
            )
            await self.redis_client.ping()
            logger.info("Redis connection established")
            
            # Initialize Neo4j connection
            self.neo4j_driver = AsyncGraphDatabase.driver(
                "bolt://localhost:7687",
                auth=("neo4j", "bountyflow123")
            )
            await self.neo4j_driver.verify_connectivity()
            logger.info("Neo4j connection established")
            
        except Exception as e:
            logger.error("Database initialization failed", error=str(e))
            raise
    
    async def close(self):
        """Close all database connections"""
        if self.redis_client:
            await self.redis_client.close()
        if self.neo4j_driver:
            await self.neo4j_driver.close()
    
    # SQLite operations (Core data)
    async def store_user_core_data(self, session: AsyncSession, user_data: Dict[str, Any]) -> int:
        """Store core user data in SQLite"""
        try:
            query = text("""
                INSERT INTO users (username, email, full_name, hashed_password, is_active, is_superuser, created_at)
                VALUES (:username, :email, :full_name, :hashed_password, :is_active, :is_superuser, :created_at)
            """)
            
            result = await session.execute(query, user_data)
            await session.commit()
            return result.lastrowid
        except Exception as e:
            await session.rollback()
            logger.error("Failed to store user core data", error=str(e))
            raise
    
    # Redis operations (Sessions, cache, temporary data)
    async def store_user_session_data(self, user_id: int, session_data: Dict[str, Any]) -> None:
        """Store user session data in Redis"""
        try:
            key = f"user_session:{user_id}"
            await self.redis_client.hset(key, mapping=session_data)
            await self.redis_client.expire(key, 3600)  # 1 hour expiry
            logger.info("User session data stored in Redis", user_id=user_id)
        except Exception as e:
            logger.error("Failed to store user session data", error=str(e))
            raise
    
    async def store_user_cache_data(self, user_id: int, cache_data: Dict[str, Any]) -> None:
        """Store user cache data in Redis"""
        try:
            key = f"user_cache:{user_id}"
            await self.redis_client.hset(key, mapping=cache_data)
            await self.redis_client.expire(key, 7200)  # 2 hours expiry
            logger.info("User cache data stored in Redis", user_id=user_id)
        except Exception as e:
            logger.error("Failed to store user cache data", error=str(e))
            raise
    
    # Neo4j operations (Relationships, knowledge graph)
    async def store_user_relationships(self, user_id: int, relationships: Dict[str, Any]) -> None:
        """Store user relationships in Neo4j"""
        try:
            async with self.neo4j_driver.session() as session:
                # Create user node
                await session.run("""
                    MERGE (u:User {id: $user_id, username: $username, role: $role})
                    SET u.created_at = datetime(),
                        u.is_admin = $is_admin,
                        u.permissions = $permissions
                """, user_id=user_id, **relationships)
                
                logger.info("User relationships stored in Neo4j", user_id=user_id)
        except Exception as e:
            logger.error("Failed to store user relationships", error=str(e))
            raise
    
    async def create_admin_permissions_graph(self, user_id: int) -> None:
        """Create admin permissions graph in Neo4j"""
        try:
            async with self.neo4j_driver.session() as session:
                # Create admin permissions
                await session.run("""
                    MATCH (u:User {id: $user_id})
                    MERGE (p:Permission {name: 'admin_access'})
                    MERGE (r:Role {name: 'Administrator'})
                    MERGE (u)-[:HAS_ROLE]->(r)
                    MERGE (r)-[:HAS_PERMISSION]->(p)
                    MERGE (p)-[:GRANTS]->(:Access {type: 'full_system'})
                """, user_id=user_id)
                
                logger.info("Admin permissions graph created", user_id=user_id)
        except Exception as e:
            logger.error("Failed to create admin permissions graph", error=str(e))
            raise
    
    # Combined operations
    async def create_admin_user(self, session: AsyncSession, admin_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create admin user across all databases"""
        try:
            # 1. Store core data in SQLite
            user_id = await self.store_user_core_data(session, admin_data)
            
            # 2. Store session data in Redis
            session_data = {
                "last_login": admin_data.get("created_at"),
                "login_count": "0",
                "active_sessions": "0",
                "preferences": json.dumps({
                    "theme": "dark",
                    "language": "en",
                    "notifications": True
                })
            }
            await self.store_user_session_data(user_id, session_data)
            
            # 3. Store cache data in Redis
            cache_data = {
                "permissions": json.dumps(["admin", "user_management", "system_config"]),
                "api_keys": json.dumps([]),
                "recent_activities": json.dumps([])
            }
            await self.store_user_cache_data(user_id, cache_data)
            
            # 4. Store relationships in Neo4j
            relationships = {
                "username": admin_data["username"],
                "role": "Administrator",
                "is_admin": True,
                "permissions": json.dumps(["admin", "user_management", "system_config"])
            }
            await self.store_user_relationships(user_id, relationships)
            await self.create_admin_permissions_graph(user_id)
            
            logger.info("Admin user created successfully", user_id=user_id)
            return {
                "user_id": user_id,
                "username": admin_data["username"],
                "email": admin_data["email"],
                "role": "Administrator",
                "created_at": admin_data["created_at"]
            }
            
        except Exception as e:
            logger.error("Failed to create admin user", error=str(e))
            raise

# Global storage manager instance
storage_manager = StorageManager()


