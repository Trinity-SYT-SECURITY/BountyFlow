# 🚀 BountyFlow

## **Professional Penetration Testing Management Platform**

![BountyFlow Platform](icon/bountyflow-full.gif)

BountyFlow is a comprehensive platform designed for penetration testers and cybersecurity researchers, providing complete test workflow management from target identification to report generation.

## Demo

![BountyFlow Platform](icon/bountyflow.gif)

Detailed Function Explanation

https://youtu.be/DoWnAYBVy4w


## 🎯 Why BountyFlow?

| Problem | Solution |
|---------|----------|
| Data scattered across tools | **Unified Platform** - All data in one place |
| No standardized process | **Smart Workflow** - AI-driven recommendations |
| Hard to visualize attack paths | **Security Relationship Map** - Interactive graph visualization |
| Time-consuming reports | **Auto Report Generation** - One-click professional reports |
| Knowledge gets lost | **Knowledge Graph** - Automatic relationship discovery |

## ✨ Core Features

| Feature | Description |
|---------|-------------|
| 📊 **Dashboard** | Project overview, attack trends, MITRE ATT&CK coverage |
| 📁 **Projects** | Create and manage penetration testing projects |
| 🎯 **Targets** | Define targets, scan connectivity, track status |
| 🔍 **Findings** | Record vulnerabilities with severity and evidence |
| 🕵️ **Asset Discovery** | Track discovered users and files automatically |
| 🛠️ **Tools** | Execute tools, view real-time output, multi-target support |
| 🧠 **Security Map** | Visualize relationships between all entities |
| ⚡ **Attack Chain** | Build automated tool workflows |
| 🤖 **AI Assistant** | Context-aware recommendations and persistent chat history |
| 🕵️‍♂️ **Forensics Mode** | Detailed activity logs and AI interactions tracking |
| 📋 **Reports** | Auto-generate professional test reports |
| 🛡️ **Audit Logs** | System-wide audit trail for team accountability |

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Backend
cd apps/backend
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### 2. Configure Everything (One File)

All configuration — AI provider keys, database settings, Neo4j credentials — lives in a **single file**:

```bash
cd apps/backend
cp .env_example .env
nano .env  # or use any text editor
```

Your `.env` file controls everything. Edit and fill in **at least one** AI API key:

```bash
# ============================================================
# AI PROVIDER — Pick ONE and fill in the key
# ============================================================

# Option 1: Google Gemini (Recommended)
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-2.0-flash

# Option 2: OpenAI GPT
# OPENAI_API_KEY=sk-your-key-here

# Option 3: Anthropic Claude
# ANTHROPIC_API_KEY=sk-ant-your-key-here

# ============================================================
# NEO4J (must match docker-compose.yml)
# ============================================================
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=bountyflow123    # Change this if you modify docker-compose.yml
```

> [!TIP]
> The platform **auto-detects** which AI provider to use based on which key is set. You do NOT need to set `AI_PROVIDER` manually.

### 3. Start Docker Services (Required for Knowledge Graph)

BountyFlow **requires** Neo4j to power the Knowledge Graph and interactive Security Relationship Map. Redis is also needed for caching.

```bash
# From project root — start all services
docker-compose up -d

# Or start only Neo4j
docker-compose up -d neo4j
```

> [!IMPORTANT]
> The default Neo4j password is `bountyflow123`. If you change it in `docker-compose.yml`, update `NEO4J_PASSWORD` in `apps/backend/.env` to match.

### 4. Start the Platform

```bash
# From project root — one command startup
python start.py

# Or run manually in separate terminals:
# Terminal 1: cd apps/backend && python start.py
# Terminal 2: cd apps/frontend && npm run dev
```

### 5. Access

| Service | URL |
|---------|-----|
| 🌐 Frontend | http://localhost:3000 |
| 🔧 Backend API | http://localhost:8002 |
| 📚 API Docs | http://localhost:8002/docs |

