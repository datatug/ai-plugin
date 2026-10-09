---
format: https://specscore.md/features-index-specification
---

# Features

Feature specifications for this project.

## Index

| Feature | Status | Description |
|---------|--------|-------------|
| [Query Builder Skill](query-builder/README.md) | Approved | The agent **skill** that teaches an AI-agent terminal to build and progressively refine a DataTug query by driving the serve-brokered query builder's MCP tools. It is the agent-side surface of the Serve-Brokered AI Query Builder Capability (`specscore:feature/serve-brokered-query-builder@github.com/datatug/datatug`): the skill ensures a `datatug serve` daemon is reachable, creates a tab (by default in **DTQL mode**, where the query is a dalgo AST whose textual form is 1:1 DTQL-YAML) and hands the user a deep link to open the Web UI, and on each natural-language request constructs the prose + structured delta + full query and calls `apply_change` — staying quiet in the terminal by default and offering candidate options when unsure. When the AST cannot express the user's query (or the user wants raw native), the skill uses **native mode** — sending the connection's native query text verbatim — and may convert a DTQL tab to native one-way via `convert_to_native`. This Feature specifies what the skill must instruct; the skill file (`skills/datatug-query-builder/SKILL.md`) is its implementation. |
| [Claude Code Project Pane Mod](claude-code-mod/README.md) | Implementing | A [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview) shipped inside this plugin that adds a `/datatug` command and a read-only pane beside the transcript showing the DataTug project in the working directory: overview, environments with their sources, queries, and boards. Every fact it shows comes from the `datatug` CLI; the mod parses no project file itself. |
| [Namespaced DataTug Agent Skills](namespaced-agent-skills/README.md) | Implementing | Publish the existing DataTug skill tree under stable datatug-* names across supported agent manifests without changing the underlying command guidance. |

## Open Questions

None at this time.

---
*This document follows the https://specscore.md/features-index-specification*
