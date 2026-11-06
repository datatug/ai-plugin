---
name: datatug-onboarding
description: Guide a new person from an installed DataTug CLI to their first protected read. Install a local demo (SQLite + inGitDB, no signup) or connect their own database, create a named project, explain it briefly, then run the Perimeter demo (allowed read, refused read, access request, their approval or rejection, a masked field). Use right after DataTug is installed, or when the person asks to "set up DataTug", "try DataTug" or "show me Perimeter". The flow stops after the Perimeter demo.
---

# DataTug onboarding

The flow goes: install, then source, then project, then understanding, then Perimeter. After that it **stops**.

Do not continue into investigations, Detective, Context Bags, Checks, Watch or dashboards, and do not upsell. If the person asks for those afterwards, that is a new task.

## Rules

- **Ask before every change.** Show the exact command and wait for a clear yes. One yes covers one step.
- **Never ask for passwords, tokens or connection strings.** For a database server the person sets an environment variable themselves; you only ever see its name.
- **Report only what you verified**: an exit code of 0, or the JSON a command printed. A printed command is not a result.
- **Run only the commands below, as written.** Do not invent flags. If a command is missing on this machine, say so and stop. Check with `datatug <command> --help`.
- Keep every message to 2–4 lines. Say what the next command does before running it.
- The person can say **skip**, **stop** or **later** at any step. On a later run, re-check state (step 0) instead of starting over.

## 0. Where are we?

```bash
datatug --version
datatug projects -o json
```

- **CLI missing:** the CLI is needed for every data and project step. Follow <https://datatug.ai/install-skills.md> steps 1–2, then come back here.
- **CLI older than 0.145.0:** the commands below need 0.145.0 or newer. After a yes, run `datatug self-update --yes`.
- **A project with id `datatug-demo` exists:** the demo is already installed. Offer to go straight to the Perimeter demo (step 4).
- **Other projects exist:** ask whether to use one of them, or to try the demo first. Never change an existing project without a yes.

## 1. Pick a source

Say, in the person's language:

> DataTug is ready. I can set up a **safe demo**: two small local databases (a music store in SQLite, support notes in inGitDB), no signup, about two minutes. Or I can connect **a database of yours**. Which do you prefer?

## 2a. Demo

> This downloads a 1 MB sample database (checked against a pinned SHA-256 checksum) and creates the project `datatug-demo` in `~/datatug/demo`. OK?

```bash
datatug demo install --format json
```

- `"status":"installed"` or `"unchanged"`: continue.
- `"status":"preserved"` with a file list: the person edited those files. Leave them alone and say so.
- A non-zero exit: show the error line. A checksum failure means the download was not the expected file. Do not retry with another source; offer `--offline` if a cached copy exists, or stop.

The demo ships with a curated description and policy, so skip the analysis interview. Summarise it in two lines (a music store's customers, invoices and staff, plus support notes) and go to step 4.

## 2b. Their own database

Ask what it is.

- **A SQLite file or an inGitDB folder:** ask for the path only.
- **PostgreSQL, MySQL, ClickHouse or another server:** ask the person to set an environment variable holding the connection string **in their own shell** (for example `export SHOP_DB=...`) and tell you only the variable's name. Do not read it, print it or echo it. For a real database, suggest they use a read-only database user. That is the only protection that holds even if DataTug has a bug.

Then propose a project folder and id and, after a yes:

```bash
datatug init <project-id> <project-dir>
datatug projects add -p <project-id> -d <project-dir>
datatug db add --project <project-id> --db <path-or-env:VAR> --format json
```

If `db add` or the scan fails (wrong path, unreachable server, bad credentials), show the one-line error, say what to check, and offer to retry or switch to the demo. Never ask for the password to "debug" it.

Then run **`/datatug:datatug-db-analyze`**. It scans the metadata, asks one question and proposes a better project name.

## 3. Name the project

If the analysis proposed a name, ask: "Call this project *<name>*? (yes / another name / skip)". A project groups databases and what you learn about them. Renaming is optional.

## 4. Perimeter

Run **`/datatug:datatug-perimeter`**. It runs the allowed read, the refused read, the request, the approval or rejection, and the masked field.

## 5. Finish

> Done. Your project is in `<project-dir>`. What you saw: I could read only what your policy allows, a refused table needed your approval in your own terminal, and the email addresses stayed masked. Onboarding ends here. Ask me anything about your data whenever you like.

Stop. Do not suggest further features.
