"""
Scope management service for BountyFlow

Handles scope validation, out-of-scope detection, and compliance enforcement
"""

import logging
import ipaddress
import re
from typing import Dict, List, Tuple, Optional, Set
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)

@dataclass
class ScopeRule:
    """Represents a scope rule"""
    rule_type: str  # "include", "exclude", "wildcard"
    pattern: str
    description: str

@dataclass
class ScopeValidationResult:
    """Result of scope validation"""
    is_valid: bool
    reason: str
    matched_rules: List[ScopeRule]
    risk_level: str  # "low", "medium", "high", "critical"

class ScopeManager:
    """Main scope management service"""

    def __init__(self):
        self.compiled_patterns = {}

    def parse_scope_definition(self, scope_data: Dict) -> Tuple[List[ScopeRule], List[ScopeRule]]:
        """Parse scope definition into rules"""
        in_scope = []
        out_of_scope = []

        # Parse in-scope rules
        for item in scope_data.get("in_scope", []):
            rule = self._parse_scope_item(item, "include")
            if rule:
                in_scope.append(rule)

        # Parse out-of-scope rules
        for item in scope_data.get("out_of_scope", []):
            rule = self._parse_scope_item(item, "exclude")
            if rule:
                out_of_scope.append(rule)

        return in_scope, out_of_scope

    def _parse_scope_item(self, item: str, rule_type: str) -> Optional[ScopeRule]:
        """Parse individual scope item"""
        if not item or not isinstance(item, str):
            return None

        item = item.strip()

        # Determine rule type based on pattern
        if '*' in item or '?' in item:
            rule_type = "wildcard"
        elif item.startswith('*.'):
            rule_type = "wildcard"
            item = item[2:]  # Remove *. prefix for processing

        return ScopeRule(
            rule_type=rule_type,
            pattern=item.lower(),
            description=f"Auto-generated rule for {item}"
        )

    def validate_target(self, target: str, project_scope: Dict) -> ScopeValidationResult:
        """Validate if a target is within scope"""
        target = target.lower().strip()

        if not project_scope:
            return ScopeValidationResult(
                is_valid=False,
                reason="No scope defined for project",
                matched_rules=[],
                risk_level="high"
            )

        in_scope, out_of_scope = self.parse_scope_definition(project_scope)

        # Check out-of-scope first (more restrictive)
        for rule in out_of_scope:
            if self._matches_rule(target, rule):
                return ScopeValidationResult(
                    is_valid=False,
                    reason=f"Target matches out-of-scope rule: {rule.pattern}",
                    matched_rules=[rule],
                    risk_level="critical"
                )

        # Check in-scope
        matched_in_scope = []
        for rule in in_scope:
            if self._matches_rule(target, rule):
                matched_in_scope.append(rule)

        if not matched_in_scope:
            return ScopeValidationResult(
                is_valid=False,
                reason="Target not found in scope definition",
                matched_rules=[],
                risk_level="medium"
            )

        # Assess risk level based on matched rules
        risk_level = self._assess_risk_level(matched_in_scope, target)

        return ScopeValidationResult(
            is_valid=True,
            reason="Target is within authorized scope",
            matched_rules=matched_in_scope,
            risk_level=risk_level
        )

    def _matches_rule(self, target: str, rule: ScopeRule) -> bool:
        """Check if target matches a scope rule"""
        if rule.rule_type == "wildcard":
            # Simple wildcard matching
            pattern = rule.pattern.replace('.', r'\.').replace('*', '.*')
            return bool(re.match(f'^{pattern}$', target))
        else:
            # Exact match or contains
            return rule.pattern in target or target == rule.pattern

    def _assess_risk_level(self, matched_rules: List[ScopeRule], target: str) -> str:
        """Assess risk level of a target"""
        # High risk if target contains IP ranges or many subdomains
        if self._is_ip_range(target):
            return "high"

        # Medium risk for wildcard matches
        wildcard_rules = [r for r in matched_rules if r.rule_type == "wildcard"]
        if wildcard_rules:
            return "medium"

        return "low"

    def _is_ip_range(self, target: str) -> bool:
        """Check if target represents an IP range"""
        try:
            # Check for CIDR notation
            if '/' in target:
                ipaddress.ip_network(target, strict=False)
                return True
        except ValueError:
            pass

        return False

    def suggest_scope_adjustment(self, target: str, current_scope: Dict) -> Dict:
        """Suggest scope adjustments based on discovered targets"""
        suggestions = {
            "add_to_scope": [],
            "add_to_out_of_scope": [],
            "warnings": []
        }

        # Analyze target patterns
        if self._is_cloud_service(target):
            suggestions["add_to_out_of_scope"].append({
                "target": target,
                "reason": "Cloud service - likely out of scope",
                "confidence": "high"
            })

        elif self._is_common_service(target):
            suggestions["warnings"].append({
                "target": target,
                "message": "Common service - verify scope authorization",
                "risk_level": "medium"
            })

        return suggestions

    def _is_cloud_service(self, target: str) -> bool:
        """Check if target is a common cloud service"""
        cloud_patterns = [
            'aws.amazon.com',
            'azure.microsoft.com',
            'cloud.google.com',
            'digitalocean.com',
            'linode.com',
            'heroku.com',
            'netlify.com',
            'vercel.com'
        ]

        return any(pattern in target for pattern in cloud_patterns)

    def _is_common_service(self, target: str) -> bool:
        """Check if target is a common third-party service"""
        common_services = [
            'github.com',
            'gitlab.com',
            'bitbucket.org',
            'slack.com',
            'discord.com',
            'trello.com',
            'asana.com',
            'notion.so'
        ]

        return any(service in target for service in common_services)

    def generate_compliance_report(self, project_scope: Dict, activities: List[Dict]) -> Dict:
        """Generate compliance report for audit purposes"""
        report = {
            "generated_at": datetime.utcnow().isoformat(),
            "scope_summary": {
                "in_scope_count": len(project_scope.get("in_scope", [])),
                "out_of_scope_count": len(project_scope.get("out_of_scope", []))
            },
            "activity_summary": {
                "total_activities": len(activities),
                "scope_violations": 0,
                "warnings_issued": 0
            },
            "violations": [],
            "warnings": []
        }

        for activity in activities:
            target = activity.get("target", "")
            if target:
                validation = self.validate_target(target, project_scope)
                if not validation.is_valid:
                    report["activity_summary"]["scope_violations"] += 1
                    report["violations"].append({
                        "target": target,
                        "activity": activity.get("activity_type"),
                        "timestamp": activity.get("timestamp"),
                        "reason": validation.reason
                    })

        return report


