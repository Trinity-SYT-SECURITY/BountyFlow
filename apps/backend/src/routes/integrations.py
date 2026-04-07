"""
External Tool Integration API Routes
Provides endpoints for importing data from external penetration testing tools
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from ..models.database import get_db
from ..middleware.auth import get_current_user_optional
from ..services.external_tool_integration import external_tool_integration_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/integrations", tags=["integrations"])


class ImportRequest(BaseModel):
    """Request model for importing external tool data"""
    raw_data: str
    project_name: Optional[str] = None
    format_hint: Optional[str] = None  # json, xml, csv, text
    source_tool: Optional[str] = None  # e.g., "PentestGPT", "Nmap", "Burp Suite"


class FormatAnalysisResponse(BaseModel):
    """Response model for format analysis"""
    format: str
    size: int
    estimated_entities: dict
    suggested_actions: list


class ImportResponse(BaseModel):
    """Response model for import operation"""
    project_id: int
    project_name: str
    imported: dict
    confidence: float
    activity_log_id: int


@router.post("/analyze-format", response_model=FormatAnalysisResponse)
async def analyze_format(
    request: ImportRequest,
    current_user: dict = Depends(get_current_user_optional)
):
    """Analyze input format and provide metadata"""
    try:
        analysis = await external_tool_integration_service.analyze_format(
            raw_data=request.raw_data,
            format_hint=request.format_hint
        )
        
        return FormatAnalysisResponse(**analysis)
        
    except Exception as e:
        logger.error(f"Failed to analyze format: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to analyze format: {str(e)}")


@router.post("/import", response_model=ImportResponse)
async def import_external_data(
    request: ImportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Import external tool output into BountyFlow"""
    try:
        user_id = current_user.get("id", 1) if current_user else 1
        
        result = await external_tool_integration_service.normalize_and_import(
            db=db,
            raw_data=request.raw_data,
            project_name=request.project_name,
            format_hint=request.format_hint,
            source_tool=request.source_tool,
            user_id=user_id
        )
        
        return ImportResponse(**result)
        
    except Exception as e:
        logger.error(f"Failed to import external data: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to import: {str(e)}")


@router.post("/import/file")
async def import_from_file(
    file: UploadFile = File(...),
    project_name: Optional[str] = Form(None),
    format_hint: Optional[str] = Form(None),
    source_tool: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Import external tool data from uploaded file"""
    try:
        # Read file content
        content = await file.read()
        raw_data = content.decode("utf-8", errors="ignore")
        
        user_id = current_user.get("id", 1) if current_user else 1
        
        result = await external_tool_integration_service.normalize_and_import(
            db=db,
            raw_data=raw_data,
            project_name=project_name,
            format_hint=format_hint or file.filename.split(".")[-1] if file.filename else None,
            source_tool=source_tool,
            user_id=user_id
        )
        
        return ImportResponse(**result)
        
    except Exception as e:
        logger.error(f"Failed to import from file: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to import from file: {str(e)}")


@router.get("/available-models")
async def get_available_models(
    current_user: dict = Depends(get_current_user_optional)
):
    """Get list of available AI models for analysis"""
    try:
        from ..services.ai_model_adapter import ai_model_factory
        
        available = ai_model_factory.get_available_adapters()
        
        return {
            "available_models": available,
            "default_model": "gemini"
        }
        
    except Exception as e:
        logger.error(f"Failed to get available models: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get models: {str(e)}")

