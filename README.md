# DataTug AI Plugin

AI plugin for [DataTug](https://datatug.io) - skills that teach AI agents how to use the `datatug` CLI for data exploration, dataset management, schema scanning, and query execution.

This repository contains the plugin source. It is installed on top of the [`datatug` CLI](https://datatug.io/en/docs/install); the CLI is a prerequisite.

## Contents

| Directory | Description |
|---|---|
| [`skills/`](skills/README.md) | Agent skills - one per major `datatug` CLI surface area, progressively loaded per-verb |
| [`.claude-plugin/`](.claude-plugin/plugin.json) | Claude Code plugin manifest |
| [`hooks/`](hooks/hooks.json), [`lib/`](lib/cli.js), [`types/`](types/index.d.ts) | Claude Code mod: the `/datatug` panel and `/datatug project` pane (Claude Code only) |
| [`tests/`](tests/mod.test.ts) | Mod tests, run with `claude plugin test` |
| [`.codex-plugin/`](.codex-plugin/plugin.json) | Codex plugin manifest |
| [`plugin.json`](plugin.json) | Portable Agent Plugins manifest for Cursor and other compatible hosts |
| [`gemini-extension.json`](gemini-extension.json) | Gemini CLI extension manifest |
| [`.github/plugin.json`](.github/plugin.json) | GitHub Copilot CLI / VS Code agent plugin manifest |

## Claude Code mod

In Claude Code, the plugin also ships a [mod](https://code.claude.com/docs/en/plugins/mods/overview) with two views. Everything either shows comes from the `datatug` CLI; the mod reads no project file itself.

**`/datatug`** opens the DataTug panel, a column of cards beside the transcript:

- **Project**: pick one of your registered projects.
- **Databases**: the project's databases, plus a field that opens another one from a connection string or a file path and adds it to the project. Open a database to list its tables and views, and count their rows on request.
- **Table**: columns, declared types, nullability, keys and foreign keys (press a foreign key to go to the table it points at), who references the table, and the column order you prefer (as defined, A to Z, or by type). **Show records** lists its first 100 records, 20 to a page; a row number opens the **Record** card, where a foreign-key value opens the record it points to. **Column** shows one column's facts.
- **Open in DataTug**: the Table, Table records and Record cards of a database in a project link to the same table, its top records or that record in the DataTug web UI at `https://datatug.app`, which reads them from your own local DataTug agent (`datatug daemon`). The link comes from `datatug daemon url`; the mod draws it only after checking it (the hosted UI on `https://datatug.app`, the agent on `127.0.0.1`, a one-time code and the record key only in the part after `#`, no credentials), refreshes it after a minute, and offers **Check again**. In its place a card says why there is none: the agent is not running (`datatug daemon start`), the web UI cannot open that view yet, the CLI is too old, the database is not in a project yet, or the card is shown somewhere other than a terminal on the machine that runs the agent (the Desktop app, VS Code, mobile, or a terminal over SSH). A PostgreSQL database added through an environment variable gets no link. Links, keys and rows never go into a prompt, a notice or the context bag.
- **Context bag**: the cart buttons next to a table, a column or a field add it to your bag. Check what you want and press **Ask Claude...** to draft one question about it in the prompt box; the draft is never sent for you and ends where you type your question. Each item carries the `datatug://<project>/<db>?env=<ENV>` reference of its database, and the draft gives Claude the one command to run (`datatug query run --db '<ref>' --from <table> --limit <N> --no-policies`), so a simple question such as "show top 5 artists" is answered with a single call; the rows appear in the card, never to Claude. An item with no recorded database is resolved when the draft is built: the open database, the project's only one, or, with several, its `local` source (shown as "default: local"; never production by default).

**The result card.** With `datatug` 0.92.0 or later, the mod runs Claude's plain `datatug query run` (ad-hoc, or a saved query with `--project --query`) with `--result-id <id>` inserted right after `query run` (and `--format json` when Claude gave no `--format`), so the CLI writes the result to two private files under `~/.datatug/query-results/<id>/` and prints only a path-free line. The mod asks the CLI where the files are (`datatug query results locate`, never Claude's command or output), checks that they are regular files of the expected names under that folder and within the size bounds, reads them, and draws a card under the call with five views, switched by **● Table ○ Record ○ Columns ○ Sources ○ Related**:

- **Table**: the rows, 20 at first, then up to 50, then pages of 50, and at most 10 columns. A row number is a button, not a link: pressing it opens that row in **Record**, where **Open row in DataTug ↗** opens the same row in the web UI.
- **Record**: one row as type, name and value, with ◀ Prev / Next ▶. A foreign-key value opens the record it points at in the panel.
- **Columns**: each column's type, declared type, nullability, key and source column; computed columns are marked.
- **Sources**: the tables and views the query reads, with their join columns.
- **Related**: the tables that can be joined to it by a foreign key, with the direction, cardinality and field pairs. All are listed; whether you may read one is decided when a query on it runs.

A table or column name opens its Table or Column card in the panel, and **Records** its Table records card, read through the result's own `datatug://<project>/<db>` reference, never the database you opened in the panel. A result from a database that is not in a project shows names as text. A native SQL saved query has no sources (nothing parses SQL), and a database whose driver reports no foreign keys says "No related tables found". In the Table view a column header is a Button: press it to sort the rows loaded in the card (up to 2000, then paged) ascending (▲), again descending (▼), a third time to clear. Numbers compare by value, text by letters, empty values last; equal values keep their order. The sort is per card, changes only what is drawn (a row number still opens that row of the result in Record) and runs nothing again. **Copy CSV** and **Copy JSON** put the rows loaded in the card (up to 2000, in the order shown, all columns) on your clipboard through the same `$.ui.copy` as the command's Copy; a toast says how many rows, or that the surface has no clipboard. CSV has a header row and quotes values holding commas, quotes or line breaks; JSON is an array of objects keyed by column name, numbers kept exact. The values are copied raw: nothing is prefixed, so a cell that starts with `=`, `+`, `-` or `@` is a formula when the CSV is opened in a spreadsheet (CSV injection); review data you do not trust before opening it there. The clipboard text goes to your clipboard only, never to a log, a notice, a toast, Claude or a tool result. A press redraws only its own card. The rows of the last ten cards are kept; an older card, or one after a reload, shows **Load**, which reads the files again (results are kept 7 days). With `datatug` 0.94.0 or later, the card also has an **Open in DataTug** line for the same result in the web UI (drawn only once `datatug daemon url --result` reports the web UI can open it, and with the same checks as the panel's links) and the command `datatug ui --result <id>`, with **Copy**, which opens the same rows in the DataTug terminal UI. Claude reads a summary only: the row count, the column names, and the names of the source and related tables, never a value, a path, the id, the link or the command. A query that went to the background shows **Load**. An older `datatug`, an unusable result store (for example a home folder that is a Git repository, or a sandboxed shell that cannot write `~/.datatug/query-results`) or a `--format` other than `json` keeps the private capture and the grid below, with a line saying why.

**More rows.** A result card that is a plain table read (`--from`, no policy, no offset, a database in a project) has **Rows ○ 10 ○ 50 ○ 100 ○ 500** beside Copy CSV and JSON. Pressing a count reads the same table again with that many rows (`datatug query run --db=<ref> --from=<table> --limit=<N> --no-policies`, run by the mod, not by Claude) and shows it in the same card, in the transcript and the panel; **Original** goes back to the first result. A count read before is shown from the store, not read again. Claude is not told: it does not see the rows, the new result or the press. The new result is stored with the same prompt as the first. A saved query, a TugQL query, a read under a policy or from an offset, or a table name with anything beyond letters, digits, `_`, `.`, `$` and `-` shows one dim line saying why there are no counts (the CLI takes `--limit` only with `--from`, and a replay without policies must not widen what a policy allowed).

Your prompt is stored with the result it led to. When a query's result card is ready, the mod hands the latest prompt you submitted (your own words, typed or from Ask Claude; never a notification or another session's message) to `datatug query results annotate --id <id> --prompt-stdin` on the CLI's standard input, once per result, so DataTug's own UI can show what you asked next to the rows. It is best effort and silent: a `datatug` older than 0.101.0, the first release with the command, a failure or no prompt seen sends nothing and shows nothing, and the card never waits for it. The prompt is the full text you submitted, including any context-bag boilerplate and clicked values Ask Claude wrote, cut by the CLI to 8 KiB. It is never an argument or environment variable, a log line, a toast, a notice or text Claude reads, and the card does not show it. **It is written to the local result store (`~/.datatug/query-results/<id>/meta.json`, private to you), kept as long as the result (7 days) and shown on the loopback result page: a secret you type into a prompt is stored there too, so do not type one.**

If the transcript folds the call into a count line ("Ran 1 shell command"), the mod unfolds that group so the card is drawn inline. In the transcript the card is a bordered, padded block with a blank line above and below, headed by a line naming what it is (for example `Customer · chinook-local (local) · 10 rows x 13 columns`: the tables it reads, or the saved query's id, or "SQL query"; the database and environment; the row count, "at least N" when more exist), with **Open in DataTug ↗** at the top right of that row (below it where the line leaves no room) and **Check again** beside it, or beside the "Columns 1-10 of N" note when the Table view has one, and the terminal command is a labelled section (a dim frame, **Copy** under it). The row above it shows a short line instead of the sentence Claude reads. The same card (the newest result) also shows in the DataTug panel as **Latest result**, opened without taking the keyboard, with the five views, the Open in DataTug line and the Copy controls (the view buttons have no digit keys: a plain Button draws its hotkey as a "1:" prefix, and the engine cannot hide it, so Tab or the arrows and Enter move between the views). The panel's order is Project, Context bag, Latest result, then what you open (Databases, table, records, record, column), with a horizontal rule between sections. With two or more results, a `◀ 2/5 ▶` row and the result's title switch between the last five; the newest is shown when a result arrives. **✕** (key **x** while the panel has the keys; drawn as `[ ✕ ]`, with no "x:" hint) removes the shown result only; the transcript cards stay. A table wider than ten columns shows ten at a time: **◀ columns** and **columns ▶** move the window ("Columns 11-13 of 13"), and sort and the Copy buttons still cover every column. A value the grid cuts is a button: press it to see the whole value, as text, under the grid, with **Copy** and **Close**. A panel narrower than 60 columns opens on the Record view until you pick a view. Press **ctrl+x tab** to focus the panel, press **Esc** to return to the prompt. Where the terminal is too narrow to place the panel, run `/datatug`. The first result of a session leaves one dim line saying where the card is (later results leave none); **ctrl+o** expands folded tool calls.

Otherwise (the private capture), when Claude runs a plain `datatug query run ...` command, the rows are shown to you as a grid under the call and Claude is given only a summary (row and column counts and column names), not the rows. A plain command is `datatug query run` with its own flags, optionally after `env`, `time` or `VAR=value`, with quotes only around whole arguments, which may hold spaces (`--db 'datatug://demo/chinook?env=local'`, `--sql 'select 1'`). Any other command that runs `datatug query run` is denied, and Claude is told to run it plainly: one with a pipe, redirect, comment, `&&`, a loop, a substitution or other shell syntax, a wrapper such as `timeout`, `nice`, `nohup`, `sudo` or `env -i`, an unbalanced or in-word quote, a bare `--`, its own `--result-id`, `--result-rows` or `--client`, or a run in the background. `datatug query run --help` alone runs as it is. A row number in the grid opens its Record card. The rows are written to an owner-only folder under your temporary folder (with `set -C`, so a file already there is never written through) and the file is removed once read (or, when it cannot be read or the call fails, as soon as the call ends; a session killed mid-call can leave one file). An explicit `--format` other than `json` is written the same way and shown nowhere; Claude is told to leave it out. A call that goes to the background is not read and its file is removed. Claude's own file tools (Read, Grep, Glob, Edit, Write, NotebookEdit) and Bash commands that name that folder, `~/.datatug/query-results` or anything under `~/.datatug` by path, or run `datatug query results locate`, `datatug daemon url --result` or `datatug ui --result` are denied. The rows of the last ten results are kept in the session's plugin state for the cards. This is a convenience that keeps rows out of the transcript, not a security boundary: Claude can still read data with a command the mod does not see as one, such as `bash -c '...'` or a script file. A database you opened with a connection string reaches the CLI in the `DATATUG_OPEN_DB` environment variable only, never in an argument, a prompt or a link, and the prompts the panel drafts name a database by its `datatug://<project>/<db>` reference. The one place a value enters a prompt is the context bag: a value you added to the bag and checked is part of the **Ask Claude...** draft because you chose it.

**`/datatug project`** opens a read-only pane for the DataTug project in the session's working directory, with four tabs (Overview, Environments, Queries, Boards), from `datatug show`, `datatug queries` and `datatug board list`, each with `--format json`. Where nothing can draw (VS Code chat, `claude -p`), it prints a text summary instead. On the Queries tab, Tab moves between queries and Enter opens one (title, ID, type and parameters). Press `a` there to draft a request in the prompt box without sending it, so you can add details first; this closes the pane, and `/datatug project` opens it again. `b` goes back to the list.

The mod runs the `datatug` found first on your `PATH`, in the session's working directory, as the plugin's skills do.

It requires Claude Code 2.1.287 or later and `datatug` 0.84.1 or later (what the panel needs: `datatug://` database references, `datatug db add`, `datatug db schema --columns` and the `--client` flag); the Open in DataTug links need `datatug` 0.86.0 or later (the record key and a one-time code in the link fragment, and an agent that admits only the hosted web UI), and with an older one the cards say to update it. The result card needs `datatug` 0.92.0 or later, and its web link and terminal command 0.94.0 or later; with an older one Claude's queries keep the grid. Every `datatug` command the mod runs carries `DATATUG_CLIENT=claude-mod`, so the CLI keeps the local agent running for the links; the mod never starts it itself. A database you open by path or connection string is added to the selected project's `local` environment under a source id of its own (a SQLite file by its path, any other database through an environment variable of its own). To link to a web UI you run locally, set the plugin's **Development web UI host** setting (`/config`) to exactly `http://datatug.localhost` (or `https://`, with an optional port); nothing else is accepted, and the mod never takes it from the CLI. Other hosts do not run the mod (GitHub Copilot CLI logs one error line about the root `hooks/hooks.json` when it loads the plugin, and still loads its skills). If the CLI is missing or older, `/datatug` says so and names the fix.

Develop and test it from this directory with `claude --plugin-dir .`, `claude plugin validate .` and `claude plugin test`.

## Install

The same `skills/<name>/SKILL.md` payload is shared across package formats; each host reads its own manifest. This repository has native inventory receipts for Claude Code and Codex. The Gemini CLI, GitHub Copilot, and Cursor metadata is declarative here and needs host-runtime validation in those environments.

### Claude Code

Via the [DataTug AI marketplace](https://github.com/datatug/ai-marketplace):

```
/plugin marketplace add datatug/ai-marketplace
/plugin install datatug@datatug
```

### Codex

```
codex plugin marketplace add datatug/ai-marketplace
```

Then enable the `datatug` plugin from Codex's plugin directory. Codex reads [`.codex-plugin/plugin.json`](.codex-plugin/plugin.json).

### Gemini CLI

```
gemini extensions install https://github.com/datatug/ai-plugin
```

[`gemini-extension.json`](gemini-extension.json) declares the bundled `skills/` tree for Gemini CLI; Gemini runtime discovery is not exercised in this repository.

### GitHub Copilot CLI

```
copilot plugin install datatug/ai-plugin
```

[`.github/plugin.json`](.github/plugin.json) declares the skills for GitHub Copilot; Copilot runtime discovery is not exercised in this repository.

### Cursor

The root [`plugin.json`](plugin.json) declares the portable Agent Plugins schema supported by Cursor. For local development, follow [Cursor's local plugin folder guidance](https://cursor.com/docs/plugins): place this repository under `~/.cursor/plugins/local/datatug` and reload Cursor. Cursor runtime discovery is not exercised in this repository.

## First use

The `datatug` CLI must be on your `PATH` before any wrapper skill can run. Options:

- Invoke `/datatug:datatug-install` inside Claude Code - the [install skill](skills/datatug-install/SKILL.md) shows the platform-appropriate install commands.
- Or install directly per the [DataTug CLI installation guide](https://datatug.io/en/docs/install).

Verify with `datatug --help`.

## Relationship to the CLI

The plugin wraps the `datatug` CLI - it does not replace it. Skills encode *when* to call a command, *which* flags to pass, and *how* to interpret exit codes. The CLI's commands are documented in the [CLI reference](https://datatug.io/en/docs/reference/cli).

A change in the CLI surface typically produces a matching skill update in this repository; the two evolve together but release independently.

## Relationship to other plugins

`datatug` is a base-layer **CLI wrapper** plugin, in the same shape as:

- [`specscore`](https://github.com/specscore/ai-plugin-specscore)
- [`synchestra`](https://github.com/synchestra-io/ai-plugin-synchestra)
- [`ingitdb`](https://github.com/ingitdb/ingitdb-ai-skills)

## Development

Pull requests and pushes to `main` run `.github/workflows/ci.yml`. It has three checks, each runnable locally from the repository root:

| Check | What it runs | Locally |
| --- | --- | --- |
| `mod` | `claude plugin validate . --strict` and `claude plugin test` (the mod tests in `tests/`), with Claude Code pinned in the workflow; needs no login or API key | `claude plugin validate . --strict` and `claude plugin test` |
| `manifests` | Parses every manifest, checks that `name` and `version` agree and that every referenced path exists, and runs the checker's own tests | `node --test scripts/check-manifests.test.js && node scripts/check-manifests.js` |
| `spec` | `specscore spec lint` on `spec/`, with specscore pinned in the workflow | `specscore spec lint` ([install](https://github.com/specscore/specscore-cli#install)) |

When you bump the version, change it in every manifest; the `manifests` check fails if they differ.

## Releases

Releases are tagged as `datatug--v<version>` on this repository to support Claude Code's dependency resolution.

## License

MIT - see [LICENSE](LICENSE).
