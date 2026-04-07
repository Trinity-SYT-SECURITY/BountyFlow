"""
Knowledge Graph Auto-Sync Service
Automatically syncs project data changes to Knowledge Graph and global pages
Enhanced with LLM-powered entity extraction and Neo4j integration
"""

import logging
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, delete, or_
from ..models.models import (
    Project, Target, DiscoveredUser, KnowledgeNode, KnowledgeEdge,
    DiscoveredFile, ToolExecution
)
from .kg_extraction_service import kg_extraction_service
from .neo4j_kg_service import neo4j_kg_service

logger = logging.getLogger(__name__)

class KnowledgeGraphAutoSync:
    """Auto-sync service for Knowledge Graph and global data"""
    
    @staticmethod
    async def sync_target_created(session: AsyncSession, project_id: int, target: Target):
        """Sync newly created target to Knowledge Graph"""
        try:
            # Create Target Knowledge Graph node
            target_kg_node = KnowledgeNode(
                project_id=project_id,
                target_id=target.id,
                node_type='target',
                node_data={
                    'target_id': target.id,
                    'name': target.target_value,
                    'target_value': target.target_value,
                    'target_type': target.target_type,
                    'status': target.status,
                    'priority': target.priority,
                    'notes': target.notes,
                    'scan_results': target.scan_results,
                    'created_at': target.created_at.isoformat() if target.created_at else None
                },
                created_by=1  # Admin user
            )
            session.add(target_kg_node)
            await session.flush()
            
            logger.info(f"✅ Auto-synced target {target.target_value} to Knowledge Graph")
            return target_kg_node
        except Exception as e:
            logger.error(f"Failed to auto-sync target to Knowledge Graph: {e}")
            return None
    
    @staticmethod
    async def sync_target_updated(session: AsyncSession, project_id: int, target: Target):
        """Sync updated target to Knowledge Graph"""
        try:
            # Find existing target KG node
            result = await session.execute(select(KnowledgeNode).where(
                and_(
                    KnowledgeNode.project_id == project_id,
                    KnowledgeNode.node_type == 'target',
                    KnowledgeNode.target_id == target.id
                )
            ))
            target_kg_node = result.scalar_one_or_none()
            
            if target_kg_node:
                # Update node data
                target_kg_node.node_data.update({
                    'target_value': target.target_value,
                    'target_type': target.target_type,
                    'status': target.status,
                    'priority': target.priority,
                    'notes': target.notes,
                    'scan_results': target.scan_results,
                    'updated_at': target.updated_at.isoformat() if target.updated_at else None
                })

                # CRITICAL: Flag node_data as modified so SQLAlchemy detects the change
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(target_kg_node, 'node_data')

                await session.flush()  # Ensure changes are written

                # Invalidate cache to force refresh
                try:
                    from ..routes.neo4j import _graph_cache
                    cache_key = f"graph_{project_id}"
                    if cache_key in _graph_cache:
                        del _graph_cache[cache_key]
                        logger.info(f"🗑️  Invalidated graph cache for project {project_id}")
                except (ImportError, AttributeError):
                    pass

                logger.info(f"✅ Auto-synced target {target.target_value} update to Knowledge Graph")
            else:
                # Create new node if not exists
                await KnowledgeGraphAutoSync.sync_target_created(session, project_id, target)
                
        except Exception as e:
            logger.error(f"Failed to auto-sync target update to Knowledge Graph: {e}")
    
    @staticmethod
    async def sync_target_deleted(session: AsyncSession, project_id: int, target_id: int):
        """Sync deleted target to Knowledge Graph"""
        try:
            # Find and delete target KG node
            result = await session.execute(select(KnowledgeNode).where(
                and_(
                    KnowledgeNode.project_id == project_id,
                    KnowledgeNode.node_type == 'target',
                    KnowledgeNode.target_id == target_id
                )
            ))
            target_kg_node = result.scalar_one_or_none()
            
            if target_kg_node:
                # Delete all relationships involving this target
                await session.execute(delete(KnowledgeEdge).where(
                    and_(
                        KnowledgeEdge.project_id == project_id,
                        or_(
                            KnowledgeEdge.source_node_id == target_kg_node.id,
                            KnowledgeEdge.target_node_id == target_kg_node.id
                        )
                    )
                ))
                
                # Delete the target node
                await session.execute(delete(KnowledgeNode).where(
                    KnowledgeNode.id == target_kg_node.id
                ))
                
                logger.info(f"✅ Auto-synced target {target_id} deletion from Knowledge Graph")
                
        except Exception as e:
            logger.error(f"Failed to auto-sync target deletion from Knowledge Graph: {e}")
    
    @staticmethod
    async def sync_user_created(session: AsyncSession, project_id: int, user: DiscoveredUser):
        """Sync newly created user to Knowledge Graph and global pages"""
        try:
            # Check if node already exists
            result = await session.execute(select(KnowledgeNode).where(
                and_(
                    KnowledgeNode.project_id == project_id,
                    KnowledgeNode.node_type == 'user',
                    KnowledgeNode.node_data.like(f'%\"discovered_user_id\": {user.id}%')
                )
            ))
            existing_node = result.scalar_one_or_none()

            if existing_node:
                logger.info(f"User KG node already exists for discovered_user_id {user.id}")
                return existing_node

            # Create User Knowledge Graph node
            user_kg_node = KnowledgeNode(
                project_id=project_id,
                target_id=user.target_id,
                node_type='user',
                node_data={
                    'discovered_user_id': user.id,
                    'username': user.username,
                    'full_name': user.full_name,
                    'email': user.email,
                    'domain': user.domain,
                    'privilege_level': user.privilege_level,
                    'account_status': user.account_status,
                    'source': user.source,
                    'notes': user.notes,
                    'severity': user.severity,
                    'created_at': user.created_at.isoformat() if user.created_at else None
                },
                created_by=1  # Admin user
            )
            session.add(user_kg_node)
            await session.flush()
            
            # Create user-target relationship if target exists
            if user.target_id:
                await KnowledgeGraphAutoSync._create_user_target_relationship(
                    session, project_id, user_kg_node.id, user.target_id
                )
            
            logger.info(f"✅ Auto-synced user {user.username} to Knowledge Graph")
            return user_kg_node
        except Exception as e:
            logger.error(f"Failed to auto-sync user to Knowledge Graph: {e}")
            return None
    
    @staticmethod
    async def sync_user_updated(session: AsyncSession, project_id: int, user: DiscoveredUser):
        """Sync updated user to Knowledge Graph"""
        try:
            # Find existing user KG node
            result = await session.execute(select(KnowledgeNode).where(
                and_(
                    KnowledgeNode.project_id == project_id,
                    KnowledgeNode.node_type == 'user',
                    KnowledgeNode.node_data.like(f'%\"discovered_user_id\": {user.id}%')
                )
            ))
            user_kg_node = result.scalar_one_or_none()
            
            if user_kg_node:
                # Update node data
                user_kg_node.node_data.update({
                    'discovered_user_id': user.id,  # Ensure ID is present
                    'username': user.username,
                    'full_name': user.full_name,
                    'email': user.email,
                    'domain': user.domain,
                    'privilege_level': user.privilege_level,
                    'account_status': user.account_status,
                    'source': user.source,
                    'notes': user.notes,
                    'severity': user.severity,
                    'updated_at': user.updated_at.isoformat() if user.updated_at else None
                })
                
                # CRITICAL: Flag node_data as modified so SQLAlchemy detects the change
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(user_kg_node, 'node_data')
                
                # Update target relationship if target_id changed
                if user.target_id != user_kg_node.target_id:
                    user_kg_node.target_id = user.target_id
                    # Recreate relationships
                    await KnowledgeGraphAutoSync._create_user_target_relationship(
                        session, project_id, user_kg_node.id, user.target_id
                    )
                
                await session.flush()  # Ensure changes are written
                
                # Invalidate cache to force refresh (if cache exists)
                try:
                    from ..routes.neo4j import _graph_cache
                    cache_key = f"graph_{project_id}"
                    if cache_key in _graph_cache:
                        del _graph_cache[cache_key]
                        logger.info(f"🗑️  Invalidated graph cache for project {project_id}")
                except (ImportError, AttributeError):
                    # Cache might not be available, that's okay
                    pass
                
                logger.info(f"✅ Auto-synced user {user.username} update to Knowledge Graph (node {user_kg_node.id})")
            else:
                # Create new node if not exists
                await KnowledgeGraphAutoSync.sync_user_created(session, project_id, user)
                
        except Exception as e:
            logger.error(f"Failed to auto-sync user update to Knowledge Graph: {e}")
    
    @staticmethod
    async def sync_user_deleted(session: AsyncSession, project_id: int, user_id: int):
        """Sync deleted user to Knowledge Graph"""
        try:
            # Find ALL user KG nodes with this discovered_user_id (handle duplicates)
            # Use string contains for SQLite JSON compatibility
            result = await session.execute(select(KnowledgeNode).where(
                and_(
                    KnowledgeNode.project_id == project_id,
                    KnowledgeNode.node_type == 'user',
                    KnowledgeNode.node_data.like(f'%\"discovered_user_id\": {user_id}%')
                )
            ))
            user_kg_nodes = result.scalars().all()
            
            logger.info(f"Found {len(user_kg_nodes)} user KG nodes for discovered_user_id {user_id}")
            
            for user_kg_node in user_kg_nodes:
                logger.info(f"Deleting user KG node {user_kg_node.id} (discovered_user_id: {user_id})")
                
                # Delete all relationships involving this user node
                await session.execute(delete(KnowledgeEdge).where(
                    and_(
                        KnowledgeEdge.project_id == project_id,
                        or_(
                            KnowledgeEdge.source_node_id == user_kg_node.id,
                            KnowledgeEdge.target_node_id == user_kg_node.id
                        )
                    )
                ))
                
                # Delete the user node
                await session.execute(delete(KnowledgeNode).where(
                    KnowledgeNode.id == user_kg_node.id
                ))
                
                logger.info(f"✅ Deleted user KG node {user_kg_node.id} and its relationships")
            
            if user_kg_nodes:
                logger.info(f"✅ Auto-synced user {user_id} deletion from Knowledge Graph ({len(user_kg_nodes)} nodes deleted)")
            else:
                logger.warning(f"⚠️ No user KG nodes found for discovered_user_id {user_id}")
                
        except Exception as e:
            logger.error(f"Failed to auto-sync user deletion from Knowledge Graph: {e}")
            import traceback
            traceback.print_exc()
    
    @staticmethod
    async def sync_finding_created(session: AsyncSession, project_id: int, finding: KnowledgeNode):
        """Sync newly created finding to Knowledge Graph"""
        try:
            # IMPORTANT: Check if node already exists using multiple criteria to avoid duplicates
            # Note: finding.id should be available after flush() in create_finding
            
            # First check: by finding_id in node_data (most reliable after commit)
            # But note: if this is called before finding.id is assigned, this check might fail
            # So we also check by title + target_id combination
            
            finding_title = finding.node_data.get('title', '')
            finding_target_id = finding.target_id
            
            # Check by finding_id if available
            existing_node = None
            if finding.id:
                result = await session.execute(select(KnowledgeNode).where(
                    and_(
                        KnowledgeNode.project_id == project_id,
                        KnowledgeNode.node_type == 'finding',
                        KnowledgeNode.node_data.like(f'%\"finding_id\": {finding.id}%')
                    )
                ))
                existing_node = result.scalar_one_or_none()
            
            # Also check by title and target_id combination (additional safety check)
            # This catches duplicates even if finding_id check fails
            if not existing_node and finding_title:
                # Build query conditions - handle None target_id properly
                conditions = [
                    KnowledgeNode.project_id == project_id,
                    KnowledgeNode.node_type == 'finding',
                    KnowledgeNode.node_data.like(f'%"title": "{finding_title}"%')
                ]
                # Add target_id condition based on whether it's None or not
                if finding_target_id is not None:
                    conditions.append(KnowledgeNode.target_id == finding_target_id)
                else:
                    # If target_id is None, check for nodes with NULL target_id
                    conditions.append(KnowledgeNode.target_id.is_(None))
                
                result2 = await session.execute(select(KnowledgeNode).where(and_(*conditions)))
                existing_node = result2.scalar_one_or_none()
                if existing_node:
                    logger.warning(f"⚠️  Found duplicate finding by title and target_id: {finding_title} on target {finding_target_id}")

            if existing_node:
                logger.info(f"✅ Finding KG node already exists for finding_id {finding.id if finding.id else 'N/A'}, skipping duplicate creation")
                # Ensure the existing node has the relationship if target exists
                if finding_target_id:
                    await KnowledgeGraphAutoSync._create_finding_target_relationship(
                        session, project_id, existing_node.id, finding_target_id
                    )
                return existing_node

            # Create Finding Knowledge Graph node
            finding_kg_node = KnowledgeNode(
                project_id=project_id,
                target_id=finding.target_id,
                node_type='finding',
                node_data={
                    'finding_id': finding.id,
                    'title': finding.node_data.get('title'),
                    'description': finding.node_data.get('description'),
                    'severity': finding.node_data.get('severity'),
                    'status': finding.node_data.get('status'),
                    'target_id': finding.target_id,
                    'created_at': finding.created_at.isoformat() if finding.created_at else None
                },
                created_by=1  # Admin user
            )
            session.add(finding_kg_node)
            await session.flush()
            
            # Create finding-target relationship if target exists
            if finding.target_id:
                logger.info(f"🔗 Creating finding-target relationship for finding {finding_kg_node.id} -> target {finding.target_id}")
                await KnowledgeGraphAutoSync._create_finding_target_relationship(
                    session, project_id, finding_kg_node.id, finding.target_id
                )
                await session.flush()  # Ensure relationship is persisted before commit
            else:
                logger.warning(f"⚠️  Finding {finding.id} has no target_id, skipping relationship creation")
            
            logger.info(f"✅ Auto-synced finding {finding.node_data.get('title')} to Knowledge Graph")
            return finding_kg_node
        except Exception as e:
            logger.error(f"Failed to auto-sync finding to Knowledge Graph: {e}")
            return None
    
    @staticmethod
    async def sync_file_created(session: AsyncSession, project_id: int, file: DiscoveredFile):
        """Sync newly created file to Knowledge Graph"""
        try:
            # Check if node already exists
            result = await session.execute(select(KnowledgeNode).where(
                and_(
                    KnowledgeNode.project_id == project_id,
                    KnowledgeNode.node_type == 'file',
                    KnowledgeNode.node_data.like(f'%\"discovered_file_id\": {file.id}%')
                )
            ))
            existing_node = result.scalar_one_or_none()

            if existing_node:
                logger.info(f"File KG node already exists for discovered_file_id {file.id}")
                return existing_node

            # Create File Knowledge Graph node
            file_kg_node = KnowledgeNode(
                project_id=project_id,
                target_id=file.target_id,
                node_type='file',
                node_data={
                    'discovered_file_id': file.id,
                    'filename': file.filename,
                    'file_path': file.file_path,
                    'file_type': file.file_type,
                    'file_size': file.file_size,
                    'file_hash': file.file_hash,
                    'source': file.source,
                    'severity': file.severity,
                    'is_sensitive': file.is_sensitive,
                    'tags': file.tags,
                    'created_at': file.created_at.isoformat() if file.created_at else None
                },
                created_by=1  # Admin user
            )
            session.add(file_kg_node)
            await session.flush()
            
            # Create file-target relationship if target exists
            if file.target_id:
                await KnowledgeGraphAutoSync._create_file_target_relationship(
                    session, project_id, file_kg_node.id, file.target_id
                )
            
            logger.info(f"✅ Auto-synced file {file.filename} to Knowledge Graph")
            return file_kg_node
        except Exception as e:
            logger.error(f"Failed to auto-sync file to Knowledge Graph: {e}")
            return None
    
    @staticmethod
    async def _create_user_target_relationship(session: AsyncSession, project_id: int, user_node_id: int, target_id: int):
        """Create user-target relationship - ONLY to the specified target"""
        try:
            # IMPORTANT: Validate target_id is not None
            if target_id is None:
                logger.warning(f"⚠️  Cannot create user-target relationship: target_id is None for user {user_node_id}")
                return
            
            # CRITICAL: First, delete ALL existing found_on relationships for this user
            # This ensures we don't have orphaned relationships to other targets
            delete_result = await session.execute(delete(KnowledgeEdge).where(
                and_(
                    KnowledgeEdge.project_id == project_id,
                    KnowledgeEdge.source_node_id == user_node_id,
                    KnowledgeEdge.edge_type == 'found_on'
                )
            ))
            deleted_count = delete_result.rowcount
            if deleted_count > 0:
                logger.info(f"🗑️  Deleted {deleted_count} existing found_on relationship(s) for user {user_node_id} before creating new one")
            await session.flush()
            
            # Find target KG node - ONLY the specified target
            result = await session.execute(select(KnowledgeNode).where(
                and_(
                    KnowledgeNode.project_id == project_id,
                    KnowledgeNode.node_type == 'target',
                    KnowledgeNode.target_id == target_id
                )
            ))
            target_kg_node = result.scalar_one_or_none()
            
            if target_kg_node:
                # Create found_on relationship - ONLY to this specific target
                relationship = KnowledgeEdge(
                    project_id=project_id,
                    source_node_id=user_node_id,
                    target_node_id=target_kg_node.id,
                    edge_type='found_on',
                    edge_data={
                        'relationship_type': 'found_on',
                        'description': f'User found on target {target_id}',
                        'created_at': None
                    },
                    confidence_score=0.8
                )
                session.add(relationship)
                logger.info(f"✅ Created found_on relationship: User {user_node_id} -> Target {target_id} (KG node {target_kg_node.id})")
            else:
                logger.warning(f"⚠️  Target KG node not found for target_id {target_id} in project {project_id}")
        except Exception as e:
            logger.error(f"Failed to create user-target relationship: {e}", exc_info=True)
    
    @staticmethod
    async def _create_finding_target_relationship(session: AsyncSession, project_id: int, finding_node_id: int, target_id: int):
        """Create finding-target relationship - ONLY to the specified target"""
        try:
            # IMPORTANT: Validate target_id is not None
            if target_id is None:
                logger.warning(f"⚠️  Cannot create finding-target relationship: target_id is None for finding {finding_node_id}")
                return
            
            # CRITICAL: First, delete ALL existing affects relationships for this finding
            # This ensures we don't have orphaned relationships to other targets
            delete_result = await session.execute(delete(KnowledgeEdge).where(
                and_(
                    KnowledgeEdge.project_id == project_id,
                    KnowledgeEdge.source_node_id == finding_node_id,
                    KnowledgeEdge.edge_type == 'affects'
                )
            ))
            deleted_count = delete_result.rowcount
            if deleted_count > 0:
                logger.info(f"🗑️  Deleted {deleted_count} existing affects relationship(s) for finding {finding_node_id} before creating new one")
            await session.flush()
            
            # Find target KG node - ONLY the specified target
            result = await session.execute(select(KnowledgeNode).where(
                and_(
                    KnowledgeNode.project_id == project_id,
                    KnowledgeNode.node_type == 'target',
                    KnowledgeNode.target_id == target_id
                )
            ))
            target_kg_node = result.scalar_one_or_none()
            
            if target_kg_node:
                # Create affects relationship - ONLY to this specific target
                relationship = KnowledgeEdge(
                    project_id=project_id,
                    source_node_id=finding_node_id,
                    target_node_id=target_kg_node.id,
                    edge_type='affects',
                    edge_data={
                        'relationship_type': 'affects',
                        'description': f'Finding affects target {target_id}',
                        'created_at': None
                    },
                    confidence_score=0.8
                )
                session.add(relationship)
                await session.flush()  # Ensure relationship is written immediately
                logger.info(f"✅ Created affects relationship: Finding {finding_node_id} -> Target {target_id} (KG node {target_kg_node.id})")
            else:
                logger.warning(f"⚠️  Target KG node not found for target_id {target_id} in project {project_id}. Make sure target exists and has been synced to Knowledge Graph.")
        except Exception as e:
            logger.error(f"Failed to create finding-target relationship: {e}", exc_info=True)
    
    @staticmethod
    async def _create_file_target_relationship(session: AsyncSession, project_id: int, file_node_id: int, target_id: int):
        """Create file-target relationship - ONLY to the specified target"""
        try:
            # IMPORTANT: Validate target_id is not None
            if target_id is None:
                logger.warning(f"⚠️  Cannot create file-target relationship: target_id is None for file {file_node_id}")
                return
            
            # CRITICAL: First, delete ALL existing discovered_on relationships for this file
            # This ensures we don't have orphaned relationships to other targets
            delete_result = await session.execute(delete(KnowledgeEdge).where(
                and_(
                    KnowledgeEdge.project_id == project_id,
                    KnowledgeEdge.source_node_id == file_node_id,
                    KnowledgeEdge.edge_type == 'discovered_on'
                )
            ))
            deleted_count = delete_result.rowcount
            if deleted_count > 0:
                logger.info(f"🗑️  Deleted {deleted_count} existing discovered_on relationship(s) for file {file_node_id} before creating new one")
            await session.flush()
            
            # Find target KG node - ONLY the specified target
            result = await session.execute(select(KnowledgeNode).where(
                and_(
                    KnowledgeNode.project_id == project_id,
                    KnowledgeNode.node_type == 'target',
                    KnowledgeNode.target_id == target_id
                )
            ))
            target_kg_node = result.scalar_one_or_none()
            
            if target_kg_node:
                # Create discovered_on relationship - ONLY to this specific target
                relationship = KnowledgeEdge(
                    project_id=project_id,
                    source_node_id=file_node_id,
                    target_node_id=target_kg_node.id,
                    edge_type='discovered_on',
                    edge_data={
                        'relationship_type': 'discovered_on',
                        'description': f'File discovered on target {target_id}',
                        'created_at': None
                    },
                    confidence_score=0.8
                )
                session.add(relationship)
                logger.info(f"✅ Created discovered_on relationship: File {file_node_id} -> Target {target_id} (KG node {target_kg_node.id})")
            else:
                logger.warning(f"⚠️  Target KG node not found for target_id {target_id} in project {project_id}")
        except Exception as e:
            logger.error(f"Failed to create file-target relationship: {e}", exc_info=True)
    
    @staticmethod
    async def _recreate_user_relationships(session: AsyncSession, project_id: int, user_node_id: int, target_id: int):
        """Recreate user relationships after target change"""
        try:
            # Delete existing relationships
            await session.execute(delete(KnowledgeEdge).where(
                and_(
                    KnowledgeEdge.project_id == project_id,
                    KnowledgeEdge.source_node_id == user_node_id,
                    KnowledgeEdge.edge_type == 'found_on'
                )
            ))
            
            # Create new relationship if target exists
            if target_id:
                await KnowledgeGraphAutoSync._create_user_target_relationship(
                    session, project_id, user_node_id, target_id
                )
        except Exception as e:
            logger.error(f"Failed to recreate user relationships: {e}")
    
    @staticmethod
    async def sync_file_updated(session: AsyncSession, project_id: int, file: DiscoveredFile):
        """Sync updated file to Knowledge Graph"""
        try:
            logger.info(f"🔄 Starting file sync for file {file.id} ({file.filename}) with target_id {file.target_id}")
            
            # Find ALL existing file KG nodes (to handle duplicates)
            result = await session.execute(select(KnowledgeNode).where(
                and_(
                    KnowledgeNode.project_id == project_id,
                    KnowledgeNode.node_type == 'file',
                    KnowledgeNode.node_data.like(f'%\"discovered_file_id\": {file.id}%')
                )
            ))
            file_kg_nodes = result.scalars().all()
            logger.info(f"Found {len(file_kg_nodes)} file KG nodes for discovered_file_id {file.id}")

            if file_kg_nodes:
                # Update the first node and delete the rest (handle duplicates)
                primary_node = file_kg_nodes[0]
                logger.info(f"Found {len(file_kg_nodes)} file KG nodes for discovered_file_id {file.id}")

                # Update primary node
                primary_node.node_data.update({
                    'discovered_file_id': file.id,
                    'filename': file.filename,
                    'file_path': file.file_path,
                    'file_type': file.file_type,
                    'file_size': file.file_size,
                    'file_hash': file.file_hash,
                    'source': file.source,
                    'severity': file.severity,
                    'is_sensitive': file.is_sensitive,
                    'tags': file.tags,
                    'updated_at': file.updated_at.isoformat() if file.updated_at else None
                })
                primary_node.target_id = file.target_id
                
                # CRITICAL: Flag node_data as modified so SQLAlchemy detects the change
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(primary_node, 'node_data')

                # Delete duplicate nodes (keep only the first one)
                for duplicate_node in file_kg_nodes[1:]:
                    logger.info(f"Deleting duplicate file KG node {duplicate_node.id}")

                    # Delete relationships involving this duplicate node
                    await session.execute(delete(KnowledgeEdge).where(
                        and_(
                            KnowledgeEdge.project_id == project_id,
                            or_(
                                KnowledgeEdge.source_node_id == duplicate_node.id,
                                KnowledgeEdge.target_node_id == duplicate_node.id
                            )
                        )
                    ))

                    # Delete the duplicate node
                    await session.execute(delete(KnowledgeNode).where(
                        KnowledgeNode.id == duplicate_node.id
                    ))

                file_kg_node = primary_node
                
                # Update relationships for existing node
                logger.info(f"🔄 Updating relationships for file {file.id} (KG node {file_kg_node.id})")
                
                # Delete all existing discovered_on relationships for this file
                delete_result = await session.execute(delete(KnowledgeEdge).where(
                    and_(
                        KnowledgeEdge.project_id == project_id,
                        KnowledgeEdge.source_node_id == file_kg_node.id,
                        KnowledgeEdge.edge_type == 'discovered_on'
                    )
                ))
                logger.info(f"🗑️ Deleted {delete_result.rowcount} existing discovered_on relationships")
                
                # Then create new relationship if target exists
                if file.target_id:
                    logger.info(f"🔗 Creating new discovered_on relationship: file {file_kg_node.id} -> target {file.target_id}")
                    await KnowledgeGraphAutoSync._create_file_target_relationship(
                        session, project_id, file_kg_node.id, file.target_id
                    )
                    logger.info(f"✅ Created discovered_on relationship successfully")
                else:
                    logger.info(f"⚠️ No target_id for file {file.id}, skipping relationship creation")
                
                await session.flush()  # Ensure changes are written
                
                # Invalidate cache to force refresh (if cache exists)
                try:
                    from ..routes.neo4j import _graph_cache
                    cache_key = f"graph_{project_id}"
                    if cache_key in _graph_cache:
                        del _graph_cache[cache_key]
                        logger.info(f"🗑️  Invalidated graph cache for project {project_id}")
                except (ImportError, AttributeError):
                    # Cache might not be available, that's okay
                    pass
                
                logger.info(f"✅ Auto-synced file {file.filename} update to Knowledge Graph (node {file_kg_node.id})")
            else:
                # Create new node if none exists
                file_kg_node = await KnowledgeGraphAutoSync.sync_file_created(session, project_id, file)
                # Update the node data
                file_kg_node.node_data.update({
                    'discovered_file_id': file.id,
                    'filename': file.filename,
                    'file_path': file.file_path,
                    'file_type': file.file_type,
                    'file_size': file.file_size,
                    'file_hash': file.file_hash,
                    'source': file.source,
                    'severity': file.severity,
                    'is_sensitive': file.is_sensitive,
                    'tags': file.tags,
                    'updated_at': None  # Avoid lazy loading issues
                })
                file_kg_node.target_id = file.target_id
                # Don't set updated_at here as it might cause async issues
                
                # Update relationships if target changed
                # First, delete all existing discovered_on relationships for this file
                await session.execute(delete(KnowledgeEdge).where(
                    and_(
                        KnowledgeEdge.project_id == project_id,
                        KnowledgeEdge.source_node_id == file_kg_node.id,
                        KnowledgeEdge.edge_type == 'discovered_on'
                    )
                ))
                
                # Then create new relationship if target exists
                if file.target_id:
                    await KnowledgeGraphAutoSync._create_file_target_relationship(
                        session, project_id, file_kg_node.id, file.target_id
                    )
                
                logger.info(f"✅ Auto-synced file {file.filename} update to Knowledge Graph")
          
        except Exception as e:
            logger.error(f"Failed to auto-sync file update to Knowledge Graph: {e}")
    @staticmethod
    async def sync_file_deleted(session: AsyncSession, project_id: int, file_id: int):
        """Sync deleted file to Knowledge Graph"""
        try:
            # Find ALL file KG nodes with this discovered_file_id (handle duplicates)
            # Use string contains for SQLite JSON compatibility
            result = await session.execute(select(KnowledgeNode).where(
                and_(
                    KnowledgeNode.project_id == project_id,
                    KnowledgeNode.node_type == 'file',
                    KnowledgeNode.node_data.like(f'%\"discovered_file_id\": {file_id}%')
                )
            ))
            file_kg_nodes = result.scalars().all()
            
            logger.info(f"Found {len(file_kg_nodes)} file KG nodes for discovered_file_id {file_id}")
            
            for file_kg_node in file_kg_nodes:
                logger.info(f"Deleting file KG node {file_kg_node.id} (discovered_file_id: {file_id})")
                
                # Delete all relationships involving this file node
                await session.execute(delete(KnowledgeEdge).where(
                    and_(
                        KnowledgeEdge.project_id == project_id,
                        or_(
                            KnowledgeEdge.source_node_id == file_kg_node.id,
                            KnowledgeEdge.target_node_id == file_kg_node.id
                        )
                    )
                ))
                
                # Delete the file node
                await session.execute(delete(KnowledgeNode).where(
                    KnowledgeNode.id == file_kg_node.id
                ))
                
                logger.info(f"✅ Deleted file KG node {file_kg_node.id} and its relationships")
            
            if file_kg_nodes:
                logger.info(f"✅ Auto-synced file {file_id} deletion from Knowledge Graph ({len(file_kg_nodes)} nodes deleted)")
            else:
                logger.warning(f"⚠️ No file KG nodes found for discovered_file_id {file_id}")
                
        except Exception as e:
            logger.error(f"Failed to auto-sync file {file_id} deletion from Knowledge Graph: {e}")
    
    @staticmethod
    async def sync_finding_updated(session: AsyncSession, project_id: int, finding: KnowledgeNode):
        """Sync updated finding to Knowledge Graph"""
        try:
            # Find existing finding KG node
            result = await session.execute(select(KnowledgeNode).where(
                and_(
                    KnowledgeNode.project_id == project_id,
                    KnowledgeNode.node_type == 'finding',
                    KnowledgeNode.node_data.like(f'%\"finding_id\": {finding.id}%')
                )
            ))
            finding_kg_node = result.scalar_one_or_none()
            
            if finding_kg_node:
                # Update the node data
                finding_kg_node.node_data.update({
                    'finding_id': finding.id,  # Ensure ID is present
                    'title': finding.node_data.get('title'),
                    'description': finding.node_data.get('description'),
                    'severity': finding.node_data.get('severity'),
                    'status': finding.node_data.get('status'),
                    'target_id': finding.target_id,
                    'updated_at': finding.updated_at.isoformat() if finding.updated_at else None
                })
                finding_kg_node.target_id = finding.target_id
                
                # CRITICAL: Flag node_data as modified so SQLAlchemy detects the change
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(finding_kg_node, 'node_data')
                
                # Update relationships if target changed
                if finding.target_id:
                    await KnowledgeGraphAutoSync._create_finding_target_relationship(
                        session, project_id, finding_kg_node.id, finding.target_id
                    )
                
                await session.flush()  # Ensure changes are written
                
                # Invalidate cache to force refresh (if cache exists)
                try:
                    from ..routes.neo4j import _graph_cache
                    cache_key = f"graph_{project_id}"
                    if cache_key in _graph_cache:
                        del _graph_cache[cache_key]
                        logger.info(f"🗑️  Invalidated graph cache for project {project_id}")
                except (ImportError, AttributeError):
                    # Cache might not be available, that's okay
                    pass
                
                logger.info(f"✅ Auto-synced finding {finding.node_data.get('title')} update to Knowledge Graph (node {finding_kg_node.id})")
            else:
                logger.warning(f"⚠️ No finding KG node found for finding_id {finding.id}")
                
        except Exception as e:
            logger.error(f"Failed to auto-sync finding update to Knowledge Graph: {e}")
    
    @staticmethod
    async def sync_finding_deleted(session: AsyncSession, project_id: int, finding: KnowledgeNode):
        """Sync deleted finding to Knowledge Graph"""
        try:
            # Find ALL finding KG nodes with this finding_id (handle duplicates)
            result = await session.execute(select(KnowledgeNode).where(
                and_(
                    KnowledgeNode.project_id == project_id,
                    KnowledgeNode.node_type == 'finding',
                    KnowledgeNode.node_data.like(f'%\"finding_id\": {finding.id}%')
                )
            ))
            finding_kg_nodes = result.scalars().all()
            
            logger.info(f"Found {len(finding_kg_nodes)} finding KG nodes for finding_id {finding.id}")
            
            for finding_kg_node in finding_kg_nodes:
                logger.info(f"Deleting finding KG node {finding_kg_node.id} (finding_id: {finding.id})")
                
                # Delete all relationships involving this finding node
                await session.execute(delete(KnowledgeEdge).where(
                    and_(
                        KnowledgeEdge.project_id == project_id,
                        or_(
                            KnowledgeEdge.source_node_id == finding_kg_node.id,
                            KnowledgeEdge.target_node_id == finding_kg_node.id
                        )
                    )
                ))
                
                # Delete the finding node
                await session.execute(delete(KnowledgeNode).where(
                    KnowledgeNode.id == finding_kg_node.id
                ))
                
                logger.info(f"✅ Deleted finding KG node {finding_kg_node.id} and its relationships")
            
            if finding_kg_nodes:
                logger.info(f"✅ Auto-synced finding {finding.id} deletion from Knowledge Graph ({len(finding_kg_nodes)} nodes deleted)")
            else:
                logger.warning(f"⚠️ No finding KG nodes found for finding_id {finding.id}")
                
        except Exception as e:
            logger.error(f"Failed to auto-sync finding {finding.id} deletion from Knowledge Graph: {e}")

# Global instance
kg_auto_sync = KnowledgeGraphAutoSync()
