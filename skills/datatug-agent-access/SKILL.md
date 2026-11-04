---
name: datatug-agent-access
description: Read protected DataTug data as your registered agent (`datatug db get` / `db preview --agent`), ask your user for access (`datatug access request --agent`), and run inside an agent session so "This session" approvals end with the conversation. Use when a protected read is refused or an agent needs access to a table.
---

# datatug agent access

Wraps the agent side of DataTug Perimeter: `datatug db get --agent`, `datatug db preview --agent`, `datatug access request --agent` and `datatug agent session start|end|status`.

## Pre-flight check

```bash
command -v datatug >/dev/null 2>&1
```

On miss, invoke `/datatug:datatug-install` and stop.

## Agent sessions

An agent session binds the agent's **This session** approvals to one harness session (one conversation). When the session ends, those approvals end, and an ended session is never revived: a resumed conversation gets a fresh session with no session approvals.

- **Claude Code**: sessions start and end automatically. The plugin's `SessionStart` hook reads the session ID from Claude Code's hook payload, runs `datatug agent session start`, and exports `DATATUG_HARNESS_SESSION` for your Bash commands; the `SessionEnd` hook runs `datatug agent session end`. It needs `node`, an agent ID (`DATATUG_AGENT_ID` or the plugin setting `agentId`) and the space and project (`DATATUG_SPACE_ID` / `DATATUG_PROJECT_ID` or the settings `spaceId` / `projectId`). Do not pass `--harness-session` yourself, and never type or change a session ID: the hook owns it.
- **Harnesses without session hooks** (Codex, Gemini CLI, Copilot, Cursor): the person (or the harness's own start-up script) runs, once per conversation, with the harness's own session ID:

  ```bash
  datatug agent session start --harness <harness> --harness-session <harness-session-id> --agent-id ag-... --space <space> --project <project>
  ```

  Then pass `--harness-session <harness-session-id>` on every agent call (or set `DATATUG_HARNESS_SESSION`), and end it with `datatug agent session end --harness-session <harness-session-id> --reason harness-ended`. Take the ID from the harness, never invent one.

`datatug agent session status` shows what is stored (never the credential). The credential stays in the OS keyring; the CLI refreshes it before it expires.

## Commands

```bash
datatug db get --agent --space <s> --project <p> --connection <c> --collection <table> --id <id>
datatug db preview --agent --space <s> --project <p> --connection <c> --namespace <ns> --table <table>
datatug access request --agent --space <s> --project <p> --connection <c> --table <ns>.<table> --reason "<why>"
```

- With an agent session, `--agent-id` defaults to the session's agent; a different `--agent-id` is refused.
- `access request --agent` asks for **This session** by default when an agent session is active. Without one it asks for a deadline (`--seconds`, default 300) and says so on stderr. `--lifetime session` without a session fails; `--lifetime deadline` asks for a deadline explicitly.
- Denials print only a safe code, such as `AGENT_SESSION_ENDED` (start a new session) or `AGENT_SESSION_INVALID`. Surface it verbatim; never retry with another agent's or another session's ID.

## Honest limit

Binding approvals to a session scopes honest harness use and attributes activity to that session. It is not a security boundary against a shell agent running as the same OS user: such an agent could name another of its own live sessions (`DATATUG_HARNESS_SESSION=<id>`) and use that session's approvals while it is live. Do not do that; use only the session the harness gave you.
