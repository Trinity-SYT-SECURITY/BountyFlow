"""
Pydantic schemas for scope management
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any
from datetime import datetime

class ScopeValidationRequest(BaseModel):
    """Schema for scope validation requests"""
    target: str = Field(..., min_length=1, description="Target to validate (domain, IP, etc.)")

class ScopeRuleInfo(BaseModel):
    """Schema for scope rule information"""
    rule_type: str
    pattern: str
    description: str

class ScopeValidationResponse(BaseModel):
    """Response schema for scope validation"""
    target: str
    is_valid: bool
    reason: str
    risk_level: str
    matched_rules: List[ScopeRuleInfo]

class ScopeSuggestion(BaseModel):
    """Schema for scope adjustment suggestions"""
    target: str
    reason: str
    confidence: str

class ScopeSuggestionResponse(BaseModel):
    """Response schema for scope suggestions"""
    suggestions: Dict[str, List[Dict[str, Any]]]
    total_suggestions: int

class ComplianceReportResponse(BaseModel):
    """Response schema for compliance reports"""
    generated_at: str
    scope_summary: Dict[str, int]
    activity_summary: Dict[str, int]
    violations: List[Dict[str, Any]]
    warnings: List[Dict[str, Any]]


