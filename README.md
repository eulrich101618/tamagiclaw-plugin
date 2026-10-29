# Tamagiclaw Plugin 🦉

State and tasks for OpenClaw agents: five needs with lazy decay, plus a tag-based task pool.

## How it works

- Five needs: `drive`, `curiosity`, `disorder`, `loneliness`, `boredom` (0 = good, 100 = critical)
- **Lazy tick:** every call applies `elapsed × 100/48h` on top, then saves `last_update`. No cron needed.
- Resets set one need to `0` and require a description of what was done.
- Tasks live in a JSON file and are picked by tags (at least 2) or ID.
- Paths resolve from the calling agent's workspace (`ctx.workspaceDir`, fallback `openclaw.json` roster).

## Heartbeat usecase: scheduled tasks with priorities

The main usecase is a heartbeat loop that picks one task per run, spread across the day:

- Each task carries at least 2 tags (e.g. `Morning` + `Order`, combining a time window with the need it satisfies).
- Priorities: `urgent`, `high`, `medium`, `low`, `minor`.
- Urgency-points: waiting minutes (since `last_run`, never-run since `created`) x priority weight. Highest first.
- Per run: read status, list tasks, run one task via `tamagi_task_run` with 2 matching tags, do the work, reset the matching need with a description, log the run.

This spreads chores, check-ins, and messages across the day without overlap: each run does something new, urgent items surface first, stale items bubble up automatically.

## Install

```bash
openclaw plugins install clawhub:openclaw-tamagiclaw
# or from GitHub:
openclaw plugins install github:eulrich101618/tamagiclaw-plugin --force
```

Build from source:

```bash
npm install
npm run build
```

## Tools

| Tool | Description |
|------|-------------|
| `tamagi_status` | Show state (lazy tick applied). Always call first. |
| `tamagi_reset` | Reset one need to 0 (description required). Params: `need` (`drive\|curiosity\|disorder\|loneliness\|boredom`), `action` (what was done, past tense). |
| `tamagi_log` | Recent actions. |
| `tamagi_task_list` | List tasks, optionally filtered by tags. Countdown `30:`→`1:` (`:` avoids Markdown list renumbering), most overdue last (#1). |
| `tamagi_task_run` | Run top-score task (no args, = #1 = last list line), or pick directly by ID, or by at least 2 tags. |
| `tamagi_task_add` | Create a task with at least 2 existing tags. |
| `tamagi_task_edit` | Edit title, detail, tags, priority or active flag. |

`task show` / `task done` exist only as slash/CLI (`/tamagi task show|done`, `tamagi task show|done`), not as tools.

## Slash

```text
/tamagi status
/tamagi reset <need> <what was done>   (need: drive|curiosity|disorder|loneliness|boredom)
/tamagi log
/tamagi task list [tag1 tag2 ...]
/tamagi task show <id>
/tamagi task run [<id> | <tag1> <tag2> ...]   (no args = #1 = last list line)
/tamagi task done <id> [note]
/tamagi task help
/tamagi help
```

`task list` renders a Markdown list, e.g.

```text
30: **My Task** — id: `my-task` · urgency-points: 123 · tags: `Morning`;`Order`
1: **Urgent Task** — id: `urgent-task` · urgency-points: 56160 · tags: `Morning`;`Order`
```

Each `reset` and each `task` subcommand supports `help`, e.g. `/tamagi reset help`.

`<agent-workspace>` is the agent's own workspace: from tool context when
available, else from the gateway roster (`agents.entries.<id>.workspace`).
Without tool context the `agent` parameter (default: `main`) selects the
roster entry (`TAMAGICLAW_AGENT` overrides it).

Absolute overrides: `TAMAGICLAW_STATE` / `TAMAGICLAW_TASKS` env vars or
`stateFile` / `tasksFile` in the plugin config.

## CLI

```bash
openclaw tamagi status
openclaw tamagi reset <need> "what was done"
openclaw tamagi log
openclaw tamagi task list [tag1 tag2 ...]
openclaw tamagi task show <id>
openclaw tamagi task run [<id> | <tag1> <tag2> ...]   # no args = #1 (last line)
openclaw tamagi task done <id> [note]
```

All commands take positional args only, no flags. `task add`/`edit` are tools-only.

## Configuration

`openclaw.plugin.json` options (all optional):

| Key | Description |
|-----|-------------|
| `agent` | Agent id from the gateway roster, used only without tool context. Default: `main`. |
| `stateFile` | Absolute path to `state.json`. Default: `<agent-workspace>/tamagi/state.json` |
| `tasksFile` | Absolute path to `tasks.json`. Default: `<agent-workspace>/tamagi/tasks.json` |

`<agent-workspace>` is the calling agent's workspace (`ctx.workspaceDir`). Each agent uses its own `tamagi/` dir — nothing is shared.

## Tasks JSON

```json
{
  "tasks": [
    {
      "id": "my-task",
      "title": "My Task",
      "detail": "",
      "tags": ["Morning", "Order"],
      "priority": "medium",
      "last_run": null,
      "active": true
    }
  ]
}
```

Priorities: `urgent`, `high`, `medium`, `low`, `minor`. Urgency-points = waiting minutes x weight (never-run since `created`). List is descending: highest first.

## Mood

`content` (<40) → `awake` (<65) → `restless` (<85) → `critical`. The worst need names the cause, e.g. `critical (curiosity)`.

## License

MIT
