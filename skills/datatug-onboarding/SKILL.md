---
name: datatug-onboarding
description: Guide a new person from an installed DataTug CLI to their first read under their own rules. Install a local demo (SQLite + inGitDB, no signup), run the Perimeter demo (an allowed read with a masked field, a refused read, a time-boxed exception they apply or reject themselves), then stop; connect their own database only if asked. Use right after DataTug is installed, or when the person asks to "set up DataTug", "try DataTug" or "show me Perimeter".
---

# DataTug onboarding

The flow goes: demo, then Perimeter, then **stop**. The person's own database comes only if they ask.

Do not continue into investigations, Detective, Context Bags, Checks, Watch or dashboards, and do not upsell. If the person asks for those afterwards, that is a new task.

## Rules

- **Ask before every change.** Show the exact command and wait for a clear yes. A yes the person already gave counts: do not ask the same thing twice.
- **Never ask for passwords, tokens or connection strings.** For a database server, the person puts the connection string in an environment variable themselves. You only ever see the variable's name.
- **Report only what you verified**: an exit code of 0, or the JSON a command printed. A printed command is not a result.
- **Run only the commands below, as written.** Do not invent flags. If a command fails as unknown, say so and stop.
- Keep updates brief, with room for a walkthrough, result tables and a final checklist. Before a command, say what the person should expect to see and why it matters.
- The person can say **skip**, **stop** or **later** at any step. On a later run, re-check state (step 0) instead of starting over.

## 0. Where are we?

```bash
datatug --version
datatug demo install --help
datatug projects -o json
```

- **CLI missing:** every data and project step needs it. Follow <https://datatug.ai/install-skills.md> steps 1–2, then come back here.
- **CLI too old:** if the `demo install --help` output does not list `--project-id`, the CLI is older than this flow. An unknown command can still exit 0 with the general help, so check for that flag, not the exit code. After a yes, run `datatug self-update --yes`, then check again.
- **`projects` fails with "failed to get settings … no such file":** nothing is registered yet (older CLIs report it this way). Treat it as an empty list.
- **The project list has `datatug-demo`:** the demo is already installed. Give the preview below and continue to Perimeter after consent. Skip installation.
- **Other projects exist:** ask whether to try the demo first or use one of them. Never change an existing project without a yes.

## 1. Preview the demo

Before installing or querying, show this short agenda in the person's language. Show the preview even if they already said yes:

> **DataTug Perimeter · 2-minute local demo**
>
> Perimeter is the set of rules DataTug checks before returning data to an AI agent. We'll use a sample music store and support notes on your machine.
>
> - **Allowed:** Read three customer records and see how DataTug masks their emails.
> - **Blocked:** Try to read the Employee table and see why DataTug refuses.
> - **Your decision:** Optionally approve, narrow or reject a short read exception in your own terminal.
> - **Audit:** See what was requested, what you decided and whether the permission was used.

If the demo isn't installed, say that setup unpacks bundled SQLite and inGitDB sample data into `~/datatug/datatug-demo` and registers it in `~/.datatug.yaml`. The sample data need no signup or download. A yes to the stated demo covers the normal reads, including the expected refusal. Follow any stricter approval instructions the person gave. Ask separately before creating an exception proposal or saving a result for a UI handoff. The person applies or rejects the exception themselves.

If the person already consented to the demo, skip asking again for any step their consent covers.

If they would rather start with their own database, go to step 6, and offer the demo later.

## 2. Choose the browser UI before the demo

Use **🌐 Choose how to open the demo** as the title. Offer these choices in the agent's picker if available, or as a short numbered list:

