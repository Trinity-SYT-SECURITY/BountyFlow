# Working as a team

How several people share an engagement, who may do what, and where the administrator fits.

## The shape of it

An engagement belongs to whoever created it. Everyone else is on it because someone put them there, with a role that says how much they may do.

```
project
 ├─ created_by ─────────── always an owner, cannot be removed
 └─ project_users
      ├─ user, role=owner   manages the team, can delete the project
      ├─ user, role=editor  does the work
      └─ user, role=viewer  reads
```

| Role | Read | Add targets, findings, run tools, write reports | Manage the team | Delete the project |
|------|------|-----|-----|-----|
| owner | yes | yes | yes | yes |
| editor | yes | yes | no | no |
| viewer | yes | no | no | no |
| superuser | every project | every project | every project | every project |

A superuser is on no project and may reach all of them. That is the whole reason the admin console exists, and it is why the admin routes are exempt from the membership check — they do their own.

## Why the check lives in middleware

There are about forty endpoints that take a project id, spread over nine routers, and they take it in seven different URL shapes:

```
/api/v1/projects/{id}/...
/api/v1/scope/projects/{id}/...
/api/v1/activity-logs/projects/{id}/...
/api/v1/tools/projects/{id}/...
/api/v1/neo4j/graph/{id}
/api/v1/reports/project/{id}
/api/v1/attack-{vectors,chains,flows}/{id}
```

Putting the check in each handler means writing it forty times and leaving a hole every time someone forgets. `middleware/project_access.py` pulls the id out of whichever shape the URL is, resolves the caller's role once, and refuses before the handler runs. A route added tomorrow is covered the moment its path matches — which is also why the patterns, not the handlers, are the thing to update when a new shape appears.

The same middleware enforces the read/write split: any method that is not GET, HEAD or OPTIONS is refused for a viewer, and anything under `/projects/{id}/members` is refused for anyone below owner.

## "Assign this to B, C and D"

That is one action, not three:

```http
POST /api/v1/projects/{id}/members/bulk
{"usernames": ["b", "c", "d"], "role": "editor"}
```

It reports who was added, who was already on the project, and any name it did not recognise, rather than failing the whole request over one of them.

From then on the four of them see the same engagement: the same targets, findings, credentials, files, tool runs, knowledge graph and reports. There is no per-page visibility to configure, because a half-visible engagement is worse than no access at all — a finding whose target you cannot see is not a finding you can act on.

## Not repeating each other

Membership is what makes the work visible. Claiming is what stops two people doing it twice.

* Each target carries an **assignee**. Claiming one is visible to everyone on the project immediately.
* `GET /projects/{id}/team` is the coordination view: every member with the targets they have claimed, the tool runs they have made and the findings they have recorded, plus how many targets nobody has taken.
* `GET /my/assignments` is the same data from one person's side — every project they are on and what is waiting on them in each.
* The activity log already records what was run and what the platform made of it, so "has anyone tried this yet" has an answer that is not a message to the group chat.
* Taking someone off a project releases whatever they had claimed, rather than leaving it assigned to somebody who can no longer see it.

## What the administrator gets

| Endpoint | Answers |
|----------|---------|
| `GET /admin/overview` | Every project on the instance: team, roles, counts, last activity, and how many targets are unclaimed |
| `GET /admin/team-load` | Every account: projects created, projects assigned, targets claimed, tool runs, findings |
| `GET /admin/users/{id}/workload` | One person: every project and role, what they have been doing, their recent actions |
| `POST /admin/projects/{id}/members` | Put anyone on any project, without owning it |
| `DELETE /admin/projects/{id}/members/{user}` | Take them off again |

All of it is one request rather than one per project — "what is everyone working on" should not take thirty round trips. Membership changes made here are written to the audit log.

The existing admin screens still do what they did: create and deactivate accounts, reset passwords, transfer project ownership, read the audit trail and change system settings.

## Search

`GET /api/v1/search` runs one query across projects, targets, findings, discovered users and files, tools, tool **output**, reports and the attack builders. Filters: type, project, severity, status, target type, assignee, author, sensitivity, and a date window.

It is scoped to the projects the caller can see, so it never becomes a way around the rules above. An account that cannot open a project also cannot find its hosts.

## API keys

A browser session lasts half an hour. Tooling needs longer, and needs revoking on its own. `api_keys` holds a hash per key; the key itself is shown once.

A key resolves to the person who created it, so project roles and the audit trail work unchanged — a viewer's key reads and cannot write. A key cannot mint another key, which would otherwise let one credential quietly reproduce itself.

This is what the [MCP server](../mcp/README.md) authenticates with.

## What is deliberately not here

* **Per-page permissions.** A matrix of `can_run_tools`, `can_view_credentials` and so on is more surface to administer, to test and to get wrong than three roles, and an engagement you can only half see is not much use.
* **Task objects.** A work tracker inside the platform — titles, due dates, comments, its own notifications — is a second product. Claiming a target and the activity log answer the question that was actually asked.
* **Tool execution over MCP.** The platform runs shell commands on the host it is installed on. A model that can call that is a remote code execution path.
