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

The CLI resolves a project at the root of the working directory only, so `/datatug` shows a project when the session runs in the project's root folder. It does not search parent folders.

The project pane is read-only towards the project: it does not run queries, guard tool calls, edit project files, or read them. The panel reads tables and, on a person's press, registers an opened database as a source of the selected project through `datatug db add`, which writes through the CLI and never reads or writes a project file itself. Neither submits a prompt.

Running `/datatug` again reloads the project and redraws an open pane. Text that comes from the project or from the CLI (titles, ids, types, drivers, error messages) is shown with control characters, bidirectional controls and line breaks replaced by spaces and long values cut short, so a project file cannot blank the pane, act on the terminal or forge a line of the reply. Each tab shows at most 200 rows and says how many more there are. The mod runs the `datatug` found first on the `PATH`.

### Picking a query

On the Queries tab each query is a row that can be chosen with the keyboard. Choosing one opens that query's detail view in the pane: its title, its ID, its type and its parameters (each with its type, and marked when required), over a row of actions. **Ask Claude** puts a request to run the query into the prompt box as a draft and does not submit it, so the person can add details before sending. **Back** returns to the list. The action row is where running a query inside the pane will be added; this Feature does not run queries.

The draft is one line: `Run the saved DataTug query <id>`, followed by ` with <P>=` for each required parameter joined by `, `, and ` (optional: <P>, <P>)` when there are optional ones. It carries no title and no other text from the project: only the query's ID and parameter names, and only plain names (letters, digits, `_`, `.` and `-`, up to 64 characters, not starting with `.` or `-`). A parameter whose id is not plain is shown in the detail view and left out of the draft. A query whose ID is not made of plain names (at most 16 segments, 200 characters in all) cannot be drafted: its detail view says so in place of the Ask Claude button, and Back stays. The draft names at most 10 required and 10 optional parameters and counts the rest (` (+N more required)`, `, +N more`), and is at most 500 characters. The detail view shows at most 20 parameters and then a count of the rest, below the actions, so the actions are always on screen. Queries beyond the 200-row cap cannot be chosen. It is appended to whatever the box already holds, after a space when that text does not end in one. When the box cannot take it (a dialog holds the keys, or the session has no box), the draft is shown in a toast instead. After the box takes it, the pane closes, which gives the keys back to the prompt box; `/datatug` opens it again.

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

### Connection strings

A database opened by a connection string or a file path is handed to the CLI in the environment variable `DATATUG_OPEN_DB` and named `env:DATATUG_OPEN_DB` in the argument list. Its connection string is never in an argument list, a prompt, a notice, a link or session state when it carries credentials or a query. A database the project holds is addressed by its reference `datatug://<project>/<db>[?env=<ENV>]`, which carries no credential.

### What the model sees

A `datatug query run` the model issues in one plain Bash command (no pipe, redirect or other shell syntax) has its rows written to a file in an owner-only folder under the temporary folder, read by the mod, and emptied (also when it cannot be read or the call fails; a session killed mid-call can leave the file); the result the model reads is a summary of the shape (row and column counts and column names) and a line saying the rows were shown to the person and withheld. The rows appear in the chat as a grid under the call, and a row number opens its Record card. The prompts the panel drafts name a database only by its `datatug://` reference. The one place values enter a prompt is the context bag: a value the person added to the bag and checked is written into the **Ask Claude...** draft because the person chose it.

### Journey

1. A user installs the plugin and runs `/datatug project` in a DataTug project. **Observable good result:** a pane opens with the four tabs populated from the CLI's output.
2. The user runs `/datatug project` in a folder that is not a project. **Observable good result:** a one-line text reply says so, and no pane opens.
3. The `datatug` CLI is not installed, or is older than the mod needs (0.84.1: `datatug://` references, `db add`, `db schema --columns` and `--client`). **Observable good result:** a one-line text reply names the problem and the remedy (`datatug:datatug-install`, or `datatug self-update` with the version needed), and no pane opens.
4. The user runs `/datatug project` where nothing can draw (VS Code chat panel, `claude -p`). **Observable good result:** the command replies with a plain-text summary of the same four sections.
5. The user runs `/datatug`. **Observable good result:** the panel opens with the Project card and the Databases card; opening a database lists its tables, and pressing a table shows its metadata and offers its records.

## Acceptance Criteria

### AC: pane-tabs

