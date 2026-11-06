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
- **CLI too old for this flow:** run `datatug policy exception --help`. If it says the command is unknown, the CLI predates onboarding. After a yes, run `datatug self-update --yes`, then check again.
- **A project with id `datatug-demo` exists:** the demo is already installed. Offer to go straight to the Perimeter demo (step 4).
- **Other projects exist:** ask whether to use one of them, or to try the demo first. Never change an existing project without a yes.

## 1. Offer the demo (one question)

Say, in the person's language:

> DataTug is ready. Shall I run the **2-minute demo**? It installs two tiny local databases (a music store in SQLite, support notes in inGitDB) into `~/datatug/datatug-demo`: no signup, nothing downloaded. It shows how you control what I can read, and it includes one step that you do yourself in a separate terminal window.

That one yes covers the demo install and the read-only demo reads below. The step that changes the policy is the person's own.

If they would rather start with their own database, go to step 6 now, and run the demo later if they want.

## 2. Install the demo

```bash
datatug demo install --format json
```

- `"status":"installed"` or `"unchanged"`: continue.
- `"status":"preserved"` with a file list: the person edited those files. Leave them alone and say so.
- A non-zero exit: show the error line and stop. A checksum failure means the binary's demo data is damaged. Suggest `datatug self-update --yes` (after a yes) and stop; never fetch the data some other way.

## 3. Two lines about the data

The demo ships with curated metadata, so skip the interview: "A music store: customers, invoices, tracks and staff (SQLite), plus support notes about customers (inGitDB). The customers' emails and the staff's personal details are marked sensitive."

## 4. Perimeter

Run **`/datatug:datatug-perimeter`**. It runs the allowed read, the refused read, the request, the approval or rejection, and the masked field.

## 5. Finish

> Done. Your demo project is in `~/datatug/datatug-demo`. You saw that I can read only what your policy allows, sensitive values stay masked, and a table you had not allowed needed an exception that you decided on yourself, in your own terminal, for 15 minutes. On this machine DataTug applies those rules itself. They keep an honest agent inside the lines but are not a security wall; for that, use a read-only database user. Onboarding ends here. If you like, I can connect one of your own databases next.

Stop. Do not suggest other features. If the person asks to connect their database, go to step 6.

## 6. Their own database (only when asked)

Ask what it is.

- **A SQLite file or an inGitDB folder:** ask for the path only.
- **PostgreSQL, MySQL, ClickHouse or another server:** ask the person to set an environment variable holding the connection string **in their own shell** (for example `export SHOP_DB=...`) and to tell you only the variable's name. Do not read it, print it or echo it. Recommend a **read-only database user**.

Then propose a project folder and id and, after a yes:

```bash
datatug init <project-id> <project-dir>
datatug projects add -p <project-id> -d <project-dir>
datatug db add --project <project-id> --db <path-or-env:VAR> --format json
```

If `db add` or the scan fails (wrong path, unreachable server, bad credentials), show the one-line error, say what to check, and offer to retry. Never ask for the password to "debug" it.

Then run **`/datatug:datatug-db-analyze`** (it scans metadata, asks one question, proposes a project name), then **`/datatug:datatug-perimeter`** for a strict default policy. Stop when the policy is saved or the person declines.
