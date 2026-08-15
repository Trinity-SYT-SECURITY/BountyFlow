"""
Scope validation API routes for BountyFlow
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List, Dict, Any

from ..models.database import get_db
from ..models.models import Project, User
from ..schemas.scope import (
    ScopeValidationRequest,
    ScopeValidationResponse,
    ScopeSuggestionResponse,
    ComplianceReportResponse
)
from ..services.scope_manager import ScopeManager
from ..middleware.auth import verify_token, get_current_user_optional

# Mock function for development
def get_current_user(current_user: dict = Depends(get_current_user_optional)):
    """Resolve the caller from the bearer token.

    This used to be a hardcoded stub returning test_user, which silently made
    every endpoint in this module unauthenticated. It now delegates to the real
    dependency: anonymous is still allowed by default so local development keeps
    working, and setting REQUIRE_AUTH=true makes a valid token mandatory.
    """
    return current_user

router = APIRouter()


async def _get_project_for_user(db: AsyncSession, project_id: int, current_user: dict) -> Project:
    """Fetch a project the caller may touch.

    The original check joined project_users, but nothing ever inserts the
    creator into that table — so every scope endpoint returned 404 for every
    project and the Scope Management page could not load or save anything.
    Membership still grants access; so does having created the project.
    """
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    user_id = (current_user or {}).get("user_id")
    if user_id is None:
        return project  # anonymous is only possible when REQUIRE_AUTH is off

    if project.created_by == user_id:
        return project

    member = await db.execute(
        select(Project.id).join(Project.users).where(
            and_(Project.id == project_id, User.id == user_id)
        )
    )
    if member.scalar_one_or_none() is not None:
        return project

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this project")

scope_manager = ScopeManager()

@router.post("/projects/{project_id}/scope/validate", response_model=ScopeValidationResponse)
async def validate_target_scope(
    project_id: int,
    validation_request: ScopeValidationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    """Validate if a target is within project scope"""
    project = await _get_project_for_user(db, project_id, current_user)

    # Validate target against project scope
    validation_result = scope_manager.validate_target(
        validation_request.target,
        project.target_scope
    )

    # Log validation attempt for audit
    # TODO: Implement audit logging

    return ScopeValidationResponse(
        target=validation_request.target,
        is_valid=validation_result.is_valid,
        reason=validation_result.reason,
        risk_level=validation_result.risk_level,
        matched_rules=[
            {
                "rule_type": rule.rule_type,
                "pattern": rule.pattern,
                "description": rule.description
            }
            for rule in validation_result.matched_rules
        ]
    )

@router.post("/projects/{project_id}/scope/suggest", response_model=ScopeSuggestionResponse)
async def suggest_scope_adjustments(
    project_id: int,
    request_data: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    """Get suggestions for scope adjustments based on discovered targets"""
    project = await _get_project_for_user(db, project_id, current_user)

    targets = request_data.get("targets", [])
    all_suggestions = {
        "add_to_scope": [],
        "add_to_out_of_scope": [],
        "warnings": []
    }

    for target in targets:
        suggestions = scope_manager.suggest_scope_adjustment(target, project.target_scope)

        all_suggestions["add_to_scope"].extend(suggestions["add_to_scope"])
        all_suggestions["add_to_out_of_scope"].extend(suggestions["add_to_out_of_scope"])
        all_suggestions["warnings"].extend(suggestions["warnings"])

    return ScopeSuggestionResponse(
        suggestions=all_suggestions,
        total_suggestions=len(all_suggestions["add_to_scope"]) +
                         len(all_suggestions["add_to_out_of_scope"]) +
                         len(all_suggestions["warnings"])
    )

@router.get("/projects/{project_id}/scope/compliance-report", response_model=ComplianceReportResponse)
async def get_compliance_report(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    """Generate compliance report for project activities"""
    project = await _get_project_for_user(db, project_id, current_user)

    # Get recent activities for compliance report
    # TODO: Implement activity logging and retrieval
    activities = []  # Would be fetched from audit logs

    report = scope_manager.generate_compliance_report(project.target_scope, activities)

    return ComplianceReportResponse(
        generated_at=report["generated_at"],
        scope_summary=report["scope_summary"],
        activity_summary=report["activity_summary"],
        violations=report["violations"],
        warnings=report["warnings"]
    )

@router.put("/projects/{project_id}/scope")
async def update_project_scope(
    project_id: int,
    scope_data: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    """Update project scope definition"""
    project = await _get_project_for_user(db, project_id, current_user)

    # Update scope
    project.target_scope = scope_data.get("target_scope", {})
    project.out_of_scope = scope_data.get("out_of_scope", {})

    # TODO: Log scope changes for audit

    # Save changes
    db.add(project)
    await db.commit()

    return {
        "message": "Project scope updated successfully",
        "new_scope": project.target_scope,
        "new_out_of_scope": project.out_of_scope
    }
