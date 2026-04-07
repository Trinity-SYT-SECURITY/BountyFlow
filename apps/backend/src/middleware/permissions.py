"""
Permission checking middleware for user data isolation

Ensures users can only access their own data, while admins can access everything.
"""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from ..models.models import User, Project, Workflow


async def verify_project_ownership(
    project_id: int,
    current_user: User,
    db: AsyncSession
) -> Project:
    """
    Verify that the current user has access to the specified project.
    
    Rules:
    - Admin (is_superuser=True): Can access any project
    - Regular user: Can only access projects they created (created_by = user.id)
    
    Args:
        project_id: ID of the project to access
        current_user: Currently authenticated user
        db: Database session
    
    Returns:
        Project if user has access
    
    Raises:
        HTTPException 404: Project not found
        HTTPException 403: User doesn't have permission
    """
    query = select(Project).where(Project.id == project_id)
    result = await db.execute(query)
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Admin can access all projects
    if current_user.is_superuser:
        return project
    
    # Regular users can only access their own projects
    if project.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this project"
        )
    
    return project


async def verify_workflow_ownership(
    workflow_id: int,
    current_user: User,
    db: AsyncSession
) -> Workflow:
    """
    Verify that the current user has access to the specified workflow.
    
    Rules:
    - Admin: Can access any workflow
    - Regular user: Can only access workflows they created
    
    Args:
        workflow_id: ID of the workflow to access
        current_user: Currently authenticated user
        db: Database session
    
    Returns:
        Workflow if user has access
    
    Raises:
        HTTPException 404: Workflow not found
        HTTPException 403: User doesn't have permission
    """
    query = select(Workflow).where(Workflow.id == workflow_id)
    result = await db.execute(query)
    workflow = result.scalar_one_or_none()
    
    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found"
        )
    
    # Admin can access all workflows
    if current_user.is_superuser:
        return workflow
    
    # Regular users can only access their own workflows
    if workflow.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this workflow"
        )
    
    return workflow


def filter_user_projects_query(query, current_user: User):
    """
    Add user filtering to a Project query.
    
    - Admin: No filtering (sees all projects)
    - Regular user: Only show projects created by the user
    
    Args:
        query: SQLAlchemy query to filter
        current_user: Currently authenticated user
    
    Returns:
        Filtered query
    """
    if not current_user.is_superuser:
        query = query.where(Project.created_by == current_user.id)
    return query


def filter_user_workflows_query(query, current_user: User):
    """
    Add user filtering to a Workflow query.
    
    - Admin: No filtering (sees all workflows)
    - Regular user: Only show workflows created by the user
    
    Args:
        query: SQLAlchemy query to filter
        current_user: Currently authenticated user
    
    Returns:
        Filtered query
    """
    if not current_user.is_superuser:
        query = query.where(Workflow.created_by == current_user.id)
    return query


