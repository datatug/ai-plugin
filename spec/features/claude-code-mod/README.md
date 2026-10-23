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
- **Views.** Five plain Buttons, `● Table ○ Record ○ Columns ○ Sources ○ Related`. Table: a grid of Boxes and plain Text (values never Markdown, a web address in a value broken so no terminal links it), the row number a Button that opens the row in Record (no link, no placeholder address), 20 rows, "Show 30 more" up to 50, then `◀ Prev 50` / `Next 50 ▶`, at most 10 columns with a note; a row number opens it in Record. Record: type, name and value per column in the column order, `◀ Prev` / `Next ▶`, "Row i of N"; a foreign-key value opens the referenced record in the panel's Record card. Columns: #, name, type, declared type, nullable, key (🔑 and its position in a composite key) and source (`relation.column`), "computed" for a column with no source. Sources: #, `schema.relation` (`main` is not shown), kind, alias, role, the join's `a.x = b.y` pairs and **Records**. Related: #, target, kind, `→ references` or `← referenced by`, cardinality, `From.f = Target.g` and **Records**; every candidate the metadata lists is shown, with no permission filtering. An `unavailable` reason is one dim line: "Sources are not known for a native SQL query", "No related tables found", "The schema of this database could not be read". `$key` is hidden when the primary key is known.
- **Side panel.** A table or column name opens the panel's Table or Column card, found in the schema of the reference's project by environment, source, schema and name together (never by name alone; the panel selects that project and loads its schema first). **Records** and the foreign-key hop read through the result's `datatug://<project>/<db>` reference passed explicitly as `--db`, never the database opened in the panel; a participant of a federated query uses its own reference. A result whose database is in no project draws names as text with "Add this database to a project to open its tables". A press opens a card only: it never runs the model's query again or starts a turn.
- **Open elsewhere.** With a `datatug` of at least the open-elsewhere minimum (0.94.0, the first with `datatug ui --result` and `datatug daemon url --result`), a card of a complete result also draws an "Open in DataTug" line ("Open row in DataTug" in Record, asked with `--row <n>`, 1-based, from the same pipeline) with **Check again** on a row of its own, and below it, after a blank line, the labelled section "Open these records in the DataTug terminal UI" with the command `datatug ui --result <id>` in a `Code` element inside a dim frame and **Copy** under it (`$.ui.copy`; "Select the command to copy it" in a toast when the surface cannot copy). The command is drawn only for an id of `[A-Za-z0-9_-]`, so it needs no quoting, and holds no path, address, name or value. The link is asked with `datatug daemon url --result <id> --result-view <current view> [--row <n> in the Record view] --format json` (`--result-view` from 0.98.0, the first release that has it; an older `datatug`, or a version the mod cannot read, gets `--view=<current view>`) and follows the Web UI link rules below (same machine only, freshness, **Check again**, the named warnings), plus "DataTug has no saved result for this call, so there is no web link" when `resultExists` is false; the re-check admits exactly `<store>result/<id>`, a `view` of the five views, an optional `row` and a `code` fragment. Until the web UI serves results, the CLI reports `uiSupport: pending` and the line says the web UI cannot open this view yet.
- **Header.** The card opens with one line from `meta.json` only: the tables it reads (`schema.relation`, `main` not shown, at most three and "and N more"), or "Saved query <id>" for a saved query, or "SQL query" when the sources are unknown for native SQL; then `<source> (<env>)` of the database when it is in a project; then "N rows x M columns" ("N rows (at least N+1)" when more exist), then the dim "(shown to you, not to Claude)". It is plain Text with web addresses broken, and holds no value, path or result id. "Open in DataTug" (or the line saying why there is none) is on the same row at the right (the row wraps, and the panel stacks it when the line and the link do not fit); **Check again** is beside it, or beside the "Columns 1-10 of N" note in a Table view that has one.
- **Wide tables.** The Table view shows ten columns at a time out of any number of them (one included): a dim "Columns 1-10 of 13" note (or "Column 21 of 21" for a last window of one) with **◀ columns** and **columns ▶** Buttons (only the direction that has columns left) moves the window by ten; the window is per card (`CardState.colPage`) and a reloaded card starts on the first. Sort, **Copy CSV** and **Copy JSON** work on all columns, whichever show. There are no arrow-key shortcuts: the engine documents a Button `hotkey` of one digit or lowercase letter only, so the Tab and arrow focus walk and Enter move the window. In the panel, when `bodyColumns` (the documented width of the box a pane draws into) is under 60 and the person has not picked a view (`CardState.picked`), the card draws the Record view instead of the Table; any view button, or a row number, is a pick, and the stored view and the Open in DataTug link are not changed by the default. A Table cell whose text the grid cuts is a plain Button (every non-empty cell when the columns would not fit the panel's `bodyColumns`, or 120 columns where none is given, since the Boxes shrink and any text may be cut on screen; its label is cut by the mod and held to one line by a one-row Box with `overflow` hidden, because a Button's text wraps): a press opens that value in full in a dim round-bordered block under the grid (header "<column> · row <n>", the text wrapped, at most 4000 characters, web addresses broken as in the grid) with **Copy** (`$.ui.copy` of the raw value, a toast "Copied the value" or "Could not copy the value; this surface has no clipboard") and **Close**. The open cell is a row place and a column name in `CardState.cell`, never a copy of the value; no log, notice, toast, tool result or prompt holds the value.
- **Result history.** The panel's Latest result keeps the newest five results that hold rows (the same per-card state and the ten-card bound; no new rows are kept). With two or more it draws a row `◀ 2/5 ▶` and the result's title (the header's first part) above the card; **◀** and **▶** select an older or newer result and stop at the ends. The newest is selected when a result arrives (also one loaded again, which brings back one the person closed). **✕** (key x) closes only the shown result and shows its neighbour; the closed ones are kept as a short list of card keys (`latestClosed`) and the transcript cards are untouched.
- **Prompt handoff.** A `prompt.submit` hook keeps the latest prompt the person wrote (origin `composer`, `bridge`, `sdk`, or a plugin's `asUser`; a notification, peer, schedule or other plugin's message is ignored) in session state (`lastPrompt`), trimmed and cut to 16384 characters, and passes the prompt on unchanged. After a result card loads (state `ready`) for the model's own Bash call, the mod runs `datatug query results annotate --id <id> --prompt-stdin` through `$.process.run` with the text as `stdin`, once per result id, not waited for by the tool result or the card. It runs only when the CLI is at least `ANNOTATE_MIN_CLI_VERSION` (a version that cannot be read is a development build and counts as new). The constant is `0.101.0`, the first release with the command (datatug-cli#431). A failure, a timeout, a missing command or no prompt is silent and not retried; the CLI's answer is not read. The prompt is never in an argument, the environment, a log, a toast, a notice, the tool result or the card, and persists in the result's `meta.json` for the retention period (a secret typed into a prompt is stored there).
- **More rows.** A result that is a plain table read gets **Rows ○ 10 ○ 50 ○ 100 ○ 500** Buttons on the row of **Copy CSV** and **Copy JSON** (the shown count `●`; none before a press), in the transcript card and the panel card alike (one member). They appear only when `meta.json` says `query.kind` is `from`, `query.policy` is `none` (a replay with `--no-policies` of a policy-governed read would widen access), `query.dbRef` is a `datatug://<project>/<db>[?env=<env>]` reference (`isRef`), `query.text` holds no `offset`, `query.from` is a plain table name (`^[A-Za-z0-9_][A-Za-z0-9_.$-]*$`, at most 128 characters, so never a flag, a path or a name needing quotes) and the derived result id fits 128 characters; otherwise a dim line names the reason ("Rows buttons need a table read without policies", "... this result is a saved query", and so on) and says no value. The CLI takes `--limit` and `--offset` only with `--from`, which is why a saved or TugQL query has no buttons. A press runs, through `$.process.run` with a fixed argument list (no shell, `DATATUG_CLIENT` the only environment) and never through the model, `datatug query run --db=<dbRef> --from=<table> --limit=<N> --no-policies --result-id <first id>-r<N> --format json`, then shows that result in the same card by the ordinary `loadCard` path (header, "First N of M columns", views and the ten-card bound all follow the new `meta.json`). `CardState` keeps `id` (shown), `base` (the first result's id), `rows` (the pressed count) and `more` (loading or a path-free error). One run per card at a time; while it runs the counts are dim text and the card says "Reading N rows…"; pressing the shown count does nothing. `result-id-in-use` means that size was read before: it is loaded, not run again. A result loaded must be the same table, database and plain policy, or it is refused and the shown result stays. **Original** returns to the first result. A new result is stored with the first result's prompt (kept in a bounded in-memory map, sent on standard input as for the handoff above; never the latest prompt, never an argument). Nothing is logged, toasted or told to Claude, and the model-facing summary is unchanged.
- **Notice once.** The dim transcript line that says where the card is (`$.ui.log`) is written for the first card of a session only, tracked in session state (`noticeShown`); later cards draw without it. The panel is still opened for each result.
- **Sort.** In the Table view a column header is a Button (key `sort` + column index). A press sorts the rows loaded in the card (at most 2000, paged after sorting) ascending, again descending, a third time clears; `▲`/`▼` on the header; per card (`CardState.sort`), stable, numbers by value (integers beyond 2^53 exactly), other values by letters, nulls last either way. It orders a list of indices: stored rows are not changed or fetched again, and a row number opens that row of the loaded order in Record.
- **Copy rows.** **Copy CSV** and **Copy JSON** (every view, inline and panel) call `$.ui.copy` with the loaded rows, all columns in the card's column order, in the sort order shown. CSV: a header row, RFC 4180 quoting; JSON: an array of objects keyed by column name, numbers exact. Values are raw (no prefix against spreadsheet formulas; the README says so). A toast names the row count, or says the surface cannot copy. The text goes to `$.ui.copy` and nowhere else: no log, notice, toast, tool result or prompt.
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

### AC: result-card-visible-in-terminal

**Given** a `datatug query run` call whose row the engine would fold into a count line ("Ran 1 shell command"), or whose card state changes from loading to ready after the row was first drawn while the call ran
**When** the result card loads
**Then** a tool group holding that call is drawn expanded (`ToolGroup` `isExpanded`), so the `ToolUse` row and the card under it are drawn; a row drawn while the call runs shows "Loading result..." and the card replaces it in place; the newest result card is also drawn in the DataTug panel as "Latest result" (after the context bag; opened without focus; views on keys 1-5, the same card state as the row); and one constant transcript line (`$.ui.log`, no path, id, row or command) says the result is in the card above, that ctrl+x tab focuses the panel (or `/datatug` when the panel cannot be placed), and that ctrl+o expands folded tool calls. A group of other calls stays as the engine draws it.

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

### AC: result-card-polish

**Given** a result card from `datatug` 0.94.0 or later
**When** it is drawn in the transcript and in the panel, a row number is pressed, and the panel's close button is pressed
**Then** the transcript card is a `round`-bordered Box with `paddingX` 1 and a blank line above and below it, with no second frame in the panel; no element carries an invalid placeholder address, the row number is a Button that opens the Record view, and the Record view draws "Open row in DataTug" from the result link request with the Record view and `--row <n>` (1-based); the link and **Check again** are on a row of their own, and the terminal command is a labelled section with a dim frame and **Copy** under it; the Bash row of a call with a card draws "DataTug query ran; the result card is below." in place of the sentence Claude reads (the model still reads its sentence, which no longer invites it to ask for rows); the panel orders Project, Context bag, Latest result, then the optional cards, with a horizontal rule between sections; and **✕** (key x, drawn `[ ✕ ]` without a hotkey prefix) removes Latest result until a newer result arrives, without touching the transcript card.

### AC: result-card-header-sort-copy

**Given** a result card of a Customer query with the database `chinook` in the `local` environment, and a second query
**When** the card is drawn inline and in the panel, a column header is pressed three times, **Copy CSV** and **Copy JSON** are pressed (with a clipboard and without one), and the second query runs
**Then** the header reads "Customer · chinook (local) · 10 rows x 13 columns (shown to you, not to Claude)" with "Open in DataTug" on its row at the right and **Check again** beside it (beside the columns note when the Table view has one); the header press sorts ascending (▲), descending (▼) and clears, numbers by value and nulls last, without running the query or changing the stored rows; the clipboard takes the header row and the loaded rows in the shown order as CSV (quoted) and as a JSON array of objects, raw, or a toast says it could not copy; the transcript notice is written once, for the first card; the view buttons and the close control have no "1:" or "x:" hint prefix; and no log, notice, toast, summary or tool result the model reads holds a value.

### AC: result-card-wide-and-history

**Given** a result of 13 columns, one of 1 column, one of 20, one of more than 100, a long text value that holds a web address, a panel 50 columns wide, and six results run in a session
**When** the column buttons, a cut cell, Copy and the history buttons are pressed
**Then** the Table view shows "Columns 1-10 of 13", then "Columns 11-13 of 13", and back; one or ten columns show no window controls; 20 columns end on "Columns 11-20 of 20" with no next button; more than 100 page to the last column; sort and Copy CSV/JSON still cover every column; the 50-column panel draws the Record view until a view is picked and the 60-column one the Table; a cut cell opens its whole value as text with the address broken, **Copy** sends the raw value to the clipboard alone, **Close** hides it; the panel shows `◀ 5/5 ▶` and the title of the newest of the last five, steps with the buttons, selects the newest when a result arrives, and **✕** removes only the shown one while every transcript card stays; and no log, toast, notice, summary, command or tool result holds a value.

### AC: result-card-names-cannot-inject

**Given** a result whose table is named `x](https://evil.example)` and whose columns are named `a\u001b[2Jb` and `` `rm -rf ~` ``, with values holding a Markdown link and control characters
**When** every view is drawn and its link and command are built
**Then** the grid is plain Text (no Markdown element), holds no address to `evil.example` that a terminal would link, no link element points there, no control character reaches the drawing, and no `daemon url` request or command holds a name; 50 rows of 10 escapable 60-character cells stay under the drawing bound (400,000 characters of drawn tree for the 50 rows).

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

### AC: bag-prompt-one-call

**Given** a context bag whose table, column or value items came from a database of the project
**When** the person presses Ask Claude
**Then** each item line names its database as a `datatug://<project>/<db>?env=<ENV>` reference (for an item that has none, resolved when the draft is built, so an item bagged by an older version is upgraded too: the open database, else the project's only database, else, when the project has several, its one `local` source, marked "default: local"; never a production one by default; "database not recorded" only when still ambiguous), and the draft states the one command to run (`datatug query run --db '<ref>' --from <table> --limit <N> --no-policies`), that `--db` is never combined with `--project`, that no connection string or store is looked for, that "top N" means the first N rows, that the rows appear in the card and not to Claude, and that the reply is one line saying so (no offer to read, list or paste rows); the draft ends after the instruction block with no "My question:" label, and the person types their question next; no connection string or credential is ever written into it; and the Bash refusal for the store names the same command.

### AC: prompt-handoff

**Given** a person who submitted a prompt and a `datatug` new enough to have `query results annotate`
**When** the model's `datatug query run` produces a result card
**Then** the mod runs `datatug query results annotate --id <result id> --prompt-stdin` once, with the prompt text only on standard input and `DATATUG_CLIENT` the only environment; a later model turn without a new prompt reuses the last one; no prompt is sent for a CLI older than the minimum, for a notification or peer message, or when none was seen; a CLI that lacks the command, a failure or a timeout leaves no line, toast or change to the card and the model's summary, and is not retried; and the prompt is in no argument list, log, toast, notice, tool result or card, while the README tells the person that it persists in the local result store and that a secret typed into a prompt would persist there.

### AC: result-card-more-rows

**Given** a result card of `--from Album --limit 3 --no-policies` on a project database, one of a saved query, one of a TugQL query, one read under a policy, one from an offset, one of a table named `-x`, and a CLI that writes the result of the id it is given
**When** the card is drawn, **50** is pressed twice at once and once more after it finishes, **Original** and **50** are pressed again, and the CLI answers `result-id-in-use` or a store failure
**Then** the first card draws **Rows ○ 10 ○ 50 ○ 100 ○ 500** under the view switcher beside **Copy CSV** and **Copy JSON**, and the others draw no count and one dim line naming why (saved query, TugQL, policies, offset, plain table name); the press runs exactly `datatug query run --db=<dbRef> --from=Album --limit=50 --no-policies --result-id <id>-r50 --format json` once, with no shell syntax and `DATATUG_CLIENT` the only environment, while the counts are dim text and "Reading 50 rows…" shows; the card then shows `● 50`, a header with the new row count and the new result's columns, and **Original**; **Original** shows the first result again; **50** again loads the stored result without a second write; a store failure or a CLI that cannot start leaves the shown result and says so without a path; the new result is annotated with the first result's prompt on standard input (not the latest prompt, not an argument); and the model-facing summary and tool result are unchanged, with no log, toast or text for the model.

### AC: other-manifests-unchanged

**Given** the Codex, Gemini CLI, Copilot and Cursor manifests
**When** the mod is added
**Then** none of them reference `hooks/` and their skill paths are unchanged; only their version changes, per `version-advance`.

### AC: version-advance

**Given** the plugin metadata files for Claude Code, Codex, GitHub Copilot, Gemini CLI and Cursor
**When** this Feature ships
**Then** every metadata version is one shared DataTug plugin version (`0.3.9` with More rows).

## Open Questions

None at this time.

## Out of Scope

Running saved queries from the panel, running a saved or TugQL query again from the result card (only a plain table read has More rows), applying a related table's join from the card, denying or rewriting database tool calls beyond moving a `datatug query run`'s rows out of the model's reach, a status band above the prompt, editing project files, entities, links from the other cards to the web UI, and finding a project in a parent folder. Each can become its own Feature.

## Verification Status

Prompt handoff, 2026-10-16, Claude Code 2.1.301 on macOS (arm64), `datatug` built from datatug-cli at 1423e765 (datatug-cli#431, identical to the v0.101.0 tag): live `claude -p` and a pty terminal session with the plugin loaded and a throwaway HOME; after a question the result's `meta.json` held a `prompt` object (`text`, `truncated`, `at`) whose byte length equals the submitted text (checked by key names and length only, no value printed), the card drew at once, and the daemon the run started was stopped. Not exercised: the released v0.101.0 binary itself, a prompt over 8 KiB live.

Web UI links, 2026-10-15, Claude Code 2.1.301 on macOS (arm64), `datatug` 0.86.0 installed: `claude plugin test` passes (222 tests across 12 files, the link cases among them); `claude plugin validate . --strict` passes. Against the live `datatug` 0.86.0 and a daemon started in a throwaway home: the argument lists the mod builds for the three kinds (a composite key and a key of 9007199254740993 among them) are accepted, the links printed pass the mod's checks once their `uiSupport` reads `available` (0.86.0 reports `pending` for all three, so the cards show the pending line today), a link with `DATATUG_UI_BASE` set is a development link unless `webDevHost` names it, and `db add` takes a SQLite file by path with `--name` and `--env local`. - Result card visible in the terminal, 2026-10-16, Claude Code 2.1.301 on macOS (arm64), `datatug` 0.100.0, plugin 0.3.3: `claude plugin test` passes (294 tests across 16 files; the new cases mount a `ToolGroup`, mount a row while the call runs and then run the call, and read the logged line); `claude plugin validate . --strict` passes. Live (160 columns): one interactive session in a pty (`claude --plugin-dir <this folder>`, started in an already-trusted folder, `datatug` run through a throwaway-home shim), prompt asking for the top 5 rows of a table: the Bash row, the five-view card with its rows, and the one-line DataTug notice appeared in the transcript, the panel opened by itself with a "Latest result" card, and after ctrl+x, Tab and the key 3 both the panel card and the transcript row switched to Columns. Not established: that the engine folds this call into "Ran 1 shell command" in a person's terminal (it did not fold in that run, and the ToolGroup hook was not seen in the debug log), so the cause of the missing card in 0.3.1 is not confirmed and the same run on 0.3.1 was not made; whether the `ToolGroup` unfold works live is covered by the test kit only. - Card header, sort and copy, 2026-10-16, Claude Code 2.1.301 on macOS (arm64), `datatug` 0.100.0, plugin 0.3.6: `claude plugin test` passes (322 tests across 17 files). Live in a pty (150 columns, throwaway-home shim): the header line, the notice once (a second query left none), the panel without digit hints, `[ ✕ ]` closing on the key x, Tab and Enter moving between the views, Enter on a column header drawing ▲, ▼ and clearing, and Enter on Copy CSV raising the "Copied 10 rows as CSV" toast. Not established: the clipboard text itself (the pty has no clipboard reader), mouse clicks, and the link on the header row beside the title (the pty draws the link's address in full, so it wrapped below the header there; a terminal that draws a hyperlink as its label was not tried).

Not exercised: the links drawn in a live terminal, or opened in a browser.

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
