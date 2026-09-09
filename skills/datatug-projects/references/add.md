# datatug projects add

Register a DataTug project on this machine (in `~/.datatug.yaml`) so it can be referenced by id with `-p <id>`.

## Command

```bash
datatug projects add -p <project-id> -d <path-to-project-directory>
```

## Parameters

| Flag | Required | Description |
|---|---|---|
| `-p`, `--project <id>` | Yes | Id/name to register the project under (used later as `-p <id>`). |
| `-d`, `--directory <path>` | Yes | Local path to the project directory. |

## When to use

- After cloning a DataTug project repo from Git.
- After scaffolding a new project with [`datatug-init`](../../datatug-init/SKILL.md).

## Notes

- Writes the entry to `~/.datatug.yaml`; the project is then resolvable by `-p <id>` in other commands.
- Run `datatug projects add --help` for the authoritative flag list.
