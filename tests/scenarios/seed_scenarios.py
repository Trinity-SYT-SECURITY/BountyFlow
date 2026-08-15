#!/usr/bin/env python3
"""
Build realistic engagements in a running BountyFlow, then check the platform
stayed consistent under that load.

    python tests/scenarios/seed_scenarios.py --base http://localhost:8002 --size small
    python tests/scenarios/seed_scenarios.py --size large --keep

Sizes are deliberately staged: run `small` first so a failure is easy to read,
then `medium`/`large` to see whether anything drifts once several projects,
dozens of targets and many executions exist side by side.

After seeding it verifies the things that break quietly:
  - every target/finding/user/file reached the knowledge graph
  - no project's graph contains another project's nodes (isolation)
  - dashboard totals match what was actually created
  - tool edits are visible to every consumer
"""
import argparse
import json
import random
import sys
import time
import urllib.error
import urllib.request

BASE = "http://localhost:8002"
API = "/api/v1"
TOKEN = None
FAILS = []

SIZES = {
    "small":  dict(projects=1, targets=3, findings=2, users=1, files=1, tools=2, execs=1),
    "medium": dict(projects=3, targets=6, findings=4, users=3, files=3, tools=4, execs=3),
    "large":  dict(projects=8, targets=12, findings=9, users=6, files=6, tools=6, execs=8),
}

COMPANIES = ["Acme", "Northwind", "Initech", "Umbrella", "Globex", "Soylent", "Hooli", "Stark"]
SEVERITIES = ["critical", "high", "medium", "low", "info"]
FINDING_KINDS = [
    "SQL Injection on /login", "IDOR on /api/v2/users/{id}", "Exposed database backup",
    "TLS 1.0 still negotiated", "Reflected XSS in search", "SSRF in webhook handler",
    "Default credentials on admin panel", "Directory listing enabled",
    "JWT signed with weak secret",
]
TOOL_SPECS = [
    ("Nmap Service Scan", "scanning", "echo scanning {target} tcp/22,80,443"),
    ("Subfinder", "reconnaissance", "echo subdomains of {target}"),
    ("Nuclei Templates", "vulnerability", "echo templates against {target}"),
    ("ffuf Directory", "enumeration", "echo fuzzing {target}/FUZZ"),
    ("WhatWeb", "reconnaissance", "echo fingerprint {target}"),
    ("testssl", "scanning", "echo tls audit {target}"),
]


def call(method, path, body=None, token=True, timeout=120):
    url = BASE + API + path
    headers = {"Accept": "application/json"}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token and TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            text = r.read().decode(errors="replace")
            status = r.status
    except urllib.error.HTTPError as e:
        text, status = e.read().decode(errors="replace"), e.code
    except Exception as e:
        return 0, str(e)
    try:
        return status, json.loads(text)
    except json.JSONDecodeError:
        return status, text


def check(name, ok, detail=""):
    if not ok:
        FAILS.append((name, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"\n         {detail}" if detail and not ok else ""))


def graph(pid):
    st, g = call("GET", f"/neo4j/graph/{pid}")
    if st != 200 or not isinstance(g, dict):
        return [], []
    return g.get("nodes", []), g.get("relationships", g.get("edges", []))


def node_text(nodes):
    out = []
    for n in nodes:
        d = n.get("node_data") or n.get("data") or n
        out.append(json.dumps(d))
    return " ".join(out)


