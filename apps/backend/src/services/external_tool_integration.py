"""
External Tool Integration Service for BountyFlow
AI-powered format normalization and automatic project creation from external tool outputs
"""

import logging
import json
import xml.etree.ElementTree as ET
import csv
import io
from typing import Dict, Any, List, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.models import Project, Target, KnowledgeNode, DiscoveredUser, DiscoveredFile, ToolExecution, ActivityLog
from .ai_model_adapter import ai_model_factory, NormalizedData
from .activity_log_service import activity_log_service

logger = logging.getLogger(__name__)


class FormatDetector:
    """Detects input data format automatically"""
    
    @staticmethod
    def detect_format(data: str) -> str:
        """Detect format of input data"""
        data_stripped = data.strip()
        
        # JSON
        if data_stripped.startswith("{") or data_stripped.startswith("["):
            try:
                json.loads(data_stripped)
                return "json"
            except:
                pass
        
        # XML
        if data_stripped.startswith("<"):
            try:
                ET.fromstring(data_stripped)
                return "xml"
            except:
                pass
        
        # CSV
        if "\t" in data_stripped or "," in data_stripped:
            try:
                csv.Sniffer().sniff(data_stripped[:1024])
                return "csv"
            except:
                pass
        
        # Plain text
        return "text"


class ExternalToolIntegrationService:
    """Service for integrating external tool outputs"""
    
    def __init__(self):
        self.format_detector = FormatDetector()
        self.ai_adapter = None
        self._initialize_ai()
    
    def _initialize_ai(self):
        """Initialize AI adapter for format normalization"""
        try:
            self.ai_adapter = ai_model_factory.create_adapter()
            if self.ai_adapter.is_available():
                logger.info("External tool integration service initialized with AI support")
            else:
                logger.warning("External tool integration service initialized without AI support")
        except Exception as e:
            logger.warning(f"Failed to initialize AI adapter: {e}")
            self.ai_adapter = None
    
    async def analyze_format(
        self,
        raw_data: str,
        format_hint: Optional[str] = None
    ) -> Dict[str, Any]:
        """Analyze input format and provide metadata"""
        detected_format = format_hint or self.format_detector.detect_format(raw_data)
        
        return {
            "format": detected_format,
            "size": len(raw_data),
            "estimated_entities": self._estimate_entity_count(raw_data, detected_format),
            "suggested_actions": self._suggest_actions(detected_format)
        }
    
    def _estimate_entity_count(self, data: str, format_type: str) -> Dict[str, int]:
        """Estimate number of entities in data"""
        estimates = {"targets": 0, "findings": 0, "users": 0, "files": 0}
        
        if format_type == "json":
            try:
                parsed = json.loads(data)
                if isinstance(parsed, list):
                    estimates["findings"] = len(parsed)
                elif isinstance(parsed, dict):
                    estimates["findings"] = 1
            except:
                pass
        elif format_type == "csv":
            lines = data.split("\n")
            estimates["findings"] = max(0, len(lines) - 1)  # Exclude header
        
        return estimates
    
    def _suggest_actions(self, format_type: str) -> List[str]:
        """Suggest actions based on format"""
        actions = ["normalize", "import"]
        
        if format_type == "text":
            actions.append("ai_extraction")
        
        return actions
    
    async def normalize_and_import(
        self,
        db: AsyncSession,
        raw_data: str,
        project_name: Optional[str] = None,
        format_hint: Optional[str] = None,
        source_tool: Optional[str] = None,
        user_id: int = 1
    ) -> Dict[str, Any]:
        """Normalize external tool output and import into BountyFlow"""
        try:
            # Detect format
            detected_format = format_hint or self.format_detector.detect_format(raw_data)
            logger.info(f"Detected format: {detected_format}")
            
            # Normalize using AI
            if not self.ai_adapter or not self.ai_adapter.is_available():
                raise RuntimeError("AI adapter not available for normalization")
            
            normalized = await self.ai_adapter.normalize_format(
                raw_data=raw_data,
                format_hint=detected_format
            )
            
            logger.info(
                f"Normalized data: {len(normalized.targets)} targets, "
                f"{len(normalized.findings)} findings, "
                f"{len(normalized.discovered_users)} users"
            )
            
            # Create or get project
            if project_name:
                project = await self._get_or_create_project(
                    db=db,
                    name=project_name,
                    user_id=user_id,
                    source_tool=source_tool
                )
            else:
                # Auto-generate project name
                project_name = f"Imported from {source_tool or 'External Tool'} - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
                project = await self._get_or_create_project(
                    db=db,
                    name=project_name,
                    user_id=user_id,
                    source_tool=source_tool
                )
            
            # Import entities
            import_results = await self._import_normalized_data(
                db=db,
                project_id=project.id,
                normalized_data=normalized,
                source_tool=source_tool
            )
            
            # Create activity log for import
            activity_log = ActivityLog(
                project_id=project.id,
                activity_type="external_import",
                timestamp=datetime.now(),
                tool_name=source_tool or "External Tool",
                command="Import from external tool",
                raw_output=raw_data[:10000],  # Truncate for storage
                normalized_output=json.dumps({
                    "targets_count": len(normalized.targets),
                    "findings_count": len(normalized.findings),
                    "users_count": len(normalized.discovered_users),
                    "files_count": len(normalized.discovered_files)
                }),
                ai_summary=f"Imported {len(normalized.findings)} findings from {source_tool or 'external tool'}",
                metadata={
                    "source_tool": source_tool,
                    "format": detected_format,
                    "confidence": normalized.confidence,
                    "import_timestamp": datetime.now().isoformat()
                }
            )
            
            db.add(activity_log)
            await db.commit()
            
            return {
                "project_id": project.id,
                "project_name": project.name,
                "imported": import_results,
                "confidence": normalized.confidence,
                "activity_log_id": activity_log.id
            }
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to normalize and import: {e}", exc_info=True)
            raise
    
    async def _get_or_create_project(
        self,
        db: AsyncSession,
        name: str,
        user_id: int,
        source_tool: Optional[str] = None
    ) -> Project:
        """Get existing project or create new one"""
        from sqlalchemy import select
        
        # Check if project with same name exists
        query = select(Project).where(Project.name == name)
        result = await db.execute(query)
        existing = result.scalar_one_or_none()
        
        if existing:
            logger.info(f"Using existing project: {existing.id}")
            return existing
        
        # Create new project
        project = Project(
            name=name,
            description=f"Auto-created from {source_tool or 'external tool'} import",
            status="active",
            created_by=user_id,
            target_scope={},
            out_of_scope={}
        )
        
        db.add(project)
        await db.commit()
        await db.refresh(project)
        
        logger.info(f"Created new project: {project.id}")
        return project
    
    async def _import_normalized_data(
        self,
        db: AsyncSession,
        project_id: int,
        normalized_data: NormalizedData,
        source_tool: Optional[str] = None
    ) -> Dict[str, Any]:
        """Import normalized data into database"""
        imported = {
            "targets": 0,
            "findings": 0,
            "discovered_users": 0,
            "discovered_files": 0,
            "tool_executions": 0
        }
        
        # Import targets
        for target_data in normalized_data.targets:
            try:
                target = Target(
                    project_id=project_id,
                    target_type=target_data.get("type", "unknown"),
                    target_value=target_data.get("value", ""),
                    status="pending",
                    priority=5,
                    notes=json.dumps(target_data.get("metadata", {}))
                )
                db.add(target)
                imported["targets"] += 1
            except Exception as e:
                logger.warning(f"Failed to import target: {e}")
        
        # Import findings as KnowledgeNodes
        for finding_data in normalized_data.findings:
            try:
                finding_node = KnowledgeNode(
                    project_id=project_id,
                    node_type="vulnerability",
                    node_data={
                        "title": finding_data.get("title", "Imported Finding"),
                        "description": finding_data.get("description", ""),
                        "severity": finding_data.get("severity", "medium"),
                        "status": "open",
                        "source": "external_import",
                        **finding_data.get("metadata", {})
                    },
                    created_by=1  # Default user
                )
                db.add(finding_node)
                imported["findings"] += 1
            except Exception as e:
                logger.warning(f"Failed to import finding: {e}")
        
        # Import discovered users
        for user_data in normalized_data.discovered_users:
            try:
                discovered_user = DiscoveredUser(
                    project_id=project_id,
                    username=user_data.get("username", ""),
                    domain=user_data.get("domain"),
                    notes=json.dumps(user_data.get("metadata", {}))
                )
                db.add(discovered_user)
                imported["discovered_users"] += 1
            except Exception as e:
                logger.warning(f"Failed to import discovered user: {e}")
        
        # Import discovered files
        for file_data in normalized_data.discovered_files:
            try:
                discovered_file = DiscoveredFile(
                    project_id=project_id,
                    file_path=file_data.get("path", ""),
                    file_type=file_data.get("type", "unknown"),
                    notes=json.dumps(file_data.get("metadata", {}))
                )
                db.add(discovered_file)
                imported["discovered_files"] += 1
            except Exception as e:
                logger.warning(f"Failed to import discovered file: {e}")
        
        # Import tool executions
        for exec_data in normalized_data.tool_executions:
            try:
                # Need to find or create tool first
                from ..models.models import Tool
                from sqlalchemy import select
                
                tool_name = exec_data.get("tool_name", "Unknown")
                tool_query = select(Tool).where(
                    Tool.project_id == project_id,
                    Tool.name == tool_name
                )
                tool_result = await db.execute(tool_query)
                tool = tool_result.scalar_one_or_none()
                
                if not tool:
                    # Create tool
                    tool = Tool(
                        project_id=project_id,
                        name=tool_name,
                        description=f"Auto-created from {source_tool or 'external'} import",
                        tool_type="external"
                    )
                    db.add(tool)
                    await db.flush()
                
                tool_execution = ToolExecution(
                    project_id=project_id,
                    tool_id=tool.id,
                    executed_by=1,  # Default user
                    command_executed=exec_data.get("command", ""),
                    execution_status="completed",
                    output=exec_data.get("output", ""),
                    start_time=datetime.fromisoformat(exec_data.get("timestamp", datetime.now().isoformat()))
                )
                db.add(tool_execution)
                imported["tool_executions"] += 1
            except Exception as e:
                logger.warning(f"Failed to import tool execution: {e}")
        
        await db.commit()
        
        logger.info(f"Imported data: {imported}")
        return imported


# Global instance
external_tool_integration_service = ExternalToolIntegrationService()

