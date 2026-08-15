"""
AI API routes for BountyFlow Platform
Provides AI-powered recommendations, analysis, and assistance
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from ..services.ai_service import ai_service
from ..models.database import get_db

router = APIRouter()

# Request/Response models
class ChatRequest(BaseModel):
    message: str
    project_id: Optional[int] = None
    page_context: Optional[str] = None
    current_url: Optional[str] = None
    model: Optional[str] = None  # AI model to use: gemini, openai, anthropic

class NextStepsRequest(BaseModel):
    project_id: int
    current_findings: List[str]

class ScopeValidationRequest(BaseModel):
    project_id: int
    target: str

class ToolRecommendationRequest(BaseModel):
    project_id: int
    target_type: str
    vulnerability_type: Optional[str] = None

@router.get("/models")
async def get_available_models():
    """Get list of available AI models based on configuration"""
    import os
    from pathlib import Path
    from dotenv import load_dotenv
    
    # Load environment variables
    env_path = Path(__file__).parent.parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path, override=False)
    
    from ..services.ai_service import _get_active_provider

    available = []

    # Check Gemini
    if os.getenv("GEMINI_API_KEY"):
        available.append("gemini")

    # Check OpenAI
    if os.getenv("OPENAI_API_KEY"):
        available.append("openai")

    # Check Anthropic
    if os.getenv("ANTHROPIC_API_KEY"):
        available.append("anthropic")

    return {
        "available": available,
        "active": _get_active_provider(),
        "default": os.getenv("AI_PROVIDER", "gemini").lower(),
        "models": {
            "gemini": {
                "name": "Gemini",
                "provider": "Google",
                "configured": bool(os.getenv("GEMINI_API_KEY")),
                "model": os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
            },
            "openai": {
                "name": "GPT-4",
                "provider": "OpenAI",
                "configured": bool(os.getenv("OPENAI_API_KEY")),
                "model": os.getenv("OPENAI_MODEL", "gpt-4")
            },
            "anthropic": {
                "name": "Claude",
                "provider": "Anthropic",
                "configured": bool(os.getenv("ANTHROPIC_API_KEY")),
                "model": os.getenv("ANTHROPIC_MODEL", "claude-3-opus-20240229")
            }
        }
    }


@router.get("/active-provider")
async def get_active_provider():
    """Get the currently active AI provider"""
    from ..services.ai_service import _get_active_provider, get_runtime_provider
    return {
        "active": _get_active_provider(),
        "runtime_override": get_runtime_provider()
    }


@router.post("/active-provider")
async def set_active_provider(provider: str):
    """Set the active AI provider at runtime (persists until server restart)"""
    from ..services.ai_service import set_runtime_provider, _get_active_provider
    from ..services.ai_model_adapter import ai_model_factory

    available = ai_model_factory.get_available_adapters()
    provider_lower = provider.lower().strip()

    if provider_lower and provider_lower not in available:
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{provider}' is not available. Available: {available}"
        )

    set_runtime_provider(provider_lower if provider_lower else None)
    return {
        "active": _get_active_provider(),
        "runtime_override": provider_lower or None,
        "available": available
    }


@router.get("/recommendations")
async def get_ai_recommendations(project_id: int):
    """Get AI-powered recommendations for penetration testing"""
    try:
        recommendations = await ai_service.generate_recommendations(project_id)
        return recommendations
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate recommendations: {str(e)}"
        )

@router.get("/analysis")
async def get_ai_analysis(project_id: int):
    """Get AI analysis of current findings"""
    try:
        analysis = await ai_service.analyze_findings(project_id)
        return analysis
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze findings: {str(e)}"
        )

@router.post("/chat")
async def chat_with_ai(request: ChatRequest):
    """Chat with AI assistant about penetration testing"""
    try:
        if not request.message:
            raise HTTPException(status_code=400, detail="Message is required")

        # Build comprehensive context
        context = None
        if request.project_id:
            context = await ai_service._build_project_context(request.project_id)
        
        # Add page context
        if request.page_context:
            if context is None:
                context = {}
            context['current_page'] = request.page_context
            context['current_url'] = request.current_url

        response = await ai_service.chat_with_ai(
            request.message, 
            context, 
            page_context=request.page_context,
            project_id=request.project_id,
            model_provider=request.model
        )
        # report the provider that actually answered, which may differ from the
        # one requested if the request failed over
        used = getattr(ai_service, "last_provider_used", None) or request.model or "gemini"
        return {"response": response, "model_used": used}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI chat failed: {str(e)}"
        )

@router.post("/next-steps")
async def get_next_steps(request: NextStepsRequest):
    """Get AI suggestions for next steps based on current findings"""
    try:
        suggestions = await ai_service.suggest_next_steps(
            request.project_id, 
            request.current_findings
        )
        return suggestions
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to suggest next steps: {str(e)}"
        )

@router.post("/validate-scope")
async def validate_target_scope(request: ScopeValidationRequest):
    """Validate if a target is within project scope using AI"""
    try:
        if not request.target:
            raise HTTPException(status_code=400, detail="Target information is required")

        validation = await ai_service.validate_scope(request.project_id, request.target)
        return validation
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to validate scope: {str(e)}"
        )

@router.post("/tool-recommendations")
async def get_tool_recommendations(request: ToolRecommendationRequest):
    """Get AI recommendations for tools based on target and vulnerability type. Uses configured provider (Gemini, OpenAI, or Anthropic)."""
    try:
        from ..services.ai_service import _is_ai_available

        if not _is_ai_available():
            return []

        # Build context for tool recommendations
        context = await ai_service._build_project_context(request.project_id)
        context.update({
            "target_type": request.target_type,
            "vulnerability_type": request.vulnerability_type
        })

        prompt = f"""
        Based on the following context, recommend the best penetration testing tools:

        Target Type: {request.target_type}
        Vulnerability Type: {request.vulnerability_type or 'General'}
        Project Phase: {context.get('current_phase', 'unknown')}

        Recommend 3-5 tools that would be most effective for this scenario.
        For each tool, provide:
        - Tool name
        - Brief description of why it's suitable
        - Command template or usage example
        - Confidence level (1-10)

        Format as JSON array of tool recommendation objects.
        """

        response_text = await ai_service.generate_content_async(prompt)
        tools = ai_service._parse_tool_recommendations(response_text)
        
        return tools if tools else []

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get tool recommendations: {str(e)}"
        )

@router.get("/capabilities")
async def get_ai_capabilities():
    """Get information about AI service capabilities"""
    from ..services.ai_service import _is_ai_available, _get_active_provider

    active_provider = _get_active_provider()
    return {
        "available": _is_ai_available(),
        "model": active_provider or "none",
        "provider": active_provider,
        "features": [
            "intelligent_recommendations",
            "finding_analysis",
            "chat_assistance",
            "scope_validation",
            "tool_suggestions",
            "attack_path_analysis"
        ],
        "languages": ["en", "zh"],
        "security_settings": "All safety restrictions disabled for penetration testing context"
    }

@router.get("/history")
async def get_conversation_history(
    project_id: Optional[int] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    """Get AI conversation history"""
    from ..models.models import AIConversation
    from sqlalchemy import select, desc
    
    query = select(AIConversation).order_by(desc(AIConversation.created_at)).limit(limit)
    
    if project_id:
        query = query.where(AIConversation.project_id == project_id)
    
    result = await db.execute(query)
    conversations = result.scalars().all()
    
    return {
        "total": len(conversations),
        "conversations": [
            {
                "id": conv.id,
                "project_id": conv.project_id,
                "page_context": conv.page_context,
                "user_message": conv.user_message,
                "ai_response": conv.ai_response,
                "created_at": conv.created_at.isoformat()
            }
            for conv in conversations
        ]
    }

@router.delete("/history")
async def clear_conversation_history(
    project_id: Optional[int] = None,
    confirm_token: str = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Clear AI conversation history with triple confirmation
    Required: confirm_token must be 'CLEAR_AI_HISTORY_CONFIRMED_3_TIMES'
    """
    from ..models.models import AIConversation
    from sqlalchemy import delete
    
    # Triple confirmation check
    if confirm_token != "CLEAR_AI_HISTORY_CONFIRMED_3_TIMES":
        raise HTTPException(
            status_code=400,
            detail="Invalid confirmation token. History clearing requires triple confirmation."
        )
    
    query = delete(AIConversation)
    
    if project_id:
        query = query.where(AIConversation.project_id == project_id)
    
    result = await db.execute(query)
    await db.commit()
    
    return {
        "success": True,
        "deleted_count": result.rowcount,
        "message": f"Successfully cleared {result.rowcount} conversation(s)"
    }

class KnowledgeGraphRequest(BaseModel):
    project_id: int
    graph_data: Dict[str, Any]

@router.post("/analyze-knowledge-graph")
async def analyze_knowledge_graph(request: KnowledgeGraphRequest):
    """Analyze knowledge graph structure and relationships to provide insights"""
    try:
        insights = await ai_service.analyze_knowledge_graph(
            request.project_id,
            request.graph_data
        )
        return {"insights": insights}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze knowledge graph: {str(e)}"
        )
