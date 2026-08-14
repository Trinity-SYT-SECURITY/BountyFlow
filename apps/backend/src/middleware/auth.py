"""
Authentication and authorization middleware for BountyFlow
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt
from jose.exceptions import JWTError
from datetime import datetime, timedelta
from typing import Optional
import os
import secrets
from pathlib import Path

# JWT configuration
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

def get_or_create_secret_key() -> str:
    """
    Get or create a secure SECRET_KEY for JWT token signing.
    - First tries to read from environment variable SECRET_KEY
    - If not found, tries to read from .env file
    - If still not found, generates a new secure random key and saves it to .env
    """
    # Try environment variable first
    secret_key = os.getenv("SECRET_KEY")
    if secret_key and secret_key.strip():  # Check if it's not empty
        return secret_key.strip()
    
    # Try to read from .env file
    backend_dir = Path(__file__).parent.parent.parent  # Go to backend/
    env_file = backend_dir / ".env"
    
    if env_file.exists():
        try:
            from dotenv import dotenv_values
            env_vars = dotenv_values(env_file)
            secret_key = env_vars.get("SECRET_KEY")
            if secret_key and secret_key.strip():  # Check if it's not empty
                return secret_key.strip()
        except Exception:
            pass
    
    # Generate a new secure random key (32 bytes = 256 bits)
    new_secret_key = secrets.token_urlsafe(32)
    
    # Save to .env file
    try:
        env_file.parent.mkdir(parents=True, exist_ok=True)
        # Read existing .env if it exists
        existing_content = ""
        if env_file.exists():
            existing_content = env_file.read_text(encoding='utf-8')
        
        # Check if SECRET_KEY already exists in .env
        has_secret_key = False
        for line in existing_content.split('\n'):
            if line.strip().startswith("SECRET_KEY="):
                has_secret_key = True
                break
        
        if not has_secret_key:
            # Append SECRET_KEY to .env
            with open(env_file, 'a', encoding='utf-8') as f:
                if existing_content and not existing_content.endswith('\n'):
                    f.write('\n')
                f.write(f"# JWT Secret Key (auto-generated)\n")
                f.write(f"SECRET_KEY={new_secret_key}\n")
        else:
            # Update existing SECRET_KEY line
            lines = existing_content.split('\n')
            updated_lines = []
            for line in lines:
                if line.strip().startswith("SECRET_KEY="):
                    updated_lines.append(f"SECRET_KEY={new_secret_key}")
                else:
                    updated_lines.append(line)
            env_file.write_text('\n'.join(updated_lines), encoding='utf-8')
        
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"✅ Generated and saved SECRET_KEY to {env_file}")
    except Exception as e:
        # If we can't write to .env, log warning but continue with generated key
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"⚠️  Could not save SECRET_KEY to .env file: {e}")
        logger.info("   Using in-memory SECRET_KEY for this session")
    
    return new_secret_key

# Get or create SECRET_KEY (generated once, reused on subsequent startups)
SECRET_KEY = get_or_create_secret_key()

security = HTTPBearer()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify JWT token"""
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return {"username": username, "user_id": payload.get("user_id")}
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

def _require_auth_enabled() -> bool:
    """REQUIRE_AUTH=true turns every 'optional' dependency into a hard one.

    Most endpoints depend on get_current_user_optional, which means an
    unauthenticated caller can read and write project data. That is convenient
    for local development and wrong for anything reachable by other hosts, so
    the strict behaviour is available behind an environment flag. Turn it on
    once the frontend attaches its bearer token to every request.
    """
    return os.getenv("REQUIRE_AUTH", "false").strip().lower() in ("1", "true", "yes", "on")


def get_current_user_optional(credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))):
    """Get current authenticated user (optional) - returns anonymous if no token,
    unless REQUIRE_AUTH is set, in which case a valid token is mandatory."""
    strict = _require_auth_enabled()
    if credentials is None:
        if strict:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return {"username": "anonymous", "user_id": None}
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        return {"username": username, "user_id": payload.get("user_id")}
    except (JWTError, Exception):
        if strict:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        # If token is invalid, return anonymous user
        return {"username": "anonymous", "user_id": None}

def get_current_user(current_user: dict = Depends(verify_token)):
    """Get current authenticated user"""
    return current_user

def require_admin(current_user: dict = Depends(get_current_user)):
    """Require admin privileges"""
    # TODO: Implement admin role checking
    return current_user
