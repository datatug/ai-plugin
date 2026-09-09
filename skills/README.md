# Skills

DataTug skills fall into two categories: a small set of **infrastructure** skills that handle plugin-level concerns (such as installing the CLI) and a larger set of **CLI-wrapper** skills that expose the `datatug` CLI's command surface to agents. Each CLI-wrapper skill covers a single CLI command or coherent group of commands; per-verb detail lives under `references/` and loads on demand.

This plugin follows the same design as the sibling [`specscore`](https://github.com/synchestra-io/ai-plugin-specscore), [`synchestra`](https://github.com/synchestra-io/ai-plugin-synchestra), and [`ingitdb`](https://github.com/ingitdb/ingitdb-ai-skills) plugins.

## Invocation

```
/datatug:datatug-<skill-name>
```

## Skill categories

- **Infrastructure skills** — plugin-level actions not backed by a `datatug` CLI command. Today: only `datatug-install`.
- **CLI-wrapper skills** — one skill per major `datatug` CLI surface area. Each wrapper assumes the CLI is already installed; see the [Pre-flight pattern](#pre-flight-pattern) below.

## Available infrastructure skills

| Skill | Purpose |
|---|---|
| [`datatug-install/`](datatug-install/SKILL.md) | Show install instructions for the `datatug` CLI. |

## Available CLI-wrapper skills

| Skill | Wraps | References |
|---|---|---|
| [`datatug-init/`](datatug-init/SKILL.md) | `datatug init` | inline |
| [`datatug-projects/`](datatug-projects/SKILL.md) | `datatug projects` | `list`, `add` |
| [`datatug-datasets/`](datatug-datasets/SKILL.md) | `datatug datasets / dataset-def / dataset-data` | `list`, `def`, `data` |
| [`datatug-scan/`](datatug-scan/SKILL.md) | `datatug scan` | `scan` |
| [`datatug-queries/`](datatug-queries/SKILL.md) | `datatug queries` | `list`, `run` |
| [`datatug-validate/`](datatug-validate/SKILL.md) | `datatug validate` | inline |
| [`datatug-serve/`](datatug-serve/SKILL.md) | `datatug serve` | inline |
| [`datatug-query-builder/`](datatug-query-builder/SKILL.md) | `datatug serve` (MCP query builder) | inline |

## Pre-flight pattern

Every CLI-wrapper skill must verify that `datatug` is installed before invoking it. Copy the block below verbatim into the top of any new wrapper `SKILL.md`:

> ### Pre-flight check
>
> Before running any `datatug` command, verify the CLI is installed:
>
> ```bash
> command -v datatug >/dev/null 2>&1
> ```
>
> If this check fails (exit `127` / `command not found`), stop and tell the user exactly:
>
> > The `datatug` CLI is not installed. Either:
> > - invoke `/datatug:datatug-install` to see install options, or
> > - install per <https://github.com/datatug/datatug-cli#installation>.
> >
> > Then retry your command.
>
> Do not proceed with the original command until `datatug --help` succeeds.

## Not-yet-wrapped commands

The CLI exposes additional commands not yet covered by a skill — invoke them directly until wrappers land:

`auth`, `gcloud`, `config`, `demo`, `updateUrlConfig`, `render`, `console`, `db`, `ui`, `show`.

## Status

**Shipped:** `datatug-install/` (infrastructure), `datatug-init/`, `datatug-projects/`, `datatug-datasets/`, `datatug-scan/`, `datatug-queries/`, `datatug-validate/`, `datatug-serve/` (CLI wrappers).
