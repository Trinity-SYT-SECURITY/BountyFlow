#!/usr/bin/env python3
"""
Check the MCP server against a running BountyFlow.

    BOUNTYFLOW_URL=http://localhost:8002 BOUNTYFLOW_API_KEY=bf_... \
    python mcp/check_mcp.py [--write]

Lists the tools, then calls every read-only one and reports what came back. A
revoked key, an unreachable backend or a tool whose path has drifted shows up
here rather than in the middle of an assessment.

`--write` additionally exercises the writing tools against a throwaway project
it creates and deletes through the REST API, and checks that what was written
reached the knowledge graph.

Exit code is the number of failures.
"""
import argparse
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bountyflow_mcp as bf  # noqa: E402

RESULTS = []


def check(name, ok, detail=""):
    RESULTS.append((name, bool(ok), detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}"
          + (f"\n         {detail}" if detail and not ok else ""))


def parsed(raw):
    """Tools return JSON as text; the checks want the object back."""
    try:
        return json.loads(raw)
    except Exception:
        return raw


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true",
                    help="also exercise the writing tools")
    args = ap.parse_args()

    print(f"BountyFlow MCP check against {bf.BASE}")
    if not bf.api_key():
        print("BOUNTYFLOW_API_KEY is not set")
        sys.exit(99)

    print("\n=== Tool list ===")
    tools = await bf.mcp.list_tools()
    names = sorted(t.name for t in tools)
    print(f"  {len(names)} tools: {', '.join(names)}")
    check("every tool has a description", all(t.description for t in tools))
    check("every tool has an input schema", all(t.input_schema for t in tools))
    check("nothing here runs a tool or deletes a record",
          not any(word in name for name in names
                  for word in ("execute_tool", "run_tool", "delete")),
          "a tool that runs commands or deletes records is exposed")

    print("\n=== Reading ===")
    projects = parsed(await bf.list_projects())
    check("list_projects answers", isinstance(projects, list),
          f"got {type(projects).__name__}: {str(projects)[:160]}")
    if not isinstance(projects, list) or not projects:
        print("  no projects visible to this key; nothing further to read")
        return finish()

    pid = projects[0]["id"]
    print(f"  using project {pid} ({projects[0].get('name')})")

    reads = [
        ("get_project", bf.get_project(pid)),
        ("get_project_team", bf.get_project_team(pid)),
        ("my_assignments", bf.my_assignments()),
        ("list_targets", bf.list_targets(pid)),
        ("list_findings", bf.list_findings(pid)),
        ("list_discovered_users", bf.list_discovered_users(pid)),
        ("list_discovered_files", bf.list_discovered_files(pid)),
        ("list_executions", bf.list_executions(pid)),
        ("get_knowledge_graph", bf.get_knowledge_graph(pid)),
        ("get_activity", bf.get_activity(pid)),
        ("list_reports", bf.list_reports(pid)),
        ("search", bf.search(q="", limit=5)),
    ]
    for name, coro in reads:
        try:
            result = parsed(await coro)
            check(name, result is not None, "returned nothing")
        except Exception as e:
            check(name, False, f"{type(e).__name__}: {e}")

    try:
        scope = parsed(await bf.check_scope(pid, "example.invalid"))
        check("check_scope answers",
              isinstance(scope, dict) and "is_valid" in scope,
              json.dumps(scope)[:200])
    except Exception as e:
        check("check_scope answers", False, str(e))

    targets = parsed(await bf.list_targets(pid))
    if isinstance(targets, list) and targets:
        needle = targets[0]["target_value"]
        hits = parsed(await bf.search(q=needle, types="target"))
        found = any(t["target_value"] == needle
                    for t in hits.get("results", {}).get("target", []))
        check("search finds a target by its value", found,
              f"searched for {needle!r} and it was not in the results")

    team = parsed(await bf.get_project_team(pid))
    check("the team view names who is on the project",
          isinstance(team, dict) and team.get("members"),
          f"got {str(team)[:200]}")

    if args.write:
        print("\n=== Writing (throwaway project) ===")
        project = await bf.call("POST", "/projects/", body={
            "name": "MCP check", "description": "created by check_mcp.py",
            "target_scope": {"in_scope": ["*.mcp-check.test"]},
            "out_of_scope": {}})
        wid = project["id"]
        try:
            target = parsed(await bf.create_target(
                wid, "host.mcp-check.test", "domain", 4, "by MCP"))
            check("create_target", bool(target.get("id")), json.dumps(target)[:200])

            listed = parsed(await bf.list_targets(wid))
            check("the created target is listed",
                  any(t["target_value"] == "host.mcp-check.test" for t in listed))

            in_scope = parsed(await bf.check_scope(wid, "host.mcp-check.test"))
            check("check_scope agrees it is in scope",
                  in_scope.get("is_valid") is True, json.dumps(in_scope)[:200])

            finding = parsed(await bf.create_finding(
                wid, "MCP check finding", "low",
                "recorded by check_mcp.py", target.get("id")))
            check("create_finding", bool(finding), json.dumps(finding)[:200])

            notes = parsed(await bf.update_target_notes(
                wid, target["id"], "port 443 open", "completed"))
            check("update_target_notes", bool(notes), json.dumps(notes)[:200])

            claimed = parsed(await bf.claim_target(wid, target["id"]))
            check("claim_target (unclaim) answers",
                  isinstance(claimed, dict), json.dumps(claimed)[:200])

            await asyncio.sleep(1.5)
            graph = parsed(await bf.get_knowledge_graph(wid))
            check("what was written reached the knowledge graph",
                  "host.mcp-check.test" in json.dumps(graph),
                  "the target is not in the graph the tool reads back")
        finally:
            await bf.call("DELETE", f"/projects/{wid}")
            print(f"  removed project {wid}")

    finish()


def finish():
    failed = [r for r in RESULTS if not r[1]]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} checks passed")
    if failed:
        print("\nfailed:")
        for name, _, detail in failed:
            print(f"  - {name}" + (f"\n      {detail}" if detail else ""))
    sys.exit(len(failed))


if __name__ == "__main__":
    asyncio.run(main())