1. **Install the local web UI:** Install the browser app once and use it offline. Reuse it if already installed.
2. **Use [DataTug.app](https://datatug.app):** Load the interface online without installing it. The browser may ask for permission to connect to the local CLI.
3. **Stay in chat:** Skip browser setup and use the terminal handoff later if desired.

**The demo data stay on your machine in both browser modes.** The CLI and the browser on the same machine exchange data over a local connection (`127.0.0.1`). The hosted option loads the interface from DataTug.app and gets the demo records directly from the local CLI.

If they choose local, check `datatug web-ui list`. Reuse an installed compatible version. If there is none, show this exact command and ask before running it. It downloads and verifies a compatible DataTug release and installs it under `~/datatug/web-ui` by default. It does not start a server.

```bash
datatug web-ui install --latest
```

Verify the installation with `datatug web-ui list`; look for a version marked compatible, since an empty list also exits successfully. Do not change an existing pin. If installation or verification fails, show the error and offer the hosted or chat-only option. Remember the chosen mode for the handoff; do not ask the person to choose it again.

## 3. Install the demo

Show this exact command and ask before running it if its file and registration changes haven't already been approved:

```bash
datatug demo install --format json
```

- `"status":"installed"`, `"unchanged"` or `"repaired"`: continue.
- If `preserved` lists files, say which edits were kept. If it lists the demo policy or sensitivity labels, stop before querying and explain that the demo's expected access and masking rules may differ.
- A non-zero exit: show the error line and go to the final checklist. If it says a file "does not match its pinned sha256", the demo files were changed: say so, and do not fetch the data some other way.

## 4. Perimeter

Run **`/datatug:datatug-perimeter`** (in other agents, the `datatug-perimeter` skill). Pass the chosen browser mode and the verified demo path. It runs the masked read, shows the browser handoff, then demonstrates the refusal, the person's exception decision and the audit.

## 5. Finish

End with one **📋 Demo results** checklist covering the steps that were relevant. Use **✅** for verified outcomes, **⏭️** for skipped steps, **⏳** for a decision still pending and **❌** for a check that failed. Pair each icon with text. A verified denial is a pass; an intentional rejection is a decision, not a failure.

Use one bullet for setup, one for the masked read, one for the denial, one for the person's exception decision and any subsequent read, and one for the audit. Mention the chosen browser mode in setup and distinguish an installed UI from a browser that was actually opened. Give a short piece of evidence for each verified check, such as the row count, `ACCESS_DENIED`, the verified expiry or the audit events. If the demo stopped early, mark later steps skipped. Do not copy example outcomes into the report.

When verified, give the actual demo project path. If the person chose a browser, include a separate **🌐 Open the demo** section with the [handoff](../datatug-perimeter/SKILL.md#optional-ui-handoff). Include the working link if a native card supplied one, or the command to start and open the browser if it is still unopened. Show this even if the Employee retry fails or is skipped. Onboarding ends here.

## 6. Their own database (only when asked)

Ask what it is. Three kinds work today:

- **A SQLite file:** ask for the path only.
- **An inGitDB folder:** ask for the path only, and use `--db ingitdb://<folder>`.
- **PostgreSQL or ClickHouse:** the connection string must reach your shell without passing through this chat. Ask the person to add a line such as `export DATATUG_SHOP_DB='postgres://…'` to their shell profile (or the env file their agent reads), then restart this agent session and tell you only the name, `DATATUG_SHOP_DB`. The name must start with `DATATUG_`. Never read, print or echo its value. Recommend a **read-only database user**.
- MySQL and other servers: not supported by `db add` yet. Say so, and offer the demo.

Then propose a project folder and id and, after a yes:

```bash
datatug init <project-id> <project-dir>
datatug projects add -p <project-id> -d <project-dir>
datatug db add --project <project-id> --db <file-or-ingitdb://folder> --format json
datatug db add --project <project-id> --db env:DATATUG_SHOP_DB --name <source-id> --format json
```

Use the third line for a file or folder and the fourth for a server. `db add` registers the source but does not read it yet. The scan in the next skill reads the metadata.

If a command fails (wrong path, unreachable server, bad credentials), show the one-line error, say what to check, and offer to retry. Never ask for the password to "debug" it.

Then run **`/datatug:datatug-db-analyze`** (it scans the metadata, asks one question, proposes a project name), then **`/datatug:datatug-perimeter`** for a strict default policy. Stop when the policy is saved or the person declines.
