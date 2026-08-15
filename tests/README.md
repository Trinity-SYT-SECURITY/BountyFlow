# Tests

Everything that exercises a running BountyFlow lives here. Nothing is written to
the repository root.

```
tests/
  platform_e2e.py           API, sync and security checks (44)
  ui_smoke.js               browser-level checks — every page must render data (15)
  scenarios/
    seed_scenarios.py       build small / medium / large engagements, then verify
  ui-screenshots/           written by `ui_smoke.js --shots` (gitignored)
```

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

Exit code is the number of failed checks.

## Browser — `ui_smoke.js`

```bash
node tests/ui_smoke.js --base http://localhost:3000 --shots
```

The API suite drives the backend with a token, so it cannot see the failure where
a page renders "No projects found" next to a dashboard that says 2 projects. This
one logs in through the form, visits every page, and fails a page if it shows an
empty state or if any `/api/` request behind it returned 4xx/5xx.

Needs a local Chrome (`CHROME_PATH` if it is somewhere unusual). It reuses the
`puppeteer-core` installed under `demo/export/`.

Known gap it reports but does not fail on: `/api/v1/attack-vectors/{id}` has no
backend implementation, so the Attack Vectors page renders an empty builder.

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
