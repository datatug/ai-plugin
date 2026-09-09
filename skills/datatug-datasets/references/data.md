# datatug dataset-data

Print a dataset's data — the result of executing its underlying query.

## Command

```bash
datatug dataset-data --file <dataset-id> -p <project> [--format <yaml|json|grid>] [--indent <n|TAB>]
```

## Parameters

| Flag | Required | Description |
|---|---|---|
| `--file <id>` | Yes | The dataset (recordset) to read. |
| `-p`, `--project <name>` | Yes* | Project to read from. |
| `-d`, `--directory <path>` | Yes* | Alternative to `-p`: path to the project directory. |
| `--format <yaml\|json\|grid>` | No | Output format (default `yaml`). `grid` is human-readable; `yaml`/`json` are machine-readable. |
| `--indent <n\|TAB>` | No | Indentation: a digit for number of spaces, or `TAB`. |

\* Provide **either** `-p` or `-d`.

## When to use

- Reading dataset rows from the CLI.
- Piping rows into another tool (`--format json` and `jq`).

## Notes

- Read-only.
- The dataset selector flag is `--file` (not a positional argument).
- Run `datatug dataset-data --help` for the authoritative flag list.