### 5. Login

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin123!` | Administrator |
| `test_user` | `test123` | Regular User |

> ⚠️ Change these in production!

## 📖 How to Use

### Step 1: Create a Project
1. Go to **Projects** → Click **"Create New Project"**
2. Fill in project name, description, and scope
3. Click **Save**

### Step 2: Add Targets
1. Open your project → Click **"Add Target"**
2. Enter target type (IP, Domain, URL) and value
3. Click **Scan** to check if target is alive

### Step 3: Run Tools
1. Go to **Tools** → Select a tool (e.g., Nmap)
2. Select target(s) from dropdown
3. Click **Run** → View real-time output

### Step 4: View Security Map
1. Go to **Security Relationship Map**
2. Select your project
3. See all targets, findings, users, and their relationships

### Step 5: Generate Report
1. Go to **Reports** → Click **"Generate Report"**
2. AI analyzes all project data
3. Download PDF/HTML/Markdown report

## 🤖 AI Model Configuration

BountyFlow supports multiple AI providers. Just set one API key in `.env` — the platform auto-detects it.

All packages are **already included** in `requirements.txt`:
```
openai>=1.3.0          # OpenAI GPT
anthropic>=0.18.0      # Anthropic Claude
google-genai>=1.0.0    # Google Gemini
```

### Supported Providers

| Provider | Package | Models | API Key Required |
|----------|---------|--------|------------------|
| **OpenAI** | `openai` | gpt-4, gpt-4-turbo, gpt-3.5-turbo | Yes |
| **Anthropic** | `anthropic` | claude-sonnet-4-20250514, claude-3-5-sonnet, claude-3-opus | Yes |
| **Gemini** | `google-genai` | gemini-2.5-flash, gemini-2.0-flash | Yes |


### Force a Specific Provider

If you have multiple API keys set and want to force a specific one:
```bash
AI_PROVIDER=openai       # or: anthropic, gemini
```

See [ENV_CONFIGURATION.md](ENV_CONFIGURATION.md) for full configuration details.


## 🏗️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | FastAPI, SQLAlchemy, JWT |
| **Frontend** | Next.js 14, React 18, Tailwind CSS |
| **Database** | SQLite (default), PostgreSQL (optional) |
| **Graph DB** | Neo4j (Required for Graph) |
| **AI** | Gemini, OpenAI, Anthropic |

## 🔧 Troubleshooting

### Database Reset
```bash
cd apps/backend
rm bountyflow.db  # Linux/Mac
del bountyflow.db # Windows
# Restart backend - auto recreates
```

### Common Issues

| Issue | Solution |
|-------|----------|
| "No AI provider configured" | Set at least one API key in `.env` (OpenAI, Anthropic, or Gemini) |
| Wrong AI provider being used | Remove `AI_PROVIDER` from `.env` for auto-detection, or set it explicitly |
| "Connection refused" | Start backend first |
| "Neo4j auth failed" | Check NEO4J_PASSWORD in `.env` |

## 🚧 Future Roadmap

- **External Tool Integration** - Import data from any tool (PentestGPT, Burp, etc.)
- **AI Format Normalization** - Auto-convert any format to BountyFlow structure
- **Graph Neural Networks** - Predictive relationship inference
- **Multi-user Collaboration** - Real-time team editing

## 🤝 Contributing

Want to add support for a new AI model or feature?

1. **New AI Model Request**: Open an issue describing the model
2. **Bug Reports**: Include steps to reproduce
3. **Feature Requests**: Describe the use case

## Developer

- YI TING SHEN
- Ariz Soriano

## ⚠️ Security Notice

This is a **penetration testing management platform**, NOT a vulnerability disclosure platform.
- Does NOT handle CVE submissions
- For platform security issues, submit a Pull Request

## 📄 License

**MIT License** - see [LICENSE](LICENSE) file.

---

**Built for the cybersecurity community with ❤️**
