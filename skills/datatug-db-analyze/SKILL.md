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

```bash
datatug scan -p <project-id> --db <db-id> --env <env>
datatug show --project <project-id>
datatug meaning describe --project <project-id> --source <db-id> --format json
```

If `scan` is not needed (the demo, or a fresh `db add` that already scanned), skip it. On large schemas (more than about 50 tables), summarise by name prefix and foreign-key clusters. Do not list everything.

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

Save only confirmed descriptions, after a yes, using the CLI's own writers: `datatug meaning` for sensitivity label **proposals**, and the project's entity and description commands where they exist (check with `datatug entity --help`). Agents may only *propose* sensitivity labels; the person confirms them:

```bash
datatug meaning label --help
```

If the CLI has no command for some piece of knowledge, keep it in the conversation summary and say it was not saved. Never edit project files by hand.

## Re-analysis

For a refresh, re-run step 1, report only what changed (new or removed tables and columns), and ask about those alone.
