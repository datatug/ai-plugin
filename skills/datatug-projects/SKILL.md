---
name: datatug-projects
description: List and manage DataTug projects registered on this machine. Use to discover what projects exist, add a new one, or remove a stale entry.
---

# datatug projects

Wraps `datatug projects` — list and manage the DataTug project registry.

## Pre-flight check

```bash
command -v datatug >/dev/null 2>&1
```

On miss, invoke `/datatug:datatug-install` and stop.

## Pick a verb

| You need to… | Read |
|---|---|
| List registered projects | [references/list.md](references/list.md) |
| Add a project to the registry | [references/add.md](references/add.md) |
