# datatug queries — list

List saved queries in a DataTug project.

## Command

```bash
datatug queries -p <project>
```

## Parameters

| Flag | Required | Description |
|---|---|---|
| `-p`, `--project <name>` | Yes* | Project to list queries from. |
| `-d`, `--directory <path>` | Yes* | Alternative to `-p`: path to the project directory. |

\* Provide **either** `-p` or `-d`.

## When to use

- Discovery — what queries are available before running one.

## Notes

- Read-only. `datatug queries` with no subcommand lists the queries.
- Run `datatug queries --help` for the authoritative flag list.
