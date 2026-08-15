@echo off
REM BountyFlow Universal Startup Script
REM This script calls the Python startup script

echo ========================================
echo     BountyFlow Development Server
echo ========================================
echo.

REM Check if Python is available
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo Using Python startup script...
    python start.py
) else (
    echo Python not found, please install Python 3.8+
    echo Or run manually:
    echo   Backend:  cd apps\backend && python -m uvicorn src.main:app --host 0.0.0.0 --port 8002 --reload
    echo   Frontend: cd apps\frontend && npm run dev
)

pause