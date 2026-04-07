"""
Database initialization script to create default users
"""

import bcrypt
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..models.models import User
from ..models.database import async_session

logger = logging.getLogger(__name__)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash"""
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


async def create_default_users():
    """Create default users if they don't exist"""
    default_users = [
        {
            "username": "admin",
            "email": "admin@bountyflow.local",
            "hashed_password": hash_password("admin123!"),
            "full_name": "System Administrator",
            "is_active": True,
            "is_superuser": True
        },
        {
            "username": "test_user",
            "email": "test@bountyflow.local",
            "hashed_password": hash_password("test123"),
            "full_name": "Test User",
            "is_active": True,
            "is_superuser": False
        }
    ]
    
    async with async_session() as session:
        try:
            users_created = 0
            users_skipped = 0
            
            for user_data in default_users:
                # Check if user already exists
                result = await session.execute(
                    select(User).where(User.username == user_data["username"])
                )
                existing_user = result.scalar_one_or_none()
                
                if not existing_user:
                    # Create new user
                    new_user = User(**user_data)
                    session.add(new_user)
                    logger.info(f"   ✅ Created user: {user_data['username']}")
                    users_created += 1
                else:
                    logger.debug(f"   ⏭️  User already exists: {user_data['username']}")
                    users_skipped += 1
            
            await session.commit()
            
            if users_created > 0:
                logger.info(f"✅ Created {users_created} default user(s)")
            if users_skipped > 0:
                logger.info(f"⏭️  Skipped {users_skipped} existing user(s)")
            
            return True
        except Exception as e:
            await session.rollback()
            logger.error(f"❌ Failed to create default users: {e}", exc_info=True)
            return False

