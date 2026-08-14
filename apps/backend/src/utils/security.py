"""
Security utilities for BountyFlow
"""

import hashlib
import secrets
import bcrypt
from typing import Optional
import structlog

logger = structlog.get_logger(__name__)

class SecurityManager:
    """Security manager for password hashing and user authentication"""
    
    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a password using bcrypt"""
        try:
            # Generate salt and hash password
            salt = bcrypt.gensalt()
            hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
            return hashed.decode('utf-8')
        except Exception as e:
            logger.error("Password hashing failed", error=str(e))
            raise
    
    @staticmethod
    def verify_password(password: str, hashed_password: str) -> bool:
        """Verify a password against its hash"""
        try:
            return bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8'))
        except Exception as e:
            logger.error("Password verification failed", error=str(e))
            return False
    
    @staticmethod
    def generate_secure_token(length: int = 32) -> str:
        """Generate a secure random token"""
        return secrets.token_urlsafe(length)
    
    @staticmethod
    def generate_api_key() -> str:
        """Generate a secure API key"""
        return f"bf_{secrets.token_urlsafe(32)}"
    
    @staticmethod
    def hash_sensitive_data(data: str) -> str:
        """Hash sensitive data for storage"""
        return hashlib.sha256(data.encode('utf-8')).hexdigest()

# Global security manager instance
security_manager = SecurityManager()