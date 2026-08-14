from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import uuid
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, text
from sqlalchemy.exc import OperationalError
from ..models.database import get_db
from ..models.models import Workflow, WorkflowExecution
from ..middleware.auth import get_current_user_optional
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

class WorkflowBase(BaseModel):
    name: str
    description: Optional[str] = ""
    tools: Optional[Dict[str, Any]] = {}  # Changed from List[dict] to Dict to match DB model
    status: str = "active"

class WorkflowResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""
    tools: Optional[Dict[str, Any]] = {}
    status: str
    created_at: str
    updated_at: str

class ExecutionHistoryCreate(BaseModel):
    workflow_id: int
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    target_name: Optional[str] = None
    target_ids: Optional[List[int]] = None
    status: str = "completed"
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    execution_results: Optional[List[Dict[str, Any]]] = None
    summary: Optional[str] = None

class ExecutionHistoryResponse(BaseModel):
    id: int
    workflow_id: int
    workflow_name: Optional[str] = None
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    target_name: Optional[str] = None
    status: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_seconds: Optional[float] = None
    execution_results: Optional[List[Dict[str, Any]]] = None
    summary: Optional[str] = None
    total_steps: Optional[int] = None
    completed_steps: Optional[int] = None
    failed_steps: Optional[int] = None
    created_at: str

@router.get("", response_model=List[WorkflowResponse])
async def get_workflows(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Get all workflows"""
    try:
        # First check if table exists using raw SQL
        try:
            check_table_query = text("SELECT name FROM sqlite_master WHERE type='table' AND name='workflows'")
            table_check = await db.execute(check_table_query)
            table_exists = table_check.fetchone() is not None
            
            if not table_exists:
                logger.warning("Workflows table does not exist yet. Returning empty list.")
                empty_list: List[WorkflowResponse] = []
                return empty_list
        except Exception as table_check_error:
            logger.warning(f"Could not check if workflows table exists: {table_check_error}. Continuing...")
        
        # Try to query workflows
        try:
            result = await db.execute(select(Workflow))
            workflows = result.scalars().all()
        except Exception as query_error:
            error_msg = str(query_error).lower()
            if "no such table" in error_msg or "does not exist" in error_msg:
                logger.warning("Workflows table does not exist. Returning empty list.")
                empty_list: List[WorkflowResponse] = []
                return empty_list
            # Re-raise if it's a different error
            raise
        
        # Return empty list if no workflows
        if not workflows:
            return []
        
        workflow_list = []
        for workflow in workflows:
            try:
                # Safely format datetime fields
                created_at_str = ""
                updated_at_str = ""
                
                if workflow.created_at:
                    if isinstance(workflow.created_at, datetime):
                        created_at_str = workflow.created_at.isoformat()
                    elif hasattr(workflow.created_at, 'isoformat'):
                        created_at_str = workflow.created_at.isoformat()
                    else:
                        created_at_str = str(workflow.created_at)
                
                if workflow.updated_at:
                    if isinstance(workflow.updated_at, datetime):
                        updated_at_str = workflow.updated_at.isoformat()
                    elif hasattr(workflow.updated_at, 'isoformat'):
                        updated_at_str = workflow.updated_at.isoformat()
                    else:
                        updated_at_str = str(workflow.updated_at)
                
                # Safely handle tools field
                tools_data = {}
                if workflow.tools:
                    if isinstance(workflow.tools, dict):
                        tools_data = workflow.tools
                    elif isinstance(workflow.tools, str):
                        try:
                            import json
                            tools_data = json.loads(workflow.tools)
                        except:
                            tools_data = {}
                
                workflow_list.append(WorkflowResponse(
                    id=str(workflow.id),
                    name=workflow.name or "",
                    description=workflow.description or "",
                    tools=tools_data,
                    status=workflow.status or "active",
                    created_at=created_at_str,
                    updated_at=updated_at_str
                ))
            except Exception as workflow_error:
                logger.error(f"Error processing workflow {workflow.id}: {workflow_error}", exc_info=True)
                # Skip this workflow and continue
                continue
        
        return workflow_list
    except Exception as e:
        logger.error(f"Error getting workflows: {e}", exc_info=True)
        # Check if it's a table not found error
        error_msg = str(e).lower()
        if "no such table" in error_msg or "does not exist" in error_msg:
            logger.warning("Workflows table does not exist yet. Returning empty list.")
            return []
        # Return empty list instead of raising error for better UX
        return []

@router.post("", response_model=WorkflowResponse)
async def create_workflow(
    workflow: WorkflowBase, 
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Create a new workflow"""
    try:
        # Check if a workflow with the same name already exists
        result = await db.execute(select(Workflow).where(Workflow.name == workflow.name))
        existing_workflow = result.scalar_one_or_none()
        if existing_workflow:
            raise HTTPException(
                status_code=400, 
                detail={"error": "Workflow already exists", "message": "Workflow with this name already exists"}
            )
        
        # Convert tools to dict if it's a list (for backward compatibility)
        tools_data = workflow.tools
        if isinstance(tools_data, list):
            # Convert list to dict format
            tools_data = {"steps": tools_data} if tools_data else {}
        
        # Create a new workflow record
        db_workflow = Workflow(
            name=workflow.name,
            description=workflow.description or "",
            tools=tools_data or {},
            status=workflow.status or "active"
        )
        
        db.add(db_workflow)
        await db.commit()
        await db.refresh(db_workflow)
        
        # Log the creation
        logger.info(f"Workflow created: {db_workflow.id} - {workflow.name}")
        
        return WorkflowResponse(
            id=str(db_workflow.id),
            name=db_workflow.name,
            description=db_workflow.description or "",
            tools=db_workflow.tools or {},
            status=db_workflow.status,
            created_at=db_workflow.created_at.isoformat() if db_workflow.created_at else "",
            updated_at=db_workflow.updated_at.isoformat() if db_workflow.updated_at else ""
        )
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error creating workflow: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, 
            detail={"error": "Failed to create workflow", "message": str(e)}
        )

@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: str, 
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Get a specific workflow"""
    try:
        result = await db.execute(select(Workflow).where(Workflow.id == int(workflow_id)))
        workflow = result.scalar_one_or_none()
        if not workflow:
            raise HTTPException(
                status_code=404, 
                detail={"error": "Not found", "message": "Workflow not found"}
            )
        
        return WorkflowResponse(
            id=str(workflow.id),
            name=workflow.name,
            description=workflow.description or "",
            tools=workflow.tools or {},
            status=workflow.status,
            created_at=workflow.created_at.isoformat() if workflow.created_at else "",
            updated_at=workflow.updated_at.isoformat() if workflow.updated_at else ""
        )
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail={"error": "Invalid workflow ID", "message": "Workflow ID must be a number"}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting workflow {workflow_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to get workflow", "message": str(e)}
        )

@router.put("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: str, 
    workflow: WorkflowBase, 
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Update a workflow"""
    try:
        result = await db.execute(select(Workflow).where(Workflow.id == int(workflow_id)))
        db_workflow = result.scalar_one_or_none()
        if not db_workflow:
            raise HTTPException(
                status_code=404,
                detail={"error": "Not found", "message": "Workflow not found"}
            )
        
        # Convert tools to dict if it's a list (for backward compatibility)
        tools_data = workflow.tools
        if isinstance(tools_data, list):
            tools_data = {"steps": tools_data} if tools_data else {}
        
        # Update workflow fields
        db_workflow.name = workflow.name
        db_workflow.description = workflow.description or ""
        db_workflow.tools = tools_data or {}
        db_workflow.status = workflow.status or "active"
        
        await db.commit()
        await db.refresh(db_workflow)
        
        logger.info(f"Workflow updated: {db_workflow.id} - {workflow.name}")
        
        return WorkflowResponse(
            id=str(db_workflow.id),
            name=db_workflow.name,
            description=db_workflow.description or "",
            tools=db_workflow.tools or {},
            status=db_workflow.status,
            created_at=db_workflow.created_at.isoformat() if db_workflow.created_at else "",
            updated_at=db_workflow.updated_at.isoformat() if db_workflow.updated_at else ""
        )
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail={"error": "Invalid workflow ID", "message": "Workflow ID must be a number"}
        )
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating workflow {workflow_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to update workflow", "message": str(e)}
        )

