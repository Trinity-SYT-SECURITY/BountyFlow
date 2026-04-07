#!/bin/bash
# BountyFlow Universal Startup Script
# This script calls the Python startup script

echo "========================================"
echo "    BountyFlow Development Server"
echo "========================================"
echo ""

# Check if Python is available
if command -v python3 &> /dev/null; then
    echo "Using Python startup script..."
    python3 start.py
elif command -v python &> /dev/null; then
    echo "Using Python startup script..."
    python start.py
else
    echo "Python not found, please install Python 3.8+"
    echo "Or run manually:"
    echo "  Backend:  cd apps/backend && python -m uvicorn src.main:app --host 0.0.0.0 --port 8002 --reload"
    echo "  Frontend: cd apps/frontend && npm run dev"
fi