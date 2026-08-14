"""
Activity Log API Routes
Provides endpoints for per-project activity logs with AI-powered analysis
"""

import logging
from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from ..models.database import get_db
from ..middleware.auth import get_current_user_optional
from ..services.activity_log_service import activity_log_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/activity-logs", tags=["activity-logs"])


class ActivityLogResponse(BaseModel):
    """Response model for activity log"""
    id: int
    project_id: int
    tool_execution_id: Optional[int]
    activity_type: str
    timestamp: Optional[str]
    tool_name: Optional[str]
    command: Optional[str]
    ai_summary: Optional[str]
    attack_phase: Optional[str]
    mitre_techniques: List[str]
    tags: List[str]
    confidence: Optional[float]
    model_used: Optional[str]
    
    class Config:
        from_attributes = True


class ActivityTimelineResponse(BaseModel):
    """Response model for activity timeline"""
    activities: List[dict]
    total: int
    statistics: dict


@router.get("/projects/{project_id}/activities", response_model=List[ActivityLogResponse])
async def get_project_activities(
    project_id: int,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    activity_type: Optional[str] = Query(None),
    tool_name: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Get activities for a project with filtering"""
    try:
        # Parse dates
        start_dt = None
        end_dt = None
        if start_date:
            start_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
        if end_date:
            end_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
        
        activities = await activity_log_service.get_project_activities(
            db=db,
            project_id=project_id,
            limit=limit,
            offset=offset,
            activity_type=activity_type,
            tool_name=tool_name,
            start_date=start_dt,
            end_date=end_dt
        )
        
        # Convert to response format
        result = []
        for activity in activities:
            result.append(ActivityLogResponse(
                id=activity.id,
                project_id=activity.project_id,
                tool_execution_id=activity.tool_execution_id,
                activity_type=activity.activity_type,
                timestamp=activity.timestamp.isoformat() if activity.timestamp else None,
                tool_name=activity.tool_name,
                command=activity.command,
                ai_summary=activity.ai_summary,
                attack_phase=activity.ai_tags.get("attack_phase") if activity.ai_tags else None,
                mitre_techniques=activity.ai_tags.get("mitre_techniques", []) if activity.ai_tags else [],
                tags=activity.ai_tags.get("tags", []) if activity.ai_tags else [],
                confidence=activity.confidence,
                model_used=activity.model_used
            ))
        
        return result
        
    except Exception as e:
        logger.error(f"Failed to get project activities: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get activities: {str(e)}")


@router.get("/projects/{project_id}/timeline", response_model=ActivityTimelineResponse)
async def get_activity_timeline(
    project_id: int,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Get activity timeline for a project"""
    try:
        # Parse dates
        start_dt = None
        end_dt = None
        if start_date:
            start_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
        if end_date:
            end_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
        
        timeline = await activity_log_service.get_activity_timeline(
            db=db,
            project_id=project_id,
            start_date=start_dt,
            end_date=end_dt
        )
        
        statistics = await activity_log_service.get_activity_statistics(
            db=db,
            project_id=project_id
        )
        
        return ActivityTimelineResponse(
            activities=timeline,
            total=len(timeline),
            statistics=statistics
        )
        
    except Exception as e:
        logger.error(f"Failed to get activity timeline: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get timeline: {str(e)}")


@router.get("/projects/{project_id}/statistics")
async def get_activity_statistics(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Get activity statistics for a project"""
    try:
        statistics = await activity_log_service.get_activity_statistics(
            db=db,
            project_id=project_id
        )
        
        return statistics
        
    except Exception as e:
        logger.error(f"Failed to get activity statistics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get statistics: {str(e)}")


@router.post("/activities/{activity_id}/reanalyze")
async def reanalyze_activity(
    activity_id: int,
    model_provider: Optional[str] = Query(None, description="AI model provider: gemini, openai, anthropic"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Reanalyze an activity with AI (optionally using different model)"""
    try:
        activity = await activity_log_service.reanalyze_activity(
            db=db,
            activity_id=activity_id,
            model_provider=model_provider
        )
        
        if not activity:
            raise HTTPException(status_code=404, detail="Activity not found")
        
        return ActivityLogResponse(
            id=activity.id,
            project_id=activity.project_id,
            tool_execution_id=activity.tool_execution_id,
            activity_type=activity.activity_type,
            timestamp=activity.timestamp.isoformat() if activity.timestamp else None,
            tool_name=activity.tool_name,
            command=activity.command,
            ai_summary=activity.ai_summary,
            attack_phase=activity.ai_tags.get("attack_phase") if activity.ai_tags else None,
            mitre_techniques=activity.ai_tags.get("mitre_techniques", []) if activity.ai_tags else [],
            tags=activity.ai_tags.get("tags", []) if activity.ai_tags else [],
            confidence=activity.confidence,
            model_used=activity.model_used
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to reanalyze activity: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to reanalyze: {str(e)}")

