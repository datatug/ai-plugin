---
format: https://specscore.md/feature-specification
status: Draft
---

# Feature: Claude Code Project Pane Mod

> [SpecScore.**Studio**](https://specscore.studio): | [Explore](https://specscore.studio/app/github.com/datatug/ai-plugin/spec/features/claude-code-mod?op=explore) | [Edit](https://specscore.studio/app/github.com/datatug/ai-plugin/spec/features/claude-code-mod?op=edit) | [Ask question](https://specscore.studio/app/github.com/datatug/ai-plugin/spec/features/claude-code-mod?op=ask) | [Request change](https://specscore.studio/app/github.com/datatug/ai-plugin/spec/features/claude-code-mod?op=request-change) |
**Status:** Draft
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

**Given** a session where mods cannot draw
**When** `/datatug` runs
**Then** it replies with a plain-text summary of the four sections.

### AC: failed-command-isolated

**Given** a project where one of the three listing commands exits non-zero (for example a board that cannot be loaded) and the folder is a project
**When** `/datatug` runs
**Then** the tabs that command feeds show a warning row carrying the first line of its stderr, and the other tabs render normally.

### AC: cli-only-data

**Given** the mod's source
**When** `claude plugin validate` lists its `hooks:` and `calls:`
**Then** the calls are limited to `$.process.run`, `$.session.cwd`, `$.command.register` and `$.ui.*`: no `fs.*`, `http.*` or `process.spawn` call; and every `$.process.run` argument list starts with `datatug` followed by one of the four commands above.

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

---
*This document follows the https://specscore.md/feature-specification*
