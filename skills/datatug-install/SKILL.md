---
name: datatug-install
description: "Show install instructions for the datatug CLI. Use when `datatug` is not on PATH, when another skill reports `command not found: datatug`, or when the user asks how to install, reinstall, or update the CLI."
user-invocable: true
---

# Install the datatug CLI

This skill **shows the user how to install** the [`datatug`](https://github.com/datatug/datatug-cli) CLI — the runtime prerequisite for every other skill in this plugin. It does not execute the installer.

## When to use

- `datatug` is not on `PATH` (e.g., `command -v datatug` returns nothing).
- Another skill reported `command not found: datatug` or a pre-flight failure.
- The user explicitly asked to install, reinstall, or update the `datatug` CLI.

## Behavior

**Do not run installers from this skill.** Surface the options below and wait for the user.

## What to show the user

### macOS — Homebrew cask

```bash
brew tap datatug/tap
brew install --cask datatug
```

### Go (any platform)

```bash
go install github.com/datatug/datatug-cli@latest
```

### Binary download (any platform)

Download the matching archive from the [GitHub Releases](https://github.com/datatug/datatug-cli/releases) page.

## Verification

```bash
datatug --help
```

If the command succeeds and prints the help screen, continue with the user's original request. If not, ask them to check their `PATH` and re-run install.
