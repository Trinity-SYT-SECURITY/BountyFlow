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

# ---------------------------------------------------------------- API keys
# Tooling — the MCP server in particular — needs a credential that does not
# expire every thirty minutes and can be revoked without changing a password.
# An API key is issued to a person, so everything done with it is attributed to
# them: project roles and the audit trail work exactly as they do in a browser.
API_KEY_PREFIX = "bf_"


def generate_api_key() -> tuple:
    """Returns (raw_key, prefix, hash). The raw key is shown once and not stored."""
    import hashlib

    raw = API_KEY_PREFIX + secrets.token_urlsafe(32)
    return raw, raw[:12], hashlib.sha256(raw.encode()).hexdigest()


def hash_api_key(raw: str) -> str:
    import hashlib

    return hashlib.sha256(raw.encode()).hexdigest()


async def resolve_api_key(raw: str) -> Optional[dict]:
    """The account this key belongs to, or None if it is unknown or revoked."""
    from sqlalchemy import select, update

    from ..models.database import async_session
    from ..models.models import ApiKey, User

    try:
        async with async_session() as db:
            row = (await db.execute(
                select(ApiKey).where(
                    ApiKey.key_hash == hash_api_key(raw),
                    ApiKey.revoked_at.is_(None)))).scalar_one_or_none()
            if row is None:
                return None

            user = (await db.execute(
                select(User).where(User.id == row.user_id))).scalar_one_or_none()
            if user is None or not user.is_active:
                return None

            # Last used is what makes an unused key easy to spot and revoke.
            await db.execute(
                update(ApiKey).where(ApiKey.id == row.id).values(
                    last_used_at=datetime.utcnow()))
            await db.commit()

            return {"username": user.username, "user_id": user.id, "via": "api_key"}
    except Exception:
        return None


async def resolve_credential(credential: str) -> Optional[dict]:
    """Whichever of the two credential types this is."""
    if credential.startswith(API_KEY_PREFIX):
        return await resolve_api_key(credential)
    try:
        payload = jwt.decode(credential, SECRET_KEY, algorithms=[ALGORITHM])
    except (JWTError, Exception):
        return None
    if payload.get("sub") is None:
        return None
    return {"username": payload.get("sub"), "user_id": payload.get("user_id")}

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Resolve the caller from a session token or an API key."""
    caller = await resolve_credential(credentials.credentials)
    if caller is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return caller

def _require_auth_enabled() -> bool:
    """REQUIRE_AUTH=true turns every 'optional' dependency into a hard one.

    Most endpoints depend on get_current_user_optional, which means an
    unauthenticated caller can read and write project data. That is convenient
    for local development and wrong for anything reachable by other hosts, so
    the strict behaviour is available behind an environment flag. Turn it on
    once the frontend attaches its bearer token to every request.
    """
    return os.getenv("REQUIRE_AUTH", "false").strip().lower() in ("1", "true", "yes", "on")


async def get_current_user_optional(credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))):
    """Get current authenticated user (optional) - returns anonymous if no
    credential, unless REQUIRE_AUTH is set, in which case one is mandatory.

    Accepts a session token or an API key."""
    strict = _require_auth_enabled()
    if credentials is None:
        if strict:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return {"username": "anonymous", "user_id": None}

    caller = await resolve_credential(credentials.credentials)
    if caller is not None:
        return caller
    if strict:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired credential",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {"username": "anonymous", "user_id": None}

def get_current_user(current_user: dict = Depends(verify_token)):
    """Get current authenticated user"""
    return current_user

async def require_admin(current_user: dict = Depends(get_current_user)):
    """Require the caller to be a superuser.

    get_current_user only decodes the JWT, so what it returns is a dict with
    the username and id in it — not a User row. Every admin router used to
    declare its own require_admin that read .is_superuser straight off that
    dict, which is an AttributeError, which is a 500 on every admin request.
    So the check has to load the row.
    """
    from sqlalchemy import select
    from ..models.database import async_session
    from ..models.models import User

    user_id = current_user.get("user_id")
    username = current_user.get("username")
    async with async_session() as db:
        query = select(User).where(
            User.id == user_id if user_id is not None else User.username == username
        )
        user = (await db.execute(query)).scalar_one_or_none()

    if user is None or not user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
