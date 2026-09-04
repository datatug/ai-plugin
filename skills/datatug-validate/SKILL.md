---
name: datatug-validate
description: Run validation scripts on a DataTug project — verify metadata, queries, and pipelines are well-formed. Use as a CI gate or before committing changes.
user-invocable: true
---

# datatug validate

Wraps `datatug validate` — run the project's validation scripts.

## Pre-flight check

```bash
command -v datatug >/dev/null 2>&1
```

On miss, invoke `/datatug:datatug-install` and stop.

## Command

```bash
datatug validate -p <project>
```

Select the project with `-p <name>` (or `-d <path>`). `--dir`/`-d` also scopes which directory is validated.

## When to use

- CI gate on every push.
- Local sanity check before committing.
- After scanning a data source (validate that the new metadata is consistent with existing datasets/queries).

## Notes

- A non-zero exit means at least one validation failed — surface the message verbatim.
- Run `datatug validate --help` for the authoritative flag list.
- Pair with [`datatug-scan`](../datatug-scan/SKILL.md) in CI: scan, then validate.
