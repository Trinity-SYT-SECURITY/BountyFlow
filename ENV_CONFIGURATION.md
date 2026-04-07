# Environment Configuration Guide

## Overview

All configuration values are loaded from environment variables via `.env` file. **No sensitive information is hardcoded in the source code.**

## Required Configuration

### Database
```bash
DATABASE_URL=sqlite+aiosqlite:///./bountyflow.db
```

### Security
```bash
SECRET_KEY=your-secret-key-here-change-in-production
```
**Warning**: Change this in production!

### Development Mode
```bash
DEBUG=true
RELOAD=true
```

## AI Configuration

BountyFlow supports **3 AI providers**. You only need **one** — just set the API key and the platform auto-detects it.

All provider packages are **already included** in `requirements.txt`:
```
google-genai>=1.0.0    # Gemini
openai>=1.3.0          # OpenAI GPT
anthropic>=0.18.0      # Anthropic Claude
```

### Quick Setup (pick one)

**OpenAI:**
```bash
OPENAI_API_KEY=sk-your-key-here
```

**Anthropic Claude:**
```bash
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

**Google Gemini:**
```bash
GEMINI_API_KEY=your-key-here
```

That's it. Restart the backend and the platform will use whichever provider has a key configured.

### Auto-Detection Behavior

When `AI_PROVIDER` is **not set** (recommended for most users):
- The platform checks which providers have valid API keys
- It uses the **first available** provider it finds
- Order checked: Gemini, OpenAI, Anthropic

When `AI_PROVIDER` **is set** explicitly:
- The platform uses that specific provider
- If that provider is not configured, it falls back to the first available one
- A warning is logged when fallback occurs

### Provider Selection (Optional)
```bash
# Only set this if you have multiple providers configured and want to force one:
AI_PROVIDER=openai      # or: gemini, anthropic
```

### Full Provider Options

#### OpenAI
```bash
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4              # Options: gpt-4, gpt-4-turbo, gpt-3.5-turbo
OPENAI_TEMPERATURE=0.7
```

#### Anthropic Claude
```bash
ANTHROPIC_API_KEY=sk-ant-your-key-here
ANTHROPIC_MODEL=claude-sonnet-4-20250514   # Options: claude-sonnet-4-20250514, claude-3-5-sonnet-20241022, claude-3-opus-20240229
```

#### Google Gemini
```bash
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-2.5-flash   # Options: gemini-2.5-flash, gemini-2.0-flash, gemini-2.0-flash-lite
GEMINI_TEMPERATURE=0.7
```

```

## Optional Configuration

### Neo4j (For Advanced Knowledge Graph)
```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password_here
```

### Redis (For Caching)
```bash
REDIS_URL=redis://localhost:6379
```

## Configuration Priority

1. **Environment Variables** (highest priority)
2. **Default Values** (only for non-sensitive settings like timeouts)

## Important Notes

- All API keys are loaded from environment variables
- No hardcoded credentials in source code
- Model names are configurable via environment variables
- Timeouts are configurable via environment variables
- All URLs and endpoints are configurable

## Setup Instructions

1. Copy `.env_example` to `.env`:
   ```bash
   cp apps/backend/.env_example apps/backend/.env
   ```

2. Edit `.env` and fill in your API key (just one provider needed):
   ```bash
   # Example: using OpenAI
   OPENAI_API_KEY=sk-your-actual-key-here

   # Example: using Claude
   ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
   ```

3. Install dependencies (packages already in requirements.txt):
   ```bash
   cd apps/backend
   pip install -r requirements.txt
   ```

4. Restart the backend server to load new configuration.

## Verification

To verify your configuration is correct, check the backend logs when starting:
- "Routing AI request to provider: openai" - OpenAI is active
- "Routing AI request to provider: anthropic" - Claude is active
- "Routing AI request to provider: gemini" - Gemini is active
- "No AI provider configured" - No API keys set

## Security Best Practices

1. **Never commit `.env` file to version control**
2. **Use strong SECRET_KEY in production**
3. **Rotate API keys regularly**
4. **Use environment-specific `.env` files** (`.env.development`, `.env.production`)
5. **Restrict file permissions**: `chmod 600 .env`

## Troubleshooting

### "No AI provider configured"
- Check that `.env` file exists in `apps/backend/` directory
- Verify at least one API key is set (no quotes needed, no trailing spaces)
- Restart backend server after changing `.env`

### Wrong provider being used
- Check if `AI_PROVIDER` is set in `.env` — remove it to use auto-detection
- If you have multiple keys set, the first available provider wins
- Set `AI_PROVIDER=openai` (or your preferred provider) to force a specific one

### AI features not working
- Check backend logs for "Routing AI request to provider:" to see which provider is active
- Verify your API key is valid (try it with curl or the provider's web console)
- Ensure the Python package is installed: `pip install openai anthropic google-genai`
