---
format: https://specscore.md/feature-specification
status: Implementing
---

# Feature: Claude Code Project Pane Mod

> [SpecScore.**Studio**](https://specscore.studio): | [Explore](https://specscore.studio/app/github.com/datatug/ai-plugin/spec/features/claude-code-mod?op=explore) | [Edit](https://specscore.studio/app/github.com/datatug/ai-plugin/spec/features/claude-code-mod?op=edit) | [Ask question](https://specscore.studio/app/github.com/datatug/ai-plugin/spec/features/claude-code-mod?op=ask) | [Request change](https://specscore.studio/app/github.com/datatug/ai-plugin/spec/features/claude-code-mod?op=request-change) |
**Status:** Implementing
**Source Ideas:** —

## Summary

A [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview) shipped inside this plugin that adds a `/datatug` command. Plain `/datatug` opens the DataTug panel, a set of cards beside the transcript: the registered projects and their databases, an opened database's tables, a table's metadata and records, a record, a column, and a context bag of what the person wants to ask Claude about. `/datatug project` opens a read-only pane showing the DataTug project in the working directory: overview, environments with their sources, queries, and boards. Every fact either shows comes from the `datatug` CLI; the mod parses no project file itself.

## Problem

The plugin's skills teach Claude how to drive the `datatug` CLI, but the user has no at-a-glance view of the DataTug project Claude is working in. They must ask Claude or open the Web UI to see which environments, queries and boards exist. A mod runs inside Claude Code and can draw that view without a Claude turn.

Reading the project's files directly would make the mod a second reader of the project layout, free to disagree with the CLI, `serve` and chat. The CLI is the one reader, so the mod asks it.

## Behavior

The mod lives in this repository next to the skills (`hooks/hooks.json` names the one hooks module `hooks/register.tsx`, which also registers the project pane of `hooks/project.js`; pure helpers are under `lib/`; the state types are `types/index.d.ts`) and is installed by the existing `datatug` plugin. Only Claude Code loads it; the Codex, Gemini CLI, Copilot and Cursor manifests do not reference it, though all five advance together.

`/datatug project` runs the `datatug` CLI in the session's working directory and draws the result as a pane with four tabs:

- **Overview**: project title, id, access, and counts.
- **Environments**: each environment with its sources, each source with its driver and its number of tables and views (or `not scanned`).
- **Queries**: the saved queries as a folder tree, with title and type.
- **Boards**: each board's id and title.

### Commands it runs

The project pane runs exactly these, each read-only, with no shell:

| Command | Feeds |
| :- | :- |
| `datatug --version` | The version check |
| `datatug show --format json --depth tables` | Overview, Environments |
| `datatug queries --format json` | Queries |
| `datatug board list --format json` | Boards |

These are specified in `datatug/datatug-cli` (`spec/features/cli/show`, `spec/features/cli/queries`, `spec/features/cli/board`). The mod requires the first `datatug` release that carries all three; that version is recorded as one constant in the mod and stated in this repository's README.

The CLI resolves a project at the root of the working directory only, so `/datatug project` shows a project when the session runs in the project's root folder. It does not search parent folders.

The project pane is read-only towards the project: it does not run queries, guard tool calls, edit project files, or read them. The panel reads tables and, on a person's press, registers an opened database as a source of the selected project through `datatug db add`, which writes through the CLI and never reads or writes a project file itself. Neither submits a prompt.

Running `/datatug project` again reloads the project and redraws an open pane. Text that comes from the project or from the CLI (titles, ids, types, drivers, error messages) is shown with control characters, bidirectional controls and line breaks replaced by spaces and long values cut short, so a project file cannot blank the pane, act on the terminal or forge a line of the reply. Each tab shows at most 200 rows and says how many more there are. The mod runs the `datatug` found first on the `PATH`.

### Picking a query

On the Queries tab each query is a row that can be chosen with the keyboard. Choosing one opens that query's detail view in the pane: its title, its ID, its type and its parameters (each with its type, and marked when required), over a row of actions. **Ask Claude** puts a request to run the query into the prompt box as a draft and does not submit it, so the person can add details before sending. **Back** returns to the list. The action row is where running a query inside the pane will be added; this Feature does not run queries.

The draft is one line: `Run the saved DataTug query <id>`, followed by ` with <P>=` for each required parameter joined by `, `, and ` (optional: <P>, <P>)` when there are optional ones. It carries no title and no other text from the project: only the query's ID and parameter names, and only plain names (letters, digits, `_`, `.` and `-`, up to 64 characters, not starting with `.` or `-`). A parameter whose id is not plain is shown in the detail view and left out of the draft. A query whose ID is not made of plain names (at most 16 segments, 200 characters in all) cannot be drafted: its detail view says so in place of the Ask Claude button, and Back stays. The draft names at most 10 required and 10 optional parameters and counts the rest (` (+N more required)`, `, +N more`), and is at most 500 characters. The detail view shows at most 20 parameters and then a count of the rest, below the actions, so the actions are always on screen. Queries beyond the 200-row cap cannot be chosen. It is appended to whatever the box already holds, after a space when that text does not end in one. When the box cannot take it (a dialog holds the keys, or the session has no box), the draft is shown in a toast instead. After the box takes it, the pane closes, which gives the keys back to the prompt box; `/datatug project` opens it again.

Parameters are those `datatug queries --format json` lists; with a `datatug` that lists none, the detail view and the draft carry none.

## The panel

Plain `/datatug` checks the `datatug` version (the same replies as below when the CLI is missing or older than the one constant `MIN_CLI_VERSION`), then opens the panel and replies `DataTug panel opened.`. It does not run when a session starts. Where nothing can draw panes (or the pane is not placed) it replies with one line that names `/datatug project`.

The panel is a column of cards. Each card is drawn only from what the `datatug` CLI printed, and every piece of text that comes from a project, a database or a row is sanitised as in the project pane.

- **Project**: the projects registered for the user (`datatug projects --format json`), a picker, and the demo project hint.
- **Context bag**: what the person added with a cart button (a table, a column or a value), per project. A checked item can be opened again; **Ask Claude...** drafts one prompt from the checked items and does not submit it.
- **Databases**: the selected project's databases (`datatug show --depth sources`), a form that opens one from a connection string or a file path, and, for an opened one, adding it to the project (`datatug db add`) unless it is there.
- **Database**: the opened database's tables and views (`datatug db schema --columns`) with an on-request row count.
- **Table metadata**: a table's columns, declared types, nullability, keys and foreign keys, and the tables that reference it, in the column order the person chose (as defined, A to Z, or by type).
- **Table records**: the first 100 records of a table, 20 to a page.
- **Record**: one record's fields, with a cart button on each, previous and next, and a foreign-key value that opens the record it points to, with a way back.
- **Column**: one column's declared and observed facts; the observed ones come from the rows already loaded, never from a new read.

- **Open in DataTug**: a line on the Table metadata, Table records and Record cards, described below.

Every `datatug` command the mod runs carries `DATATUG_CLIENT=claude-mod`, the CLI's caller mechanism, so the local DataTug agent (`datatug daemon`) is kept running as a side effect of the cards' own calls. The mod never runs `datatug daemon start`.

### Connection strings

A database opened by a connection string or a file path is handed to the CLI in the environment variable `DATATUG_OPEN_DB` and named `env:DATATUG_OPEN_DB` in the argument list. To add it to the selected project, `db add` gets its own source id (`--name`, from the file or database name, with `-2`, `-3`... when taken) in the `local` environment: a SQLite file by its plain absolute path (one with credentials, a query or a fragment is not added), any other database through an environment variable of its own, `DATATUG_OPEN_DB_<NAME>_<FINGERPRINT>` (the fingerprint of the id keeps ids such as `shop-db` and `shop_db` apart), so two databases are never taken for one. Its connection string is never in an argument list, a prompt, a notice, a link or session state when it carries credentials or a query. A database the project holds is addressed by its reference `datatug://<project>/<db>[?env=<ENV>]`, which carries no credential.

### What the model sees

A `datatug query run` the model issues in one plain Bash command has its rows written to a file in an owner-only folder under the temporary folder (in a subshell with `set -C`, so a file already there is refused, not written through), read by the mod, and removed with `rm -f` (emptied when it cannot be removed; also when it cannot be read or the call fails; a session killed mid-call can leave the file); the result the model reads is a summary of the shape (row and column counts and column names) and a line saying the rows were shown to the person and withheld. `--format json` is inserted right after `query run` when the model gave no `--format`, so no flag of the model's can take it as its value.

The plain form is `datatug query run` (the command word, or a path ending in `datatug`, after optional `env`, `time` and `VAR=value` words) with flags of its own, no shell syntax (`|`, `;`, `&`, `<`, `>`, `$`, a backtick, `(`, `)`, `#`, a backslash, a newline or a carriage return, quoted or not), quotes only around whole arguments (which may hold spaces, as in `--sql 'select 1'`) and holding no quote of the other kind (a quoted argument whose first word is `--result-id`, `--result-rows` or `--client` is denied like the bare flag), no unquoted word the shell would expand (`{`, `}`, `*`, `?`, `[`, `]`), so a flag cannot appear after the check, no bare `--`, and none of `--result-id`, `--result-rows` or `--client`, quoted or not, nor a `DATATUG_CLIENT=` assignment (the CLI's fallback for `--client`). The command word matches in any case (`DataTug` runs datatug on a macOS disk), and wrapper names are compared by their basename, ignoring case (`/usr/bin/env`). Two detectors find a command that runs `datatug query run`: the command word anywhere in command position (at the start or after a newline, `&&`, `||`, `;`, `|`, `&`, `(`, `$(`, a backtick, `!`, `{`, `then`, `do`, `else`, `elif`, `while` or `until`, after `VAR=` words, or as the command a wrapper runs: `env`, `time`, `timeout`, `nice`, `nohup`, `stdbuf`, `caffeinate`, `watch`, `command`, `exec`, `builtin`, `sudo`, `doas`, `xargs`, `gtimeout`, `arch`, `coproc`, `ltrace`, `strace`, `sandbox-exec`, `script`, `unbuffer`, `npx`, zsh's `noglob`, `nocorrect`, `-` and `repeat N`, with the wrapper's options skipped), in the command with its quoted text blanked (a double-quoted part that substitutes a command is kept); and the first command of each line as written, which covers a heredoc body. Past both detectors, any simple command that holds the word `datatug` (any case, or a path ending in it) followed later by `query` and `run` is denied too, unless its command never runs its words (`echo`, `printf`, `rg`, `grep`, `git`, `gh`, `specscore`, `man`, `which`, `type`), so a wrapper the detectors do not know is denied rather than run; the same default covers `query results locate`, `daemon url --result` and `ui --result`. A command either detector finds that is not the plain form is denied with "Run DataTug queries as a plain `datatug query run ...` command, ..." and never runs; one with `run_in_background` is denied with "DataTug queries cannot run in the background". `datatug query run --help` (or `-h`) and nothing else runs as it is; `-h` beside other flags is denied, since it may be another flag's value. A command with an explicit `--format` other than `json` is captured the same way and the model reads that the output was captured privately. A call that went to the background (its result carries a `backgroundTaskId`) is not read and its file is removed. The Bash hook's `.catch` is a constant denial: "The DataTug mod could not show the result of this query, so it did not hand it to Claude".

The model's own tools are kept out of the capture folder and the CLI's result store (`~/.datatug/query-results`), judged on the model's input before any rewrite: a Read, Grep, Glob, Edit, Write or NotebookEdit whose path (folded: `~`, `$HOME`, `..`; a glob by the folder before its first wildcard; and where it resolves, when it exists) is under either folder or is the folder directly above it; a Bash command (as written and as the shell reads it, quotes and backslashes removed, with `//`, `/./` and `/name/../` folded, case ignored) holding `.datatug/query-results`, `/datatug-claude-mod`, a wildcard anywhere in a path after `.datatug/`, any path into the home folder's `.datatug` (`~`, `~user`, `$HOME`, `${HOME}` or the literal home path), or a `datatug query results locate`, `datatug daemon url --result` or `datatug ui --result` in command position. Command words are read as the shell reads them, so `'query'`, `"run"`, `\datatug`, `$'run'` (ANSI-C quoting, its escapes decoded) and `$"run"` are those words, and zsh's `=datatug` is the datatug command; `time` takes options, and the word after `find`'s `-exec` is a command. They are denied with "DataTug query results are shown in the card, not to Claude"; the guards' `.catch` denies too. Words alone are not paths: a branch or spec folder named after the feature is not denied. This is hygiene, not containment: a model with a shell can reach data through a form neither detector sees, such as `bash -c '...'` or a script file. Known and not guarded: a command word the detectors do not read as `datatug` (`go run . query run`, `datatug-dev query run`, `datatug.exe query run`), which runs as written; `--result-id` or `--result-rows` placed before `query run` (`datatug --result-id zz query run`), which is not looked at; the bare folder `.datatug` of another user's home spelled with `~user/../` (`ls ~root/../u/.datatug`; a path into `query-results` or the capture folder is still denied); a wildcard that reaches the capture folder through `$TMPDIR` (`cat "${TMPDIR}"/dat*/x`); and a Bash call running in parallel with a query that reads the capture file while it exists. The rows appear in the chat as a grid under the call, and a row number opens its Record card. The prompts the panel drafts name a database only by its `datatug://` reference. The one place values enter a prompt is the context bag: a value the person added to the bag and checked is written into the **Ask Claude...** draft because the person chose it.

### Query result card

With a `datatug` of at least the card minimum (0.92.0, the first to write both result files with columns, sources and related tables), the plain form runs with result files instead of the private capture. `datatug --version` is asked once per session (a version it cannot read is a development build and counts as new; a probe that fails takes the private capture), then `datatug query results check --format json` once: an unusable store (`inside-git`, `symlink`, `owner`, `results-store-unwritable`) sends the session through the private capture, and its grids carry one line naming the reason. Below the minimum the grid carries "Update the DataTug CLI for the Record, Columns, Sources and Related views", and there is no link and no command.

- **Rewrite.** `--result-id <id>` (the tool_use_id with every character outside `[A-Za-z0-9_-]` made `_`), and `--format json` when the model gave no `--format`, go right after `query run`, with no redirect, `mkdir` or other shell syntax and no `--client`. The ad-hoc (`--db` with `-f` or `--from`) and saved (`--project --query`) forms both get it. An explicit `--format` other than `json` takes the private capture.
- **Fallbacks.** An errored call is read for two lines only: `unknown flag: --result-id` (an older `datatug` in the model's shell) and a `{"resultFiles"` line whose reason is `results-store-unwritable` (a sandboxed shell). Either turns the session to the private capture; the model reads "DataTug is older than the mod expects; run the query again" or "Run the query again", and the card says "Allow DataTug's result store (~/.datatug/query-results) in the sandbox's writable paths to see every view" for the second. Any other error reaches the model as the CLI's own error text and leaves the session as it is. A call that went to the background shows **Load**.
- **Finding the files.** The tool's stdout is never used for a path. The mod runs `datatug query results locate --id <id> --format json` itself and reads nothing unless the answer names this id, `data` and `meta` are exactly `<root>/<id>/data.json` and `<root>/<id>/meta.json` under an absolute root with no `.` or `..` segment, and `$.fs.stat(..., { resolve: true })` lands each on a regular file at exactly that place under the resolved root. `meta.json` is at most 1 MiB and is read first; `data.json` is at most 4,000,000 bytes and its size equals `dataBytes` in `meta.json`; a size that differs is not read and the card says "The result files do not agree with each other, so nothing was read. Run the query again" (a file over the limit says "too large"). Each file is read at the resolved path that was checked (`<resolved root>/<id>/meta.json`), not at the path as the CLI wrote it. A `meta.json` of a version other than 1 shows "Update the DataTug mod". `expired` and `not-found` answers show "These results expired (DataTug keeps them 7 days). Run the query again" and "No saved result for this call (removed, or run without result files)"; no link and no command are drawn for them.
- **What the model reads.** The row count ("at least N+1" when more exist), at most 40 column names, 32 source names and 50 related table names, each cleaned and cut to 80 characters, then "and N more", and the line saying the rows were shown to the person and withheld. Never a value, a path, the result id, the link or the command.
- **Per-card state.** Each card's rows, metadata, view, row, rows shown and link status are one member of a state family keyed by the tool call's id; a card reads only its member and the column order, so a press, a side-panel action or a schema load redraws no other card. An index lists the cards that hold rows; past ten, the oldest drops its rows and shows **Load**, which runs `locate` and the same checks again. A Bash row whose command is the plain form (or the rewritten one naming its own id) and whose member is empty, after a reload or a resumed session, shows **Load** too.
- **Views.** Five plain Buttons, `● Table ○ Record ○ Columns ○ Sources ○ Related`. Table: the Markdown grid, values escaped, 20 rows, "Show 30 more" up to 50, then `◀ Prev 50` / `Next 50 ▶`, at most 10 columns with a note; a row number opens it in Record. Record: type, name and value per column in the column order, `◀ Prev` / `Next ▶`, "Row i of N"; a foreign-key value opens the referenced record in the panel's Record card. Columns: #, name, type, declared type, nullable, key (🔑 and its position in a composite key) and source (`relation.column`), "computed" for a column with no source. Sources: #, `schema.relation` (`main` is not shown), kind, alias, role, the join's `a.x = b.y` pairs and **Records**. Related: #, target, kind, `→ references` or `← referenced by`, cardinality, `From.f = Target.g` and **Records**; every candidate the metadata lists is shown, with no permission filtering. An `unavailable` reason is one dim line: "Sources are not known for a native SQL query", "No related tables found", "The schema of this database could not be read". `$key` is hidden when the primary key is known.
- **Side panel.** A table or column name opens the panel's Table or Column card, found in the schema of the reference's project by environment, source, schema and name together (never by name alone; the panel selects that project and loads its schema first). **Records** and the foreign-key hop read through the result's `datatug://<project>/<db>` reference passed explicitly as `--db`, never the database opened in the panel; a participant of a federated query uses its own reference. A result whose database is in no project draws names as text with "Add this database to a project to open its tables". A press opens a card only: it never runs the model's query again or starts a turn.
- **Open elsewhere.** With a `datatug` of at least the open-elsewhere minimum (0.94.0, the first with `datatug ui --result` and `datatug daemon url --result`), a card of a complete result also draws an "Open in DataTug" line and the command `datatug ui --result <id>` in a `Code` element with **Copy** (`$.ui.copy`; "Select the command to copy it" in a toast when the surface cannot copy). The command is drawn only for an id of `[A-Za-z0-9_-]`, so it needs no quoting, and holds no path, address, name or value. The link is asked with `datatug daemon url --result <id> --result-view <current view> [--row <n> in the Record view] --format json` (`--result-view` from 0.98.0, the first release that has it; an older `datatug`, or a version the mod cannot read, gets `--view=<current view>`) and follows the Web UI link rules below (same machine only, freshness, **Check again**, the named warnings), plus "DataTug has no saved result for this call, so there is no web link" when `resultExists` is false; the re-check admits exactly `<store>result/<id>`, a `view` of the five views, an optional `row` and a `code` fragment. Until the web UI serves results, the CLI reports `uiSupport: pending` and the line says the web UI cannot open this view yet.
- **Names.** Table, view, column and alias names pass through the mod's text cleaning in Text and Button labels and through the Markdown escaping in the grid; Button keys are built from a fingerprint of the result id, the view and a list index, never from a name. Names never go into the link request, the command, a prompt or a path.

### Web UI links

The Table metadata, Table records and Record cards of a database that is a source of a project carry an "Open in DataTug" line: a link to the same table, its top 100 records or that record in the hosted web UI, which reads them from the person's local agent.

- **The CLI builds the link.** The mod asks `datatug daemon url --db <datatug:// reference> --table <name> [--schema S] [--view] [--records --limit 100 | --record <key JSON>] --format json`, after `datatug daemon status --format json` for the port, and never assembles a URL itself. Neither command starts the daemon or sends it a request. A database is named only by the `datatug://` reference it was opened by, or by the id and environment `db add` returned for it; never by a path or connection string.
- **Only after the card's data.** A card asks for its link only after its own data call resolved (the Table card once the database's schema is read, the Table records card once its records are read).
- **The mod checks every link before drawing it.** It must be `https://datatug.app` (or the development host below), the agent's own store path on `127.0.0.1` with the port `daemon status` reported, no `@` before the fragment, no second `://`, at most 2048 characters, the query `schema` (and `limit` for records) only, and the fragment `code` (and `pk` for a record) only, with a one-time code present. Anything else is no link.
- **Development host.** The plugin setting `webDevHost` admits exactly `http(s)://datatug.localhost[:port]` as a second origin. It is never inferred from the CLI or `DATATUG_UI_BASE`; any other base the CLI prints shows "This DataTug CLI points at a development web UI; no link".
- **Record key.** Built from the table's declared primary-key columns only (never `$key` or another column), with an integer above 2^53 - 1 kept as the digits the CLI printed, so it is passed unrounded. A table with no declared key, or a null, non-plain or over-256-character key value, gets "No record link: ..." in place of the link.
- **Same machine only.** A link is drawn only on the `terminal` surface with neither `SSH_CONNECTION` nor `SSH_TTY` set: the Desktop app, VS Code and mobile are remote surfaces that cannot be shown to open links on the agent's machine, so they show "Open in DataTug works only on the machine that runs the agent".
- **Freshness.** A link is drawn for 60 seconds, then asked for again before it is drawn; every line offers **Check again**.
- **No link, a named reason.** The agent not running (or the CLI not starting): "DataTug web link unavailable: the local DataTug agent is not running (datatug daemon start)". A daemon that did not start because a policy set exists and it names no principal (`startError: policy-principal-required` in `daemon status`, or in `daemon url`): "DataTug web link unavailable: a policy set exists but the DataTug agent has no principal. Run `datatug serve --as <principal>` or remove the policy set". `uiSupport` other than `available` for the view: "The DataTug web UI cannot open this view yet". A CLI older than 0.86.0, one without `daemon url`, or a link with no one-time code: "update the DataTug CLI". A database not in a project: "Add this database to a project to open it in DataTug". A source the project reads from an environment variable (`dsnEnv`): a line naming the variable the agent must be started with. A Record card of the opened database before it is in a project says so too; a Record card of a chat grid has no line.
- **Kept out of the model's reach.** The link (it carries a one-time code) is kept in the mod's memory only; session state holds the line's status, the time and a fingerprint of the request. No link, key or row goes into a tool result, a notice, a prompt or the context bag.

### Journey

1. A user installs the plugin and runs `/datatug project` in a DataTug project. **Observable good result:** a pane opens with the four tabs populated from the CLI's output.
2. The user runs `/datatug project` in a folder that is not a project. **Observable good result:** a one-line text reply says so, and no pane opens.
3. The `datatug` CLI is not installed, or is older than the mod needs (0.84.1: `datatug://` references, `db add`, `db schema --columns` and `--client`). **Observable good result:** a one-line text reply names the problem and the remedy (`datatug:datatug-install`, or `datatug self-update` with the version needed), and no pane opens.
4. The user runs `/datatug project` where nothing can draw (VS Code chat panel, `claude -p`). **Observable good result:** the command replies with a plain-text summary of the same four sections.
5. The user runs `/datatug`. **Observable good result:** the panel opens with the Project card and the Databases card; opening a database lists its tables, and pressing a table shows its metadata and offers its records.
6. In a terminal on the machine that runs the agent, the user opens a table of a project database. **Observable good result:** the Table card shows "Open in DataTug" once the web UI serves the view, or the one line that says why not, with **Check again**.

## Acceptance Criteria

### AC: pane-tabs

**Given** a DataTug project and a `datatug` CLI of the required version
**When** `/datatug project` runs in the project's root folder in a session that can draw
**Then** a pane shows the Overview, Environments, Queries and Boards tabs populated from the CLI's JSON output.

### AC: not-a-project

**Given** a working directory for which `datatug show` exits `3`
**When** `/datatug project` runs
**Then** it replies with one text line saying the folder is not a DataTug project and opens no pane.

### AC: cli-missing

**Given** no `datatug` executable can be started
**When** `/datatug project` runs
**Then** it replies with one text line that names the `datatug:datatug-install` skill and opens no pane.

### AC: cli-too-old

**Given** a `datatug` whose version is lower than the required version
**When** `/datatug project` or `/datatug` runs
**Then** it replies with one text line giving the version found, the version needed and `datatug self-update`, runs no other command, and opens no pane.

### AC: text-fallback

**Given** a session that draws on no surface that shows panes (`$.session.surfaces()` names neither `terminal` nor `desktop`; a `claude -p` run names none)
**When** `/datatug project` runs
**Then** it replies with a plain-text summary of the four sections, and opens no pane.

### AC: failed-command-isolated

**Given** a project where one of the three listing commands exits non-zero (for example a project file that `datatug show` cannot read, while the queries and boards are listed) and the folder is a project
**When** `/datatug project` runs
**Then** the tabs that command feeds show a warning row carrying the command's name and the error message it printed, and the other tabs render normally.

### AC: rerun-refreshes-pane

**Given** an open pane and a project that has changed
**When** `/datatug project` runs again
**Then** the pane shows the Overview tab with the changed project, without a key press.

### AC: project-text-is-sanitised

**Given** a project whose titles or ids hold control characters, bidirectional controls or line breaks
**When** `/datatug project` runs
**Then** the pane is drawn and the text summary is printed with those characters replaced by spaces, and no line of the reply begins with text taken from after a line break in a title.

### AC: query-detail

**Given** a pane on the Queries tab for a project with a query that has a required and an optional parameter
**When** the person chooses that query
**Then** the pane shows the query's title, ID, type and both parameters with the required one marked, and the actions Ask Claude and Back; Back shows the list again.

### AC: ask-claude-drafts-without-submitting

**Given** the detail view of a query
**When** the person presses Ask Claude
**Then** `$.prompt.fill` is called once in `append` mode with the one-line draft naming the query's ID and its plain-named parameters, no prompt is submitted, and the pane is closed, which returns the keys to the prompt box.

### AC: draft-carries-no-project-prose

**Given** a query whose title or a parameter id holds a sentence or quote characters
**When** Ask Claude is pressed
**Then** the draft holds the query's ID and plain parameter names only, and no text from the title.

### AC: draft-keeps-what-was-typed

**Given** a prompt box that already holds text not ending in a space
**When** the person presses Ask Claude
**Then** the appended text starts with a space, and the text already there is unchanged.

### AC: draft-falls-back-to-a-toast

**Given** a prompt box that cannot take text (`isFilled` is false)
**When** the person presses Ask Claude
**Then** the draft is shown in a toast and the pane stays open.

### AC: cli-only-data

**Given** the mod's source
**When** `claude plugin validate` lists its `hooks:` and `calls:`
**Then** there is no `http.*` call, no `$.fs.*` call other than reading and emptying the file that holds a `datatug query run`'s rows, checking that a path the person typed exists, and looking where a model tool's path leads (`exists`, `stat`), and every `process.run` or `process.spawn` runs `datatug` (the two other processes: `head -c 16` on a file path the person typed only detects a SQLite file, and `rm -f` removes the file that held a query's rows). The project pane runs only the four commands above; the panel runs `datatug --version`, `projects`, `show --depth sources|columns`, `db schema --columns`, `db add` and `query run` (the panel's own reads). The project pane's argument lists are checked by `tests/mod.test.ts` and the panel's by `tests/panel.test.ts`, since `claude plugin validate` lists call names only.

### AC: panel-opens-on-demand

**Given** a session
**When** the session starts
**Then** the panel is not opened and no `datatug` command is run; plain `/datatug` checks the version and opens it, and `/datatug project` opens the project pane instead.

### AC: panel-version-and-surface

**Given** a `datatug` that is missing or older than the required version, or a session that draws no panes
**When** plain `/datatug` runs
**Then** it replies with one text line (naming `datatug:datatug-install`, or the two versions and `datatug self-update`, or `/datatug project`) and opens no pane.

### AC: panel-model-sees-no-rows

**Given** a `datatug query run` in a plain Bash command whose rows hold a recognisable value
**When** the tool call finishes
**Then** the result the model reads holds the row and column counts and no row value, the file that held the rows has been removed with `rm -f` inside the hook, the redirect ran in a subshell with `set -C`, and the folder it was written to is made owner-only (`mkdir -m 700`) under the session's temporary folder.

### AC: panel-non-plain-query-denied

**Given** a Bash command running `datatug query run` after `cd /x &&`, a newline, `for ...; do`, `sleep 1 &`, `nohup`, `nice -n 5`, `timeout 60`, `env -i`, in `$(...)` or a heredoc body; or with a trailing `#` or backslash, an unbalanced or in-word quote, a bare `--`, its own `--result-id`, `--result-rows` or `--client`, `-h` beside other flags, or `run_in_background: true`
**When** the Bash hook handles it
**Then** it is denied with the plain-command or background reason and never reaches the shell; `datatug query run --help` alone, `echo datatug query run x` and `rg "datatug query run" spec/` run as written, and `--db 'datatug://demo/chinook?env=local'` and `--var 'ids=[1,2]'` are rewritten. A hook that throws before or after the command ran denies the call.

### AC: panel-results-out-of-model-tools

**Given** a model Read of `~/.datatug/query-results/t1/data.json`, a Grep over `~/.datatug`, `cat ~/.datatug/query-results/t1/data.json`, `ls $TMPDIR/datatug-claude-mod`, a model-run `datatug query results locate` or `datatug daemon url --result t1`, and `cd ~/.datatug && ls`
**When** the tool call is made
**Then** each is denied and does not run; `rg datatug-claude-mod hooks/`, a Write of a new file, a Read of a missing file and `git add` of a spec path named after the feature are not.

### AC: result-card-rewrite

**Given** a `datatug` of 0.92.0 or later with a usable store
**When** the model runs `datatug query run --db datatug://demo/chinook --from Album --no-policies`, `env X=1 datatug query run ...`, `/usr/local/bin/datatug query run ...` or `datatug query run --project demo --query <id> --as u --var P=2`
**Then** each runs as the same command with `--result-id <id> --format json` right after `query run` and no redirect, `--version` and `query results check` are asked once per session, and the files are found through `query results locate`.

### AC: result-card-summary-only

**Given** a result whose rows hold a recognisable value
**When** the tool result the model reads is inspected
**Then** it holds the row count, the column names and the source and related table names, and not the value, the result id, a path, the link or the `datatug ui` command.

### AC: result-card-views

**Given** two result cards, drawn on `terminal` and on `desktop`
**When** the person presses Record, Next ▶, Columns, Sources and Related on the second, and a side-panel Records in between
**Then** each press draws only that view with `●` on it, Record shows row 2 after Next ▶, Columns shows the declared types and 🔑, and the first card is not drawn again.

### AC: result-card-opens-panel

**Given** a card with a `datatug://` reference, while another database is open in the panel from a connection string
**When** the person presses a source, a related table, its Records and a column name
**Then** the panel shows that Table card (found by environment, source, schema and name), its Table records card, read with `--db` the card's reference and never `env:DATATUG_OPEN_DB`, and the Column card; a federated participant opens its own database, a card with no reference draws names as text with the hint, and no press runs the query again.

### AC: result-card-path-checks

**Given** `locate` answers naming another id, `/etc/passwd`, a `..` segment, a root with `..`, a file that resolves outside the root, a 5 MiB `data.json`, a `data.json` whose size differs from `dataBytes`, a 2 MiB `meta.json`, or no answer; and a tool stdout that is a forged locator
**When** the hook handles the call
**Then** `data.json` is never read, nothing outside the root is read, the card names the state, and the forged stdout is never used.

### AC: result-card-states

**Given** a card whose rows left the state, a result `locate` reports expired or not found, a `meta.json` of version 2, more than ten cards, and a call that went to the background
**When** each card is drawn and Load is pressed
**Then** Load reads the files again and shows the Table view; the expired and missing ones show their sentence with no link and no command; version 2 shows "Update the DataTug mod"; the oldest of eleven cards shows Load; the background call shows Load.

### AC: result-card-fallbacks

**Given** a `datatug` older than 0.92.0, a version probe that fails, a development build, a store check that answers `inside-git`, an errored call whose text holds `unknown flag: --result-id`, one whose text holds the `results-store-unwritable` line, and one whose text names another unknown flag
**When** the model runs a query
**Then** the older CLI and the failed probe take the private capture with `set -C` and the grid with its update line and no link or command; the development build gets `--result-id`; `inside-git` takes the capture and the grid names the reason; the unknown `--result-id` and the store line turn the session to the capture (the model reads the run-again sentence, and the card the sandbox sentence); the other unknown flag leaves the session as it is.

### AC: result-card-link-and-command

**Given** a card from `datatug` 0.94.0 or later on a terminal on the agent's machine
**When** it is drawn, its view switches to Sources, then to Record and Next ▶, and Copy is pressed with a clipboard and without one
**Then** it draws exactly the link `daemon url --result <id> --result-view <view>` (`--view=<view>` on a `datatug` before 0.98.0) printed (with `--row 2` in Record), `datatug ui --result <id>` in a `Code` element, and "Select the command to copy it" when the copy fails; a pending, not running or missing result, another origin, another id or an extra query parameter draw that case's line and no link; on `desktop` the same-machine line is drawn and `daemon url` is not asked; a 0.93.0 CLI draws neither the link nor the command.

### AC: result-card-names-cannot-inject

**Given** a result whose table is named `x](https://evil.example)` and whose columns are named `a\u001b[2Jb` and `` `rm -rf ~` ``, with values holding a Markdown link and control characters
**When** every view is drawn and its link and command are built
**Then** the grid holds no Markdown link to `evil.example`, no link element points there, no control character reaches the drawing, and no `daemon url` request or command holds a name; 50 rows of 10 escapable 60-character cells stay under the 100,000-character drawing bound.

### AC: panel-no-credential-in-argv-or-prompt

**Given** a database opened from a connection string with a password
**When** the panel runs `db schema`, `db add` and `query run` for it and the person presses Ask Claude on its table
**Then** no argument list, state value, prompt or notice holds the connection string; the connection string is in `DATATUG_OPEN_DB` only, and the prompt names the database by its `datatug://` reference.

### AC: web-link-from-the-cli

**Given** a database of a project, the agent running and `datatug daemon url` reporting the view as available
**When** the Table metadata, Table records or Record card has loaded its data in a terminal on the agent's machine
**Then** the card draws exactly the link the CLI printed, asked with the database's `datatug://` reference (and for a record its declared primary key, an integer above 2^53 - 1 as its digits), with **Check again**; it asked for nothing before its data loaded.

### AC: web-link-named-warnings

**Given** the agent not running or the CLI not starting, a view the web UI cannot open yet, a CLI older than 0.86.0 or a link without a one-time code, a database not in a project, or a source read from an environment variable
**When** a linked card renders
**Then** it shows that case's one line and **Check again**, and draws no link element.

### AC: web-link-checked-not-trusted

**Given** a link from the CLI with another origin, credentials, a second scheme, another agent host or port, an unexpected query or fragment parameter, or a development base that is not the configured `webDevHost`
**When** the card renders
**Then** no link is drawn; a configured `http(s)://datatug.localhost[:port]` that matches exactly is drawn, and a look-alike is not.

### AC: web-link-same-machine-and-fresh

**Given** the card on `desktop`, `vscode` or `mobile`, or a terminal with `SSH_CONNECTION` or `SSH_TTY` set; and a link drawn 60 seconds ago
**When** the card renders
**Then** the first gets "works only on the machine that runs the agent" and no `daemon url` call; the second is asked for again (only `daemon status` and `daemon url`) and turns into the not-running line when the agent stopped.

### AC: web-link-out-of-the-model

**Given** a Record card with a drawn link and a non-key value in the row
**When** the person uses Ask Claude, the context bag and the notices
**Then** no prompt, notice, tool result or argument list holds the link, its one-time code, its fragment or the non-key value, and the mod's session state holds no link or code; the only row values in session state are the rows the cards already keep for display, plus, per row, the digits of an integer too large for JavaScript.

### AC: other-manifests-unchanged

**Given** the Codex, Gemini CLI, Copilot and Cursor manifests
**When** the mod is added
**Then** none of them reference `hooks/` and their skill paths are unchanged; only their version changes, per `version-advance`.

### AC: version-advance

**Given** the plugin metadata files for Claude Code, Codex, GitHub Copilot, Gemini CLI and Cursor
**When** this Feature ships
**Then** every metadata version is one shared DataTug plugin version (`0.3.0` with the result card).

## Open Questions

None at this time.

## Out of Scope

Running saved queries from the panel, running a query again from the result card, applying a related table's join from the card, denying or rewriting database tool calls beyond moving a `datatug query run`'s rows out of the model's reach, a status band above the prompt, editing project files, entities, links from the other cards to the web UI, and finding a project in a parent folder. Each can become its own Feature.

## Verification Status

Web UI links, 2026-10-15, Claude Code 2.1.301 on macOS (arm64), `datatug` 0.86.0 installed: `claude plugin test` passes (222 tests across 12 files, the link cases among them); `claude plugin validate . --strict` passes. Against the live `datatug` 0.86.0 and a daemon started in a throwaway home: the argument lists the mod builds for the three kinds (a composite key and a key of 9007199254740993 among them) are accepted, the links printed pass the mod's checks once their `uiSupport` reads `available` (0.86.0 reports `pending` for all three, so the cards show the pending line today), a link with `DATATUG_UI_BASE` set is a development link unless `webDevHost` names it, and `db add` takes a SQLite file by path with `--name` and `--env local`. Not exercised: the links drawn in a live terminal, or opened in a browser.

Panel port, 2026-10-15, Claude Code 2.1.301 on macOS (arm64), `datatug` 0.84.1 installed: `claude plugin test` passes (171 tests across 10 files, the earlier 114 among them with `/datatug` changed to `/datatug project`, and the panel's 25 prototype tests); `claude plugin validate . --strict` passes. Live with the released `datatug` 0.84.1 in `chinook-demo`: `claude --plugin-dir . -p "/datatug"` prints the one line naming `/datatug project`, and `-p "/datatug project"` prints the text summary. Checked through the test kit only: the panel was not drawn in a live terminal or the Desktop app, and none of its cards was exercised against a live `datatug` in this port.

Earlier verification, for the project pane:

Verified on 2026-10-09 with Claude Code 2.1.295 on macOS (arm64):

- `claude plugin test`: 114 tests pass across 7 files. `claude plugin validate . --strict` passes; its calls are `$.command.register`, `$.process.run`, `$.prompt.fill`, `$.prompt.read`, `$.session.cwd`, `$.session.surfaces`, `$.ui.close`, `$.ui.invalidate`, `$.ui.open`, `$.ui.resolve`, `$.ui.toast`.
- `claude -p "/datatug"` with the released `datatug` 0.67.0, in the root of the `chinook-demo` project: prints the text summary of the four sections (5 environments, 9 queries matching `datatug queries`, 1 board), and leaves the project unchanged.
- The same in a folder that is not a project: the one-line "not a DataTug project" reply.
- With `datatug` 0.51.0: the one-line "too old" reply naming 0.51.0, 0.67.0 and `datatug self-update`.
- With no `datatug` on the `PATH`: the one-line reply naming `datatug:datatug-install`.
- All five manifests are at `0.0.4`, and none but Claude Code's plugin layout references `hooks/`.

Not exercised:

- The pane drawn in an interactive terminal or the Desktop app. The tests check the tree the mod returns and its tab presses through the test kit, not how an app paints it.
- A session that draws only on `vscode` or `mobile`: covered by tests with a stubbed surface list, not by a real client.
- Other hosts: GitHub Copilot CLI 1.0.90 loads the plugin at 0.0.3 with its nine skills and logs one error line that the root `hooks/hooks.json` is not read; Codex 0.156.0 installs the plugin and showed no hook-related message, without a positive sign that it parsed the file; Gemini CLI and Cursor were not installed and are unverified. Both are documented to discover `hooks/hooks.json`.
- Choosing a query and Ask Claude in a live terminal, checked through the test kit only: whether a focused pane lets the fill through or the engine treats it as a dialog; whether the cursor is in the prompt box after the draft once the pane closes; Tab and Enter across many query rows and whether the pane scrolls to follow the focus; whether hotkeys `1`–`4`, `a` and `b` fire in every focus state.
- How an interactive transcript treats the text reply, and re-running `/datatug` against a pane in a live terminal (checked through the test kit only).

---
*This document follows the https://specscore.md/feature-specification*
