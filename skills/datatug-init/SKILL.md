---
name: datatug-init
description: Create a new DataTug project — scaffolds the project file layout at a specified path. Use when starting a new data exploration project.
---

# datatug init

Wraps `datatug init` — scaffold a new DataTug project.

## Pre-flight check

```bash
command -v datatug >/dev/null 2>&1
```

On miss, invoke `/datatug:datatug-install` and stop until `datatug --help` succeeds.

## Command

```bash
datatug init <projectId> <projectPath>
```

Both arguments are **required positional arguments**:

| Argument | Description |
|---|---|
| `projectId` | Short id used to reference the project later (e.g. with `-p <projectId>`). |
| `projectPath` | Directory in which to create the project. Created if it does not exist. |

A bare `datatug init` (no arguments) will not work.

## When to use

- Bootstrapping a new DataTug project skeleton at the given path.

## Notes

- Creates a `datatug/` directory under `<projectPath>`; the project summary is stored as `datatug-project.json`. Errors if the target already contains a `datatug` project.
- Run `datatug init --help` for the authoritative argument list.
- After init, register the project with [`datatug-projects add`](../datatug-projects/references/add.md), add data sources with [`datatug-scan`](../datatug-scan/SKILL.md), and define datasets with [`datatug-datasets`](../datatug-datasets/SKILL.md).
