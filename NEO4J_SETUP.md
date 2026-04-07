# Neo4j Setup Guide for BountyFlow (Core Component)

## Quick Fix for Authentication Error

If you see this error:
```
Neo4j connection failed: {code: Neo.ClientError.Security.Unauthorized} 
{message: The client is unauthorized due to authentication failure.}
```

Follow these steps:

## Step 1: Check Neo4j is Running

```bash
# Windows
docker ps

# You should see neo4j container running
# If not, start it:
docker-compose up -d neo4j
```

## Step 2: Set Neo4j Password (First Time Only)

When you first start Neo4j, you need to set the password:

### Option A: Using Docker (Recommended)

```bash
# Stop any running Neo4j container
docker stop bountyflow-neo4j
docker rm bountyflow-neo4j

# Start Neo4j with initial password (binding to localhost to prevent public exposure)
docker run -d \
  --name bountyflow-neo4j \
  -p 127.0.0.1:7474:7474 -p 127.0.0.1:7687:7687 \
  -e NEO4J_AUTH=neo4j/your_password_here \
  -v neo4j_data:/data \
  neo4j:latest
```

**Windows PowerShell:**
```powershell
docker stop bountyflow-neo4j
docker rm bountyflow-neo4j
docker run -d --name bountyflow-neo4j -p 127.0.0.1:7474:7474 -p 127.0.0.1:7687:7687 -e NEO4J_AUTH=neo4j/bountyflow123 -v neo4j_data:/data neo4j:latest
```

### Option B: Using Neo4j Browser

1. Open Neo4j Browser: http://localhost:7474
2. First login:
   - **Username**: `neo4j`
   - **Password**: `neo4j` (default)
3. You'll be prompted to change password
4. Set new password (e.g., `bountyflow123`)

## Step 3: Update BountyFlow Configuration

Edit `apps/backend/.env` file:

```bash
# Neo4j Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=bountyflow123  # Use the password you set
NEO4J_DATABASE=neo4j
```

## Step 4: Restart BountyFlow Backend

```bash
cd apps/backend
python start.py
```

You should now see:
```
✅ Successfully connected to Neo4j at bolt://localhost:7687
```

## Common Issues

### Issue 1: "Connection refused"

**Cause**: Neo4j is not running

**Solution**:
```bash
# Check if Neo4j container is running
docker ps | findstr neo4j

# If not running, start it
docker start bountyflow-neo4j
# or
start-services.bat
```

### Issue 2: "Authentication failure"

**Cause**: Password mismatch between Neo4j and .env file

**Solution**:
1. Check Neo4j password by logging into http://localhost:7474
2. Update `NEO4J_PASSWORD` in `apps/backend/.env` to match
3. Restart backend

### Issue 3: "Database 'neo4j' does not exist"

**Cause**: Using wrong database name

**Solution**:
```bash
# In .env file, use default database
NEO4J_DATABASE=neo4j
```

## Verify Connection

### Method 1: Check Backend Logs

When backend starts, you should see:
```
✅ Successfully connected to Neo4j at bolt://localhost:7687
```

Not:
```
❌ Failed to connect to Neo4j: ... Will use SQLite fallback.
```

### Method 2: Test with cypher-shell

```bash
# Connect to Neo4j container
docker exec -it bountyflow-neo4j cypher-shell -u neo4j -p bountyflow123

# Run a test query
neo4j> RETURN "Connection works!" AS message;

# You should see the result
# Exit with :exit
```

### Method 3: Check Neo4j Browser

1. Open http://localhost:7474
2. Login with your credentials
3. Run: `MATCH (n) RETURN count(n) AS nodeCount;`
4. Should return successfully (even if count is 0)

## Recommended Setup

For development, use these settings:

**docker-compose.yml** (if you're using docker-compose):
```yaml
services:
  neo4j:
    image: neo4j:latest
    container_name: bountyflow-neo4j
    ports:
      - "127.0.0.1:7474:7474"  # HTTP (Localhost only)
      - "127.0.0.1:7687:7687"  # Bolt (Localhost only)
    environment:
      - NEO4J_AUTH=neo4j/bountyflow123
      - NEO4J_PLUGINS=["apoc"]
    volumes:
      - neo4j_data:/data
    restart: unless-stopped

volumes:
  neo4j_data:
```

**apps/backend/.env**:
```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=bountyflow123
NEO4J_DATABASE=neo4j
```

## Knowledge Graph Fallback (Manual Mode)

While Neo4j is **essential** for the full visualization and automated relationship discovery, BountyFlow can operate in a limited fallback mode if Neo4j is not available:

1. Don't set Neo4j environment variables in `.env`
2. Or comment them out:
   ```bash
   # NEO4J_URI=bolt://localhost:7687
   # NEO4J_USERNAME=neo4j
   # NEO4J_PASSWORD=bountyflow123
   ```
3. BountyFlow will use SQLite for all graph operations.
4. You'll see: `Neo4j not configured, using SQLite fallback` in the logs.

> [!CAUTION]
> Fallback mode is significantly slower and does not support many of the advanced graph analytics features.

## Security Note

**For Production:**
- Change default password `bountyflow123` to a strong password
- Don't expose Neo4j ports to the internet
- Use environment-specific .env files
- Never commit `.env` files to Git

---

For more information, see [SETUP_KNOWLEDGE_GRAPH.md](SETUP_KNOWLEDGE_GRAPH.md)

