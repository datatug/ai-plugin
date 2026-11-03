# DataTug for DeepSeek Harness

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that opens
DataTug projects in the Harness itself: a **DataTug tab in the right sidebar** for
browsing environments, databases, schemas, tables, columns and rows, a **`datatug`
tool** so the agent can read the same data, and the **DataTug agent skills** this
repository already ships.

It is the DeepSeek Harness counterpart of the [Claude Code mod](../README.md#claude-code-mod):
the panel plays the part of the Claude Code pane, and the tool plays the part of the
Bash calls the mod intercepts. Everything runs against the locally installed
`datatug` CLI; the plugin stores no data, holds no credentials and opens no network
connection of its own.

## Requirements

- `datatug` 0.120 or later on the `PATH` of the process that runs DeepSeek Harness
  (developed against 0.127.0). Install it from
  <https://datatug.io/en/docs/install/>.
- A DeepSeek Harness `web` (or Desktop) profile: the panel needs the Web UI.
- Creator mode is the easiest way to install it, because that is the mode whose
  `plugin_manager` tool can install bundles.

## Install in Creator mode

Ask the agent, in a **Creator mode** session, to install the bundle from the absolute
path of this directory:

```text
Use plugin_manager with install_bundle and target "<absolute path>/dsh".
```

The same can be done from a shell:

```bash
dsh plugin --profile web add <absolute path>/dsh
```

Either way the profile depends on the package (`link:` for a local directory) and
selects the bundle. **Reload the Harness page**: the Host half loads as the bundle is
selected, while the browser picks up a newly installed Client plugin on the next page
load. Editing the Host files afterwards needs a Harness restart — the running process
keeps the module it loaded.

Open the right Sidebar, press the compass (guide), and pick **DataTug**.

To remove it: `dsh plugin --profile web remove @datatug/dsh-plugin`.

## What it gives you

### The panel

| Area | What it does |
|---|---|
| Project picker | Registered DataTug projects, from `datatug projects --format json` |
| Table list | The project's environments → sources → schemas → tables, from `datatug show --depth columns`, filterable |
| Table detail | The table's columns (name, type, key, nullability), **Load 10 / 50 / 100 rows**, a row grid, and **Copy CSV** |
| Status | The CLI version, or the reason the CLI is missing |

Rows are read with one plain command, the same one the skills document:

```bash
datatug query run --db 'datatug://<project>/<source>?env=<env>' --from <table> \
  --limit <N> --no-policies --format json
```

A project opened by directory instead of a registry entry is read the same way, with
the CLI's current-project reference (`datatug:///<source>`) and that directory as the
working directory.

### The tool

The agent gets one `datatug` tool:

| `action` | Runs |
|---|---|
| `projects` | `datatug projects --format json` |
| `show` | `datatug show --project <id>` (or `--directory <dir>`) `--format json --depth sources\|tables\|columns` |
| `queries` | `datatug queries --project <id> --format json` |
| `datasets` | `datatug datasets --project <id> --format json` |
| `rows` | one table read, as the panel does, returning the rows as JSON |
| `query` | one saved query: `datatug query run --project <id> --query <id> [--env] [--var k=v]` |
| `scan` | `datatug scan --directory <dir> --driver <driver> --db <db> --env <env> [--path]` |
| `validate` | `datatug validate --project <id>` |

Every argument is passed as its own argv element to the CLI through the Harness
subprocess service: no shell, no interpolation, so a project id or a table name can
never become shell syntax. Values that start with `-` are refused.

### The skills

The ten skills in [`../skills`](../skills) are registered as one bundled provider, so
`datatug-projects`, `datatug-queries`, `datatug-scan` and the rest appear in the
session's skill catalog (model and user invocation). Each body is prefixed with a
short DeepSeek Harness note that replaces the Claude Code instructions it was written
with.

## Configuration

The bundle row is `datatug` in the profile's composition; set its `config` in the
profile's `cordis.patch.yml` (or through the plugin's page in the Web UI):

| Field | Default | Meaning |
|---|---|---|
| `command` | `datatug` | Executable name or absolute path, resolved through `PATH` by the subprocess service |
| `cwd` | the Harness process's working directory | Working directory of every CLI run |
| `timeoutMs` | `20000` | Budget for one read; `scan` gets 120 s |
| `maxRows` | `200` | Upper bound for `rows`, from both the panel and the tool |
| `skills` | `true` | Set `false` to install the panel and tool without the skill provider |

## How the panel talks to the Host

The Host half provides a `datatug` Cordis service whose methods are marked for the
Harness Gateway, and the Client half calls them over the Gateway's `/api` channel
(`/api/datatug/<method>`) with `ctx.connection.rpc.call`. This uses the Gateway's
source-mode dispatch, which needs no generated Typert artifacts — the reason this
bundle has no build step and no dependency on a Harness package.

The methods answer JSON; a failure is a value (`{ ok: false, error: { code, message } }`),
never a rejected call, so the panel can always render why something failed.

This is a convenience for a personal data browser, not a security boundary: the
Gateway applies its usual Peer and access checks, and the plugin adds no
authentication of its own. Rows reach the model only when the agent calls the
`datatug` tool; what you open in the panel stays in the panel.

## Development

```bash
node --test dsh/test/*.test.mjs   # registration, marker and client-wiring smoke tests
node --check dsh/lib/index.js dsh/lib/client.js dsh/lib/cli.js
```

| File | Role |
|---|---|
| [`package.json`](package.json) | Bundle manifest: `dsh.bundle.patch`, `dsh.client`, exports, display metadata |
| [`cordis.patch.yml`](cordis.patch.yml) | The one Host row the bundle inserts |
| [`locale/en.json`](locale/en.json), [`icon.svg`](icon.svg) | Plugin Manager display metadata |
| [`lib/index.js`](lib/index.js) | Host plugin: service, Remote markers, `datatug` tool, skills provider |
| [`lib/cli.js`](lib/cli.js) | CLI runner over `ctx.subprocess`, JSON parsing, failure facts |
| [`lib/client.js`](lib/client.js) | Client plugin: right-sidebar page type and the panel |
| [`test/smoke.test.mjs`](test/smoke.test.mjs) | Smoke tests |

A linked install (`link:`) is read in place: edit, then reload the page for the
Client half. The Host half is a module of the running process — a Harness restart
picks up its changes.

## Known limits

- The panel is read-only: it lists and reads. Writing (scan, project setup) stays with
  the CLI, the skills and the `datatug` tool.
- No result card in the transcript and no interception of the agent's Bash calls, by
  design: the Harness tool path replaces them.
- Row values are rendered as text; a very wide table scrolls horizontally and cells
  are cut to 260 px (the full value is in the cell's tooltip).
- The client bundle is plain JavaScript with no JSX and no build; UI strings are
  English for now, and the display metadata is localized through
  [`locale/en.json`](locale/en.json).
