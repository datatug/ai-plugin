# datatug queries — run

Run a query: a table of a project database, or a saved query with parameters.

## Commands

```bash
datatug query run --db 'datatug://<project>/<db-id>?env=<ENV>' --from <Table> --limit <N>
datatug query run --project <project> --query <id> --var Name=value [--env <ENV>]
```

## Notes

- `--db` and `--project` never go together. With `--db`, give a `datatug://` reference, never a connection string.
- `--limit` and `--offset` work with `--from` only. No ranking column named means the first rows.
- Run it plainly, with no pipe, redirect or `&&`. The rows are drawn in the card, not given to you.
- Never read `~/.datatug` or look for connection strings.
- Preserve the operator's declared profile, principal and policies. Stop and relay missing-policy, denied or unsupported errors. Never retry with `--no-policies`, remove policies, change principals or substitute credentials to bypass them. The flag is an explicit operator opt-out on supported legacy routes, not automatic recovery.
- CLI v0.139.0 refuses direct project-query execution for a declared `exact-table-readonly-v1` profile, including `datatug://` project references. Do not claim that dropping policy flags enables it. Saved TugQL can use the operator's existing profile-bound agent through [the MCP skill](../../datatug-mcp/SKILL.md); preserve that session and relay any denial.
- `datatug query run --help` is the authoritative flag list.