**Given** a DataTug project and a `datatug` CLI of the required version
**When** `/datatug` runs in the project's root folder in a session that can draw
**Then** a pane shows the Overview, Environments, Queries and Boards tabs populated from the CLI's JSON output.

### AC: not-a-project

**Given** a working directory for which `datatug show` exits `3`
**When** `/datatug` runs
**Then** it replies with one text line saying the folder is not a DataTug project and opens no pane.

### AC: cli-missing

**Given** no `datatug` executable can be started
**When** `/datatug` runs
**Then** it replies with one text line that names the `datatug:datatug-install` skill and opens no pane.

### AC: cli-too-old

**Given** a `datatug` whose version is lower than the required version
**When** `/datatug project` or `/datatug` runs
**Then** it replies with one text line giving the version found, the version needed and `datatug self-update`, runs no other command, and opens no pane.

### AC: text-fallback

**Given** a session that draws on no surface that shows panes (`$.session.surfaces()` names neither `terminal` nor `desktop`; a `claude -p` run names none)
**When** `/datatug` runs
**Then** it replies with a plain-text summary of the four sections, and opens no pane.

### AC: failed-command-isolated

**Given** a project where one of the three listing commands exits non-zero (for example a project file that `datatug show` cannot read, while the queries and boards are listed) and the folder is a project
**When** `/datatug` runs
**Then** the tabs that command feeds show a warning row carrying the command's name and the error message it printed, and the other tabs render normally.

### AC: rerun-refreshes-pane

**Given** an open pane and a project that has changed
**When** `/datatug` runs again
**Then** the pane shows the Overview tab with the changed project, without a key press.

### AC: project-text-is-sanitised

**Given** a project whose titles or ids hold control characters, bidirectional controls or line breaks
**When** `/datatug` runs
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
**Then** there is no `http.*` call, no `$.fs.*` call other than reading and emptying the file that holds a `datatug query run`'s rows and checking that a path the person typed exists, and every `process.run` or `process.spawn` runs `datatug` (the one other process, `head -c 16` on a file path the person typed, only detects a SQLite file). The project pane runs only the four commands above; the panel runs `datatug --version`, `projects`, `show --depth sources|columns`, `db schema --columns`, `db add` and `query run` (the panel's own reads). The project pane's argument lists are checked by `tests/mod.test.ts` and the panel's by `tests/panel.test.ts`, since `claude plugin validate` lists call names only.

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
**Then** the result the model reads holds the row and column counts and no row value, the file that held the rows has been emptied, and the folder it was written to is made owner-only (`mkdir -m 700`) under the session's temporary folder.

### AC: panel-no-credential-in-argv-or-prompt

**Given** a database opened from a connection string with a password
**When** the panel runs `db schema`, `db add` and `query run` for it and the person presses Ask Claude on its table
**Then** no argument list, state value, prompt or notice holds the connection string; the connection string is in `DATATUG_OPEN_DB` only, and the prompt names the database by its `datatug://` reference.

### AC: other-manifests-unchanged

**Given** the Codex, Gemini CLI, Copilot and Cursor manifests
**When** the mod is added
**Then** none of them reference `hooks/` and their skill paths are unchanged; only their version changes, per `version-advance`.

### AC: version-advance

**Given** the plugin metadata files for Claude Code, Codex, GitHub Copilot, Gemini CLI and Cursor
**When** this Feature ships
**Then** every metadata version is one shared DataTug plugin version (`0.1.0` with the panel).

## Open Questions

None at this time.

## Out of Scope

Running saved queries, denying or rewriting database tool calls beyond moving a `datatug query run`'s rows out of the model's reach, a status band above the prompt, editing project files, entities, links to the web UI, and finding a project in a parent folder. Each can become its own Feature.

## Verification Status

Panel port, 2026-10-15, Claude Code 2.1.301 on macOS (arm64), `datatug` 0.84.1 installed: `claude plugin test` passes (167 tests across 10 files, the earlier 114 among them with `/datatug` changed to `/datatug project`, and the panel's 25 prototype tests); `claude plugin validate . --strict` passes. Live with the released `datatug` 0.84.1 in `chinook-demo`: `claude --plugin-dir . -p "/datatug"` prints the one line naming `/datatug project`, and `-p "/datatug project"` prints the text summary. Checked through the test kit only: the panel was not drawn in a live terminal or the Desktop app, and none of its cards was exercised against a live `datatug` in this port.

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
