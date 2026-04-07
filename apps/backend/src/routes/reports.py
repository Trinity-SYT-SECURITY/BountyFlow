"""
Report generation and management API routes
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query, Body
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from datetime import datetime
from pathlib import Path
import base64
import os
import uuid

from ..models.database import get_db
from ..models.models import Report, Project, ToolExecution, User
from ..middleware.auth import get_current_user, get_current_user_optional
from ..services.report_service import ReportService

logger = logging.getLogger(__name__)

router = APIRouter()
report_service = ReportService()

# Image storage directory
UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads" / "report_images"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

@router.post("/generate")
async def generate_report(
    project_id: int = Form(...),
    title: str = Form(...),
    report_type: str = Form("executive"),
    include_all_executions: bool = Form(False),
    include_all_findings: bool = Form(False),
    execution_ids: Optional[str] = Form(None),  # JSON string of execution IDs
    finding_ids: Optional[str] = Form(None),  # JSON string of finding IDs
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Generate a new report using AI"""
    try:
        import json
        
        # Verify project exists first
        project_result = await db.execute(select(Project).where(Project.id == project_id))
        project = project_result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get user ID - handle various cases
        user_id = None
        if isinstance(current_user, dict):
            user_id = current_user.get("user_id")
            # If user_id is None, try to get user by username
            if user_id is None:
                username = current_user.get("username")
                if username and username != "anonymous":
                    from ..models.models import User
                    user_result = await db.execute(select(User).where(User.username == username))
                    user = user_result.scalar_one_or_none()
                    if user:
                        user_id = user.id
        
        # Fallback: use project creator or first user
        if user_id is None:
            # Try to get user from project creator
            if project.created_by:
                user_id = project.created_by
            else:
                # Get first active user as fallback
                from ..models.models import User
                user_result = await db.execute(select(User).where(User.is_active == True).limit(1))
                user = user_result.scalar_one_or_none()
                if user:
                    user_id = user.id
                else:
                    # Last resort: use ID 1
                    user_id = 1
        
        # Ensure user_id is not None
        if user_id is None:
            user_id = 1
        
        # Parse execution and finding IDs
        include_executions = []
        include_findings = []
        
        if execution_ids:
            try:
                include_executions = json.loads(execution_ids)
            except:
                pass
        
        if finding_ids:
            try:
                include_findings = json.loads(finding_ids)
            except:
                pass
        
        # If include_all is True, get all IDs
        if include_all_executions:
            exec_result = await db.execute(
                select(ToolExecution.id).where(
                    ToolExecution.project_id == project_id,
                    ToolExecution.execution_status == "completed"
                )
            )
            include_executions = [row[0] for row in exec_result.fetchall()]
        
        if include_all_findings:
            from ..models.models import KnowledgeNode
            find_result = await db.execute(
                select(KnowledgeNode.id).where(
                    KnowledgeNode.project_id == project_id,
                    KnowledgeNode.node_type == "finding"
                )
            )
            include_findings = [row[0] for row in find_result.fetchall()]
        
        # Generate report content using AI
        markdown_content = await report_service.generate_report_with_ai(
            db, project_id, report_type, include_executions, include_findings
        )
        
        # Create report record
        report = Report(
            project_id=project_id,
            title=title,
            report_type=report_type,
            markdown_content=markdown_content,
            format="markdown",
            included_executions={"ids": include_executions} if include_executions else {},
            included_findings={"ids": include_findings} if include_findings else {},
            generated_by=user_id,
            status="draft",
            content={
                "version": 1,
                "generated_at": datetime.utcnow().isoformat(),
                "ai_generated": True
            }
        )
        
        db.add(report)
        await db.commit()
        await db.refresh(report)
        
        return {
            "id": report.id,
            "title": report.title,
            "project_id": report.project_id,
            "report_type": report.report_type,
            "status": report.status,
            "markdown_content": report.markdown_content,
            "generated_at": report.generated_at.isoformat() if report.generated_at else None
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error generating report: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

@router.get("/project/{project_id}")
async def get_project_reports(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Get all reports for a project"""
    try:
        # Verify project exists
        project_result = await db.execute(select(Project).where(Project.id == project_id))
        project = project_result.scalar_one_or_none()
        if not project:
            return []  # Return empty list if project doesn't exist
        
        result = await db.execute(
            select(Report).where(Report.project_id == project_id).order_by(Report.generated_at.desc())
        )
        reports = result.scalars().all()
        
        import json
        
        return [
            {
                "id": r.id,
                "title": r.title,
                "report_type": r.report_type,
                "status": getattr(r, 'status', 'draft') or 'draft',
                "format": getattr(r, 'format', 'markdown') or 'markdown',
                "generated_at": r.generated_at.isoformat() if r.generated_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at and hasattr(r, 'updated_at') else None,
                "markdown_preview": (r.markdown_content or "")[:200] + "..." if r.markdown_content and len(r.markdown_content) > 200 else (r.markdown_content or ""),
                "included_executions": json.loads(r.included_executions) if isinstance(r.included_executions, str) else (r.included_executions or {}) if hasattr(r, 'included_executions') else {},
                "included_findings": json.loads(r.included_findings) if isinstance(r.included_findings, str) else (r.included_findings or {}) if hasattr(r, 'included_findings') else {}
            }
            for r in reports
        ]
    except Exception as e:
        logger.error(f"Error getting reports: {e}", exc_info=True)
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{report_id}")
async def get_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Get a specific report"""
    try:
        result = await db.execute(select(Report).where(Report.id == report_id))
        report = result.scalar_one_or_none()
        
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        return {
            "id": report.id,
            "project_id": report.project_id,
            "title": report.title,
            "report_type": report.report_type,
            "markdown_content": report.markdown_content or "",
            "format": report.format,
            "status": report.status,
            "included_executions": report.included_executions or {},
            "included_findings": report.included_findings or {},
            "generated_at": report.generated_at.isoformat() if report.generated_at else None,
            "updated_at": report.updated_at.isoformat() if report.updated_at else None
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting report: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{report_id}")
async def update_report(
    report_id: int,
    title: Optional[str] = None,
    markdown_content: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Update report content (edit markdown)"""
    try:
        from sqlalchemy import update
        
        result = await db.execute(select(Report).where(Report.id == report_id))
        report = result.scalar_one_or_none()
        
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        # Update fields
        update_data = {}
        if title is not None:
            update_data["title"] = title
        if markdown_content is not None:
            update_data["markdown_content"] = markdown_content
        if status is not None:
            update_data["status"] = status
        
        update_data["updated_at"] = datetime.utcnow()
        
        await db.execute(
            update(Report).where(Report.id == report_id).values(**update_data)
        )
        await db.commit()
        
        # Refresh and return complete report data (matching GET format)
        await db.refresh(report)
        return {
            "id": report.id,
            "project_id": report.project_id,
            "title": report.title,
            "report_type": report.report_type,
            "markdown_content": report.markdown_content or "",
            "format": report.format,
            "status": report.status,
            "included_executions": report.included_executions or {},
            "included_findings": report.included_findings or {},
            "generated_at": report.generated_at.isoformat() if report.generated_at else None,
            "updated_at": report.updated_at.isoformat() if report.updated_at else None
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating report: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{report_id}/add-execution")
async def add_execution_to_report(
    report_id: int,
    execution_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Add a tool execution result to the report"""
    try:
        from sqlalchemy import update
        
        result = await db.execute(select(Report).where(Report.id == report_id))
        report = result.scalar_one_or_none()
        
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        # Verify execution exists
        exec_result = await db.execute(
            select(ToolExecution).where(ToolExecution.id == execution_id)
        )
        execution = exec_result.scalar_one_or_none()
        
        if not execution:
            raise HTTPException(status_code=404, detail="Execution not found")
        
        # Add execution ID to included_executions
        included = report.included_executions or {}
        execution_ids = included.get("ids", [])
        
        if execution_id not in execution_ids:
            execution_ids.append(execution_id)
            included["ids"] = execution_ids
            
            await db.execute(
                update(Report).where(Report.id == report_id).values(
                    included_executions=included,
                    updated_at=datetime.utcnow()
                )
            )
            await db.commit()
        
        return {"message": "Execution added to report", "execution_id": execution_id}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error adding execution to report: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{report_id}/remove-execution/{execution_id}")
async def remove_execution_from_report(
    report_id: int,
    execution_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Remove a tool execution from the report"""
    try:
        from sqlalchemy import update
        
        result = await db.execute(select(Report).where(Report.id == report_id))
        report = result.scalar_one_or_none()
        
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        # Remove execution ID from included_executions
        included = report.included_executions or {}
        execution_ids = included.get("ids", [])
        
        if execution_id in execution_ids:
            execution_ids.remove(execution_id)
            included["ids"] = execution_ids
            
            await db.execute(
                update(Report).where(Report.id == report_id).values(
                    included_executions=included,
                    updated_at=datetime.utcnow()
                )
            )
            await db.commit()
        
        return {"message": "Execution removed from report"}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error removing execution from report: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{report_id}/upload-image")
async def upload_image(
    report_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Upload an image for the report"""
    try:
        result = await db.execute(select(Report).where(Report.id == report_id))
        report = result.scalar_one_or_none()
        
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        # Validate file type - allow images
        allowed_types = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "image/svg+xml"]
        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid file type. Allowed types: {', '.join(allowed_types)}"
            )
        
        # Validate file size (max 10MB)
        content = await file.read()
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large. Maximum size: 10MB")
        
        # Reset file pointer
        await file.seek(0)
        
        # Generate unique filename
        file_ext = Path(file.filename).suffix if file.filename else ".png"
        filename = f"{report_id}_{uuid.uuid4().hex[:8]}{file_ext}"
        file_path = UPLOAD_DIR / filename
        
        # Ensure directory exists
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        
        # Save file
        with open(file_path, "wb") as f:
            f.write(content)
        
        logger.info(f"Saved image to: {file_path}")
        
        # Return markdown image reference
        # Using relative path that frontend can serve
        image_url = f"/uploads/report_images/{filename}"
        markdown_image = f"![{file.filename or 'Image'}]({image_url})"
        
        return {
            "url": image_url,
            "markdown": markdown_image,
            "filename": filename
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading image: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{report_id}/upload-file")
async def upload_file(
    report_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Upload a file (document) for the report"""
    try:
        result = await db.execute(select(Report).where(Report.id == report_id))
        report = result.scalar_one_or_none()
        
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        # Validate file type - allow documents
        allowed_types = [
            "application/pdf",
            "text/plain",
            "text/markdown",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # DOCX
            "application/msword"  # DOC
        ]
        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type. Allowed types: PDF, TXT, MD, DOC, DOCX"
            )
        
        # Validate file size (max 50MB for documents)
        content = await file.read()
        if len(content) > 50 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large. Maximum size: 50MB")
        
        # Reset file pointer
        await file.seek(0)
        
        # Create separate directory for documents
        DOCS_DIR = UPLOAD_DIR.parent / "report_documents"
        DOCS_DIR.mkdir(parents=True, exist_ok=True)
        
        # Generate unique filename
        file_ext = Path(file.filename).suffix if file.filename else ".txt"
        filename = f"{report_id}_{uuid.uuid4().hex[:8]}{file_ext}"
        file_path = DOCS_DIR / filename
        
        # Save file
        with open(file_path, "wb") as f:
            f.write(content)
        
        logger.info(f"Saved document to: {file_path}")
        
        # Return markdown link reference
        file_url = f"/uploads/report_documents/{filename}"
        markdown_link = f"[{file.filename or 'Document'}]({file_url})"
        
        return {
            "url": file_url,
            "markdown": markdown_link,
            "filename": filename
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading file: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{report_id}/executions")
async def get_available_executions(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Get available tool executions for a report (for selection modal)"""
    try:
        result = await db.execute(select(Report).where(Report.id == report_id))
        report = result.scalar_one_or_none()
        
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        # Get all completed executions for this project
        exec_result = await db.execute(
            select(ToolExecution).where(
                ToolExecution.project_id == report.project_id,
                ToolExecution.execution_status == "completed"
            ).order_by(ToolExecution.start_time.desc())
        )
        executions = exec_result.scalars().all()
        
        # Get tool names
        tool_ids = list(set([e.tool_id for e in executions if e.tool_id]))
        tools_map = {}
        if tool_ids:
            from ..models.models import Tool
            tools_result = await db.execute(select(Tool).where(Tool.id.in_(tool_ids)))
            tools = tools_result.scalars().all()
            tools_map = {t.id: t.name for t in tools}
        
        # Get included execution IDs
        included_ids = (report.included_executions or {}).get("ids", [])
        
        return [
            {
                "id": e.id,
                "tool_id": e.tool_id,
                "tool_name": tools_map.get(e.tool_id, "Unknown Tool"),
                "command_executed": e.command_executed or "",
                "output_preview": (e.output or "")[:200] + "..." if e.output and len(e.output) > 200 else (e.output or ""),
                "output_length": len(e.output or ""),
                "exit_code": e.exit_code,
                "start_time": e.start_time.isoformat() if e.start_time else None,
                "end_time": e.end_time.isoformat() if e.end_time else None,
                "included": e.id in included_ids
            }
            for e in executions
        ]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting executions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

class FormatExecutionsRequest(BaseModel):
    execution_ids: List[int]
    include_output: bool = True
    redact_sensitive: bool = False
    summarize: bool = False

@router.post("/{report_id}/format-executions")
async def format_executions_for_report(
    report_id: int,
    request: FormatExecutionsRequest = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Format selected executions and return as Markdown to insert into report"""
    try:
        result = await db.execute(select(Report).where(Report.id == report_id))
        report = result.scalar_one_or_none()
        
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        if not request.execution_ids:
            raise HTTPException(status_code=400, detail="No execution IDs provided")
        
        # Get executions
        exec_result = await db.execute(
            select(ToolExecution).where(
                ToolExecution.id.in_(request.execution_ids),
                ToolExecution.project_id == report.project_id
            )
        )
        executions = exec_result.scalars().all()
        
        # Get tool names
        tool_ids = list(set([e.tool_id for e in executions if e.tool_id]))
        tools_map = {}
        if tool_ids:
            from ..models.models import Tool
            tools_result = await db.execute(select(Tool).where(Tool.id.in_(tool_ids)))
            tools = tools_result.scalars().all()
            tools_map = {t.id: t.name for t in tools}
        
        # Format each execution
        markdown_sections = []
        for exec in executions:
            exec_dict = {
                "id": exec.id,
                "tool_id": exec.tool_id,
                "tool_name": tools_map.get(exec.tool_id, "Unknown Tool"),
                "command_executed": exec.command_executed or "",
                "output": exec.output or "",
                "error_output": exec.error_output or "",
                "exit_code": exec.exit_code,
                "start_time": exec.start_time.isoformat() if exec.start_time else None
            }
            
            # Summarize if requested
            if request.summarize and exec_dict.get("output"):
                exec_dict["output"] = await report_service.summarize_execution_output(exec_dict)
            
            formatted = report_service.format_execution_for_report(
                exec_dict, 
                include_output=request.include_output,
                redact_sensitive=request.redact_sensitive
            )
            markdown_sections.append(formatted)
        
        return {
            "markdown": "\n\n".join(markdown_sections),
            "count": len(markdown_sections)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error formatting executions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

class RedactTextRequest(BaseModel):
    text: str

@router.post("/{report_id}/redact-text")
async def redact_text(
    report_id: int,
    request: RedactTextRequest = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Redact sensitive information from text"""
    try:
        redacted = report_service._redact_sensitive_info(request.text)
        return {"redacted_text": redacted}
    except Exception as e:
        logger.error(f"Error redacting text: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{report_id}/export/{format}")
async def export_report(
    report_id: int,
    format: str,  # pdf, html, markdown
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Export report in various formats"""
    try:
        result = await db.execute(select(Report).where(Report.id == report_id))
        report = result.scalar_one_or_none()
        
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        markdown_content = report.markdown_content or ""

        # Fix lazy numbered lists (1. 1. 1. → 1. 2. 3.) for all export formats
        markdown_content = ReportService._fix_lazy_numbering(markdown_content)

        if format == "markdown":
            from fastapi.responses import Response
            return Response(
                content=markdown_content,
                media_type="text/markdown",
                headers={
                    "Content-Disposition": f'attachment; filename="{report.title.replace(" ", "_")}.md"'
                }
            )
        
        elif format == "html":
            try:
                import markdown
                import re as _re
                from markdown.extensions import codehilite, fenced_code
                _md = ReportService._normalize_list_indent(markdown_content)
                # Only add blank lines before top-level list items; indented
                # sub-items must stay attached to their parent for nesting.
                _md = _re.sub(r'([^\n])\n([-*+] )', r'\1\n\n\2', _md)
                _md = _re.sub(r'([^\n])\n(\d+\. )', r'\1\n\n\2', _md)
                html_content = markdown.markdown(
                    _md,
                    extensions=['codehilite', 'fenced_code', 'tables', 'sane_lists']
                )
                html_content = ReportService._fix_ol_start_attributes(html_content)

                # Wrap in proper HTML document
                full_html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{report.title}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 20px;
            line-height: 1.6;
            color: #333;
            background: #fff;
        }}
        h1, h2, h3, h4, h5, h6 {{
            color: #2c3e50;
            margin-top: 2em;
        }}
        code {{
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
        }}
        pre {{
            background: #2d2d2d;
            color: #f8f8f2;
            padding: 16px;
            border-radius: 5px;
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }}
        pre code {{
            background: transparent;
            padding: 0;
            color: inherit;
            white-space: pre-wrap;
            word-wrap: break-word;
        }}
        img {{
            max-width: 100%;
            height: auto;
            border-radius: 5px;
        }}
        table {{
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
        }}
        th, td {{
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }}
        th {{
            background-color: #4CAF50;
            color: white;
        }}
        ul, ol {{
            padding-left: 2em;
            margin: 0.5em 0;
        }}
        ul {{
            list-style-type: disc;
        }}
        ol {{
            list-style-type: decimal;
        }}
        li {{
            margin-bottom: 0.3em;
        }}
        li > ul, li > ol {{
            margin-top: 0.2em;
            margin-bottom: 0.2em;
        }}
        ul ul {{
            list-style-type: circle;
        }}
        ul ul ul {{
            list-style-type: square;
        }}
        ol ol {{
            list-style-type: lower-alpha;
        }}
        ol ol ol {{
            list-style-type: lower-roman;
        }}
        blockquote {{
            border-left: 4px solid #4CAF50;
            margin: 1em 0;
            padding: 0.5em 1em;
            background: #f9f9f9;
            color: #555;
        }}
        hr {{
            border: none;
            border-top: 1px solid #ddd;
            margin: 1.5em 0;
        }}
    </style>
</head>
<body>
    <h1>{report.title}</h1>
    <p><em>Generated: {report.generated_at.strftime('%Y-%m-%d %H:%M:%S UTC') if report.generated_at else 'N/A'}</em></p>
    <hr>
    {html_content}
</body>
</html>"""

                from fastapi.responses import Response
                return Response(
                    content=full_html,
                    media_type="text/html",
                    headers={
                        "Content-Disposition": f'attachment; filename="{report.title.replace(" ", "_")}.html"'
                    }
                )
            except ImportError:
                raise HTTPException(status_code=500, detail="markdown library not installed. Install with: pip install markdown")
        
        elif format == "pdf":
            try:
                from weasyprint import HTML, CSS
                from io import BytesIO
                
                # Convert markdown to HTML first
                import markdown
                import re as _re
                _md = ReportService._normalize_list_indent(markdown_content)
                _md = _re.sub(r'([^\n])\n([-*+] )', r'\1\n\n\2', _md)
                _md = _re.sub(r'([^\n])\n(\d+\. )', r'\1\n\n\2', _md)
                html_content = markdown.markdown(
                    _md,
                    extensions=['codehilite', 'fenced_code', 'tables', 'sane_lists']
                )
                html_content = ReportService._fix_ol_start_attributes(html_content)

                full_html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{report.title}</title>
    <style>
        @page {{
            size: A4;
            margin: 2cm;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
        }}
        h1, h2, h3, h4, h5, h6 {{
            color: #2c3e50;
            page-break-after: avoid;
        }}
        code {{
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
        }}
        pre {{
            background: #1e1e1e;
            color: #d4d4d4;
            padding: 16px;
            border-radius: 5px;
            page-break-inside: avoid;
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-size: 0.85em;
            line-height: 1.5;
        }}
        pre code {{
            background: transparent;
            padding: 0;
            color: inherit;
            white-space: pre-wrap;
            word-wrap: break-word;
        }}
        .codehilite, .highlight {{
            background: #1e1e1e;
            border-radius: 5px;
            padding: 0;
        }}
        .codehilite pre, .highlight pre {{
            margin: 0;
        }}
        img {{
            max-width: 100%;
            height: auto;
            page-break-inside: avoid;
        }}
        table {{
            border-collapse: collapse;
            width: 100%;
            page-break-inside: avoid;
        }}
        th, td {{
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }}
        th {{
            background-color: #4CAF50;
            color: white;
        }}
        ul, ol {{
            padding-left: 2em;
            margin: 0.5em 0;
        }}
        ul {{
            list-style-type: disc;
        }}
        ol {{
            list-style-type: decimal;
        }}
        li {{
            margin-bottom: 0.3em;
        }}
        li > ul, li > ol {{
            margin-top: 0.2em;
            margin-bottom: 0.2em;
        }}
        ul ul {{
            list-style-type: circle;
        }}
        ul ul ul {{
            list-style-type: square;
        }}
        ol ol {{
            list-style-type: lower-alpha;
        }}
        ol ol ol {{
            list-style-type: lower-roman;
        }}
        blockquote {{
            border-left: 4px solid #4CAF50;
            margin: 1em 0;
            padding: 0.5em 1em;
            background: #f9f9f9;
            color: #555;
        }}
        hr {{
            border: none;
            border-top: 1px solid #ddd;
            margin: 1.5em 0;
        }}
    </style>
</head>
<body>
    <h1>{report.title}</h1>
    <p><em>Generated: {report.generated_at.strftime('%Y-%m-%d %H:%M:%S UTC') if report.generated_at else 'N/A'}</em></p>
    <hr>
    {html_content}
</body>
</html>"""

                pdf_buffer = BytesIO()
                HTML(string=full_html).write_pdf(pdf_buffer)
                pdf_buffer.seek(0)
                
                from fastapi.responses import Response
                return Response(
                    content=pdf_buffer.read(),
                    media_type="application/pdf",
                    headers={
                        "Content-Disposition": f'attachment; filename="{report.title.replace(" ", "_")}.pdf"'
                    }
                )
            except ImportError:
                raise HTTPException(
                    status_code=500, 
                    detail="weasyprint library not installed. Install with: pip install weasyprint"
                )
        
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported format: {format}")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting report: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

