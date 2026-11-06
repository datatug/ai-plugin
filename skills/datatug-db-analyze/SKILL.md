---
name: datatug-db-analyze
description: Build a short, reviewable understanding of a database in a DataTug project from its metadata (tables, columns, keys), one question to the person, and docs they point to; propose a meaningful project name; save confirmed descriptions through the CLI. Use when a database was just added to a DataTug project, during onboarding, or when asked to "analyze", "understand" or "re-analyze" a database. Metadata only by default; never reads row values without permission.
---

# DataTug database analysis

Works during onboarding and later, for example when another database joins an existing project.

## Rules

- **Read metadata only** (names, types, keys, comments) by default. Reading row values needs the person's yes **and** must go through `datatug query run`, which applies their access policy. Never use `--no-policies`.
- **Mark every guess.** "Inferred" means you guessed it from names; "verified" means the person confirmed it or a document says so. Never present an inference as a fact, and never save one as a fact.
- Ask **one** question, not a questionnaire. The person may skip it.
- Read docs, source code or migrations **only** where the person points you, after a yes. Do not crawl other folders or repositories.

## 1. Scan and read the structure

Scan once after `db add` (it registers a source but reads nothing). Use the form for the source's kind:

```bash
datatug scan -p <project-id> --db <db-id> --env <env> -D sqlite3 --path <file.sqlite>
datatug scan -p <project-id> --db <db-id> --env <env> -D postgres --dsn-env DATATUG_SHOP_DB
```

Then read the structure:

```bash
datatug show --project <project-id>
datatug meaning describe --project <project-id> --source <db-id> --format json
```

Skip the scan for the demo, which ships its metadata, and for an inGitDB folder, whose collection definitions already describe it. On large schemas (more than about 50 tables), summarise by name prefix and foreign-key clusters; do not list everything.

## 2. Propose an understanding

Write at most 8 lines:

- **Likely domain** (inferred), e.g. "an online music store: customers, invoices, tracks, staff".
- **Key tables**, 3–5 of them, each with one clause on what it seems to hold and how it joins.
- **Possibly sensitive columns** (inferred from names: email, phone, address, salary, birth date, token, password). Say these will be candidates for masking. Do not label them yourself.
- **Open questions**, at most 2.

## 3. Ask one question

> What is this database for, and what do you most want to do with it? (Skip if you like.) If there are docs, source code or migrations that describe it, tell me where and I'll read them.

Update the summary with the answer. Anything the person confirms becomes *verified*.

## 4. Suggest a project name

Base the name on what the data is for, not on the database's file name: "Music store", not "chinook". Explain in one line that a project can hold several databases and what you learn about them. Ask "yes / another name / skip".

## 5. Save what was confirmed

You may only **propose** sensitivity labels; the person confirms them (`datatug meaning label confirm`, their action). After a yes, propose one label per sensitive column the person agreed on:

```bash
datatug meaning label propose --agent --project <project-id> --source <db-id> --table <table> --column <column> --class pii --reason "<why>"
```

A proposed label masks the column at once, until the person decides. `--class` is `pii`, `financial` or `secret`. This command talks to the local DataTug agent (`datatug serve`). If it says the agent is not running, say so and leave the labels in the conversation summary.

Everything else you learned (purpose, key tables, open questions) stays in the conversation summary; say it was not saved. Never edit project files by hand.

## Re-analysis

For a refresh, re-run step 1, report only what changed (new or removed tables and columns), and ask about those alone.