@router.delete("/{workflow_id}")
async def delete_workflow(
    workflow_id: str, 
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Delete a workflow"""
    try:
        # First check if workflow exists
        result = await db.execute(select(Workflow).where(Workflow.id == int(workflow_id)))
        db_workflow = result.scalar_one_or_none()
        if not db_workflow:
            raise HTTPException(
                status_code=404,
                detail={"error": "Not found", "message": "Workflow not found"}
            )
        
        # Delete the workflow using delete statement
        delete_result = await db.execute(
            delete(Workflow).where(Workflow.id == int(workflow_id))
        )
        await db.commit()
        
        if delete_result.rowcount == 0:
            logger.warning(f"Workflow {workflow_id} was not deleted (rowcount=0)")
        else:
            logger.info(f"Workflow deleted successfully: {workflow_id}")
        
        return {"message": "Workflow deleted successfully"}
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail={"error": "Invalid workflow ID", "message": "Workflow ID must be a number"}
        )
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error deleting workflow {workflow_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to delete workflow", "message": str(e)}
        )


# ─── Workflow Execution History Endpoints ───

@router.get("/executions/history", response_model=List[ExecutionHistoryResponse])
async def get_execution_history(
    workflow_id: Optional[int] = None,
    project_id: Optional[int] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Get workflow execution history, optionally filtered by workflow or project"""
    try:
        try:
            check_table_query = text("SELECT name FROM sqlite_master WHERE type='table' AND name='workflow_executions'")
            table_check = await db.execute(check_table_query)
            if table_check.fetchone() is None:
                return []
        except Exception:
            pass

        query = select(WorkflowExecution, Workflow.name).join(
            Workflow, WorkflowExecution.workflow_id == Workflow.id, isouter=True
        )

        if workflow_id is not None:
            query = query.where(WorkflowExecution.workflow_id == workflow_id)
        if project_id is not None:
            query = query.where(WorkflowExecution.project_id == project_id)

        query = query.order_by(WorkflowExecution.created_at.desc()).limit(limit)

        result = await db.execute(query)
        rows = result.all()

        history = []
        for execution, workflow_name in rows:
            history.append(ExecutionHistoryResponse(
                id=execution.id,
                workflow_id=execution.workflow_id,
                workflow_name=workflow_name or "Unknown",
                project_id=execution.project_id,
                project_name=execution.project_name,
                target_name=execution.target_name,
                status=execution.status,
                start_time=execution.start_time.isoformat() if execution.start_time else None,
                end_time=execution.end_time.isoformat() if execution.end_time else None,
                duration_seconds=execution.duration_seconds,
                execution_results=execution.execution_results,
                summary=execution.summary,
                total_steps=execution.total_steps,
                completed_steps=execution.completed_steps,
                failed_steps=execution.failed_steps,
                created_at=execution.created_at.isoformat() if execution.created_at else ""
            ))

        return history
    except Exception as e:
        logger.error(f"Error getting execution history: {e}", exc_info=True)
        return []


@router.post("/executions/history", response_model=ExecutionHistoryResponse)
async def save_execution_history(
    data: ExecutionHistoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Save a workflow execution to persistent history"""
    try:
        results_list = data.execution_results or []
        total = len(results_list)
        completed = sum(1 for r in results_list if r.get('status') in ('success', 'completed'))
        failed = sum(1 for r in results_list if r.get('status') in ('error', 'failed'))

        start_time = None
        end_time = None
        duration = None
        if data.start_time:
            start_time = datetime.fromisoformat(data.start_time.replace('Z', '+00:00'))
        if data.end_time:
            end_time = datetime.fromisoformat(data.end_time.replace('Z', '+00:00'))
        if start_time and end_time:
            duration = (end_time - start_time).total_seconds()

        execution = WorkflowExecution(
            workflow_id=data.workflow_id,
            project_id=data.project_id,
            status=data.status,
            start_time=start_time,
            end_time=end_time,
            duration_seconds=duration,
            project_name=data.project_name,
            target_name=data.target_name,
            target_ids=data.target_ids,
            execution_results=results_list,
            summary=data.summary,
            total_steps=total,
            completed_steps=completed,
            failed_steps=failed,
        )

        db.add(execution)
        await db.commit()
        await db.refresh(execution)

        # Get workflow name
        wf_result = await db.execute(select(Workflow.name).where(Workflow.id == data.workflow_id))
        workflow_name = wf_result.scalar_one_or_none() or "Unknown"

        logger.info(f"Saved workflow execution history: {execution.id} for workflow {data.workflow_id}")

        return ExecutionHistoryResponse(
            id=execution.id,
            workflow_id=execution.workflow_id,
            workflow_name=workflow_name,
            project_id=execution.project_id,
            project_name=execution.project_name,
            target_name=execution.target_name,
            status=execution.status,
            start_time=execution.start_time.isoformat() if execution.start_time else None,
            end_time=execution.end_time.isoformat() if execution.end_time else None,
            duration_seconds=execution.duration_seconds,
            execution_results=execution.execution_results,
            summary=execution.summary,
            total_steps=execution.total_steps,
            completed_steps=execution.completed_steps,
            failed_steps=execution.failed_steps,
            created_at=execution.created_at.isoformat() if execution.created_at else ""
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"Error saving execution history: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to save execution history", "message": str(e)}
        )


@router.delete("/executions/history/{execution_id}")
async def delete_execution_history(
    execution_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user_optional)
):
    """Delete a specific execution history entry"""
    try:
        result = await db.execute(
            select(WorkflowExecution).where(WorkflowExecution.id == execution_id)
        )
        execution = result.scalar_one_or_none()
        if not execution:
            raise HTTPException(status_code=404, detail="Execution not found")

        await db.execute(
            delete(WorkflowExecution).where(WorkflowExecution.id == execution_id)
        )
        await db.commit()
        return {"message": "Execution history deleted"}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error deleting execution history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

