"""
API routes for discovered files (files found during penetration testing)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from typing import List, Optional
import logging

from ..models.database import get_db
from ..models.models import DiscoveredFile, Target, Project
from ..schemas.files import (
    DiscoveredFileCreate,
    DiscoveredFileUpdate,
    DiscoveredFileResponse,
    DiscoveredFileWithTarget
)
from ..middleware.auth import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

def normalize_tags(tags):
    """Convert tags to list format"""
    if tags is None:
        return None
    if isinstance(tags, list):
        return tags
    if isinstance(tags, str):
        # Split comma-separated string into list
        return [tag.strip() for tag in tags.split(',') if tag.strip()]
    return None


@router.get("/discovered-files", response_model=List[DiscoveredFileWithTarget])
async def get_all_discovered_files(
    db: AsyncSession = Depends(get_db)
):
    """
    Get all discovered files across all projects
    Only returns files from projects that still exist
    """
    try:
        # Query all discovered files with their targets and projects
        query = select(DiscoveredFile, Target, Project).outerjoin(
            Target, DiscoveredFile.target_id == Target.id
        ).outerjoin(
            Project, DiscoveredFile.project_id == Project.id
        ).where(
            Project.id.isnot(None)  # Only include files from existing projects
        ).order_by(DiscoveredFile.created_at.desc())

        result = await db.execute(query)
        rows = result.all()

        # Format response
        files_with_target = []
        for discovered_file, target, project in rows:
            file_dict = {
                "id": discovered_file.id,
                "project_id": discovered_file.project_id,
                "target_id": discovered_file.target_id,
                "filename": discovered_file.filename,
                "file_path": discovered_file.file_path,
                "file_type": discovered_file.file_type,
                "file_size": discovered_file.file_size,
                "file_hash": discovered_file.file_hash,
                "content_preview": discovered_file.content_preview,
                "content_analysis": discovered_file.content_analysis,
                "discovered_at": discovered_file.discovered_at,
                "source": discovered_file.source,
                "severity": discovered_file.severity,
                "notes": discovered_file.notes,
                "tags": normalize_tags(discovered_file.tags),
                "is_sensitive": discovered_file.is_sensitive,
                "created_at": discovered_file.created_at,
                "updated_at": discovered_file.updated_at,
                "target_value": target.target_value if target else None,
                "target_type": target.target_type if target else None,
                "project_name": project.name if project else None,
            }
            files_with_target.append(file_dict)

        return files_with_target

    except Exception as e:
        logger.error(f"Error getting all discovered files: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_id}/discovered-files", response_model=List[DiscoveredFileWithTarget])
async def get_discovered_files(
    project_id: int,
    target_id: Optional[int] = Query(None, description="Filter by target ID"),
    file_type: Optional[str] = Query(None, description="Filter by file type"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all discovered files for a project with optional filters
    """
    try:
        # Build query
        query = select(DiscoveredFile, Target).outerjoin(
            Target, DiscoveredFile.target_id == Target.id
        ).where(DiscoveredFile.project_id == project_id)

        # Apply filters
        if target_id:
            query = query.where(DiscoveredFile.target_id == target_id)
        if file_type:
            query = query.where(DiscoveredFile.file_type == file_type)
        if severity:
            query = query.where(DiscoveredFile.severity == severity)

        query = query.order_by(DiscoveredFile.created_at.desc())

        result = await db.execute(query)
        rows = result.all()

        # Format response
        files_with_target = []
        for discovered_file, target in rows:
            file_dict = {
                "id": discovered_file.id,
                "project_id": discovered_file.project_id,
                "target_id": discovered_file.target_id,
                "filename": discovered_file.filename,
                "file_path": discovered_file.file_path,
                "file_type": discovered_file.file_type,
                "file_size": discovered_file.file_size,
                "file_hash": discovered_file.file_hash,
                "content_preview": discovered_file.content_preview,
                "content_analysis": discovered_file.content_analysis,
                "discovered_at": discovered_file.discovered_at,
                "source": discovered_file.source,
                "severity": discovered_file.severity,
                "notes": discovered_file.notes,
                "tags": normalize_tags(discovered_file.tags),
                "is_sensitive": discovered_file.is_sensitive,
                "created_at": discovered_file.created_at,
                "updated_at": discovered_file.updated_at,
                "target_value": target.target_value if target else None,
                "target_type": target.target_type if target else None,
            }
            files_with_target.append(file_dict)

        return files_with_target

    except Exception as e:
        logger.error(f"Error getting discovered files for project {project_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_id}/discovered-files", response_model=DiscoveredFileResponse)
