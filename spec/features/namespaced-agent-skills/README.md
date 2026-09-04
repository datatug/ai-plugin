---
format: https://specscore.md/feature-specification
status: Implementing
---

# Feature: Namespaced DataTug Agent Skills

> [SpecScore.**Studio**](https://specscore.studio): | [Explore](https://specscore.studio/app/github.com/datatug/ai-plugin/spec/features/namespaced-agent-skills?op=explore) | [Edit](https://specscore.studio/app/github.com/datatug/ai-plugin/spec/features/namespaced-agent-skills?op=edit) | [Ask question](https://specscore.studio/app/github.com/datatug/ai-plugin/spec/features/namespaced-agent-skills?op=ask) | [Request change](https://specscore.studio/app/github.com/datatug/ai-plugin/spec/features/namespaced-agent-skills?op=request-change) |
**Status:** Implementing
**Source Ideas:** —

## Summary

Publish the existing DataTug skill tree under stable datatug-* names across supported agent manifests without changing the underlying command guidance.

## Problem

Generic skill names such as `scan` and `serve` collide with skills supplied by
other products. Agent inventories need a stable DataTug-owned identifier while
retaining the existing command guidance and progressive reference loading.

## Behavior

The plugin publishes the same nine skill payloads from the canonical `skills/`
tree under `datatug-*` directory and frontmatter names. The Claude Code and
Codex package formats have isolated native-discovery receipts for that one
tree. The GitHub Copilot, Gemini CLI, and Cursor Agent Plugins manifests
declare the same canonical tree; their live runtimes are not exercised by this
Feature.

The DataTug plugin metadata advances from DataTug plugin `0.0.1` to the DataTug
plugin patch release `0.0.2`. Existing capability text and every resource beneath each skill remain
in place, with internal links and the install fallback updated to the
namespaced name. Cursor receives a portable root Agent Plugins manifest with
the standard schema identifier and no Cursor-only duplicate tree.

### Journey

1. A user installs the DataTug plugin in Claude Code, Codex, or Cursor. **Observable
   good result:** the native inventory contains exactly the nine `datatug-*`
   skills from this repository's `skills/` directory.
2. The user asks the agent to scan a database, manage a project, run a query,
   serve the Web UI, validate metadata, initialize a project, inspect datasets,
   use the query builder, or install the CLI. **Observable good result:** the
   matched namespaced skill presents the pre-existing command guidance and its
   referenced resource still resolves.
3. The CLI is absent when a wrapper skill starts. **Observable good result:**
   it directs the user to `datatug:datatug-install` and stops before running a
   command.

## Acceptance Criteria

### AC: namespaced-inventory

**Given** an isolated Claude Code, Codex, or Cursor package installation
**When** the native host inventory is read
**Then** it finds exactly `datatug-datasets`, `datatug-init`,
`datatug-install`, `datatug-projects`, `datatug-queries`,
`datatug-query-builder`, `datatug-scan`, `datatug-serve`, and
`datatug-validate`, with no generic skill directory or frontmatter name left.

### AC: capability-and-resource-preservation

**Given** any of the nine renamed skills
**When** an agent follows it through an internal link
**Then** its pre-existing content and referenced resource are available from
the renamed canonical directory.

### AC: manifest-closure

**Given** the Claude Code, Codex, GitHub Copilot, Gemini CLI, and Cursor Agent
Plugins metadata files
**When** each is parsed
**Then** every declared skill path resolves to the one canonical `skills/`
tree and every metadata version is DataTug plugin `0.0.2`; this verifies
package metadata, not unexercised host-runtime discovery.

### AC: missing-cli-fallback

**Given** a wrapper skill whose `datatug` executable is absent
**When** the pre-flight check fails
**Then** the skill directs the user to `datatug:datatug-install` and stops.

## Open Questions

None at this time.

## Verification Status

Claude Code and Codex each discovered the nine namespaced skills in isolated
installations. Cursor discovery remains an acceptance requirement and is
pending Computer Use access; parsing its manifest alone does not complete
that requirement. Gemini CLI and GitHub Copilot have declared metadata, with
their runtime behavior unverified.

---
*This document follows the https://specscore.md/feature-specification*
