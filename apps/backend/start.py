#!/usr/bin/env python3
"""
BountyFlow Backend Startup Script
"""

import sys
import os
import uvicorn
from pathlib import Path

# Get the backend directory
backend_dir = Path(__file__).parent.resolve()
src_dir = backend_dir / "src"

# Add the backend directory to Python path so src can be imported as a package
# This allows relative imports in main.py to work correctly
sys.path.insert(0, str(backend_dir))

def main():
    """Start the BountyFlow backend server"""
    print("🚀 Starting BountyFlow Backend Server...")
    print("📡 Backend API will be available at: http://localhost:8002")
    print("📚 API Documentation: http://localhost:8002/docs")
    print("❤️  Health Check: http://localhost:8002/health")
    print("=" * 50)
    
    try:
        # Import the app from src package (this allows relative imports to work)
        from src.main import app
        
        # Start the server
        config = uvicorn.Config(
            app,
            host="0.0.0.0",
            port=8002,
            reload=True,
            reload_dirs=[str(src_dir)],
            log_level="info"
        )
        server = uvicorn.Server(config)
        server.run()
    except KeyboardInterrupt:
        print("\n🛑 Backend server stopped by user")
    except Exception as e:
        print(f"❌ Error starting backend server: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
