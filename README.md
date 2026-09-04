# DataTug AI Plugin

AI plugin for [DataTug](https://datatug.io) - skills that teach AI agents how to use the `datatug` CLI for data exploration, dataset management, schema scanning, and query execution.

This repository contains the plugin source. It is installed on top of the [`datatug` CLI](https://github.com/datatug/datatug-cli); the CLI is a prerequisite.

## Contents

| Directory | Description |
|---|---|
| [`skills/`](skills/README.md) | Agent skills - one per major `datatug` CLI surface area, progressively loaded per-verb |
| [`.claude-plugin/`](.claude-plugin/plugin.json) | Claude Code plugin manifest |
| [`.codex-plugin/`](.codex-plugin/plugin.json) | Codex plugin manifest |
| [`plugin.json`](plugin.json) | Portable Agent Plugins manifest for Cursor and other compatible hosts |
| [`gemini-extension.json`](gemini-extension.json) | Gemini CLI extension manifest |
| [`.github/plugin.json`](.github/plugin.json) | GitHub Copilot CLI / VS Code agent plugin manifest |

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
- Or install directly per the [DataTug CLI installation guide](https://github.com/datatug/datatug-cli#installation).

Verify with `datatug --help`.

## Relationship to the CLI

The plugin wraps the `datatug` CLI - it does not replace it. Skills encode *when* to call a command, *which* flags to pass, and *how* to interpret exit codes. The CLI source of truth is [`datatug/datatug-cli`](https://github.com/datatug/datatug-cli).

A change in the CLI surface typically produces a matching skill update in this repository; the two evolve together but release independently.

## Relationship to other plugins

`datatug` is a base-layer **CLI wrapper** plugin, in the same shape as:

- [`specscore`](https://github.com/specscore/ai-plugin-specscore)
- [`synchestra`](https://github.com/synchestra-io/ai-plugin-synchestra)
- [`ingitdb`](https://github.com/ingitdb/ingitdb-ai-skills)

## Releases

Releases are tagged as `datatug--v<version>` on this repository to support Claude Code's dependency resolution.

## License

MIT - see [LICENSE](LICENSE).
