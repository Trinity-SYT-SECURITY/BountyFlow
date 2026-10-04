#!/usr/bin/env python3
"""
BountyFlow MCP server.

Puts an engagement in front of a model: what is in scope, what has been
scanned, what was found, who is working on what, and what the knowledge graph
says connects to what — without anyone pasting it in.

    BOUNTYFLOW_URL=http://localhost:8002 \
    BOUNTYFLOW_API_KEY=bf_... \
    python mcp/bountyflow_mcp.py

The key is minted per person in the UI (Settings -> API keys) or with
`POST /api/v1/auth/api-keys`. Everything this server does is done *as that
person*: project roles apply unchanged, and every write lands in the audit log
under their name. Revoking the key revokes this server.

What it deliberately cannot do
------------------------------
Run tools, or delete anything. BountyFlow executes shell commands on the host
it runs on; a model that can call that is a remote code execution path, and no
amount of prompting makes that safe. Reading is unrestricted, and writes are
limited to recording work — targets, findings, notes, claims — which is what a
model helping with an assessment actually needs.
"""
import json
import os
import sys
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import httpx
from mcp.server.mcpserver import MCPServer

BASE = os.environ.get("BOUNTYFLOW_URL", "http://localhost:8002").rstrip("/")
API = f"{BASE}/api/v1"
TIMEOUT = float(os.environ.get("BOUNTYFLOW_TIMEOUT", "60"))

mcp = MCPServer(
    name="bountyflow",
    version="1.0.0",
    instructions=(
        "BountyFlow holds penetration testing engagements: projects, their "
        "authorised scope, targets, findings, discovered credentials and files, "
        "tool runs and their output, and a knowledge graph linking all of it.\n\n"
        "Start with `search` when you are looking for something and do not know "
        "which project it is in. Use `get_project_team` before suggesting work, "
        "so you do not send someone at a host a colleague has already claimed. "
        "Use `check_scope` before proposing anyone touch a host.\n\n"
        "This server cannot run tools or delete anything. It can record what you "
        "find: targets, findings, notes and claims."
    ),
)


def api_key() -> str:
    return os.environ.get("BOUNTYFLOW_API_KEY", "")


class BountyFlowError(RuntimeError):
    """Something the caller should read, rather than a stack trace."""


async def call(method: str, path: str, params: Optional[Dict[str, Any]] = None,
               body: Optional[Dict[str, Any]] = None) -> Any:
    """One request to the platform, as the person who owns the API key."""
    key = api_key()
    if not key:
        raise BountyFlowError(
            "BOUNTYFLOW_API_KEY is not set. Create a key in the BountyFlow UI "
            "under Settings -> API keys, or with POST /api/v1/auth/api-keys.")

    url = f"{API}{path}"
    if params:
        clean = {k: v for k, v in params.items() if v is not None and v != ""}
        if clean:
            url = f"{url}?{urlencode(clean)}"

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.request(
                method, url,
                headers={"Authorization": f"Bearer {key}",
                         "Content-Type": "application/json"},
                json=body)
    except httpx.ConnectError:
        raise BountyFlowError(
            f"Could not reach BountyFlow at {BASE}. Is the backend running?")

    if response.status_code == 401:
        raise BountyFlowError("The API key was rejected. It may have been revoked.")
    if response.status_code == 403:
        raise BountyFlowError(
            "Refused: this account does not have access to that project, or has "
            "view-only access to it.")
    if response.status_code == 404:
        raise BountyFlowError("Not found.")
    if response.status_code >= 400:
        detail = response.text[:400]
        try:
            detail = response.json().get("detail", detail)
        except Exception:
            pass
        raise BountyFlowError(f"{response.status_code}: {detail}")

    if not response.content:
        return {"ok": True}
    try:
        return response.json()
    except Exception:
        return {"text": response.text}


# ------------------------------------------------------------------ finding
@mcp.tool()
async def search(
    q: str = "",
    types: str = "",
    project_id: Optional[int] = None,
    severity: str = "",
    status: str = "",
    target_type: str = "",
    assigned_to: Optional[int] = None,
    sensitive_only: bool = False,
    since: str = "",
    until: str = "",
    limit: int = 50,
) -> str:
    """Search every project this account can see.

    Use this to find which engagement a host, credential, file or finding
    belongs to, or to pull everything matching a term. Free text is matched
    against project and target names, finding titles and descriptions,
    discovered usernames and file paths, tool commands and their output, and
    report bodies.

    Args:
        q: Free text — a hostname, a CVE, a username, a port, a fragment of output.
        types: Comma-separated subset of project,target,finding,discovered_user,
            discovered_file,tool,execution,report,attack_flow. Empty searches all.
        project_id: Restrict to one project.
        severity: Finding severity filter, e.g. critical or high.
        status: Target, finding, execution or report status.
        target_type: domain, ip, url, network.
        assigned_to: User id a target is claimed by.
        sensitive_only: Only files marked sensitive.
        since: ISO date; records created on or after.
        until: ISO date; records created on or before.
        limit: Maximum results per entity type.
    """
    return _json(await call("GET", "/search", params={
        "q": q, "types": types, "project_id": project_id, "severity": severity,
        "status": status, "target_type": target_type, "assigned_to": assigned_to,
        "sensitive_only": sensitive_only or None, "since": since, "until": until,
        "limit": limit}))


@mcp.tool()
async def list_projects() -> str:
    """Every project this account can see, with its counts."""
    return _json(await call("GET", "/projects/"))


@mcp.tool()
async def get_project(project_id: int) -> str:
    """One project: its scope, status and what is recorded against it."""
    return _json(await call("GET", f"/projects/{project_id}"))