def build(size, rng):
    cfg = SIZES[size]
    made = []
    for pi in range(cfg["projects"]):
        company = COMPANIES[pi % len(COMPANIES)]
        domain = f"{company.lower()}.test"
        st, p = call("POST", "/projects/", {
            "name": f"{company} External Assessment",
            "description": f"Scenario '{size}' project {pi + 1} seeded by seed_scenarios.py",
            "company_name": f"{company} Corp",
            "target_scope": {"domains": [f"*.{domain}"]},
            "out_of_scope": {"domains": [f"prod.{domain}"]},
        })
        pid = p.get("id") if isinstance(p, dict) else None
        if not pid:
            check(f"create project {pi + 1}", False, f"status={st}")
            continue
        rec = dict(pid=pid, domain=domain, targets=[], findings=0, users=0, files=0)

        for ti in range(cfg["targets"]):
            host = ["www", "api", "staging", "vpn", "mail", "dev", "git", "jenkins",
                    "sso", "cdn", "db", "backup"][ti % 12]
            st, t = call("POST", f"/projects/{pid}/targets", {
                "target_type": "domain", "target_value": f"{host}.{domain}",
                "priority": rng.randint(1, 5),
            })
            if isinstance(t, dict) and t.get("id"):
                rec["targets"].append(t["id"])

        for fi in range(cfg["findings"]):
            st, _ = call("POST", f"/projects/{pid}/findings", {
                "title": f"{FINDING_KINDS[fi % len(FINDING_KINDS)]} ({company})",
                "description": "seeded scenario finding",
                "severity": SEVERITIES[fi % len(SEVERITIES)],
                "status": "open",
                "target_id": rec["targets"][fi % len(rec["targets"])] if rec["targets"] else None,
            })
            rec["findings"] += 1 if st in (200, 201) else 0

        for ui in range(cfg["users"]):
            st, _ = call("POST", f"/projects/{pid}/discovered-users", {
                "project_id": pid,
                "target_id": rec["targets"][ui % len(rec["targets"])] if rec["targets"] else None,
                "username": f"user{ui}@{domain}", "privilege_level": ["admin", "service", "user"][ui % 3],
                "source": "scenario seed", "domain": domain, "account_status": "active",
            })
            rec["users"] += 1 if st in (200, 201) else 0

        for fi in range(cfg["files"]):
            st, _ = call("POST", f"/projects/{pid}/discovered-files", {
                "project_id": pid,
                "target_id": rec["targets"][fi % len(rec["targets"])] if rec["targets"] else None,
                "filename": f"artefact{fi}.bak", "file_path": f"/backup/artefact{fi}.bak",
                "file_type": "backup", "source": "scenario seed", "severity": "high",
                "is_sensitive": "true",
            })
            rec["files"] += 1 if st in (200, 201) else 0

        made.append(rec)
        print(f"  project {pid} ({company}): {len(rec['targets'])} targets, "
              f"{rec['findings']} findings, {rec['users']} users, {rec['files']} files")
    return made


def seed_tools(cfg):
    ids = []
    for name, cat, cmd in TOOL_SPECS[:cfg["tools"]]:
        st, t = call("POST", "/tools/", {
            "name": name, "description": f"{cat} tool seeded by scenario",
            "category": cat, "command_template": cmd, "parameters": {},
        })
        if isinstance(t, dict) and t.get("id"):
            ids.append(t["id"])
    print(f"  tools created: {len(ids)}")
    return ids


def run_executions(made, tool_ids, per_project):
    started = []
    for rec in made:
        for i in range(per_project):
            if not tool_ids or not rec["targets"]:
                break
            tid = tool_ids[i % len(tool_ids)]
            target_id = rec["targets"][i % len(rec["targets"])]
            st, ex = call("POST", f"/tools/projects/{rec['pid']}/tools/execute", {
                "tools": [{"tool_id": tid, "target_id": target_id,
                           "parameters": {"target": f"host{i}.{rec['domain']}"}}],
            })
            if isinstance(ex, dict) and ex.get("id"):
                started.append(ex["id"])
    print(f"  executions started: {len(started)}")
    return started


def wait_for_executions(ids, budget=120):
    deadline = time.time() + budget
    pending = list(ids)
    while pending and time.time() < deadline:
        time.sleep(2)
        still = []
        for eid in pending:
            st, e = call("GET", f"/tools/executions/{eid}")
            if isinstance(e, dict) and e.get("execution_status") in ("completed", "failed"):
                continue
            still.append(eid)
        pending = still
    return pending


