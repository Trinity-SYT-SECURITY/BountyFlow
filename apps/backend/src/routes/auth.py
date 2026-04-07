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
from ..middleware.auth import create_access_token, verify_token
from ..utils.security import security_manager

# Mock function for development
def get_current_user():
    """Mock function for development - returns a test user"""
    return {"user_id": "test_user", "username": "test_user"}

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

@router.get("/auth/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: dict = Depends(verify_token)
):
    """Get current user information"""
    # In a real implementation, you'd fetch the full user object from database
    # For now, return the token data
    return UserResponse(
        id=current_user["user_id"],
        username=current_user["username"],
        email="",  # Would need to fetch from database
        full_name="",
        is_active=True,
        is_superuser=False,
        created_at=datetime.utcnow()
    )

@router.post("/auth/password-reset-request")
async def request_password_reset(
    reset_request: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """Request password reset"""
    # Find user by email
    query = select(User).where(User.email == reset_request.email)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if user:
        # Generate reset token
        reset_token = secrets.token_urlsafe(32)

        # In a real implementation, you'd store this token in database with expiration
        # and send an email with the reset link

        # For now, just return success
        pass

    # Always return success to prevent email enumeration
    return {"message": "If the email exists, a password reset link has been sent"}

@router.post("/auth/password-reset")
async def reset_password(
    reset_data: PasswordReset,
    db: AsyncSession = Depends(get_db)
):
    """Reset user password"""
    # In a real implementation, you'd verify the reset token
    # and update the user's password

    # For now, just return success
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
