---
name: datatug-query-builder
description: Build and progressively refine a read-only DataTug query by conversation, driving the datatug serve query-builder over MCP. The query and results show live in the DataTug Web UI; you (the agent) never write SQL by hand. Use when the user wants to build, refine, or explore a query against a DataTug connection.
---

# DataTug Query Builder

Build a query *with* the user by driving the `datatug serve` query-builder daemon over **MCP**. You hold the conversation in this terminal; the daemon holds the query (one canonical *dalgo* AST per **tab**) and streams it plus results to the **Web UI** the user opens from a link you give them.

> Implements `spec/features/query-builder` — the agent-side surface of the Serve-Brokered AI Query Builder capability (`specscore:feature/serve-brokered-query-builder@github.com/datatug/datatug`).

## Pre-flight check

```bash
command -v datatug >/dev/null 2>&1
```

On miss, invoke `/datatug:datatug-install` and stop.

Then confirm a query-builder daemon is reachable over MCP. If no `datatug serve` daemon with the query builder is connected, tell the user to start one and stop — do **not** try to build the query another way:

```bash
datatug serve   # starts the HTTP + MCP daemon the builder runs on
```

## Core rule

**Drive the daemon's MCP tools only.** Never write SQL files, edit project files, or hand-author the query outside the daemon. The tools are:

| Tool | Use |
|------|-----|
| `create_tab` | Start a new query (named tab) bound to one connection; returns a deep link. |
| `apply_change` | Set the tab's query to a new full query you built. |
| `inspect` | Read a tab's current query (dalgo or native SQL). |
| `run` | Execute a tab's query and return results. |

Every call except `create_tab` takes an **explicit tab id**.

## Workflow

### 1. Start a tab and hand over the link

When the user wants to build a query, call `create_tab` (pick the target connection — ask if ambiguous). It returns a **deep link** (query id + daemon host + one-time code). Present that link to the user so they open the Web UI for this tab:

> Open your query builder: <deep-link>

### 2. Refine, one request at a time

For each natural-language request, **you** interpret it and build the result — then call `apply_change` with the tab id and all three of:

- **prose** — a short human description (e.g. `"add exchange rate column"`), shown in the Web UI history;
- **delta** — the structured change;
- **query** — the **full resulting query** (the daemon adopts this verbatim; it does **not** read your prose to build the query).

Before building each new change, call `inspect` first to re-read the tab's **current** query — the user may have edited it directly in the Web UI (added a filter, dropped a column). Build your delta on that current state so their edits are preserved.

### 3. Stay quiet by default

Do **not** print the query (SQL or dalgo) in the terminal — the user reads it in the Web UI. Only show it when the user asks ("show the query", "show SQL") — then `inspect` and print the dalgo or native form, once or per change as they prefer. Confirm changes in a short sentence, not by dumping the query.

### 4. When you are unsure, offer options — don't guess

If a request has several reasonable interpretations and you can't confidently pick one (e.g. "add exchange rate" with multiple rate sources), submit **multiple candidate options** via `apply_change` rather than committing one. The user compares their results in the Web UI and commits one; the rest are discarded.

### 5. Read-only only

Produce only read-only queries. If the user asks to insert/update/delete or run DDL, the daemon refuses it — relay that refusal in the terminal and leave the current query unchanged. Do not retry or work around it.

## Notes

- The daemon holds only the **current** version per tab; the change **history** lives in the Web UI (the user can revert there).
- Results in the Web UI default to 1000 rows with "load next" / "load all" controls — you don't manage paging.
- The conversation is here, in the terminal. The Web UI has **no chat panel** — it is for viewing and deterministic point-and-click edits.
