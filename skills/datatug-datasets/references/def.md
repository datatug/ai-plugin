# datatug dataset-def

Print a dataset's definition (the YAML that describes its source, query, and columns).

## Command

```bash
datatug dataset-def --dataset <dataset-id> -p <project>
```

## Parameters

| Flag | Required | Description |
|---|---|---|
| `--dataset <id>` | Yes | The dataset to describe. |
| `-p`, `--project <name>` | Yes* | Project to read from (a project registered via `datatug projects`). |
| `-d`, `--directory <path>` | Yes* | Alternative to `-p`: path to the project directory. |

\* Provide **either** `-p` or `-d`.

## When to use

- Understanding how a dataset is constructed before using its data.
- Reviewing changes to a dataset definition.

## Notes

- Output is YAML.
- The selector flag is `--dataset` (not a positional argument).
- Pair with [`dataset-data`](data.md) to see the resulting rows.
- Run `datatug dataset-def --help` for the authoritative flag list.
