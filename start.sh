#!/bin/bash

# 🎮 Game Platform - One-Command Startup Script
# This script starts the entire gaming platform stack

set -e

echo "🎮 Starting Complete Gaming Platform..."
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << EOF
NODE_ENV=production
PORT=3000

# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=game_platform
DB_USER=postgres
DB_PASSWORD=postgres

# Redis
REDIS_URL=redis://redis:6379

# MongoDB
MONGODB_URL=mongodb://mongo:27017/game-platform

# Security
JWT_SECRET=$(openssl rand -hex 32)

# CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# Optional: Add your payment provider keys
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
EOF
    echo "✅ Created .env file with default configuration"
else
    echo "✅ .env file already exists"
fi

echo ""
echo "${BLUE}Starting Docker containers...${NC}"
docker-compose up -d

echo ""
echo "${BLUE}Waiting for services to initialize...${NC}"
sleep 10

# Check service health
echo ""
echo "${BLUE}Checking service health...${NC}"

# Check PostgreSQL
if docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
    echo "✅ PostgreSQL: ${GREEN}Running${NC}"
else
    echo "❌ PostgreSQL: Not ready"
fi

# Check Redis
if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis: ${GREEN}Running${NC}"
else
    echo "❌ Redis: Not ready"
fi

# Check MongoDB
if docker-compose exec -T mongo mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
    echo "✅ MongoDB: ${GREEN}Running${NC}"
else
    echo "❌ MongoDB: Not ready"
fi

# Check API
sleep 5
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ API Server: ${GREEN}Running${NC}"
else
    echo "${YELLOW}⚠️  API Server: Still starting...${NC}"
fi

echo ""
echo "========================================"
echo "${GREEN}🎮 Gaming Platform Started Successfully!${NC}"
echo "========================================"
echo ""
echo "📱 Access your platform:"
echo "   Frontend:    ${BLUE}http://localhost:5173${NC}"
echo "   API:         ${BLUE}http://localhost:3000${NC}"
echo "   API Docs:    ${BLUE}http://localhost:3000/api/docs${NC}"
echo "   Grafana:     ${BLUE}http://localhost:3001${NC} (admin/admin)"
echo "   Prometheus:  ${BLUE}http://localhost:9090${NC}"
echo "   Kibana:      ${BLUE}http://localhost:5601${NC}"
echo ""
echo "📊 Database Connections:"
echo "   PostgreSQL:  ${BLUE}localhost:5432${NC}"
echo "   Redis:       ${BLUE}localhost:6379${NC}"
echo "   MongoDB:     ${BLUE}localhost:27017${NC}"
echo ""
echo "🔧 Useful Commands:"
echo "   View logs:        docker-compose logs -f"
echo "   Stop platform:    docker-compose down"
echo "   Restart:          docker-compose restart"
echo "   View status:      docker-compose ps"
echo ""
echo "📚 Documentation:"
echo "   Deployment Guide:  ${BLUE}DEPLOYMENT_GUIDE.md${NC}"
echo "   Feature Summary:   ${BLUE}COMPLETE_FEATURE_SUMMARY.md${NC}"
echo ""
echo "${GREEN}Happy Gaming! 🎮${NC}"
