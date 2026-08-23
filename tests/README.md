# Tests

Everything that exercises a running BountyFlow lives here. Nothing is written to
the repository root.

```
tests/
  platform_e2e.py           API, sync, security, admin and graph checks (64)
  crud_matrix.py            create/read/update/delete every entity (52)
  ui_smoke.js               browser-level checks — every page must render data (33)
  capture_ui_reference.js   screenshots of the live UI, used by demo/
  scenarios/
    seed_scenarios.py       build small / medium / large engagements, then verify
  ui-screenshots/           written by `ui_smoke.js --shots` (gitignored)
```

Run all four in this order: `crud_matrix` → `platform_e2e` → `scenarios` →
`ui_smoke`. The first three need only Python; the last needs a local Chrome.

All three take `--base`, so they run against localhost or a remote instance.

## API, sync and security — `platform_e2e.py`

```bash
python tests/platform_e2e.py --base http://localhost:8002
```

Drives the platform the way a user does — project → targets → findings → users →
files → tools → execute → edit → delete — and asserts the *rest* of the platform
follows: the knowledge graph gets the node and the edge, a renamed target renames
its node, an edited `command_template` is what actually executes, deleting a
project takes its graph with it. Also probes unauthenticated access, SQL
metacharacters, stored XSS and unknown ids.

`--ai` adds live model calls (costs tokens): default provider, per-request
provider override, and a prompt-injection attempt that must not leak the system
prompt. `--keep` leaves the scenario in the database.

Two sections exist because both areas shipped broken and nothing here could see
it:

* **Admin console** — every admin router declared its own `require_admin` that
  read `.is_superuser` off the dict `get_current_user` returns, which is an
  `AttributeError`, which is a 500 on every admin request. The suite now asserts
  each admin endpoint answers a superuser with 200 and a normal user with 403.
* **Graph service** — `create_relationship`, `delete_node`,
  `update_node_position`, `get_attack_paths` and `get_critical_nodes` were
  called by routes but never existed on `Neo4jService`. The suite creates a
  relationship, reads it back out of the graph, moves a node, deletes it, and
  checks that deleting it again 404s.

Exit code is the number of failed checks.

## Every entity, every verb — `crud_matrix.py`

```bash
python tests/crud_matrix.py --base http://localhost:8002 --ai
```

Deliberately boring and exhaustive: for projects, targets, findings, discovered
users, discovered files, tools, workflows, reports and scope it creates a row,
reads it back, edits a field, reads it again, deletes it, and confirms it left
both the listing **and** the knowledge graph. Nearly every bug found in this
codebase has been an update or a delete that only touched one of those two.

`--ai` additionally exercises chat, knowledge-graph analysis and recommendations.

## Browser — `ui_smoke.js`

```bash
node tests/ui_smoke.js --base http://localhost:3000 --shots
```

The API suite drives the backend with a token, so it cannot see the failure where
a page renders "No projects found" next to a dashboard that says 2 projects. This
one logs in through the form, visits every page, and fails a page if it shows an
empty state or if any `/api/` request behind it returned 4xx/5xx.

It covers every route under `pages/`: the fourteen data pages, the three attack
builders, both graph views, the two redirects, `/api-test`, the project detail
and report editor pages (it resolves a real id, generating a report if the
project has none), registration through the form, and the five `/admin/*` pages
under a second login as a superuser. `--no-admin` skips that second half;
`--admin-user` / `--admin-pass` override the credentials.

Needs a local Chrome (`CHROME_PATH` if it is somewhere unusual). It reuses the
`puppeteer-core` installed under `demo/export/`, or any `puppeteer-core` it can
resolve normally — on the Linux host, `npm i --no-save puppeteer-core@23.11.1`
in the repo root (v25 is ESM-only and needs Node 22).

Known gaps it reports but does not fail on — three endpoints the UI calls that
the backend never implemented, so each page degrades to an empty builder:

| Endpoint | Page |
|----------|------|
| `/api/v1/attack-vectors/{id}` | `/vectors`, `/attack-vectors` |
| `/api/v1/attack-chains/{id}` | `/attack-chain-builder` |
| `/api/v1/attack-flows/{id}` | `/attack-flow-builder` |

## Load and consistency — `scenarios/seed_scenarios.py`

```bash
python tests/scenarios/seed_scenarios.py --size small
python tests/scenarios/seed_scenarios.py --size medium
python tests/scenarios/seed_scenarios.py --size large --keep
```

Start with `small` so a failure is easy to read, then scale up. `large` builds 8
projects, ~100 targets, ~80 findings and ~64 executions, then checks that every
entity reached the graph, that **no project's graph contains another project's
nodes**, that dashboard totals match, and that a tool edit is visible to every
consumer. `--keep` leaves the data in place — useful before running `ui_smoke.js`
against a populated instance.

## Running against the Linux host

Develop in this repo, copy over, run there:

```bash
scp -r tests kali@192.168.235.129:~/bountyflow/
```

```bash
ssh kali@192.168.235.129 "cd ~/bountyflow && python3 tests/platform_e2e.py --base http://localhost:8002"
```

The browser suite runs from the workstation against a tunnel:

```bash
ssh -f -N -L 3000:localhost:3000 -L 8002:localhost:8002 kali@192.168.235.129
```

…or entirely on the host, which already has Chromium:

```bash
ssh kali@192.168.235.129 "cd ~/bountyflow && CHROME_PATH=/usr/bin/chromium node tests/ui_smoke.js --base http://localhost:3000 --shots"
```

### Bringing the host up from cold

```bash
ssh kali@192.168.235.129 "cd ~/bountyflow && NEO4J_PASSWORD=bountyflow123 docker compose up -d neo4j redis"
```

```bash
ssh kali@192.168.235.129 "cd ~/bountyflow/apps/backend && (setsid nohup ../../.venv/bin/python -m uvicorn src.main:app --host 0.0.0.0 --port 8002 > ~/bf-backend.log 2>&1 </dev/null &)"
```

```bash
ssh kali@192.168.235.129 "cd ~/bountyflow/apps/frontend && (setsid nohup npm run dev > ~/bf-frontend.log 2>&1 </dev/null &)"
```

Stop the backend by port, not by name — `pkill -f uvicorn` over SSH matches the
command line of the SSH session itself and kills your own shell:

```bash
ssh kali@192.168.235.129 "kill \$(ss -tlnp | grep :8002 | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u)"
```
