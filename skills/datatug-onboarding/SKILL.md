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
- Keep every message to 2–4 lines. Say what the next command does before running it.
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
- **The project list has `datatug-demo`:** the demo is already installed. Offer to go straight to the Perimeter demo (step 4).
- **Other projects exist:** ask whether to try the demo first or use one of them. Never change an existing project without a yes.

## 1. Offer the demo (one question)

If the person already said yes to a demo (for example in the install guide's last step), skip this question. Otherwise say, in their language:

> DataTug is ready. Shall I run the **2-minute demo**? It installs two tiny local databases (a music store in SQLite, support notes in inGitDB) into `~/datatug/datatug-demo`: no signup, nothing downloaded. It shows how you control what I can read, and it has one step you do yourself in a separate terminal window.

That one yes covers the demo install and every **read** in the demo, including the attempt on a table that is not allowed. Changing the policy is never yours to do: the person does that step.

If they would rather start with their own database, go to step 6, and offer the demo later.

## 2. Install the demo

```bash
datatug demo install --format json
```

- `"status":"installed"`, `"unchanged"` or `"repaired"`: continue.
- `"preserved"` with a file list: the person edited those files. Leave them alone and say so.
- A non-zero exit: show the error line and stop. If it says a file "does not match its pinned sha256", the demo files were changed: say so, and do not fetch the data some other way.

## 3. Two lines about the data

The demo ships with curated metadata, so there is no interview: "A music store: customers, invoices, tracks and staff (SQLite), plus support notes about customers (inGitDB). Emails, phone numbers and staff personal details are marked sensitive."

## 4. Perimeter

Run **`/datatug:datatug-perimeter`** (in other agents, the `datatug-perimeter` skill). It runs the allowed and masked read, the refused read, the exception the person applies or rejects, and the audit record.

## 5. Finish

Use the sentence that matches what happened:

- **Applied:** "Done. I could read only what your rules allow, the sensitive values stayed masked, and the `Employee` table needed an exception that you applied yourself, in your own terminal. It ends on its own."
- **Rejected:** "Done. I could read only what your rules allow, the sensitive values stayed masked, and when you rejected the exception I stopped. I can't read `Employee`."
- **Stopped at the refusal:** "Done. I could read only what your rules allow, the sensitive values stayed masked, and the table you hadn't allowed was refused."

Then, in every case:

> The demo project is in `~/datatug/datatug-demo`. On this machine DataTug applies these rules itself. They keep an honest agent inside the lines but are not a security wall; for that, use a read-only database user. Onboarding ends here. If you like, I can connect one of your own databases next.

Stop. If the person asks to connect their database, go to step 6.

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
