# 📦 Installation Guide

This guide provides detailed installation instructions for BountyFlow.

## Prerequisites

### Required Software

1. **Python 3.10+**
   - Download: https://www.python.org/downloads/
   - Verify: `python --version` or `python3 --version`

2. **Node.js 18+ and npm**
   - Download: https://nodejs.org/
   - Verify: `node --version` and `npm --version`

3. **Git**
   - Download: https://git-scm.com/downloads
   - Verify: `git --version`

### Support Services (Required for Graph)

4. **Docker Desktop** (for Neo4j and Redis)
   - Download: https://www.docker.com/products/docker-desktop
   - Verify: `docker --version`

## Step-by-Step Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd bountyflow
```

### 2. Backend Setup

#### 2.1 Navigate to Backend Directory

```bash
cd apps/backend
```

#### 2.2 Create Virtual Environment (Recommended)

**Windows:**
```bash
python -m venv venv
venv\Scripts\activate
```

**Mac/Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

#### 2.3 Install Backend Dependencies

```bash
pip install -r requirements.txt
```

**What gets installed:**
- FastAPI and Uvicorn (web framework)
- SQLAlchemy (database ORM)
- python-jose and bcrypt (authentication)
- google-generativeai (AI integration)
- markdown and weasyprint (report generation)
- And 20+ other packages...

**Troubleshooting:**
- If `pip` command not found: Use `python -m pip` or `python3 -m pip`
- If installation fails: Try `pip install --upgrade pip` first
- On Windows: May need to install Visual C++ Build Tools for some packages
- On Mac: May need Xcode Command Line Tools: `xcode-select --install`

### 3. Frontend Setup

#### 3.1 Navigate to Frontend Directory

```bash
cd ../frontend
```

#### 3.2 Install Frontend Dependencies

```bash
npm install
```

**What gets installed:**
- Next.js and React (frontend framework)
- react-markdown and remark-gfm (markdown rendering)
- rehype-highlight (code syntax highlighting)
- apexcharts (charts and graphs)
- And 30+ other packages...

**Troubleshooting:**
- If `npm` command not found: Install Node.js from nodejs.org
- If installation fails: Try `npm cache clean --force` then `npm install`
- On Windows: May need to run as Administrator for global installs

### 4. Required: Docker Services Setup (Neo4j & Redis)

#### 4.1 Start Support Services

**Windows:**
```bash
cd ../..
start-services.bat
```

**Mac/Linux:**
```bash
cd ../..
chmod +x start-services.sh
./start-services.sh
```

**Manual start:**
```bash
docker compose -f docker-compose.services.yml up -d
```

**Services included:**
- **Neo4j** (port 7474/7687): Knowledge graph database
- **Redis** (port 6379): Caching and sessions

**Access Neo4j:**
- Browser: http://localhost:7474
- Username: `neo4j`
- Password: `bountyflow123`

### 5. Environment Configuration

#### 5.1 Gemini API Key (Optional but Recommended)

1. Get API key from: https://aistudio.google.com/api-keys
2. Create `.env` file in `apps/backend/`:

```bash
cd apps/backend
# Windows
echo GEMINI_API_KEY=your-api-key-here > .env

# Mac/Linux
echo "GEMINI_API_KEY=your-api-key-here" > .env
```

**Note:** Without API key, AI features won't work, but other features will function.

### 6. Verify Installation

#### 6.1 Check Backend Dependencies

```bash
cd apps/backend
python -c "import fastapi, sqlalchemy, jose, bcrypt; print('✅ Backend packages OK')"
```

#### 6.2 Check Frontend Dependencies

```bash
cd apps/frontend
npm list --depth=0
```

#### 6.3 Check Docker Services

```bash
docker ps --filter "name=bountyflow"
```

## Quick Start After Installation

### Start Everything

```bash
# From project root
python start.py
```

This will:
1. ✅ Verify directory structure
2. ✅ Start backend server (http://localhost:8002)
3. ✅ Start frontend server (http://localhost:3000)
4. ✅ Auto-create database and default users

### Access the Platform

- **Frontend UI**: http://localhost:3000
- **Backend API**: http://localhost:8002
- **API Docs**: http://localhost:8002/docs
- **Neo4j Browser**: http://localhost:7474 (if Docker services running)

### Default Credentials

- Username: `admin` / Password: `admin123!`
- Username: `test_user` / Password: `test123`

## Common Installation Issues

### Python Package Installation Fails

**Error**: `error: Microsoft Visual C++ 14.0 or greater is required`

**Solution (Windows):**
- Install Visual Studio Build Tools: https://visualstudio.microsoft.com/downloads/
- Or use pre-compiled wheels: `pip install --only-binary :all: <package>`

**Error**: `SSL: CERTIFICATE_VERIFY_FAILED`

**Solution:**
```bash
pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org -r requirements.txt
```

### Node.js Package Installation Fails

**Error**: `npm ERR! code ELIFECYCLE`

**Solution:**
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

**Error**: `EACCES: permission denied`

**Solution (Mac/Linux):**
```bash
sudo chown -R $(whoami) ~/.npm
npm install
```

### Docker Services Won't Start

**Error**: `port is already allocated`

**Solution:**
```bash
# Find process using port
# Windows
netstat -ano | findstr :7474
# Mac/Linux
lsof -i :7474

# Stop the process or change port in docker-compose.services.yml
```

**Error**: `Cannot connect to Docker daemon`

**Solution:**
- Ensure Docker Desktop is running
- Restart Docker Desktop
- On Linux: `sudo systemctl start docker`

## Development vs Production

### Development Setup (Current)

- SQLite database (file-based, auto-created)
- Docker required for Knowledge Graph (Neo4j)
- Local file storage for uploads
- Auto-generated JWT secrets

### Production Setup (Future)

- PostgreSQL database
- Docker containers for all services
- External file storage (S3, etc.)
- Environment-specific secrets
- HTTPS/SSL certificates
- Reverse proxy (nginx)

## Need Help?

If you encounter issues not covered here:

1. Check the main README.md troubleshooting section
2. Review error logs in backend/frontend console
3. Ensure all prerequisites are installed
4. Verify ports 3000 and 8002 are not in use
5. Check firewall/antivirus isn't blocking connections

