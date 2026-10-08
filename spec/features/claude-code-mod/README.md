---
format: https://specscore.md/feature-specification
status: Draft
---

# Feature: Claude Code Project Pane Mod

> [SpecScore.**Studio**](https://specscore.studio): | [Explore](https://specscore.studio/app/github.com/datatug/ai-plugin/spec/features/claude-code-mod?op=explore) | [Edit](https://specscore.studio/app/github.com/datatug/ai-plugin/spec/features/claude-code-mod?op=edit) | [Ask question](https://specscore.studio/app/github.com/datatug/ai-plugin/spec/features/claude-code-mod?op=ask) | [Request change](https://specscore.studio/app/github.com/datatug/ai-plugin/spec/features/claude-code-mod?op=request-change) |
**Status:** Draft
**Source Ideas:** —

## Summary

A [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview) shipped inside this plugin that adds a `/datatug` command and a read-only pane beside the transcript showing the DataTug project in the working directory: overview, environments, queries, and boards plus DB models. It reads project files directly, makes no network calls, and starts no processes.

## Problem

The plugin's skills teach Claude how to drive the `datatug` CLI, but the user has no at-a-glance view of the DataTug project Claude is working in. They must ask Claude or open the Web UI to see which environments, queries and boards exist. A mod runs inside Claude Code and can draw that view without a Claude turn.

## Behavior

The mod lives in this repository next to the skills (`hooks/hooks.json`, `hooks/register.js`, `lib/project.js`, `lib/view.js`) and is installed by the existing `datatug` plugin. Only the Claude Code manifest references it; the Codex, Gemini CLI, Copilot and Cursor manifests do not reference it, though all five advance together from plugin `0.0.2` to `0.0.3`.

`/datatug` locates the nearest `datatug-project.json` by walking up from the working directory, loads the project into a plain object (`lib/project.js`, no Claude Code dependency), and draws it as a pane (`lib/view.js`) with four tabs:

- **Overview**: project title, id, access.
- **Environments**: entries from `environments/`.
- **Queries**: the folder tree under `queries/`.
- **Boards and DB models**: entries from `boards/` and `dbmodels/`, with table, schema and view counts.

The mod is read-only. It does not run queries, guard tool calls, or edit project files.

### Journey

1. A user installs the plugin and runs `/datatug` in a DataTug project. **Observable good result:** a pane opens with the four tabs populated from the project files.
2. The user runs `/datatug` outside any project. **Observable good result:** a one-line text reply says no `datatug-project.json` was found, and no pane opens.
3. The user runs `/datatug` where nothing can draw (VS Code chat panel, `claude -p`). **Observable good result:** the command replies with a plain-text summary of the same four sections.

## Acceptance Criteria

### AC: project-discovery

**Given** a working directory inside or below a DataTug project
**When** the project loader runs
**Then** it returns the project rooted at the nearest ancestor containing `datatug-project.json`, with title, id, environments, query tree, boards and DB models.

### AC: pane-tabs

**Given** the `chinook-demo` fixture
**When** `/datatug` runs in a session that can draw
**Then** a pane shows the Overview, Environments, Queries and Boards and DB models tabs populated from the fixture.

### AC: no-project

**Given** a working directory with no ancestor `datatug-project.json`
**When** `/datatug` runs
**Then** it replies with one text line and opens no pane.

### AC: text-fallback

**Given** a session where mods cannot draw
**When** `/datatug` runs
**Then** it replies with a plain-text summary of the four sections.

### AC: malformed-file-isolated

**Given** a project where one file (for example a query definition) is malformed
**When** the project loads
**Then** the affected tab shows a warning row and the other tabs render normally.

### AC: no-side-effects

**Given** the mod's source
**When** `claude plugin validate` lists its `hooks:` and `calls:`
**Then** the calls contain file reads and interface drawing only: no process start, network request or file write.

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

Running saved queries, guarding database tool calls, a status band above the prompt, and editing project files. Each can become its own Feature.

---
*This document follows the https://specscore.md/feature-specification*
