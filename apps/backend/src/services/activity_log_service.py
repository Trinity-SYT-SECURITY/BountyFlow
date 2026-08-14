"""
Activity Log Service for BountyFlow
Manages per-project activity logs with AI-powered attack perspective analysis
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from sqlalchemy.orm import selectinload

from ..models.models import ActivityLog, Project, ToolExecution
from .ai_model_adapter import ai_model_factory, AnalysisResult

logger = logging.getLogger(__name__)


class ActivityLogService:
    """Service for managing activity logs"""
    
    def __init__(self):
        self.ai_adapter = None
        self._initialize_ai()
    
    def _initialize_ai(self):
        """Initialize AI adapter"""
        try:
            self.ai_adapter = ai_model_factory.create_adapter()
            if self.ai_adapter.is_available():
                logger.info("Activity log service initialized with AI support")
            else:
                logger.warning("Activity log service initialized without AI support")
        except Exception as e:
            logger.warning(f"Failed to initialize AI adapter: {e}")
            self.ai_adapter = None
    
    async def create_from_tool_execution(
        self,
        db: AsyncSession,
        tool_execution: ToolExecution,
        analyze_with_ai: bool = True
    ) -> ActivityLog:
        """Create activity log entry from tool execution"""
        try:
            # Get tool name
            tool_name = "Unknown"
            if tool_execution.tool:
                tool_name = tool_execution.tool.name
            
            # Get target value
            target_value = None
            if tool_execution.target:
                target_value = tool_execution.target.target_value
            
            # Create base activity log
            activity_log = ActivityLog(
                project_id=tool_execution.project_id,
                tool_execution_id=tool_execution.id,
                activity_type="tool_execution",
                timestamp=tool_execution.start_time or tool_execution.created_at,
                tool_name=tool_name,
                command=tool_execution.command_executed,
                raw_output=tool_execution.output,
                normalized_output=tool_execution.output,  # Can be enhanced later
                metadata={
                    "exit_code": tool_execution.exit_code,
                    "status": tool_execution.execution_status,
                    "target_id": tool_execution.target_id
                }
            )
            
            # AI analysis if enabled and adapter available
            if analyze_with_ai and self.ai_adapter and self.ai_adapter.is_available():
                try:
                    analysis = await self.ai_adapter.analyze_activity(
                        tool_name=tool_name,
                        command=tool_execution.command_executed or "",
                        output=tool_execution.output or "",
                        target=target_value
                    )
                    
                    activity_log.ai_summary = analysis.summary
                    activity_log.ai_tags = {
                        "attack_phase": analysis.attack_phase,
                        "mitre_techniques": analysis.mitre_techniques,
                        "tags": analysis.tags
                    }
                    activity_log.model_used = self.ai_adapter.__class__.__name__.replace("Adapter", "").lower()
                    activity_log.confidence = analysis.confidence
                    
                    logger.info(f"AI analysis completed for activity log {activity_log.id}")
                except Exception as e:
                    logger.warning(f"AI analysis failed for tool execution {tool_execution.id}: {e}")
            
            db.add(activity_log)
            await db.commit()
            await db.refresh(activity_log)
            
            logger.info(f"Created activity log {activity_log.id} for tool execution {tool_execution.id}")
            return activity_log
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to create activity log from tool execution: {e}", exc_info=True)
            raise
    
    async def get_project_activities(
        self,
        db: AsyncSession,
        project_id: int,
        limit: int = 100,
        offset: int = 0,
        activity_type: Optional[str] = None,
        tool_name: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[ActivityLog]:
        """Get activities for a project with filtering"""
        try:
            query = select(ActivityLog).where(
                ActivityLog.project_id == project_id
            )
            
            # Apply filters
            if activity_type:
                query = query.where(ActivityLog.activity_type == activity_type)
            if tool_name:
                query = query.where(ActivityLog.tool_name == tool_name)
            if start_date:
                query = query.where(ActivityLog.timestamp >= start_date)
            if end_date:
                query = query.where(ActivityLog.timestamp <= end_date)
            
            # Order by timestamp descending
            query = query.order_by(desc(ActivityLog.timestamp))
            
            # Apply pagination
            query = query.limit(limit).offset(offset)
            
            result = await db.execute(query)
            activities = result.scalars().all()
            
            return list(activities)
            
        except Exception as e:
            logger.error(f"Failed to get project activities: {e}", exc_info=True)
            return []
    
    async def get_activity_timeline(
        self,
        db: AsyncSession,
        project_id: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """Get activity timeline for a project"""
        try:
            activities = await self.get_project_activities(
                db=db,
                project_id=project_id,
                limit=1000,  # Get more for timeline
                start_date=start_date,
                end_date=end_date
            )
            
            timeline = []
            for activity in activities:
                timeline.append({
                    "id": activity.id,
                    "timestamp": activity.timestamp.isoformat() if activity.timestamp else None,
                    "tool_name": activity.tool_name,
                    "command": activity.command,
                    "activity_type": activity.activity_type,
                    "ai_summary": activity.ai_summary,
                    "attack_phase": activity.ai_tags.get("attack_phase") if activity.ai_tags else None,
                    "mitre_techniques": activity.ai_tags.get("mitre_techniques", []) if activity.ai_tags else [],
                    "tags": activity.ai_tags.get("tags", []) if activity.ai_tags else [],
                    "confidence": activity.confidence
                })
            
            return timeline
            
        except Exception as e:
            logger.error(f"Failed to get activity timeline: {e}", exc_info=True)
            return []
    
    async def get_activity_statistics(
        self,
        db: AsyncSession,
        project_id: int
    ) -> Dict[str, Any]:
        """Get statistics for project activities"""
        try:
            # Total activities
            total_query = select(func.count(ActivityLog.id)).where(
                ActivityLog.project_id == project_id
            )
            total_result = await db.execute(total_query)
            total_activities = total_result.scalar() or 0
            
            # Activities by type
            type_query = select(
                ActivityLog.activity_type,
                func.count(ActivityLog.id)
            ).where(
                ActivityLog.project_id == project_id
            ).group_by(ActivityLog.activity_type)
            
            type_result = await db.execute(type_query)
            activities_by_type = {row[0]: row[1] for row in type_result.all()}
            
            # Attack phases distribution
            phase_query = select(
                func.json_extract(ActivityLog.ai_tags, '$.attack_phase'),
                func.count(ActivityLog.id)
            ).where(
                ActivityLog.project_id == project_id,
                ActivityLog.ai_tags.isnot(None)
            ).group_by(
                func.json_extract(ActivityLog.ai_tags, '$.attack_phase')
            )
            
            phase_result = await db.execute(phase_query)
            attack_phases = {}
            for row in phase_result.all():
                phase = row[0]
                count = row[1]
                if phase:
                    attack_phases[phase] = count
            
            # Tools used
            tool_query = select(
                ActivityLog.tool_name,
                func.count(ActivityLog.id)
            ).where(
                ActivityLog.project_id == project_id,
                ActivityLog.tool_name.isnot(None)
            ).group_by(ActivityLog.tool_name)
            
            tool_result = await db.execute(tool_query)
            tools_used = {row[0]: row[1] for row in tool_result.all()}
            
            return {
                "total_activities": total_activities,
                "activities_by_type": activities_by_type,
                "attack_phases": attack_phases,
                "tools_used": tools_used
            }
            
        except Exception as e:
            logger.error(f"Failed to get activity statistics: {e}", exc_info=True)
            return {
                "total_activities": 0,
                "activities_by_type": {},
                "attack_phases": {},
                "tools_used": {}
            }
    
    async def reanalyze_activity(
        self,
        db: AsyncSession,
        activity_id: int,
        model_provider: Optional[str] = None
    ) -> Optional[ActivityLog]:
        """Reanalyze an activity with AI (optionally using different model)"""
        try:
            # Get activity
            query = select(ActivityLog).where(ActivityLog.id == activity_id)
            result = await db.execute(query)
            activity = result.scalar_one_or_none()
            
            if not activity:
                return None
            
            # Use specified model or default
            if model_provider:
                adapter = ai_model_factory.create_adapter(model_provider)
            else:
                adapter = self.ai_adapter
            
            if not adapter or not adapter.is_available():
                raise RuntimeError("AI adapter not available")
            
            # Perform analysis
            analysis = await adapter.analyze_activity(
                tool_name=activity.tool_name or "Unknown",
                command=activity.command or "",
                output=activity.raw_output or "",
                target=None  # Could be extracted from metadata
            )
            
            # Update activity
            activity.ai_summary = analysis.summary
            activity.ai_tags = {
                "attack_phase": analysis.attack_phase,
                "mitre_techniques": analysis.mitre_techniques,
                "tags": analysis.tags
            }
            activity.model_used = adapter.__class__.__name__.replace("Adapter", "").lower()
            activity.confidence = analysis.confidence
            
            await db.commit()
            await db.refresh(activity)
            
            logger.info(f"Reanalyzed activity {activity_id} with {model_provider or 'default'} model")
            return activity
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to reanalyze activity: {e}", exc_info=True)
            return None


# Global instance
activity_log_service = ActivityLogService()

