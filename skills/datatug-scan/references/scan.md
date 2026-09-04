# datatug scan

Introspect a database and write its schema metadata into the DataTug project. Runs DDL discovery against the source and writes the scanned tables, columns, types and primary keys to disk under the project's `dbmodels/` folder.

## Command

SQLite (file-based):

```bash
datatug scan -d <project> --env <ENV> --db <database-id> -D sqlite3 --path <path-to-.db-file>
```

SQL Server (network):

```bash
datatug scan -d <project> --env <ENV> --db <database-id> -D sqlserver -s <server> [-U <user> -P <password> --port <n>]
```

There is **no `--source` flag** — the source is specified by the connection flags below.

## Parameters

| Flag | Required | Description |
|---|---|---|
| `-p`, `--project <name>` | Yes* | Project to write metadata into. |
| `-d`, `--directory <path>` | Yes* | Alternative to `-p`: path to the project directory. |
| `--env <ENV>` | Yes | Environment the DB belongs to (e.g. `LOCAL`, `DEV`, `UAT`, `PROD`). |
| `--db <id>` | Yes | Id of the database to scan. |
| `-D`, `--driver <name>` | — | DB driver: `sqlite3` or `sqlserver`. |
| `--path <file>` | For sqlite3 | Path to the SQLite database file. |
| `-s`, `--server <host>` | For sqlserver | Network server / host name. |
| `--port <n>` | — | Server port (default if omitted). |
| `-U`, `--user <name>` | — | DB login user. |
| `-P`, `--password <pwd>` | — | DB login password. |
| `--dbmodel <id>` | — | DB model id; required for newly scanned databases. |

\* Provide **either** `-p` or `-d`.

## When to use

- After adding a new database connection.
- After upstream schema changes (new tables, dropped columns).

## Notes

- Run `datatug scan --help` for the authoritative flag list.
- Writes the schema — tables, columns, types, primary keys, **foreign keys, indexes, unique constraints, and reverse references** — to `dbmodels/<id>.dbmodel.json` plus the project/environment files. Commit the diff to version-control the schema snapshot.
- **SQLite** is supported via `-D sqlite3 --path <file>` (datatug-cli [#139](https://github.com/datatug/datatug-cli/pull/139) scan, [#140](https://github.com/datatug/datatug-cli/pull/140) persistence, [#141](https://github.com/datatug/datatug-cli/pull/141) indexes/FKs/constraints). SQLite requires a CGO build of the CLI (e.g. `go install`), so prebuilt `CGO_ENABLED=0` release binaries do not include it.
- Deriving a SQL Server host from the project's environment config (omitting `-s/--server`) is not yet implemented and returns a clear error.