@mcp.tool()
async def get_project_team(project_id: int) -> str:
    """Who is on a project, their roles, and what each of them has done.

    Includes tool runs, findings recorded and targets claimed per person, plus
    how many targets nobody has taken. Read this before proposing work, so two
    people do not scan the same host.
    """
    return _json(await call("GET", f"/projects/{project_id}/team"))


@mcp.tool()
async def my_assignments() -> str:
    """Every project this account is on, and the targets claimed for it."""
    return _json(await call("GET", "/my/assignments"))


@mcp.tool()
async def list_targets(project_id: int) -> str:
    """Targets in a project, with status, priority and who has claimed each."""
    return _json(await call("GET", f"/projects/{project_id}/targets"))


@mcp.tool()
async def list_findings(project_id: int) -> str:
    """Findings recorded against a project."""
    return _json(await call("GET", f"/projects/{project_id}/findings"))


@mcp.tool()
async def list_discovered_users(project_id: int) -> str:
    """Credentials and accounts found during the engagement."""
    return _json(await call("GET", f"/projects/{project_id}/discovered-users"))


@mcp.tool()
async def list_discovered_files(project_id: int, sensitive_only: bool = False) -> str:
    """Files found during the engagement.

    Args:
        project_id: The project to read.
        sensitive_only: Only files flagged as containing sensitive material.
    """
    params = {"is_sensitive": "true"} if sensitive_only else None
    return _json(await call("GET", f"/projects/{project_id}/discovered-files",
                            params=params))


@mcp.tool()
async def list_executions(project_id: int) -> str:
    """Tool runs in a project: what was run, by whom, and how it ended."""
    return _json(await call("GET", f"/tools/projects/{project_id}/tools/executions"))


@mcp.tool()
async def get_execution(execution_id: int) -> str:
    """One tool run in full, including its output."""
    return _json(await call("GET", f"/tools/executions/{execution_id}"))


@mcp.tool()
async def get_knowledge_graph(project_id: int) -> str:
    """The project's knowledge graph.

    Every target, finding, credential and file as nodes, and the relationships
    between them. This is what to read when the question is how one thing leads
    to another.
    """
    return _json(await call("GET", f"/neo4j/graph/{project_id}"))


@mcp.tool()
async def get_activity(project_id: int) -> str:
    """The project's activity timeline — the record of what has been tried."""
    return _json(await call("GET", f"/activity-logs/projects/{project_id}/activities"))


@mcp.tool()
async def list_reports(project_id: int) -> str:
    """Reports generated for a project."""
    return _json(await call("GET", f"/reports/project/{project_id}"))


@mcp.tool()
async def get_report(report_id: int) -> str:
    """One report, with its Markdown body."""
    return _json(await call("GET", f"/reports/{report_id}"))


@mcp.tool()
async def check_scope(project_id: int, target: str) -> str:
    """Whether a host is inside a project's authorised scope.

    Ask this before suggesting anyone touch something.

    Args:
        project_id: The project whose scope applies.
        target: Hostname, IP or URL.
    """
    return _json(await call("POST", f"/scope/projects/{project_id}/scope/validate",
                            body={"target": target}))


# ------------------------------------------------------------- safe writes
@mcp.tool()
async def create_target(project_id: int, target_value: str, target_type: str,
                        priority: int = 5, notes: str = "") -> str:
    """Record a target in a project.

    Use it to write down a host that turned up in output but was never added.
    Needs editor access to the project.

    Args:
        project_id: The project to add it to.
        target_value: Hostname, IP or URL.
        target_type: domain, ip, url or network.
        priority: 1 to 10.
        notes: Anything worth recording about it.
    """
    return _json(await call("POST", f"/projects/{project_id}/targets", body={
        "target_value": target_value, "target_type": target_type,
        "priority": priority, "notes": notes or None}))


@mcp.tool()
async def create_finding(project_id: int, title: str, severity: str,
                         description: str = "",
                         target_id: Optional[int] = None) -> str:
    """Record a finding against a project. Needs editor access.

    Args:
        project_id: The project this belongs to.
        title: Short name for the issue.
        severity: critical, high, medium, low or info.
        description: What it is and how it was confirmed.
        target_id: The target it affects, if it is tied to one.
    """
    return _json(await call("POST", f"/projects/{project_id}/findings", body={
        "title": title, "description": description, "severity": severity,
        "target_id": target_id, "status": "open"}))


@mcp.tool()
async def claim_target(project_id: int, target_id: int,
                       assigned_to: Optional[int] = None) -> str:
    """Claim a target for someone, or hand it back by omitting the assignee.

    This is how the team avoids two people working the same host.

    Args:
        project_id: The project the target is in.
        target_id: The target to claim.
        assigned_to: User id to claim it for; omit to unclaim.
    """
    return _json(await call("PUT",
                            f"/projects/{project_id}/targets/{target_id}/assignee",
                            body={"assigned_to": assigned_to}))


@mcp.tool()
async def update_target_notes(project_id: int, target_id: int, notes: str,
                              status: str = "") -> str:
    """Record what was learned about a target.

    Args:
        project_id: The project the target is in.
        target_id: The target to update.
        notes: What to write down.
        status: pending, scanning or completed. Left alone if empty.
    """
    body: Dict[str, Any] = {"notes": notes}
    if status:
        body["status"] = status
    return _json(await call("PUT", f"/projects/{project_id}/targets/{target_id}",
                            body=body))


def _json(value: Any) -> str:
    return json.dumps(value, indent=2, default=str)


if __name__ == "__main__":
    if not api_key():
        print("BOUNTYFLOW_API_KEY is not set; every call will fail.", file=sys.stderr)
    mcp.run("stdio")
