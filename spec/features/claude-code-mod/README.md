---
format: https://specscore.md/feature-specification
status: Implementing
---

# Feature: Claude Code Project Pane Mod

> [SpecScore.**Studio**](https://specscore.studio): | [Explore](https://specscore.studio/app/github.com/datatug/ai-plugin/spec/features/claude-code-mod?op=explore) | [Edit](https://specscore.studio/app/github.com/datatug/ai-plugin/spec/features/claude-code-mod?op=edit) | [Ask question](https://specscore.studio/app/github.com/datatug/ai-plugin/spec/features/claude-code-mod?op=ask) | [Request change](https://specscore.studio/app/github.com/datatug/ai-plugin/spec/features/claude-code-mod?op=request-change) |
**Status:** Implementing
**Source Ideas:** —

## Summary

A [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview) shipped inside this plugin that adds a `/datatug` command and a read-only pane beside the transcript showing the DataTug project in the working directory: overview, environments with their sources, queries, and boards. Every fact it shows comes from the `datatug` CLI; the mod parses no project file itself.

## Problem

The plugin's skills teach Claude how to drive the `datatug` CLI, but the user has no at-a-glance view of the DataTug project Claude is working in. They must ask Claude or open the Web UI to see which environments, queries and boards exist. A mod runs inside Claude Code and can draw that view without a Claude turn.

Reading the project's files directly would make the mod a second reader of the project layout, free to disagree with the CLI, `serve` and chat. The CLI is the one reader, so the mod asks it.

## Behavior

The mod lives in this repository next to the skills (`hooks/hooks.json`, `hooks/register.js`, and pure helpers under `lib/`) and is installed by the existing `datatug` plugin. Only Claude Code loads it; the Codex, Gemini CLI, Copilot and Cursor manifests do not reference it, though all five advance together from plugin `0.0.2` to `0.0.3`.

`/datatug` runs the `datatug` CLI in the session's working directory and draws the result as a pane with four tabs:

- **Overview**: project title, id, access, and counts.
- **Environments**: each environment with its sources, each source with its driver and its number of tables and views (or `not scanned`).
- **Queries**: the saved queries as a folder tree, with title and type.
- **Boards**: each board's id and title.

### Commands it runs

The mod runs exactly these, each read-only, with no shell:

| Command | Feeds |
| :- | :- |
| `datatug --version` | The version check |
| `datatug show --format json --depth tables` | Overview, Environments |
| `datatug queries --format json` | Queries |
| `datatug board list --format json` | Boards |

These are specified in `datatug/datatug-cli` (`spec/features/cli/show`, `spec/features/cli/queries`, `spec/features/cli/board`). The mod requires the first `datatug` release that carries all three; that version is recorded as one constant in the mod and stated in this repository's README.

The CLI resolves a project at the root of the working directory only, so `/datatug` shows a project when the session runs in the project's root folder. It does not search parent folders.

The mod is read-only. It does not run queries, guard tool calls, edit project files, or read them.

Running `/datatug` again reloads the project and redraws an open pane. Text that comes from the project or from the CLI (titles, ids, types, drivers, error messages) is shown with control characters, bidirectional controls and line breaks replaced by spaces and long values cut short, so a project file cannot blank the pane, act on the terminal or forge a line of the reply. Each tab shows at most 200 rows and says how many more there are. The mod runs the `datatug` found first on the `PATH`.

### Journey

1. A user installs the plugin and runs `/datatug` in a DataTug project. **Observable good result:** a pane opens with the four tabs populated from the CLI's output.
2. The user runs `/datatug` in a folder that is not a project. **Observable good result:** a one-line text reply says so, and no pane opens.
3. The `datatug` CLI is not installed, or is older than the mod needs. **Observable good result:** a one-line text reply names the problem and the remedy (`datatug:datatug-install`, or `datatug self-update` with the version needed), and no pane opens.
4. The user runs `/datatug` where nothing can draw (VS Code chat panel, `claude -p`). **Observable good result:** the command replies with a plain-text summary of the same four sections.

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
**When** `/datatug` runs
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

### AC: cli-only-data

**Given** the mod's source
**When** `claude plugin validate` lists its `hooks:` and `calls:`
**Then** the calls are limited to `$.process.run`, `$.session.cwd`, `$.session.surfaces`, `$.command.register` and `$.ui.*`: no `fs.*`, `http.*` or `process.spawn` call; and every `$.process.run` argument list starts with `datatug` followed by one of the four commands above. The argument lists are checked by the mod's tests (`tests/mod.test.ts`), since `claude plugin validate` lists call names only.

### AC: other-manifests-unchanged

**Given** the Codex, Gemini CLI, Copilot and Cursor manifests
**When** the mod is added
**Then** none of them reference `hooks/` and their skill paths are unchanged; only their version changes, per `version-advance`.

### AC: version-advance

**Given** the plugin metadata files for Claude Code, Codex, GitHub Copilot, Gemini CLI and Cursor
**When** this Feature ships
**Then** every metadata version is DataTug plugin `0.0.3`, advanced from `0.0.2`.

## Open Questions

None at this time.

## Out of Scope

Running saved queries, guarding database tool calls, a status band above the prompt, editing project files, entities, and finding a project in a parent folder. Each can become its own Feature.

## Verification Status

Verified on 2026-10-09 with Claude Code 2.1.295 on macOS (arm64):

- `claude plugin test`: 67 tests pass across 6 files. `claude plugin validate . --strict` passes; its calls are `$.command.register`, `$.process.run`, `$.session.cwd`, `$.session.surfaces`, `$.ui.invalidate`, `$.ui.open`, `$.ui.resolve`.
- `claude -p "/datatug"` with the released `datatug` 0.67.0, in the root of the `chinook-demo` project: prints the text summary of the four sections (5 environments, 9 queries matching `datatug queries`, 1 board), and leaves the project unchanged.
- The same in a folder that is not a project: the one-line "not a DataTug project" reply.
- With `datatug` 0.51.0: the one-line "too old" reply naming 0.51.0, 0.67.0 and `datatug self-update`.
- With no `datatug` on the `PATH`: the one-line reply naming `datatug:datatug-install`.
- All five manifests are at `0.0.3`, and none but Claude Code's plugin layout references `hooks/`.

Not exercised:

- The pane drawn in an interactive terminal or the Desktop app. The tests check the tree the mod returns and its tab presses through the test kit, not how an app paints it.
- A session that draws only on `vscode` or `mobile`: covered by tests with a stubbed surface list, not by a real client.
- Other hosts: GitHub Copilot CLI 1.0.90 loads the plugin at 0.0.3 with its nine skills and logs one error line that the root `hooks/hooks.json` is not read; Codex 0.156.0 installs the plugin and showed no hook-related message, without a positive sign that it parsed the file; Gemini CLI and Cursor were not installed and are unverified. Both are documented to discover `hooks/hooks.json`.
- How an interactive transcript treats the text reply, and re-running `/datatug` against a pane in a live terminal (checked through the test kit only).

---
*This document follows the https://specscore.md/feature-specification*
