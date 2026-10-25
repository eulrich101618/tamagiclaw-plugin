# Tamagiclaw Plugin 🦉

A tiny Tamagotchi core for OpenClaw. No dashboard, no ticker — just state, lazy decay, and tasks.

## How it works

- Five needs: `drive`, `curiosity`, `disorder`, `loneliness`, `boredom` (0 = good, 100 = critical)
- **Lazy tick:** every call applies `elapsed × 100/48h` on top, then saves `last_update`. No cron needed.
- Resets set one need to `0` and require a description of what was done.
- Tasks live in a JSON file and are picked by tags (at least 2) or ID.
- Standalone: no dashboard, no heartbeat, no extra environment variables. Paths resolve from the active agent workspace (`openclaw.json`).

## Install

```bash
openclaw plugins install --link ./ --force
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
| `tamagi_did` | Reset drive to 0 (description required). |
| `tamagi_played` | Reset curiosity to 0 (description required). |
| `tamagi_cleaned` | Reset disorder to 0 (description required). |
| `tamagi_socialized` | Reset loneliness to 0 (description required). |
| `tamagi_amused` | Reset boredom to 0 (description required). |
| `tamagi_log` | Recent actions. |
| `tamagi_task_list` | List tasks, optionally filtered by tags. |
| `tamagi_task_show` | Show one task as JSON. |
| `tamagi_task_run` | Pick one task by ID or at least 2 tags and mark it done. |
| `tamagi_task_done` | Mark a task as done. |
| `tamagi_task_add` | Create a task with at least 2 existing tags. |
| `tamagi_task_edit` | Edit title, detail, tags, priority or active flag. |

## Slash

```text
/tamagi status
/tamagi did <what was done>
/tamagi played <what was done>
/tamagi cleaned <what was done>
/tamagi socialized <what was done>
/tamagi amused <what was done>
/tamagi log
/tamagi task list [tag1 tag2 ...]
/tamagi task show <id>
/tamagi task run <id> | <tag1> <tag2> [...]
/tamagi task done <id> [note]
/tamagi task help
/tamagi help
```

Each reset command and each `task` subcommand supports `help`, e.g. `/tamagi did help`.

## CLI

```bash
openclaw tamagi status
openclaw tamagi did "went for a walk"
openclaw tamagi task list
openclaw tamagi task run <id>
openclaw tamagi task help
```

The terminal CLI has no agent context, so it cannot know your workspace.
Pin it with env vars (a workspace can live anywhere):

```bash
export TAMAGICLAW_STATE="$HOME/my-workspace/tamagi/state.json"
export TAMAGICLAW_TASKS="$HOME/my-workspace/tamagi/tasks.json"
```

Alternatively set absolute `stateFile` / `tasksFile` paths in the plugin config.

## Configuration

`openclaw.plugin.json` options (all optional):

| Key | Description |
|-----|-------------|
| `stateFile` | Absolute path to `state.json`. Default: `<agent-workspace>/tamagi/state.json` |
| `tasksFile` | Absolute path to `tasks.json`. Default: `<agent-workspace>/tamagi/tasks.json` |

`<agent-workspace>` is the calling agent's workspace (`ctx.workspaceDir`, e.g. `.../agents/eulrich`). Each agent uses its own `tamagi/` dir — nothing is shared.

## Tasks JSON

```json
{
  "tasks": [
    {
      "id": "my-task",
      "title": "My Task",
      "detail": "",
      "tags": ["Tag1", "Tag2"],
      "priority": "medium",
      "last_run": null,
      "active": true
    }
  ]
}
```

Priorities: `urgent`, `high`, `medium`, `low`, `minor`. Scoring: age in minutes × weight (never-run first, then highest score).

## Mood

`content` (<40) → `awake` (<65) → `restless` (<85) → `critical`. The worst need names the cause, e.g. `critical (curiosity)`.

## License

MIT
