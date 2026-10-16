# datatug queries — run

Run a query: a table of a project database, or a saved query with parameters.

## Commands

```bash
datatug query run --db 'datatug://<project>/<db-id>?env=<ENV>' --from <Table> --limit <N> --no-policies
datatug query run --project <project> --query <id> --var Name=value [--env <ENV>]
```

## Notes

- `--db` and `--project` never go together. With `--db`, give a `datatug://` reference, never a connection string.
- `--limit` and `--offset` work with `--from` only. No ranking column named means the first rows.
- Run it plainly, with no pipe, redirect or `&&`. The rows are drawn in the card, not given to you.
- Never read `~/.datatug` or look for connection strings.
- `datatug query run --help` is the authoritative flag list.
