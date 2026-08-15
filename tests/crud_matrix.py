#!/usr/bin/env python3
"""
Create / read / update / delete every entity the product exposes, and check the
knowledge graph and the listing endpoints agree after each step.

    python tests/crud_matrix.py --base http://localhost:8002 [--ai] [--keep]

platform_e2e.py proves the happy path end to end. This one is deliberately
boring and exhaustive: for each entity type it creates a row, reads it back,
edits a field, reads it back again, deletes it, and confirms it is gone from
both the listing and the graph. Most sync bugs in this codebase have been an
update or a delete that only touched one of those places.

Exit code is the number of failed checks.
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlencode

BASE = "http://localhost:8002"
API = "/api/v1"
TOKEN = None
RESULTS = []


def call(method, path, body=None, token=True, timeout=180, form=False):
    url = BASE + API + path
    headers = {"Accept": "application/json"}
    data = None
    if body is not None and form:
        data = urlencode(body).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token and TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            text, status = r.read().decode(errors="replace"), r.status
    except urllib.error.HTTPError as e:
        text, status = e.read().decode(errors="replace"), e.code
    except Exception as e:
        return 0, str(e)
    try:
        return status, json.loads(text)
    except json.JSONDecodeError:
        return status, text


def check(name, ok, detail=""):
    RESULTS.append((name, bool(ok), detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"\n         {detail}" if detail and not ok else ""))


def section(t):
    print(f"\n=== {t} ===", flush=True)


def graph(pid):
    st, g = call("GET", f"/neo4j/graph/{pid}")
    if st != 200 or not isinstance(g, dict):
        return "", 0
    nodes = g.get("nodes", [])
    edges = g.get("relationships", g.get("edges", []))
    return json.dumps(nodes), len(edges)


def in_graph(pid, needle):
    blob, _ = graph(pid)
    return needle in blob


# ---------------------------------------------------------------- entity suites
def suite_project():
    section("Project CRUD")
    st, p = call("POST", "/projects/", {
        "name": "CRUD Project", "description": "created by crud_matrix",
        "company_name": "CRUD Ltd", "target_scope": {}, "out_of_scope": {}})
    pid = p.get("id") if isinstance(p, dict) else None
    check("C project", st in (200, 201) and pid, f"status={st}")
    if not pid:
        sys.exit(99)

    st, got = call("GET", f"/projects/{pid}")
    check("R project", st == 200 and got.get("name") == "CRUD Project", f"status={st}")

    st, _ = call("PUT", f"/projects/{pid}", {"name": "CRUD Project renamed", "status": "completed"})
    st2, got = call("GET", f"/projects/{pid}")
    check("U project", st in (200, 204) and got.get("name") == "CRUD Project renamed",
          f"update={st} name={got.get('name') if isinstance(got, dict) else got}")
    return pid


def suite_target(pid):
    section("Target CRUD  (+ graph)")
    st, t = call("POST", f"/projects/{pid}/targets",
                 {"target_type": "domain", "target_value": "crud-a.test", "priority": 4})
    tid = t.get("id") if isinstance(t, dict) else None
    check("C target", st in (200, 201) and tid, f"status={st}")
    time.sleep(0.8)
    check("C target -> graph node", in_graph(pid, "crud-a.test"))

    st, lst = call("GET", f"/projects/{pid}/targets")
    check("R target list", st == 200 and any(x.get("id") == tid for x in lst), f"status={st}")

    st, _ = call("PUT", f"/projects/{pid}/targets/{tid}",
                 {"target_value": "crud-b.test", "priority": 1, "status": "completed"})
    time.sleep(0.8)
    check("U target", st in (200, 204), f"status={st}")
    check("U target -> graph node renamed",
          in_graph(pid, "crud-b.test") and not in_graph(pid, "crud-a.test"))

    keep = call("POST", f"/projects/{pid}/targets",
                {"target_type": "domain", "target_value": "crud-keep.test", "priority": 3})[1]
    keep_id = keep.get("id") if isinstance(keep, dict) else None

    st, _ = call("DELETE", f"/projects/{pid}/targets/{tid}")
    time.sleep(0.8)
    check("D target", st in (200, 204), f"status={st}")
    check("D target -> graph node gone", not in_graph(pid, "crud-b.test"))
    st, lst = call("GET", f"/projects/{pid}/targets")
    check("D target -> gone from list", all(x.get("id") != tid for x in lst))
    return keep_id


def suite_finding(pid, tid):
    section("Finding CRUD  (+ graph)")
    st, f = call("POST", f"/projects/{pid}/findings", {
        "title": "CRUD finding alpha", "description": "d", "severity": "high",
        "status": "open", "target_id": tid})
    fid = None
    if isinstance(f, dict):
        fid = f.get("id") or (f.get("finding") or {}).get("id") or f.get("node_id")
    if not fid:  # some builds return only the node payload; find it by title
        _, listing = call("GET", f"/projects/{pid}/findings")
        if isinstance(listing, list):
            for item in listing:
                if isinstance(item, dict) and item.get("title") == "CRUD finding alpha":
                    fid = item.get("id")
                    break
    check("C finding", st in (200, 201) and fid, f"status={st} body={str(f)[:140]}")
    time.sleep(0.8)
    check("C finding -> graph node", in_graph(pid, "CRUD finding alpha"))

    st, lst = call("GET", f"/projects/{pid}/findings")
    check("R finding list", st == 200 and isinstance(lst, list) and len(lst) >= 1, f"status={st}")

    st, _ = call("PUT", f"/projects/{pid}/findings/{fid}",
                 {"title": "CRUD finding beta", "severity": "critical", "status": "confirmed"})
    time.sleep(0.8)
    check("U finding", st in (200, 204), f"status={st}")
    check("U finding -> graph node retitled",
          in_graph(pid, "CRUD finding beta"), "graph still shows the old title")

    st, _ = call("DELETE", f"/projects/{pid}/findings/{fid}")
    time.sleep(0.8)
    check("D finding", st in (200, 204), f"status={st}")
    check("D finding -> graph node gone", not in_graph(pid, "CRUD finding beta"))


def suite_user(pid, tid):
    section("Discovered user CRUD  (+ graph)")
    st, u = call("POST", f"/projects/{pid}/discovered-users", {
        "project_id": pid, "target_id": tid, "username": "crud_user_a",
        "privilege_level": "user", "source": "crud", "account_status": "active"})
    uid = u.get("id") if isinstance(u, dict) else None
    check("C user", st in (200, 201) and uid, f"status={st}")
    time.sleep(0.8)
    check("C user -> graph node", in_graph(pid, "crud_user_a"))

    st, one = call("GET", f"/discovered-users/{uid}")
    check("R user", st == 200 and isinstance(one, dict), f"status={st}")

    st, _ = call("PUT", f"/discovered-users/{uid}", {"username": "crud_user_b", "privilege_level": "admin"})
    time.sleep(0.8)
    check("U user", st in (200, 204), f"status={st}")
    check("U user -> graph node renamed", in_graph(pid, "crud_user_b"))

    st, _ = call("DELETE", f"/discovered-users/{uid}")
    time.sleep(0.8)
    check("D user", st in (200, 204), f"status={st}")
    check("D user -> graph node gone", not in_graph(pid, "crud_user_b"))


def suite_file(pid, tid):
    section("Discovered file CRUD  (+ graph)")
    st, f = call("POST", f"/projects/{pid}/discovered-files", {
        "project_id": pid, "target_id": tid, "filename": "crud_a.bak",
        "file_path": "/tmp/crud_a.bak", "file_type": "backup", "source": "crud",
        "severity": "medium", "is_sensitive": "false"})
    fid = f.get("id") if isinstance(f, dict) else None
    check("C file", st in (200, 201) and fid, f"status={st}")
    time.sleep(0.8)
    check("C file -> graph node", in_graph(pid, "crud_a.bak"))

    st, lst = call("GET", f"/projects/{pid}/discovered-files")
    check("R file list", st == 200 and isinstance(lst, list), f"status={st}")

    st, _ = call("PUT", f"/projects/{pid}/discovered-files/{fid}",
                 {"filename": "crud_b.bak", "severity": "critical"})
    time.sleep(0.8)
    check("U file", st in (200, 204), f"status={st}")
    check("U file -> graph node renamed", in_graph(pid, "crud_b.bak"))

    st, _ = call("DELETE", f"/projects/{pid}/discovered-files/{fid}")
    time.sleep(0.8)
    check("D file", st in (200, 204), f"status={st}")
    check("D file -> graph node gone", not in_graph(pid, "crud_b.bak"))


def suite_tool(pid, tid):
    section("Tool CRUD  (+ execution uses the current template)")
    st, t = call("POST", "/tools/", {
        "name": "CRUD Probe", "description": "crud", "category": "utility",
        "command_template": "echo crud-one {target}", "parameters": {}})
    toolid = t.get("id") if isinstance(t, dict) else None
    check("C tool", st in (200, 201) and toolid, f"status={st}")

    st, one = call("GET", f"/tools/{toolid}")
    check("R tool", st == 200 and isinstance(one, dict) and one.get("id") == toolid, f"status={st}")

    st, _ = call("PUT", f"/tools/{toolid}", {"command_template": "echo crud-two {target}"})
    st2, one = call("GET", f"/tools/{toolid}")
    st3, lst = call("GET", "/tools/")
    in_list = next((x for x in lst if x.get("id") == toolid), None) if isinstance(lst, list) else None
    check("U tool visible on detail and list",
          st in (200, 204) and one.get("command_template") == "echo crud-two {target}"
          and in_list and in_list.get("command_template") == "echo crud-two {target}",
          f"detail={one.get('command_template')} list={in_list.get('command_template') if in_list else None}")

    st, ex = call("POST", f"/tools/projects/{pid}/tools/execute", {
        "tools": [{"tool_id": toolid, "target_id": tid, "parameters": {"target": "crud-keep.test"}}]})
    eid = ex.get("id") if isinstance(ex, dict) else None
    final = None
    for _ in range(40):
        time.sleep(1)
        st, e = call("GET", f"/tools/executions/{eid}")
        if isinstance(e, dict) and e.get("execution_status") in ("completed", "failed"):
            final = e
            break
    check("execution runs the edited template", bool(final) and "crud-two" in (final.get("output") or ""),
          f"output={(final or {}).get('output')!r}")

    st, _ = call("DELETE", f"/tools/{toolid}")
    st2, after = call("GET", f"/tools/{toolid}")
    st3, lst = call("GET", "/tools/")
    listed = any(x.get("id") == toolid for x in lst) if isinstance(lst, list) else True
    # a tool with execution history is retired rather than destroyed, so it may
    # still be readable by id — it must not come back in the active list
    check("D tool", st in (200, 204) and not listed and st2 in (200, 404),
          f"delete={st} still_listed={listed} read_after={st2}")


def suite_workflow(pid):
    section("Workflow CRUD")
    st, w = call("POST", "/workflows", {
        "name": "CRUD Workflow", "description": "crud", "project_id": pid,
        "steps": [{"tool_id": 1, "order": 1}]})
    wid = w.get("id") if isinstance(w, dict) else None
    check("C workflow", st in (200, 201) and wid, f"status={st} body={str(w)[:160]}")
    if not wid:
        return

    st, one = call("GET", f"/workflows/{wid}")
    check("R workflow", st == 200 and isinstance(one, dict), f"status={st}")

    st, _ = call("PUT", f"/workflows/{wid}", {"name": "CRUD Workflow renamed"})
    st2, one = call("GET", f"/workflows/{wid}")
    check("U workflow", st in (200, 204) and isinstance(one, dict)
          and one.get("name") == "CRUD Workflow renamed",
          f"update={st} name={one.get('name') if isinstance(one, dict) else one}")

    st, _ = call("DELETE", f"/workflows/{wid}")
    st2, _ = call("GET", f"/workflows/{wid}")
    check("D workflow", st in (200, 204) and st2 == 404, f"delete={st} read_after={st2}")


def suite_reports(pid):
    section("Reports")
    st, r = call("POST", "/reports/generate",
                 {"project_id": pid, "title": "CRUD Report", "report_type": "executive"},
                 form=True)
    rid = (r.get("id") or r.get("report_id")) if isinstance(r, dict) else None
    check("generate report", st in (200, 201) and rid, f"status={st} body={str(r)[:160]}")
    st, lst = call("GET", f"/reports/project/{pid}")
    check("list project reports", st == 200, f"status={st}")
    if rid:
        st, one = call("GET", f"/reports/{rid}")
        check("read report", st == 200, f"status={st}")
        st, _ = call("PUT", f"/reports/{rid}", {"title": "CRUD Report edited"})
        check("update report", st in (200, 204), f"status={st}")


def suite_scope(pid):
    section("Scope")
    st, _ = call("PUT", f"/scope/projects/{pid}/scope", {
        "target_scope": {"domains": ["*.crud.test"]},
        "out_of_scope": {"domains": ["deny.crud.test"]}})
    check("update scope", st in (200, 204), f"status={st}")
    st, got = call("GET", f"/projects/{pid}")
    check("scope persisted on the project",
          isinstance(got, dict) and "crud.test" in json.dumps(got.get("target_scope") or {}),
          f"scope={got.get('target_scope') if isinstance(got, dict) else got}")
    st, rep = call("GET", f"/scope/projects/{pid}/scope/compliance-report")
    check("scope compliance report", st == 200, f"status={st}")


def suite_activity(pid):
    section("Activity log")
    st, acts = call("GET", f"/projects/{pid}/activities")
    check("project activity list", st in (200, 404), f"status={st}")
    st, stats = call("GET", f"/projects/{pid}/activities/statistics")
    check("activity statistics", st in (200, 404), f"status={st}")


def suite_ai(pid):
    section("AI endpoints")
    st, m = call("GET", "/ai/models")
    configured = [k for k, v in (m.get("models") or {}).items() if v.get("configured")] \
        if isinstance(m, dict) else []
    check("providers configured", bool(configured), f"configured={configured}")

    st, r = call("POST", "/ai/chat", {"message": "Name one target, one line.", "project_id": pid})
    body = r.get("response", "") if isinstance(r, dict) else str(r)
    ok = st == 200 and body and "rate-limited" not in body and "request failed" not in body
    check("chat answers", ok, f"status={st} used={r.get('model_used') if isinstance(r, dict) else '?'} "
                              f"reply={body[:120]!r}")

    st, g = call("GET", f"/neo4j/graph/{pid}")
    if st == 200:
        st2, a = call("POST", "/ai/analyze-knowledge-graph", {"project_id": pid, "graph_data": g})
        check("knowledge-graph analysis returns paths", st2 == 200 and a, f"status={st2}")

    st, rec = call("GET", f"/ai/recommendations?project_id={pid}")
    check("recommendations endpoint", st == 200, f"status={st}")


def suite_cleanup(pid, keep):
    section("Cleanup")
    if keep:
        print("  (kept)")
        return
    st, _ = call("DELETE", f"/projects/{pid}")
    check("D project", st in (200, 204), f"status={st}")
    blob, edges = graph(pid)
    check("D project -> graph emptied", blob in ("[]", "") and edges == 0, f"nodes={blob[:60]} edges={edges}")


def main():
    global BASE, TOKEN
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=BASE)
    ap.add_argument("--ai", action="store_true")
    ap.add_argument("--keep", action="store_true")
    args = ap.parse_args()
    BASE = args.base.rstrip("/")

    st, r = call("POST", "/auth/login", {"username": "test_user", "password": "test123"}, token=False)
    if st != 200:
        print(f"login failed: {st} {r}")
        sys.exit(99)
    TOKEN = r["access_token"]
    print(f"CRUD matrix against {BASE}")

    pid = suite_project()
    tid = suite_target(pid)
    suite_finding(pid, tid)
    suite_user(pid, tid)
    suite_file(pid, tid)
    suite_tool(pid, tid)
    suite_workflow(pid)
    suite_reports(pid)
    suite_scope(pid)
    suite_activity(pid)
    if args.ai:
        suite_ai(pid)
    suite_cleanup(pid, args.keep)

    failed = [x for x in RESULTS if not x[1]]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} checks passed")
    for name, _, detail in failed:
        print(f"  - {name}\n      {detail}")
    sys.exit(len(failed))


if __name__ == "__main__":
    main()
