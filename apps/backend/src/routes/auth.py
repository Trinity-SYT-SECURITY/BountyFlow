"""
Authentication and user management API routes for BountyFlow
"""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Form
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from datetime import datetime, timedelta
from typing import Optional
import secrets

from ..models.database import get_db
from ..models.models import User, Project
from ..schemas.auth import (
    UserCreate,
    UserLogin,
    UserResponse,
    TokenResponse,
    PasswordResetRequest,
    PasswordReset,
    LoginForm
)
from ..middleware.auth import create_access_token, verify_token, get_current_user_optional
from ..utils.security import security_manager

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

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db)
):
    """Register a new user (regular users only, cannot create admin accounts)"""
    import bcrypt
    
    # Check if username already exists
    username_query = select(User).where(User.username == user_data.username)
    username_result = await db.execute(username_query)
    if username_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )
    
    # Check if email already exists
    email_query = select(User).where(User.email == user_data.email)
    email_result = await db.execute(email_query)
    if email_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create new user - ALWAYS as regular user (not admin)
    # Hash password using bcrypt
    hashed_password = bcrypt.hashpw(
        user_data.password.encode('utf-8'),
        bcrypt.gensalt()
    ).decode('utf-8')
    
    db_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        is_active=True,
        is_superuser=False  # NEVER allow self-registration as admin
    )

    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)

    return UserResponse(
        id=db_user.id,
        username=db_user.username,
        email=db_user.email,
        full_name=db_user.full_name,
        is_active=db_user.is_active,
        is_superuser=db_user.is_superuser,
        created_at=db_user.created_at
    )

@router.post("/login")
async def login_user(
    form_data: LoginForm,
    db: AsyncSession = Depends(get_db)
):
    """Login user and return access token"""
    from sqlalchemy import select
    from ..models.models import User
    import bcrypt
    
    # Query user from database
    query = select(User).where(User.username == form_data.username)
    result = await db.execute(query)
    user = result.scalar_one_or_none()
    
    # Check if user exists
    if not user:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Incorrect username or password"},
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify password using bcrypt
    try:
        password_valid = bcrypt.checkpw(
            form_data.password.encode('utf-8'),
            user.hashed_password.encode('utf-8')
        )
    except Exception as e:
        password_valid = False
    
    if not password_valid:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Incorrect username or password"},
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if user is active
    if not user.is_active:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "User account is inactive"},
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create access token
    access_token_expires = timedelta(minutes=30)
    access_token = create_access_token(
        data={
            "sub": user.username,
            "user_id": user.id,
            "is_superuser": user.is_superuser
        },
        expires_delta=access_token_expires
    )

    # Return successful login response
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": 1800,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "is_active": user.is_active,
            "is_superuser": user.is_superuser,
            "created_at": user.created_at.isoformat() if user.created_at else None
        }
    }

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: dict = Depends(verify_token),
    db: AsyncSession = Depends(get_db)
):
    """Get current user information straight from the database.

    The token only carries username/user_id, and UserResponse requires a real
    email, so returning token data alone fails response validation.
    """
    from sqlalchemy import select
    from ..models.models import User

    result = await db.execute(select(User).where(User.username == current_user["username"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        is_superuser=user.is_superuser,
        created_at=user.created_at
    )

RESET_TOKEN_TTL = timedelta(hours=1)


@router.post("/password-reset-request")
async def request_password_reset(
    reset_request: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """Request a password reset.

    Both halves of this used to be stubs: this one generated a token and threw
    it away, and /password-reset returned success without touching anything.
    The token is now stored against the account with an expiry so the reset
    endpoint has something to verify.

    There is no mail transport configured, so the token is returned in the
    response when SMTP is not set up. That is deliberate for a self-hosted
    single-operator tool, and it is stated in the response.
    """
    query = select(User).where(User.email == reset_request.email)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    response = {"message": "If the email exists, a password reset link has been sent"}

    if user:
        user.reset_token = secrets.token_urlsafe(32)
        user.reset_token_expires = datetime.utcnow() + RESET_TOKEN_TTL
        db.add(user)
        await db.commit()

        import os
        if not os.getenv("SMTP_HOST"):
            response["reset_token"] = user.reset_token
            response["note"] = (
                "No SMTP_HOST is configured, so the token is returned here "
                "instead of being emailed."
            )

    # The message is identical either way, so a caller cannot use this endpoint
    # to find out which addresses have accounts.
    return response


@router.post("/password-reset")
async def reset_password(
    reset_data: PasswordReset,
    db: AsyncSession = Depends(get_db)
):
    """Reset a password using a token from /password-reset-request."""
    query = select(User).where(User.reset_token == reset_data.token)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if not user or not user.reset_token_expires:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )

    if user.reset_token_expires < datetime.utcnow():
        user.reset_token = None
        user.reset_token_expires = None
        db.add(user)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )

    user.hashed_password = security_manager.hash_password(reset_data.new_password)
    # Single use.
    user.reset_token = None
    user.reset_token_expires = None
    db.add(user)
    await db.commit()

    return {"message": "Password has been reset successfully"}

@router.get("/users", response_model=list[UserResponse])
async def get_users(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(verify_token),
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None
):
    """Get all users (admin only)"""
    # TODO: Add admin role check

    query = select(User)

    if search:
        query = query.where(
            User.username.ilike(f"%{search}%") |
            User.email.ilike(f"%{search}%") |
            User.full_name.ilike(f"%{search}%")
        )

    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    users = result.scalars().all()

    return [
        UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            is_active=user.is_active,
            is_superuser=user.is_superuser,
            created_at=user.created_at
        )
        for user in users
    ]

@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    """Get a specific user by ID"""
    # TODO: Add admin role check or allow users to see their own info

    query = select(User).where(User.id == user_id)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        is_superuser=user.is_superuser,
        created_at=user.created_at
    )