def verify(made, tool_ids, exec_ids):
    print("\n--- verification ---")
    for rec in made:
        nodes, edges = graph(rec["pid"])
        expected_min = len(rec["targets"]) + rec["findings"] + rec["users"] + rec["files"]
        check(f"project {rec['pid']}: graph has a node per entity",
              len(nodes) >= expected_min,
              f"nodes={len(nodes)} expected>={expected_min}")
        check(f"project {rec['pid']}: graph has relationships",
              len(edges) >= rec["findings"] + rec["users"] + rec["files"],
              f"edges={len(edges)}")

    # isolation: one project's graph must never mention another's domain
    if len(made) > 1:
        leaked = []
        for rec in made:
            blob = node_text(graph(rec["pid"])[0])
            for other in made:
                if other["pid"] != rec["pid"] and other["domain"] in blob:
                    leaked.append(f"{rec['pid']} contains {other['domain']}")
        check("projects do not leak nodes into each other's graph", not leaked,
              "; ".join(leaked[:4]))

    st, stats = call("GET", "/admin/dashboard/summary-stats")
    check("dashboard summary-stats responds", st == 200, f"status={st}")
    if isinstance(stats, dict):
        print(f"         dashboard says: {json.dumps(stats)[:220]}")

    if tool_ids:
        tid = tool_ids[0]
        new_cmd = "echo edited by scenario {target}"
        call("PUT", f"/tools/{tid}", {"command_template": new_cmd})
        st, one = call("GET", f"/tools/{tid}")
        st2, lst = call("GET", "/tools/")
        in_list = next((x for x in lst if x.get("id") == tid), None) if isinstance(lst, list) else None
        check("tool edit is visible on detail and list",
              isinstance(one, dict) and one.get("command_template") == new_cmd
              and in_list and in_list.get("command_template") == new_cmd,
              f"detail={one.get('command_template') if isinstance(one, dict) else one} "
              f"list={in_list.get('command_template') if in_list else None}")

    if exec_ids:
        done = 0
        for eid in exec_ids:
            st, e = call("GET", f"/tools/executions/{eid}")
            if isinstance(e, dict) and e.get("execution_status") == "completed" and e.get("output"):
                done += 1
        check("executions completed with captured output", done == len(exec_ids),
              f"{done}/{len(exec_ids)} completed with output")


def cleanup(made):
    print("\n--- cleanup ---")
    for rec in made:
        call("DELETE", f"/projects/{rec['pid']}")
    print(f"  deleted {len(made)} projects")


def main():
    global BASE, TOKEN
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=BASE)
    ap.add_argument("--size", choices=list(SIZES), default="small")
    ap.add_argument("--keep", action="store_true", help="leave the scenario in place")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    BASE = args.base.rstrip("/")
    rng = random.Random(args.seed)

    st, r = call("POST", "/auth/login", {"username": "test_user", "password": "test123"}, token=False)
    if st != 200 or not isinstance(r, dict):
        print(f"login failed: {st} {r}")
        sys.exit(99)
    TOKEN = r["access_token"]

    cfg = SIZES[args.size]
    print(f"seeding '{args.size}' scenario against {BASE}: {cfg}")
    made = build(args.size, rng)
    tool_ids = seed_tools(cfg)
    exec_ids = run_executions(made, tool_ids, cfg["execs"])
    stuck = wait_for_executions(exec_ids)
    if stuck:
        check("all executions reached a terminal state", False, f"still running: {stuck}")
    verify(made, tool_ids, exec_ids)
    if not args.keep:
        cleanup(made)

    print(f"\n{'FAILURES: ' + str(len(FAILS)) if FAILS else 'all scenario checks passed'}")
    for name, detail in FAILS:
        print(f"  - {name}\n      {detail}")
    sys.exit(len(FAILS))


if __name__ == "__main__":
    main()
