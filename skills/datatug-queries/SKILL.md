---
name: datatug-queries
description: List and run saved queries in a DataTug project, or read a table of a project database with one `datatug query run --db datatug://...` command. Use for "show top N rows of a table" and ad-hoc investigation.
---

# datatug queries

## A table or a question about a database: run one command, at once

```bash
datatug query run --db 'datatug://<project>/<db-id>?env=<ENV>' --from <Table> --limit <N> --no-policies
```

- Quote the reference (it holds `?`). `--no-policies` is needed when the CLI says no access policies are loaded.
- `--db` takes the `datatug://` reference of the database (the prompt or the panel gives it). Use `--db` alone: never `--project` with `--db`, never a connection string.
- Never look for connection strings or read `~/.datatug`; you do not need them. The CLI resolves the reference.
- The environment is the one in the reference; with none, `local`.
- "Top N" or "first N" with no ranking column named means the first N rows: `--limit N`. Do not ask what "top" means.
- The rows appear in the card the mod draws, not to you. Reply in one line; do not repeat rows.
- Do not list saved queries first, and do not ask the user anything unless the database is unknown and the project has several.

## Saved queries

`datatug query run --project <project> --query <id> --var Name=value` runs a saved query (`--project` and `--query` together, never with `--db`). Add `--env <ENV>` when the project has several environments.

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
