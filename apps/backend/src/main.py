"""
BountyFlow - Bug Bounty Platform Backend API

A comprehensive platform for bug bounty hunters and penetration testers
providing data collection, analysis, automation, and reporting capabilities.
"""

# Load environment variables FIRST before any other imports
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from the backend directory
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from contextlib import asynccontextmanager
import uvicorn
import logging
from typing import Optional
from pathlib import Path
# from .config import get_backend_config, get_frontend_config

# Import database and models
try:
    from .models.database import engine, Base, get_db, async_session
    from .models import models
    from .routes import api_router
except ImportError as e:
    print(f"Import error: {e}")
    print("Please make sure all dependencies are installed: pip install -r requirements.txt")
    raise

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Security scheme
security = HTTPBearer()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    import time
    startup_start = time.time()
    
    # Startup
    logger.info("Starting BountyFlow Backend API...")

    # Check if tables exist first (faster)
    try:
        async with engine.begin() as conn:
            # Check if projects table exists
            result = await conn.execute("""
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='projects' 
                LIMIT 1
            """)
            tables_exist = result.fetchone() is not None
    except Exception:
        tables_exist = False
    
    if not tables_exist:
        logger.info("📊 Database tables not found. Creating new database...")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("✅ Database tables created successfully!")
    else:
        logger.info("📊 Database tables already exist, checking for schema migrations...")
        from sqlalchemy import text as sa_text, inspect as sa_inspect

        # Add missing columns to existing tables FIRST (before create_all touches anything)
        migrations = [
            ("targets", "scan_results", "TEXT"),
        ]
        for table, column, col_type in migrations:
            try:
                async with engine.begin() as conn:
                    # Use SQLite pragma to check column existence reliably
                    result = await conn.execute(sa_text(f"PRAGMA table_info({table})"))
                    columns = [row[1] for row in result.fetchall()]
                    if column not in columns:
                        await conn.execute(sa_text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
                        logger.info(f"  ✅ Added missing column {table}.{column}")
            except Exception as e:
                logger.warning(f"  ⚠️ Migration {table}.{column}: {e}")

        # Now create any new tables (e.g. workflow_executions)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("✅ Schema migrations complete")

    # Initialize default users (admin and test_user)
    # This will create default users if they don't exist
    logger.info("👤 Initializing default users (admin, test_user)...")
    try:
        from .utils.init_db import create_default_users
        success = await create_default_users()
        if success:
            logger.info("✅ Default users initialized successfully!")
            logger.info("   Default credentials:")
            logger.info("   - Username: admin / Password: admin123!")
            logger.info("   - Username: test_user / Password: test123")
        else:
            logger.warning("⚠️  Default users initialization may have failed")
    except Exception as e:
        logger.warning(f"⚠️  Failed to initialize default users: {e}")
        import traceback
        logger.debug(traceback.format_exc())

    # Pre-warm connection pool
    try:
        from sqlalchemy import text
        async with async_session() as session:
            await session.execute(text("SELECT 1"))
        logger.info("Database connection pool warmed up")
    except Exception as e:
        logger.warning(f"Failed to warm up connection pool: {e}")
    
    startup_time = time.time() - startup_start
    logger.info(f"Backend startup completed in {startup_time:.2f} seconds")

    yield

    # Shutdown
    logger.info("Shutting down BountyFlow Backend API...")

# Create FastAPI application
app = FastAPI(
    title="BountyFlow API",
    description="Comprehensive bug bounty and penetration testing platform",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware - MUST be added before routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],  # Frontend origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "BountyFlow Backend API",
        "version": "1.0.0"
    }

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "Welcome to BountyFlow API",
        "docs": "/docs",
        "health": "/health"
    }

# Include API routes
app.include_router(api_router, prefix="/api/v1")

# Serve uploaded files (images and documents)
uploads_dir = Path(__file__).parent.parent / "uploads"
uploads_dir.mkdir(exist_ok=True)

# Create subdirectories
(uploads_dir / "report_images").mkdir(exist_ok=True)
(uploads_dir / "report_documents").mkdir(exist_ok=True)

try:
    app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")
    logger.info(f"✅ Uploads directory mounted at /uploads")
except Exception as e:
    logger.warning(f"⚠️  Could not mount uploads directory: {e}")

# Authentication dependency
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current authenticated user"""
    # TODO: Implement JWT token validation
    # For now, return a mock user
    return {"user_id": "mock_user", "username": "test_user"}

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    from fastapi.responses import JSONResponse
    # Get origin from request headers, default to localhost:3000
    origin = request.headers.get("origin", "http://localhost:3000")
    # Only allow known origins
    allowed_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
    if origin in allowed_origins:
        cors_origin = origin
    else:
        cors_origin = "http://localhost:3000"
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": "HTTP Exception",
            "detail": exc.detail,
            "status_code": exc.status_code
        },
        headers={
            "Access-Control-Allow-Origin": cors_origin,
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Credentials": "true"
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Handle all unhandled exceptions"""
    from fastapi.responses import JSONResponse
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    # Get origin from request headers, default to localhost:3000
    origin = request.headers.get("origin", "http://localhost:3000")
    # Only allow known origins
    allowed_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
    if origin in allowed_origins:
        cors_origin = origin
    else:
        cors_origin = "http://localhost:3000"
    
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "detail": str(exc),
            "status_code": 500
        },
        headers={
            "Access-Control-Allow-Origin": cors_origin,
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Credentials": "true"
        }
    )

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8002,
        reload=True,
        log_level="info"
    )
