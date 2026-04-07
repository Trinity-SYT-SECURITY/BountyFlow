#!/usr/bin/env python3
"""
BountyFlow Universal Startup Script
Automatically detects OS and starts both backend and frontend servers
"""

import os
import sys
import subprocess
import platform
import time
from pathlib import Path

def print_banner():
    """Print startup banner"""
    print("=" * 50)
    print("    🚀 BountyFlow Development Server")
    print("=" * 50)
    print()

def check_requirements():
    """Check if we're in the right directory and requirements exist"""
    current_dir = Path.cwd()
    
    # Check if we're in the bountyflow directory
    if not (current_dir / "apps" / "backend" / "src").exists():
        print("❌ Error: Please run this script from the bountyflow directory")
        print(f"Current directory: {current_dir}")
        print("Expected to find: apps/backend/src/")
        input("Press Enter to exit...")
        sys.exit(1)
    
    if not (current_dir / "apps" / "frontend" / "package.json").exists():
        print("❌ Error: Frontend directory not found")
        print(f"Expected to find: apps/frontend/package.json")
        input("Press Enter to exit...")
        sys.exit(1)
    
    print("✅ Directory structure verified")
    return current_dir

def detect_os():
    """Detect operating system"""
    system = platform.system().lower()
    if system == "windows":
        return "windows"
    elif system == "darwin":
        return "macos"
    elif system == "linux":
        return "linux"
    else:
        return "unknown"

def start_backend(project_dir, os_type):
    """Start backend server"""
    print("🚀 Starting Backend Server...")
    
    backend_dir = project_dir / "apps" / "backend"
    
    if os_type == "windows":
        # Windows - use cmd
        subprocess.Popen([
            "cmd", "/k", 
            f"cd /d {backend_dir} && python start.py"
        ], creationflags=subprocess.CREATE_NEW_CONSOLE)
    elif os_type == "macos":
        # macOS - use Terminal
        subprocess.run([
            "osascript", "-e",
            f'tell app "Terminal" to do script "cd \'{backend_dir}\' && python start.py"'
        ])
    elif os_type == "linux":
        # Linux - try different terminal emulators
        terminals = [
            ["gnome-terminal", "--title=BountyFlow Backend", "--", "bash", "-c", f"cd '{backend_dir}' && python start.py; exec bash"],
            ["xterm", "-title", "BountyFlow Backend", "-e", "bash", "-c", f"cd '{backend_dir}' && python start.py; bash"],
            ["konsole", "--title", "BountyFlow Backend", "-e", "bash", "-c", f"cd '{backend_dir}' && python start.py; exec bash"]
        ]
        
        started = False
        for terminal in terminals:
            try:
                subprocess.Popen(terminal, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                started = True
                break
            except FileNotFoundError:
                continue
        
        if not started:
            print("⚠️  No supported terminal found. Please start backend manually:")
            print(f"   cd {backend_dir} && python start.py")
    else:
        print("⚠️  Unsupported OS. Please start backend manually:")
        print(f"   cd {backend_dir} && python start.py")

def start_frontend(project_dir, os_type):
    """Start frontend server"""
    print("🚀 Starting Frontend Server...")
    
    frontend_dir = project_dir / "apps" / "frontend"
    
    if os_type == "windows":
        # Windows - use cmd
        subprocess.Popen([
            "cmd", "/k", 
            f"cd /d {frontend_dir} && npm run dev"
        ], creationflags=subprocess.CREATE_NEW_CONSOLE)
    elif os_type == "macos":
        # macOS - use Terminal
        subprocess.run([
            "osascript", "-e",
            f'tell app "Terminal" to do script "cd \'{frontend_dir}\' && npm run dev"'
        ])
    elif os_type == "linux":
        # Linux - try different terminal emulators
        terminals = [
            ["gnome-terminal", "--title=BountyFlow Frontend", "--", "bash", "-c", f"cd '{frontend_dir}' && npm run dev; exec bash"],
            ["xterm", "-title", "BountyFlow Frontend", "-e", "bash", "-c", f"cd '{frontend_dir}' && npm run dev; bash"],
            ["konsole", "--title", "BountyFlow Frontend", "-e", "bash", "-c", f"cd '{frontend_dir}' && npm run dev; exec bash"]
        ]
        
        started = False
        for terminal in terminals:
            try:
                subprocess.Popen(terminal, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                started = True
                break
            except FileNotFoundError:
                continue
        
        if not started:
            print("⚠️  No supported terminal found. Please start frontend manually:")
            print(f"   cd {frontend_dir} && npm run dev")
    else:
        print("⚠️  Unsupported OS. Please start frontend manually:")
        print(f"   cd {frontend_dir} && npm run dev")

def main():
    """Main function"""
    print_banner()
    
    # Check requirements
    project_dir = check_requirements()
    
    # Detect OS
    os_type = detect_os()
    print(f"🖥️  Detected OS: {os_type.title()}")
    print()
    
    # Start backend
    start_backend(project_dir, os_type)
    
    # Wait for backend to initialize
    print("⏳ Waiting 3 seconds for backend to initialize...")
    time.sleep(3)
    
    # Start frontend
    start_frontend(project_dir, os_type)
    
    # Show final information
    print()
    print("=" * 50)
    print("    🎉 Servers Starting...")
    print("=" * 50)
    print("🌐 Backend:  http://localhost:8002")
    print("🌐 Frontend: http://localhost:3000")
    print("📚 API Docs: http://localhost:8002/docs")
    print()
    print("🔑 Default Login Credentials:")
    print("   Test User:  test_user / test123")
    print("   Admin User: admin / admin123!")
    print()
    print("Press Enter to close this window...")
    input()

if __name__ == "__main__":
    main()