async def create_discovered_file(
    project_id: int,
    file_data: DiscoveredFileCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new discovered file
    """
    try:
        # Verify project exists
        project_result = await db.execute(select(Project).where(Project.id == project_id))
        project = project_result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Verify target exists if provided
        if file_data.target_id:
            target_result = await db.execute(select(Target).where(Target.id == file_data.target_id))
            target = target_result.scalar_one_or_none()
            if not target:
                raise HTTPException(status_code=404, detail="Target not found")

        # Create discovered file
        discovered_file = DiscoveredFile(
            project_id=project_id,
            target_id=file_data.target_id,
            filename=file_data.filename,
            file_path=file_data.file_path,
            file_type=file_data.file_type,
            file_size=file_data.file_size,
            file_hash=file_data.file_hash,
            content_preview=file_data.content_preview,
            content_analysis=file_data.content_analysis,
            source=file_data.source,
            severity=file_data.severity,
            notes=file_data.notes,
            tags=file_data.tags,
            is_sensitive=file_data.is_sensitive
        )

        db.add(discovered_file)
        await db.flush()  # Get the ID before auto-sync
        
        # Auto-sync to Knowledge Graph
        try:
            from ..services.kg_auto_sync import kg_auto_sync
            await kg_auto_sync.sync_file_created(db, project_id, discovered_file)
        except Exception as e:
            logger.error(f"Failed to auto-sync file to Knowledge Graph: {e}")
        
        await db.commit()
        await db.refresh(discovered_file)

        return {
            "id": discovered_file.id,
            "project_id": discovered_file.project_id,
            "target_id": discovered_file.target_id,
            "filename": discovered_file.filename,
            "file_path": discovered_file.file_path,
            "file_type": discovered_file.file_type,
            "file_size": discovered_file.file_size,
            "file_hash": discovered_file.file_hash,
            "content_preview": discovered_file.content_preview,
            "content_analysis": discovered_file.content_analysis,
            "discovered_at": discovered_file.discovered_at,
            "source": discovered_file.source,
            "severity": discovered_file.severity,
            "notes": discovered_file.notes,
            "tags": discovered_file.tags,
            "is_sensitive": discovered_file.is_sensitive,
            "created_at": discovered_file.created_at,
            "updated_at": discovered_file.updated_at
        }

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error creating discovered file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/projects/{project_id}/discovered-files/{file_id}")
async def update_discovered_file(
    project_id: int,
    file_id: int,
    file_data: DiscoveredFileUpdate,
    db: AsyncSession = Depends(get_db)
):
    """
    Update a discovered file
    """
    print(f"🔄 [DEBUG] update_discovered_file called with project_id={project_id}, file_id={file_id}, data={file_data}")
    try:
        # Get existing file
        result = await db.execute(select(DiscoveredFile).where(
            and_(DiscoveredFile.id == file_id, DiscoveredFile.project_id == project_id)
        ))
        discovered_file = result.scalar_one_or_none()
        
        if not discovered_file:
            raise HTTPException(status_code=404, detail="Discovered file not found")
        
        from sqlalchemy.orm.attributes import flag_modified
        
        # Update file fields
        for field, value in file_data.dict(exclude_unset=True).items():
            if hasattr(discovered_file, field) and value is not None:
                setattr(discovered_file, field, value)
                # Flag JSON fields as modified to ensure they are saved
                if field == 'tags':
                    flag_modified(discovered_file, "tags")
        
        # Commit changes first
        await db.commit()
        await db.refresh(discovered_file)
        
        # Auto-sync to Knowledge Graph after commit
        print(f"🔄 [DEBUG] Starting auto-sync for file {discovered_file.id} (target_id: {discovered_file.target_id})")
        logger.info(f"🔄 Starting auto-sync for file {discovered_file.id} (target_id: {discovered_file.target_id})")
        try:
            from ..services.kg_auto_sync import kg_auto_sync
            print(f"🔄 [DEBUG] Imported kg_auto_sync successfully")
            await kg_auto_sync.sync_file_updated(db, project_id, discovered_file)
            print(f"✅ [DEBUG] Auto-sync completed for file {discovered_file.id}")
            logger.info(f"✅ Auto-sync completed for file {discovered_file.id}")
        except Exception as e:
            print(f"❌ [DEBUG] Auto-sync failed: {e}")
            logger.error(f"❌ Failed to auto-sync file update to Knowledge Graph: {e}")
            import traceback
            print(f"❌ [DEBUG] Traceback: {traceback.format_exc()}")
            logger.error(f"Traceback: {traceback.format_exc()}")

        # Convert datetime objects to ISO format strings
        def format_datetime(dt):
            return dt.isoformat() if dt else None

        return {
            "id": discovered_file.id,
            "project_id": discovered_file.project_id,
            "target_id": discovered_file.target_id,
            "filename": discovered_file.filename,
            "file_path": discovered_file.file_path,
            "file_type": discovered_file.file_type,
            "file_size": discovered_file.file_size,
            "file_hash": discovered_file.file_hash,
            "content_preview": discovered_file.content_preview,
            "content_analysis": discovered_file.content_analysis,
            "discovered_at": format_datetime(discovered_file.discovered_at),
            "source": discovered_file.source,
            "severity": discovered_file.severity,
            "notes": discovered_file.notes,
            "tags": discovered_file.tags,
            "is_sensitive": discovered_file.is_sensitive,
            "created_at": format_datetime(discovered_file.created_at),
            "updated_at": format_datetime(discovered_file.updated_at)
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update discovered file: {str(e)}")


@router.delete("/projects/{project_id}/discovered-files/{file_id}")
async def delete_discovered_file(
    project_id: int,
    file_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Delete a discovered file
    """
    try:
        # Get existing file
        result = await db.execute(select(DiscoveredFile).where(
            and_(DiscoveredFile.id == file_id, DiscoveredFile.project_id == project_id)
        ))
        discovered_file = result.scalar_one_or_none()
        
        if not discovered_file:
            raise HTTPException(status_code=404, detail="Discovered file not found")
        
        # Delete the file
        await db.delete(discovered_file)
        await db.commit()
        
        return {"message": "Discovered file deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete discovered file: {str(e)}")
