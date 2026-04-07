@echo off
REM Start Docker services for BountyFlow (Neo4j, Redis, etc.)
REM This script starts supporting services but NOT the frontend/backend
REM Frontend and backend should be started separately using start.py

echo ==========================================
echo 🚀 Starting BountyFlow Support Services
echo ==========================================

REM Check if Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not installed. Please install Docker Desktop first:
    echo    https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

REM Navigate to script directory
cd /d "%~dp0"

echo 📦 Starting services (Neo4j, Redis)...
echo.

REM Try docker compose (newer) first, then docker-compose (older)
docker compose version >nul 2>&1
if errorlevel 1 (
    docker-compose -f docker-compose.yml up -d
) else (
    docker compose -f docker-compose.yml up -d
)

if errorlevel 1 (
    echo.
    echo ❌ Failed to start services. Check Docker logs for details.
    pause
    exit /b 1
)

echo.
echo ✅ Services started successfully!
echo.
echo 📊 Service Status:
docker ps --filter "name=bountyflow" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo.
echo 🔗 Access URLs:
echo    - Neo4j Browser: http://localhost:7474
echo    - Neo4j Bolt: bolt://localhost:7687
echo    - Redis: localhost:6379
echo.
echo 🔑 Neo4j Credentials:
echo    Username: neo4j
echo    Password: bountyflow123
echo.
echo 💡 To stop services, run:
echo    docker compose -f docker-compose.yml down
echo    (or docker-compose -f docker-compose.yml down)
echo.
echo 💡 To view logs, run:
echo    docker compose -f docker-compose.yml logs -f
echo.
pause

