# datatug datasets

List datasets in a DataTug project.

## Command

```bash
datatug datasets -p <project>
```

## Parameters

| Flag | Required | Description |
|---|---|---|
| `-p`, `--project <name>` | Yes* | Project to list datasets from. |
| `-d`, `--directory <path>` | Yes* | Alternative to `-p`: path to the project directory. |

\* Provide **either** `-p` or `-d`.

## When to use

- Discover which datasets exist before reading their definitions or data.

## Notes

- Read-only.
- Run `datatug datasets --help` for the authoritative flag list.
