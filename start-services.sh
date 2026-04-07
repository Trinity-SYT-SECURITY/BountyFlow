#!/bin/bash

# Start Docker services for BountyFlow (Neo4j, Redis, etc.)
# This script starts supporting services but NOT the frontend/backend
# Frontend and backend should be started separately using start.py

echo "=========================================="
echo "🚀 Starting BountyFlow Support Services"
echo "=========================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first:"
    echo "   https://www.docker.com/get-started"
    exit 1
fi

# Check if Docker Compose is available
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
else
    echo "❌ Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

# Navigate to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

echo "📦 Starting services (Neo4j, Redis)..."
echo ""

# Start services
$COMPOSE_CMD -f docker-compose.yml up -d

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Services started successfully!"
    echo ""
    echo "📊 Service Status:"
    docker ps --filter "name=bountyflow" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo ""
    echo "🔗 Access URLs:"
    echo "   - Neo4j Browser: http://localhost:7474"
    echo "   - Neo4j Bolt: bolt://localhost:7687"
    echo "   - Redis: localhost:6379"
    echo ""
    echo "🔑 Neo4j Credentials:"
    echo "   Username: neo4j"
    echo "   Password: bountyflow123"
    echo ""
    echo "💡 To stop services, run:"
    echo "   $COMPOSE_CMD -f docker-compose.yml down"
    echo ""
    echo "💡 To view logs, run:"
    echo "   $COMPOSE_CMD -f docker-compose.yml logs -f"
else
    echo ""
    echo "❌ Failed to start services. Check Docker logs for details."
    exit 1
fi

