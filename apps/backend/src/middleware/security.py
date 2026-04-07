"""
Security middleware for BountyFlow
Protects against IDOR, injection attacks, and other security vulnerabilities
"""

import re
import json
from typing import Optional, Dict, Any
from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
import structlog

logger = structlog.get_logger(__name__)

class SecurityMiddleware:
    """Security middleware to protect against common attacks"""
    
    def __init__(self):
        # SQL injection patterns
        self.sql_patterns = [
            r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)",
            r"(\b(OR|AND)\s+\d+\s*=\s*\d+)",
            r"(\b(OR|AND)\s+'.*'\s*=\s*'.*')",
            r"(\bUNION\s+SELECT\b)",
            r"(\bDROP\s+TABLE\b)",
            r"(\bINSERT\s+INTO\b)",
            r"(\bDELETE\s+FROM\b)",
            r"(\bUPDATE\s+SET\b)",
            r"(\bALTER\s+TABLE\b)",
            r"(\bCREATE\s+TABLE\b)"
        ]
        
        # XSS patterns
        self.xss_patterns = [
            r"<script[^>]*>.*?</script>",
            r"javascript:",
            r"on\w+\s*=",
            r"<iframe[^>]*>",
            r"<object[^>]*>",
            r"<embed[^>]*>",
            r"<link[^>]*>",
            r"<meta[^>]*>",
            r"<style[^>]*>.*?</style>"
        ]
        
        # Path traversal patterns
        self.path_traversal_patterns = [
            r"\.\./",
            r"\.\.\\",
            r"%2e%2e%2f",
            r"%2e%2e%5c",
            r"\.\.%2f",
            r"\.\.%5c"
        ]
        
        # Command injection patterns
        self.command_injection_patterns = [
            r"[;&|`$]",
            r"\b(cat|ls|pwd|whoami|id|uname|ps|netstat|ifconfig)\b",
            r"\b(rm|del|mkdir|rmdir|chmod|chown)\b",
            r"\b(wget|curl|nc|telnet|ssh|ftp)\b"
        ]
    
    def detect_sql_injection(self, value: str) -> bool:
        """Detect SQL injection attempts"""
        if not isinstance(value, str):
            return False
            
        value_upper = value.upper()
        for pattern in self.sql_patterns:
            if re.search(pattern, value_upper, re.IGNORECASE):
                logger.warning("SQL injection attempt detected", pattern=pattern, value=value)
                return True
        return False
    
    def detect_xss(self, value: str) -> bool:
        """Detect XSS attempts"""
        if not isinstance(value, str):
            return False
            
        for pattern in self.xss_patterns:
            if re.search(pattern, value, re.IGNORECASE):
                logger.warning("XSS attempt detected", pattern=pattern, value=value)
                return True
        return False
    
    def detect_path_traversal(self, value: str) -> bool:
        """Detect path traversal attempts"""
        if not isinstance(value, str):
            return False
            
        for pattern in self.path_traversal_patterns:
            if re.search(pattern, value, re.IGNORECASE):
                logger.warning("Path traversal attempt detected", pattern=pattern, value=value)
                return True
        return False
    
    def detect_command_injection(self, value: str) -> bool:
        """Detect command injection attempts"""
        if not isinstance(value, str):
            return False
            
        for pattern in self.command_injection_patterns:
            if re.search(pattern, value, re.IGNORECASE):
                logger.warning("Command injection attempt detected", pattern=pattern, value=value)
                return True
        return False
    
    def sanitize_input(self, value: Any) -> Any:
        """Sanitize input data"""
        if isinstance(value, str):
            # Remove potentially dangerous characters
            value = value.replace('<', '&lt;').replace('>', '&gt;')
            value = value.replace('"', '&quot;').replace("'", '&#x27;')
            value = value.replace('&', '&amp;')
        elif isinstance(value, dict):
            return {k: self.sanitize_input(v) for k, v in value.items()}
        elif isinstance(value, list):
            return [self.sanitize_input(item) for item in value]
        return value
    
    def validate_user_access(self, user_id: str, resource_id: str, resource_type: str) -> bool:
        """Validate user access to resources (IDOR protection)"""
        try:
            # Convert to integers for comparison
            user_id_int = int(user_id)
            resource_id_int = int(resource_id)
            
            # Basic IDOR protection - users can only access their own resources
            # In a real application, you'd check against a database
            if resource_type in ['user', 'profile', 'settings']:
                return user_id_int == resource_id_int
            
            # For other resources, implement proper authorization checks
            # This is a simplified example
            return True
            
        except (ValueError, TypeError):
            logger.warning("Invalid ID format in access validation", user_id=user_id, resource_id=resource_id)
            return False
    
    def check_request_security(self, request: Request) -> Dict[str, Any]:
        """Check request for security issues"""
        security_issues = []
        
        # Check query parameters
        for param, value in request.query_params.items():
            if self.detect_sql_injection(str(value)):
                security_issues.append(f"SQL injection in query parameter '{param}'")
            if self.detect_xss(str(value)):
                security_issues.append(f"XSS in query parameter '{param}'")
            if self.detect_path_traversal(str(value)):
                security_issues.append(f"Path traversal in query parameter '{param}'")
            if self.detect_command_injection(str(value)):
                security_issues.append(f"Command injection in query parameter '{param}'")
        
        # Check headers
        for header, value in request.headers.items():
            if header.lower() in ['user-agent', 'referer', 'origin']:
                if self.detect_xss(str(value)):
                    security_issues.append(f"XSS in header '{header}'")
        
        return {
            "has_issues": len(security_issues) > 0,
            "issues": security_issues
        }
    
    def create_security_response(self, message: str, status_code: int = status.HTTP_400_BAD_REQUEST) -> JSONResponse:
        """Create a security response"""
        return JSONResponse(
            status_code=status_code,
            content={
                "error": "Security violation detected",
                "message": message,
                "type": "security_error"
            }
        )

# Global security middleware instance
security_middleware = SecurityMiddleware()

# Decorator for security checks
def security_check(func):
    """Decorator to add security checks to endpoints"""
    async def wrapper(*args, **kwargs):
        # Extract request from args if present
        request = None
        for arg in args:
            if isinstance(arg, Request):
                request = arg
                break
        
        if request:
            security_result = security_middleware.check_request_security(request)
            if security_result["has_issues"]:
                logger.warning("Security issues detected", issues=security_result["issues"])
                return security_middleware.create_security_response(
                    "Request contains potentially malicious content"
                )
        
        return await func(*args, **kwargs)
    return wrapper

# IDOR protection decorator
def idor_protection(resource_type: str):
    """Decorator to protect against IDOR attacks"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            # Extract user_id and resource_id from kwargs
            user_id = kwargs.get('user_id') or kwargs.get('current_user', {}).get('user_id')
            resource_id = kwargs.get('id') or kwargs.get('project_id') or kwargs.get('target_id')
            
            if user_id and resource_id:
                if not security_middleware.validate_user_access(str(user_id), str(resource_id), resource_type):
                    logger.warning("IDOR attempt detected", user_id=user_id, resource_id=resource_id, resource_type=resource_type)
                    return security_middleware.create_security_response(
                        "Access denied: Invalid resource access"
                    )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator


