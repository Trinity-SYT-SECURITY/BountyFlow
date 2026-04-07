"""
Database configuration and connection management for BountyFlow
"""

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, Integer, Boolean, DateTime, Text, JSON, Float, ForeignKey
from typing import Optional, List, Dict, Any
import os
import logging
from pathlib import Path
from datetime import datetime

# Database URL - can be configured via environment variables
# Use SQLite for development, PostgreSQL for production
USE_SQLITE = os.getenv("USE_SQLITE", "true").lower() == "true"

if USE_SQLITE:
    # Ensure database file is always created in the backend directory
    # This way, no matter where the script is run from, DB is always in the same place
    backend_dir = Path(__file__).parent.parent.parent  # Go from models/database.py to backend/
    db_path = backend_dir / "bountyflow.db"
    
    # Get absolute path and convert to URI format for SQLite
    # Use forward slashes and triple slashes for absolute paths
    db_uri = f"sqlite+aiosqlite:///{db_path.resolve().as_posix()}"
    
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        db_uri
    )
    logger = logging.getLogger(__name__)
    logger.info(f"Database will be stored at: {db_path.resolve()}")
else:
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://bountyflow:bountyflow@localhost:5432/bountyflow"
    )

# Create async engine with optimizations
FAST_STARTUP = os.getenv("FAST_STARTUP", "false").lower() == "true"

engine_kwargs = {
    "future": True,
    "pool_pre_ping": True,  # Verify connections before use
    "pool_recycle": 3600,   # Recycle connections every hour
}

# Disable echo in fast startup mode
if not FAST_STARTUP:
    engine_kwargs["echo"] = True

# SQLite specific optimizations
if USE_SQLITE:
    engine_kwargs.update({
        "connect_args": {
            "check_same_thread": False,
            "timeout": 20,
            "isolation_level": None,  # Disable autocommit for better performance
        }
    })

engine = create_async_engine(DATABASE_URL, **engine_kwargs)

# Create async session factory
async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Dependency to get database session
async def get_db() -> AsyncSession:
    """Dependency to get database session"""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception as e:
            await session.rollback()
            raise e
        finally:
            await session.close()

class Base(DeclarativeBase):
    """Base class for all database models"""
    pass

# Import all models to ensure they are registered with Base
from . import models
