# DataTug AI Plugin

AI plugin for [DataTug](https://datatug.io) - skills that teach AI agents how to use the `datatug` CLI for data exploration, dataset management, schema scanning, and query execution.

This repository contains the plugin source. It is installed on top of the [`datatug` CLI](https://github.com/datatug/datatug-cli); the CLI is a prerequisite.

## Contents

| Directory | Description |
|---|---|
| [`skills/`](skills/README.md) | Agent skills - one per major `datatug` CLI surface area, progressively loaded per-verb |
| [`.claude-plugin/`](.claude-plugin/plugin.json) | Claude Code plugin manifest |
| [`hooks/`](hooks/hooks.json), [`lib/`](lib/cli.js), [`types/`](types/index.d.ts) | Claude Code mod: the `/datatug` panel and `/datatug project` pane (Claude Code only) |
| [`tests/`](tests/mod.test.ts) | Mod tests, run with `claude plugin test` |
| [`.codex-plugin/`](.codex-plugin/plugin.json) | Codex plugin manifest |
| [`plugin.json`](plugin.json) | Portable Agent Plugins manifest for Cursor and other compatible hosts |
| [`gemini-extension.json`](gemini-extension.json) | Gemini CLI extension manifest |
| [`.github/plugin.json`](.github/plugin.json) | GitHub Copilot CLI / VS Code agent plugin manifest |

## Claude Code mod

In Claude Code, the plugin also ships a [mod](https://code.claude.com/docs/en/plugins/mods/overview) with two views. Everything either shows comes from the `datatug` CLI; the mod reads no project file itself.

**`/datatug`** opens the DataTug panel, a column of cards beside the transcript:

- **Project**: pick one of your registered projects.
- **Databases**: the project's databases, plus a field that opens another one from a connection string or a file path and adds it to the project. Open a database to list its tables and views, and count their rows on request.
- **Table**: columns, declared types, nullability, keys and foreign keys (press a foreign key to go to the table it points at), who references the table, and the column order you prefer (as defined, A to Z, or by type). **Show records** lists its first 100 records, 20 to a page; a row number opens the **Record** card, where a foreign-key value opens the record it points to. **Column** shows one column's facts.
- **Open in DataTug**: the Table, Table records and Record cards of a database in a project link to the same table, its top records or that record in the DataTug web UI at `https://datatug.app`, which reads them from your own local DataTug agent (`datatug daemon`). The link comes from `datatug daemon url`; the mod draws it only after checking it (the hosted UI on `https://datatug.app`, the agent on `127.0.0.1`, a one-time code and the record key only in the part after `#`, no credentials), refreshes it after a minute, and offers **Check again**. In its place a card says why there is none: the agent is not running (`datatug daemon start`), the web UI cannot open that view yet, the CLI is too old, the database is not in a project yet, or the card is shown somewhere other than a terminal on the machine that runs the agent (the Desktop app, VS Code, mobile, or a terminal over SSH). A PostgreSQL database added through an environment variable gets no link. Links, keys and rows never go into a prompt, a notice or the context bag.
- **Context bag**: the cart buttons next to a table, a column or a field add it to your bag. Check what you want and press **Ask Claude...** to draft one question about it in the prompt box; the draft is never sent for you.

When Claude runs a plain `datatug query run ...` command, the rows are shown to you as a grid under the call and Claude is given only a summary (row and column counts and column names), not the rows. This covers a plain command only: one with a pipe, redirect, comment or other shell syntax of its own, or another tool, is not intercepted: Claude reads its output. A row number in the grid opens its Record card. The rows are written to an owner-only folder under your temporary folder and emptied once read (or, when they cannot be read or the call fails, as soon as the call ends; a session killed mid-call can leave one file). Other `--format` values are written the same way and shown nowhere. A Bash call run in the background returns before the rows are written, so they are not intercepted and can stay in the folder until you delete them. The rows of the last ten results are kept in the session's plugin state for the cards. This is a convenience that keeps rows out of the transcript, not a security boundary: Claude can still read data with a command the mod does not intercept. A database you opened with a connection string reaches the CLI in the `DATATUG_OPEN_DB` environment variable only, never in an argument, a prompt or a link, and the prompts the panel drafts name a database by its `datatug://<project>/<db>` reference. The one place a value enters a prompt is the context bag: a value you added to the bag and checked is part of the **Ask Claude...** draft because you chose it.

**`/datatug project`** opens a read-only pane for the DataTug project in the session's working directory, with four tabs (Overview, Environments, Queries, Boards), from `datatug show`, `datatug queries` and `datatug board list`, each with `--format json`. Where nothing can draw (VS Code chat, `claude -p`), it prints a text summary instead. On the Queries tab, Tab moves between queries and Enter opens one (title, ID, type and parameters). Press `a` there to draft a request in the prompt box without sending it, so you can add details first; this closes the pane, and `/datatug project` opens it again. `b` goes back to the list.

The mod runs the `datatug` found first on your `PATH`, in the session's working directory, as the plugin's skills do.

It requires Claude Code 2.1.287 or later and `datatug` 0.84.1 or later (what the panel needs: `datatug://` database references, `datatug db add`, `datatug db schema --columns` and the `--client` flag); the Open in DataTug links need `datatug` 0.86.0 or later (the record key and a one-time code in the link fragment, and an agent that admits only the hosted web UI), and with an older one the cards say to update it. Every `datatug` command the mod runs carries `DATATUG_CLIENT=claude-mod`, so the CLI keeps the local agent running for the links; the mod never starts it itself. A database you open by path or connection string is added to the selected project's `local` environment under a source id of its own (a SQLite file by its path, any other database through an environment variable of its own). To link to a web UI you run locally, set the plugin's **Development web UI host** setting (`/config`) to exactly `http://datatug.localhost` (or `https://`, with an optional port); nothing else is accepted, and the mod never takes it from the CLI. other hosts do not run the mod (GitHub Copilot CLI logs one error line about the root `hooks/hooks.json` when it loads the plugin, and still loads its skills). If the CLI is missing or older, `/datatug` says so and names the fix.

Develop and test it from this directory with `claude --plugin-dir .`, `claude plugin validate .` and `claude plugin test`.

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

## Development

Pull requests and pushes to `main` run `.github/workflows/ci.yml`. It has three checks, each runnable locally from the repository root:

| Check | What it runs | Locally |
| --- | --- | --- |
| `mod` | `claude plugin validate . --strict` and `claude plugin test` (the mod tests in `tests/`), with Claude Code pinned in the workflow; needs no login or API key | `claude plugin validate . --strict` and `claude plugin test` |
| `manifests` | Parses every manifest, checks that `name` and `version` agree and that every referenced path exists, and runs the checker's own tests | `node --test scripts/check-manifests.test.js && node scripts/check-manifests.js` |
| `spec` | `specscore spec lint` on `spec/`, with specscore pinned in the workflow | `specscore spec lint` ([install](https://github.com/specscore/specscore-cli#install)) |

When you bump the version, change it in every manifest; the `manifests` check fails if they differ.

## Releases

Releases are tagged as `datatug--v<version>` on this repository to support Claude Code's dependency resolution.

## License

MIT - see [LICENSE](LICENSE).
