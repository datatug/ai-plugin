---
name: datatug-uninstall
description: Preview or remove the DataTug CLI, downloaded web UI, or the DataTug skills for Codex or Claude Code. Also covers a separate demo reset and disk usage. Use when the person asks to uninstall DataTug, reset the demo, or see how much disk space DataTug uses.
---

# DataTug uninstall and demo reset

## 🧹 Choose what to remove

Start with the narrowest option that matches the request. If it is unclear, use a choice picker or a short numbered list. Uninstalling the CLI alone is the default.

| Choice | Preview command |
| --- | --- |
| CLI only | `datatug uninstall --dry-run --format json` |
| Downloaded web UI only | `datatug uninstall --web-ui --dry-run --format json` |
| Codex skills only | `datatug uninstall --skills codex --dry-run --format json` |
| Claude Code user skills only | `datatug uninstall --skills claude --dry-run --format json` |
| CLI and web UI | `datatug uninstall --full --dry-run --format json` |
| CLI, web UI and one agent's skills | Add `--skills codex` or `--skills claude` to the full preview |
| Reset the default Perimeter demo | `datatug demo reset --dry-run --format json` |
| See disk usage | `datatug disk --format json` |

Projects, account state, credentials, shell settings and marketplace registrations are kept. The separate demo reset archives the default demo folder and removes only its matching project registration. The archive includes the demo audit and any edits. It frees no space. Use `datatug demo install` again only if the person wants to recreate the demo.

## 🔍 Check availability and preview

Resolve `datatug` on PATH or reuse its verified absolute path from setup. If neither is available, check the official installer default read-only: `$HOME/.local/bin/datatug` on Unix, or `%LOCALAPPDATA%\DataTug\bin\datatug.exe` on Windows. If found, use that same executable for help, preview, and apply. Check the relevant command's `--help` before invoking it. Some older releases can show general help and still exit successfully for unknown commands. Confirm the uninstall or reset help lists `--dry-run` and `--apply`, or that the disk help describes disk usage.

If the CLI or command is missing, explain the limitation. Do not reinstall DataTug to uninstall it. If they asked to remove only the agent skills, show the matching native command and ask before running it:

- **Codex:** `codex plugin remove datatug@datatug`
- **Claude Code, user scope:** `claude plugin uninstall datatug@datatug --scope user --keep-data`

For other unavailable operations, give the verified package manager or installer instructions. Never guess paths, recursively delete a home directory, edit agent config by hand, or remove project or credential files.

Show the dry-run actions, exact paths and counts in a compact table. Distinguish an archive move from a deletion. Byte totals are logical sizes, and the plugin manager may not provide a file count or size. A manual action blocks the entire apply. Show the owner command from the preview for separate approval, or preview a narrower selection. Homebrew and running Windows executables are handled by the owner named in the preview.

## ✅ Apply and verify

If a local server is using selected files, ask the person to stop that server or get separate approval to stop it. A skills-only removal needs no server stop. Show the exact command with `--apply` in place of `--dry-run` and wait for approval. Apply the same component selection. List completed actions and surface any refusals or partial failures, including the recovery path if the CLI reports one.

- For CLI removal, verify the selected executable is gone and check whether a different copy still resolves on PATH.
- For Codex skills, verify `datatug@datatug` is absent from `codex plugin list --json` (without `--available`).
- For Claude Code skills, verify the user-scoped `datatug@datatug` is absent from `claude plugin list --json`.

Keep marketplace registrations in place.
