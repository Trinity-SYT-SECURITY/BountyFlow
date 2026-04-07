"""
Pydantic schemas for authentication and user management
"""

from pydantic import BaseModel, Field, EmailStr, validator
from typing import Optional
from datetime import datetime

class UserBase(BaseModel):
    """Base user schema"""
    username: str = Field(..., min_length=3, max_length=50, pattern="^[a-zA-Z0-9_-]+$")
    email: EmailStr = Field(...)
    full_name: Optional[str] = Field(None, max_length=100)

class UserCreate(UserBase):
    """Schema for creating a new user"""
    password: str = Field(..., min_length=8, max_length=100)

    @validator('password')
    def validate_password(cls, v):
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        return v

class UserLogin(BaseModel):
    """Schema for user login"""
    username: str = Field(...)
    password: str = Field(...)

class LoginForm(BaseModel):
    """Custom login form to replace OAuth2PasswordRequestForm"""
    username: str
    password: str

class UserResponse(UserBase):
    """Response schema for users"""
    id: int
    is_active: bool
    is_superuser: bool
    created_at: datetime

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    """Response schema for authentication tokens"""
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds
    user: UserResponse

class PasswordResetRequest(BaseModel):
    """Schema for password reset request"""
    email: EmailStr

class PasswordReset(BaseModel):
    """Schema for password reset"""
    token: str
    new_password: str = Field(..., min_length=8, max_length=100)
