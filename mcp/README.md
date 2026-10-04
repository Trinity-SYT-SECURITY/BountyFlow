# BountyFlow MCP server

Gives a model read access to an engagement, and enough write access to record
what it finds — targets, findings, notes, claims. It cannot run tools and it
cannot delete anything.

## Install

```bash
pip install -r mcp/requirements.txt
```

## Get a key

Sign in to BountyFlow, open **Settings → API keys**, and create one. The key is
shown once. From the API instead:

```bash
curl -X POST -H "Authorization: Bearer $SESSION_TOKEN" \
  -H 'Content-Type: application/json' -d '{"name":"mcp on my laptop"}' \
  http://localhost:8002/api/v1/auth/api-keys
```

The key belongs to you. Everything the server does is done as you: the projects
you can see are the projects it can see, and every write lands in the audit log
under your name. Revoking the key in the same screen stops it immediately.

## Connect it

Claude Code:

```bash
claude mcp add bountyflow \
  --env BOUNTYFLOW_URL=http://localhost:8002 \
  --env BOUNTYFLOW_API_KEY=bf_your_key \
  -- python /path/to/BountyFlow-main/mcp/bountyflow_mcp.py
```

Anything else that speaks MCP over stdio:

```json
{
  "mcpServers": {
    "bountyflow": {
      "command": "python",
      "args": ["/path/to/BountyFlow-main/mcp/bountyflow_mcp.py"],
      "env": {
        "BOUNTYFLOW_URL": "http://localhost:8002",
        "BOUNTYFLOW_API_KEY": "bf_your_key"
      }
    }
  }
}
```

## What it exposes

**Finding things**

| Tool | For |
|------|-----|
| `search` | "Which project was that host in?" Free text over targets, findings, credentials, files, tool output and reports, with filters for type, project, severity, status, assignee and date range |
| `list_projects`, `get_project` | The engagements you can see |
| `list_targets`, `list_findings` | What is recorded against one |
| `list_discovered_users`, `list_discovered_files` | Credentials and loot |
| `list_executions`, `get_execution` | What has been run, and its output |
| `get_knowledge_graph` | Nodes and relationships — how one thing leads to another |
| `get_activity` | The timeline of what has already been tried |
| `list_reports`, `get_report` | Written up so far |
| `check_scope` | Whether a host is in scope, before suggesting anyone touch it |

**Coordinating**

| Tool | For |
|------|-----|
| `get_project_team` | Who is on the project, what each has done, what nobody has claimed |
| `my_assignments` | Your projects and the targets waiting on you |
| `claim_target` | Take a target, or hand it back |

**Recording**

| Tool | For |
|------|-----|
| `create_target` | Write down a host that turned up in output |
| `create_finding` | Record a vulnerability |
| `update_target_notes` | Append what was learned |

## What it will not do

No tool execution and no deletion. BountyFlow runs shell commands on the host
it is installed on; exposing that through MCP would make this server a remote
code execution path into your testing box. Run tools from the UI, where a
person chooses.

Everything else is bounded by your own account. A viewer's key can read a
project and not write to it, exactly as in the browser.

## Checking it works

```bash
python mcp/check_mcp.py
```

Lists the tools and calls the read-only ones against the configured instance,
so a broken key or an unreachable backend shows up here rather than mid-task.
