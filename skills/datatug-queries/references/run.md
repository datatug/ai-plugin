# datatug queries — run

Execute a saved query, optionally with parameters.

## Command

```bash
datatug queries <subcommand> [args] -p <project>
```

## When to use

- Ad-hoc troubleshooting using a parametrised query.
- Scripted reporting from CI or a cron job.

## Notes

- Select the project with `-p <name>` or `-d <path>`.
- ⚠️ A dedicated run subcommand is **not confirmed** in the current CLI — `datatug queries` with no subcommand only *lists* queries. The exact run subcommand name and parameter-passing syntax depend on the CLI version. Run `datatug queries --help` for the authoritative list before relying on this.
