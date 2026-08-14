"""
Create initial admin user for BountyFlow
"""

import asyncio
import sys
from datetime import datetime
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.database import get_db, engine, Base
from utils.security import security_manager
from utils.storage import storage_manager
import structlog

logger = structlog.get_logger(__name__)

async def create_admin_user():
    """Create initial admin user with maximum permissions"""
    
    # Admin user data
    admin_data = {
        "username": "admin",
        "email": "admin@bountyflow.com",
        "full_name": "System Administrator",
        "hashed_password": security_manager.hash_password("admin123!"),
        "is_active": True,
        "is_superuser": True,
        "created_at": datetime.utcnow()
    }
    
    try:
        logger.info("Starting admin user creation process...")
        
        # Initialize storage manager
        await storage_manager.initialize()
        logger.info("Storage manager initialized")
        
        # Create database tables if they don't exist
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables created/verified")
        
        # Create admin user
        async for session in get_db():
            try:
                result = await storage_manager.create_admin_user(session, admin_data)
                logger.info("Admin user created successfully", **result)
                
                print("=" * 60)
                print("🎉 ADMIN USER CREATED SUCCESSFULLY!")
                print("=" * 60)
                print(f"Username: {result['username']}")
                print(f"Email: {result['email']}")
                print(f"Password: admin123!")
                print(f"User ID: {result['user_id']}")
                print(f"Role: {result['role']}")
                print("=" * 60)
                print("📊 Data Storage Distribution:")
                print("• SQLite: Core user data, authentication")
                print("• Redis: Session data, cache, temporary data")
                print("• Neo4j: User relationships, permissions graph")
                print("=" * 60)
                print("🔐 Security Features:")
                print("• Password hashed with bcrypt")
                print("• Secure token generation")
                print("• Multi-database data separation")
                print("=" * 60)
                
                break
            except Exception as e:
                logger.error("Failed to create admin user", error=str(e))
                print(f"❌ Error creating admin user: {e}")
                break
            finally:
                await session.close()
        
        # Close storage connections
        await storage_manager.close()
        
    except Exception as e:
        logger.error("Admin user creation failed", error=str(e))
        print(f"❌ Critical error: {e}")
        sys.exit(1)

async def verify_admin_user():
    """Verify admin user was created correctly"""
    try:
        await storage_manager.initialize()
        
        # Check SQLite
        async for session in get_db():
            result = await session.execute("SELECT id, username, email, is_superuser FROM users WHERE username = 'admin'")
            user = result.fetchone()
            if user:
                print(f"✅ SQLite: Admin user found (ID: {user[0]})")
            else:
                print("❌ SQLite: Admin user not found")
            break
        
        # Check Redis
        session_data = await storage_manager.redis_client.hgetall("user_session:1")
        if session_data:
            print("✅ Redis: Session data stored")
        else:
            print("❌ Redis: Session data not found")
        
        # Check Neo4j
        async with storage_manager.neo4j_driver.session() as session:
            result = await session.run("MATCH (u:User {username: 'admin'}) RETURN u")
            record = await result.single()
            if record:
                print("✅ Neo4j: User node created")
            else:
                print("❌ Neo4j: User node not found")
        
        await storage_manager.close()
        
    except Exception as e:
        print(f"❌ Verification failed: {e}")

if __name__ == "__main__":
    print("🚀 BountyFlow Admin User Creation")
    print("=" * 40)
    
    # Create admin user
    asyncio.run(create_admin_user())
    
    print("\n🔍 Verifying admin user creation...")
    asyncio.run(verify_admin_user())


