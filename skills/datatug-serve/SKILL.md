---
name: datatug-serve
description: Start the DataTug HTTP server — exposes a REST API the DataTug Web UI consumes. Use during local development or to run a shared DataTug instance for a team.
---

# datatug serve

Wraps `datatug serve` — start the HTTP server that backs the DataTug Web UI.

## Pre-flight check

```bash
command -v datatug >/dev/null 2>&1
```

On miss, invoke `/datatug:datatug-install` and stop.

## Command

```bash
datatug serve
```

## When to use

- Local development — pair with the Web UI for interactive data exploration.
- Shared team instance behind a reverse proxy.

## Notes

- Long-running process. Exits on `SIGINT` / `SIGTERM`.
- Default port is **8989**.
- Run `datatug serve --help` for the authoritative flag list. (Note: `--help` on the current CLI shows no additional flags beyond `--help`; host/TLS/port options are not confirmed to be wired yet.)
