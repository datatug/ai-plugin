# datatug projects (list)

List all DataTug projects registered on this machine (in `~/.datatug.yaml`).

## Command

```bash
datatug projects
```

There is **no `projects list` subcommand** — running `datatug projects` with no subcommand prints the registered projects.

## Parameters

| Flag | Description |
|---|---|
| `-a`, `--all` | Output all fields (`id`, `path`, `title`) instead of just `id`. |
| `-f`, `--fields <list>` | Comma-separated fields to output. Possible values: `id`, `path`, `title`. Default: `id`. |

## When to use

- Discover which projects are known before opening one.
- Find a project `id` for use in other commands (`-p <id>`).

## Notes

- Read-only.
- Run `datatug projects --help` for the authoritative flag list.
