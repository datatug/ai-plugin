---
name: datatug-queries
description: List and run saved queries in a DataTug project. Use to discover available queries or execute a parametrised query for ad-hoc investigation.
user-invocable: true
---

# datatug queries

Wraps `datatug queries` — list and run saved queries in a DataTug project.

## Pre-flight check

```bash
command -v datatug >/dev/null 2>&1
```

On miss, invoke `/datatug:datatug-install` and stop.

## Pick a verb

| You need to… | Read |
|---|---|
| List saved queries | [references/list.md](references/list.md) |
| Run a saved query (with parameters) | [references/run.md](references/run.md) |
