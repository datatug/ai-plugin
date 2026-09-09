---
name: datatug-scan
description: Add or update database metadata in a DataTug project by scanning a configured data source. Use after adding a new database connection, or to refresh schema metadata after upstream changes.
---

# datatug scan

Wraps `datatug scan` — introspect a configured data source and write its schema metadata into the DataTug project.

## Pre-flight check

```bash
command -v datatug >/dev/null 2>&1
```

On miss, invoke `/datatug:datatug-install` and stop.

## Pick a reference

| You need to… | Read |
|---|---|
| Scan a configured database and refresh metadata | [references/scan.md](references/scan.md) |
