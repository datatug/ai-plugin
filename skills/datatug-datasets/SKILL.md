---
name: datatug-datasets
description: List, define, and read datasets in a DataTug project. Covers `datatug datasets`, `datatug dataset-def`, and `datatug dataset-data`. Use to enumerate datasets, inspect a definition, or print recordset data.
---

# datatug datasets

Wraps the DataTug dataset command surface: `datasets`, `dataset-def`, `dataset-data`.

## Pre-flight check

```bash
command -v datatug >/dev/null 2>&1
```

On miss, invoke `/datatug:datatug-install` and stop.

## Pick a verb

| You need to… | Read |
|---|---|
| List datasets in the current project | [references/list.md](references/list.md) |
| Print a dataset's definition (YAML) | [references/def.md](references/def.md) |
| Print a dataset's data (YAML / JSON / grid) | [references/data.md](references/data.md) |
