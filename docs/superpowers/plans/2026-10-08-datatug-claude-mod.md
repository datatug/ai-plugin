# DataTug Claude Code Mod Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `/datatug` command and project pane (Claude Code mod) to the `datatug/ai-plugin` plugin, and advance the plugin to `0.0.3`.

**Architecture:** A Claude Code mod is a plugin with `hooks/hooks.json` pointing at an ES-module `register(on)`. All project logic lives in pure files under `lib/` that receive an injected `fs` adapter (`exists`, `read`, `list`), because validation rejects passing `$` to imported files. `hooks/register.js` is thin: it builds the adapter from `$.fs.*`, loads the project, and opens/draws the pane. Tests use `claude plugin test` with an in-memory fs, so no session or disk fixtures are needed.

**Tech Stack:** JavaScript ES modules (mod code), TypeScript tests via `claude-code/testing`, Claude Code >= 2.1.287, SpecScore CLI.

**Spec:** `spec/features/claude-code-mod/README.md` (ACs: `project-discovery`, `pane-tabs`, `no-project`, `text-fallback`, `malformed-file-isolated`, `no-side-effects`, `other-manifests-unchanged`, `version-advance`).

## Global Constraints

- Work only in the worktree `/Users/alex/projects/.worktrees/datatug-claude-mod/github.com/datatug/ai-plugin` (never the canonical clone). Every command below runs from that directory.
- Read-only mod: calls limited to `$.fs.exists`, `$.fs.read`, `$.fs.list`, `$.session.cwd`, `$.command.register`, `$.ui.*`. No `process.*`, `http.*`, `fs.write`.
- Only the Claude Code manifest path references the mod. Codex, Gemini CLI, Copilot and Cursor manifests change only their `version`, to `0.0.3`.
- Hooks module rules (enforced by `claude plugin validate`): event names are string literals; write `$.ns.method` in full; never pass `$` to a function imported from another file; relative imports only, as `import` declarations at the top.
- Paths are POSIX (`/`-separated). Windows is out of scope for this plan.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never bypass hooks (`--no-verify`).
- Do not commit `.specscore-lifecycle.lock`; stage files by name.

## File Structure

| File | Responsibility |
| :- | :- |
| `hooks/hooks.json` | Points Claude Code at `./register.js` |
| `hooks/register.js` | Registers `/datatug`, opens the pane, draws it, text fallback. No logic beyond wiring. |
| `lib/project.js` | Pure: path helpers, `findProjectRoot(fs, dir)`, `loadProject(fs, root)`, `countQueries` |
| `lib/lines.js` | Pure: turns a loaded project into display lines per section, and the plain-text summary |
| `lib/view.js` | Pure: builds the pane element tree from the lines |
| `tests/fixtures.ts` | In-memory fs (`memfs`) and the `CHINOOK` fixture, mirroring `datatug/chinook-demo` |
| `tests/project.test.ts`, `tests/lines.test.ts`, `tests/mod.test.ts` | Unit tests for `lib/`; kit tests for the command and pane |

---

### Task 1: Scaffold the mod and confirm the API shapes

**Files:**
- Create: `hooks/hooks.json`, `hooks/register.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces: a loadable plugin that answers `/datatug`. Confirms the shape of `$.fs.list` entries (`kind` values), `$.fs.exists`, `$.session.cwd()` and `$.ui.open()` that later tasks assume.

- [ ] **Step 1: Check the Claude Code version**

Run: `claude --version`
Expected: `2.1.287` or later. If older, stop and run `claude update`.

- [ ] **Step 2: Ignore files Claude Code generates when it loads a mod from a directory**

Run:
```bash
printf '\n# Claude Code writes these when it loads the mod from a directory\n/tsconfig.json\n.claude-plugin/types/\n' >> .gitignore
```

- [ ] **Step 3: Create `hooks/hooks.json`**

```json
{
  "description": "The DataTug project pane mod",
  "modules": ["./register.js"]
}
```

- [ ] **Step 4: Create a minimal `hooks/register.js`**

```javascript
export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'datatug',
      description: 'Show the DataTug project in this directory',
    })
    return next(e)
  })

  on('command.run', { command: 'datatug' }, async ($) => {
    return { text: 'cwd: ' + (await $.session.cwd()) }
  })
}
```

- [ ] **Step 5: Load it and run the command non-interactively**

Run: `claude -p "/datatug" --plugin-dir .`
Expected: a line like `datatug: cwd: /Users/alex/projects/.worktrees/datatug-claude-mod/github.com/datatug/ai-plugin`.
If `/datatug` is not found, read the troubleshooting page (`/docs/en/plugins/mods/troubleshoot`) before continuing.

- [ ] **Step 6: Confirm the API shapes from the generated types**

Claude Code just wrote `.claude-plugin/types/claude-code/index.d.ts`. Run:
```bash
grep -n "isLink" -B8 -A3 .claude-plugin/types/claude-code/index.d.ts | head -40
grep -n "exists(" -B2 -A2 .claude-plugin/types/claude-code/index.d.ts | head -20
grep -n "cwd(" -B2 -A2 .claude-plugin/types/claude-code/index.d.ts | head -12
```
Record: (a) the exact string values of an fs entry's `kind`; (b) whether `exists` resolves to a boolean; (c) whether `cwd()` returns a string or a promise.
If (a) is not `'file' | 'directory'`, change `isDirectory` in Task 2 and `DIRECTORY_KIND` in `tests/fixtures.ts` (Task 2) to the real value. If (b) or (c) differ, adjust `lib/project.js` accordingly before Task 2 step 3.

- [ ] **Step 7: Confirm only intended files are untracked, then commit**

Run: `git status --short`
Expected: `.gitignore`, `hooks/`, and `.specscore-lifecycle.lock` only (no `tsconfig.json`, no `.claude-plugin/types/`).

```bash
git add .gitignore hooks/hooks.json hooks/register.js
git commit -m "feat(mod): scaffold the DataTug Claude Code mod with /datatug

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Project loader (`lib/project.js`)

**Files:**
- Create: `lib/project.js`, `tests/fixtures.ts`, `tests/project.test.ts`

**Interfaces:**
- Consumes: an `fs` adapter `{ exists(path): boolean|Promise<boolean>, read(path): string|Promise<string>, list(path): Entry[]|Promise<Entry[]> }`, where `Entry = { name: string, kind: string, size: number, isLink: boolean }`.
- Produces (used by Tasks 3 and 4):
  - `PROJECT_FILE = 'datatug-project.json'`
  - `joinPath(dir, name): string`, `parentDir(dir): string | null`
  - `classifyQueryFile(name): { stem: string, kind: 'meta'|'sql'|'dtql'|'http' } | null`
  - `findProjectRoot(fs, startDir): Promise<string | null>`
  - `loadProject(fs, root): Promise<Project>` where
    ```
    Project = {
      root: string,
      overview: { id, title, access: string|null, warnings: string[] },
      environments: { items: { id: string, drivers: string[], catalogs: number }[], warnings: string[] },
      queries: { tree: QueryNode, count: number, warnings: string[] },
      boards: { items: { id: string, title: string|null }[], warnings: string[] },
      dbModels: { items: { id: string, schemas: number, tables: number, views: number }[], warnings: string[] },
    }
    QueryNode = { name: string, queries: { id: string, title: string, kinds: string[] }[], children: QueryNode[] }
    ```
  - `countQueries(node): number`

- [ ] **Step 1: Create the fixture and in-memory fs, `tests/fixtures.ts`**

```typescript
// Mirrors the layout of datatug/chinook-demo, in memory.
export const DIRECTORY_KIND = 'directory'

export type Entry = { name: string; kind: string; size: number; isLink: boolean }

export const CHINOOK: Record<string, string> = {
  '/work/chinook/datatug-project.json': JSON.stringify({
    id: 'datatug-demo-project',
    title: 'DataTug Demo Project 1',
    access: 'public',
    boards: [{ id: 'board1', title: '1st board' }],
    dbModels: [{ id: 'chinook', numberOf: { schemas: 1, tables: 11, views: 0 } }],
    environments: [{ id: 'local' }, { id: 'dev' }, { id: 'prod' }],
  }),
  '/work/chinook/environments/local/local.env.json': JSON.stringify({
    id: 'local',
    dbServers: [
      { driver: 'sqlite3', catalogs: ['chinook-local', 'orders', 'countries', 'chinook', 'geo'] },
      { driver: 'https-json', catalogs: ['affiliations'] },
    ],
  }),
  '/work/chinook/environments/dev/dev.env.json': JSON.stringify({ id: 'dev' }),
  '/work/chinook/environments/prod/prod.env.json': JSON.stringify({
    id: 'prod',
    dbServers: [{ driver: 'sqlite3', catalogs: ['chinook-prod'] }],
  }),
  '/work/chinook/boards/REAMDE.md': '# boards',
  '/work/chinook/boards/board1/board.json': JSON.stringify({ title: '1st board' }),
  '/work/chinook/queries/albums/albums_by_title.sql': 'select 1',
  '/work/chinook/queries/albums/albums_by_title.sql.json': JSON.stringify({ title: 'Albums by title' }),
  '/work/chinook/queries/customers/customer-invoices.query.json': JSON.stringify({ title: 'Customer invoices' }),
  '/work/chinook/queries/customers/customer-invoices.query.dtql': 'from: Invoice',
  '/work/chinook/queries/reference/country-facts.query.http': 'GET https://example.com',
}

export function memfs(files: Record<string, string>) {
  const dirs = new Set<string>(['/'])
  for (const path of Object.keys(files)) {
    for (let d = path; d !== '/'; ) {
      const i = d.lastIndexOf('/')
      d = i <= 0 ? '/' : d.slice(0, i)
      dirs.add(d)
    }
  }
  return {
    exists: (path: string): boolean => path in files || dirs.has(path),
    read: (path: string): string => {
      if (!(path in files)) throw new Error('ENOENT: ' + path)
      return files[path]
    },
    list: (path: string): Entry[] => {
      if (!dirs.has(path)) throw new Error('ENOTDIR: ' + path)
      const prefix = path === '/' ? '/' : path + '/'
      const found = new Map<string, Entry>()
      for (const p of [...Object.keys(files), ...dirs]) {
        if (p === path || !p.startsWith(prefix)) continue
        const name = p.slice(prefix.length).split('/')[0]
        if (found.has(name)) continue
        const isDir = dirs.has(prefix + name)
        found.set(name, { name, kind: isDir ? DIRECTORY_KIND : 'file', size: 0, isLink: false })
      }
      return [...found.values()]
    },
  }
}
```

- [ ] **Step 2: Write the failing tests, `tests/project.test.ts`**

```typescript
import { expect, test } from 'claude-code/testing'
import { classifyQueryFile, countQueries, findProjectRoot, joinPath, loadProject, parentDir } from '../lib/project.js'
import { CHINOOK, memfs } from './fixtures'

test('joinPath and parentDir handle the filesystem root', async () => {
  expect(joinPath('/', 'a')).toBe('/a')
  expect(joinPath('/x/', 'a')).toBe('/x/a')
  expect(parentDir('/a/b')).toBe('/a')
  expect(parentDir('/a')).toBe('/')
  expect(parentDir('/')).toBe(null)
})

test('classifyQueryFile groups the known query file shapes', async () => {
  expect(classifyQueryFile('albums_by_title.sql.json')).toEqual({ stem: 'albums_by_title', kind: 'meta' })
  expect(classifyQueryFile('albums_by_title.sql')).toEqual({ stem: 'albums_by_title', kind: 'sql' })
  expect(classifyQueryFile('x.query.json')).toEqual({ stem: 'x', kind: 'meta' })
  expect(classifyQueryFile('x.query.dtql')).toEqual({ stem: 'x', kind: 'dtql' })
  expect(classifyQueryFile('x.query.http')).toEqual({ stem: 'x', kind: 'http' })
  expect(classifyQueryFile('README.md')).toBe(null)
})

test('findProjectRoot walks up to the nearest datatug-project.json', async () => {
  const fs = memfs(CHINOOK)
  expect(await findProjectRoot(fs, '/work/chinook/queries/albums')).toBe('/work/chinook')
  expect(await findProjectRoot(fs, '/work/chinook')).toBe('/work/chinook')
  expect(await findProjectRoot(fs, '/elsewhere')).toBe(null)
})

test('loadProject reads overview, environments, boards, models and the query tree', async () => {
  const project = await loadProject(memfs(CHINOOK), '/work/chinook')

  expect(project.overview).toEqual({
    id: 'datatug-demo-project',
    title: 'DataTug Demo Project 1',
    access: 'public',
    warnings: [],
  })
  expect(project.environments.items).toEqual([
    { id: 'dev', drivers: [], catalogs: 0 },
    { id: 'local', drivers: ['sqlite3', 'https-json'], catalogs: 6 },
    { id: 'prod', drivers: ['sqlite3'], catalogs: 1 },
  ])
  expect(project.boards.items).toEqual([{ id: 'board1', title: '1st board' }])
  expect(project.dbModels.items).toEqual([{ id: 'chinook', schemas: 1, tables: 11, views: 0 }])
  expect(project.queries.tree.children.map((c: { name: string }) => c.name)).toEqual(['albums', 'customers', 'reference'])
  expect(project.queries.tree.children[0].queries).toEqual([
    { id: 'albums_by_title', title: 'Albums by title', kinds: ['sql'] },
  ])
  expect(countQueries(project.queries.tree)).toBe(3)
  expect(project.queries.count).toBe(3)
})

test('a malformed query file warns on that section only', async () => {
  const files = { ...CHINOOK, '/work/chinook/queries/albums/albums_by_title.sql.json': '{not json' }
  const project = await loadProject(memfs(files), '/work/chinook')

  expect(project.queries.warnings.length).toBe(1)
  expect(project.queries.warnings[0]).toMatch(/^queries\/albums\/albums_by_title\.sql\.json: /)
  expect(project.queries.tree.children[0].queries[0].title).toBe('albums_by_title')
  expect(project.environments.items.length).toBe(3)
  expect(project.environments.warnings).toEqual([])
})

test('a malformed project file warns on the overview and the other sections still load', async () => {
  const files = { ...CHINOOK, '/work/chinook/datatug-project.json': '{not json' }
  const project = await loadProject(memfs(files), '/work/chinook')

  expect(project.overview.title).toBe(null)
  expect(project.overview.warnings.length).toBe(1)
  expect(project.overview.warnings[0]).toMatch(/^datatug-project\.json: /)
  expect(project.environments.items.length).toBe(3)
  expect(project.queries.count).toBe(3)
})
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `claude plugin test`
Expected: FAIL — `Cannot find module '../lib/project.js'` (or equivalent).

- [ ] **Step 4: Implement `lib/project.js`**

```javascript
// Pure DataTug project loader. It never touches the file system itself: every
// read goes through the `fs` adapter the caller passes in, so the same code
// runs under Claude Code's mods API and under test.

export const PROJECT_FILE = 'datatug-project.json'

const MAX_QUERY_DEPTH = 8
// stem + one of: .query.<ext>, .sql.json (metadata), .sql
const QUERY_FILE = /^(.+?)\.(?:query\.(json|sql|dtql|http)|(sql)\.json|(sql))$/

export function joinPath(dir, name) {
  return dir.replace(/\/+$/, '') + '/' + name
}

export function parentDir(dir) {
  const trimmed = dir.length > 1 ? dir.replace(/\/+$/, '') : dir
  if (trimmed === '/' || trimmed === '') return null
  const i = trimmed.lastIndexOf('/')
  return i <= 0 ? '/' : trimmed.slice(0, i)
}

export function isDirectory(entry) {
  return !entry.isLink && (entry.kind === 'directory' || entry.kind === 'dir')
}

export function classifyQueryFile(name) {
  const m = QUERY_FILE.exec(name)
  if (!m) return null
  if (m[2]) return { stem: m[1], kind: m[2] === 'json' ? 'meta' : m[2] }
  if (m[3]) return { stem: m[1], kind: 'meta' }
  return { stem: m[1], kind: 'sql' }
}

export function countQueries(node) {
  return node.queries.length + node.children.reduce((n, child) => n + countQueries(child), 0)
}

export async function findProjectRoot(fs, startDir) {
  for (let dir = startDir; dir !== null; dir = parentDir(dir)) {
    if (await fs.exists(joinPath(dir, PROJECT_FILE))) return dir
  }
  return null
}

function messageOf(err) {
  return err instanceof Error ? err.message : String(err)
}

function relative(root, path) {
  const prefix = root.replace(/\/+$/, '') + '/'
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

function byName(entries) {
  return [...entries].sort((a, b) => a.name.localeCompare(b.name))
}

async function readJson(fs, root, path) {
  try {
    return { value: JSON.parse(await fs.read(path)), warning: null }
  } catch (err) {
    return { value: null, warning: relative(root, path) + ': ' + messageOf(err) }
  }
}

// A missing folder is an empty section, not an error; an unreadable one warns.
async function listDir(fs, root, path) {
  if (!(await fs.exists(path))) return { entries: [], warning: null }
  try {
    return { entries: await fs.list(path), warning: null }
  } catch (err) {
    return { entries: [], warning: relative(root, path) + ': ' + messageOf(err) }
  }
}

async function loadEnvironments(fs, root) {
  const dir = joinPath(root, 'environments')
  const listed = await listDir(fs, root, dir)
  const warnings = listed.warning ? [listed.warning] : []
  const items = []
  for (const entry of byName(listed.entries).filter(isDirectory)) {
    const item = { id: entry.name, drivers: [], catalogs: 0 }
    const file = joinPath(joinPath(dir, entry.name), entry.name + '.env.json')
    if (await fs.exists(file)) {
      const read = await readJson(fs, root, file)
      if (read.warning) {
        warnings.push(read.warning)
      } else {
        const servers = Array.isArray(read.value?.dbServers) ? read.value.dbServers : []
        item.drivers = [...new Set(servers.map((s) => s?.driver).filter(Boolean))]
        item.catalogs = servers.reduce((n, s) => n + (Array.isArray(s?.catalogs) ? s.catalogs.length : 0), 0)
      }
    }
    items.push(item)
  }
  return { items, warnings }
}

async function loadBoards(fs, root) {
  const dir = joinPath(root, 'boards')
  const listed = await listDir(fs, root, dir)
  const warnings = listed.warning ? [listed.warning] : []
  const items = []
  for (const entry of byName(listed.entries).filter(isDirectory)) {
    const item = { id: entry.name, title: null }
    const file = joinPath(joinPath(dir, entry.name), 'board.json')
    if (await fs.exists(file)) {
      const read = await readJson(fs, root, file)
      if (read.warning) warnings.push(read.warning)
      else if (typeof read.value?.title === 'string') item.title = read.value.title
    }
    items.push(item)
  }
  return { items, warnings }
}

function loadDbModels(manifest) {
  const list = Array.isArray(manifest?.dbModels) ? manifest.dbModels : []
  const items = list
    .filter((m) => m && typeof m.id === 'string')
    .map((m) => ({
      id: m.id,
      schemas: m.numberOf?.schemas ?? 0,
      tables: m.numberOf?.tables ?? 0,
      views: m.numberOf?.views ?? 0,
    }))
  return { items, warnings: [] }
}

async function loadQueryDir(fs, root, dir, name, depth, warnings) {
  const node = { name, queries: [], children: [] }
  const listed = await listDir(fs, root, dir)
  if (listed.warning) warnings.push(listed.warning)

  const groups = new Map()
  const subdirs = []
  for (const entry of byName(listed.entries)) {
    if (isDirectory(entry)) {
      if (depth < MAX_QUERY_DEPTH) subdirs.push(entry)
      continue
    }
    const cls = classifyQueryFile(entry.name)
    if (!cls) continue
    const group = groups.get(cls.stem) ?? { id: cls.stem, title: cls.stem, kinds: [], meta: null }
    if (cls.kind === 'meta') group.meta = entry.name
    else group.kinds.push(cls.kind)
    groups.set(cls.stem, group)
  }

  for (const group of groups.values()) {
    if (group.meta) {
      const read = await readJson(fs, root, joinPath(dir, group.meta))
      if (read.warning) warnings.push(read.warning)
      else if (typeof read.value?.title === 'string' && read.value.title) group.title = read.value.title
    }
    node.queries.push({ id: group.id, title: group.title, kinds: group.kinds })
  }
  for (const sub of subdirs) {
    node.children.push(await loadQueryDir(fs, root, joinPath(dir, sub.name), sub.name, depth + 1, warnings))
  }
  return node
}

async function loadQueries(fs, root) {
  const warnings = []
  const tree = await loadQueryDir(fs, root, joinPath(root, 'queries'), 'queries', 0, warnings)
  return { tree, count: countQueries(tree), warnings }
}

const asString = (v) => (typeof v === 'string' ? v : null)

export async function loadProject(fs, root) {
  const manifest = await readJson(fs, root, joinPath(root, PROJECT_FILE))
  const m = manifest.value ?? {}
  return {
    root,
    overview: {
      id: asString(m.id),
      title: asString(m.title),
      access: asString(m.access),
      warnings: manifest.warning ? [manifest.warning] : [],
    },
    environments: await loadEnvironments(fs, root),
    queries: await loadQueries(fs, root),
    boards: await loadBoards(fs, root),
    dbModels: loadDbModels(m),
  }
}
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `claude plugin test`
Expected: PASS — 6 tests in `tests/project.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/project.js tests/fixtures.ts tests/project.test.ts
git commit -m "feat(mod): load a DataTug project through an injected fs adapter

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Display lines and text summary (`lib/lines.js`)

**Files:**
- Create: `lib/lines.js`, `tests/lines.test.ts`

**Interfaces:**
- Consumes: `Project` from Task 2.
- Produces (used by Task 4):
  - `SECTIONS: { id: 'overview'|'environments'|'queries'|'boards', label: string, hotkey: string }[]`
  - `sectionLines(project, id): { text: string, tone: 'normal'|'dim'|'warn' }[]`
  - `summaryText(project): string`

- [ ] **Step 1: Write the failing tests, `tests/lines.test.ts`**

```typescript
import { expect, test } from 'claude-code/testing'
import { loadProject } from '../lib/project.js'
import { SECTIONS, sectionLines, summaryText } from '../lib/lines.js'
import { CHINOOK, memfs } from './fixtures'

const texts = (project: unknown, id: string) => sectionLines(project, id).map((l: { text: string }) => l.text)

test('the four sections are in tab order', async () => {
  expect(SECTIONS.map((s: { id: string }) => s.id)).toEqual(['overview', 'environments', 'queries', 'boards'])
})

test('overview lines show title, id, access, root and counts', async () => {
  const project = await loadProject(memfs(CHINOOK), '/work/chinook')
  expect(texts(project, 'overview')).toEqual([
    'DataTug Demo Project 1',
    'id: datatug-demo-project',
    'access: public',
    'root: /work/chinook',
    '3 environments · 3 queries · 1 board · 1 DB model',
  ])
})

test('environment lines show drivers and catalog counts', async () => {
  const project = await loadProject(memfs(CHINOOK), '/work/chinook')
  expect(texts(project, 'environments')).toEqual([
    'dev',
    'local  sqlite3, https-json · 6 catalogs',
    'prod  sqlite3 · 1 catalog',
  ])
})

test('query lines are an indented folder tree', async () => {
  const project = await loadProject(memfs(CHINOOK), '/work/chinook')
  expect(texts(project, 'queries')).toEqual([
    'albums/',
    '  Albums by title (albums_by_title) [sql]',
    'customers/',
    '  Customer invoices (customer-invoices) [dtql]',
    'reference/',
    '  country-facts [http]',
  ])
})

test('boards and models share one tab', async () => {
  const project = await loadProject(memfs(CHINOOK), '/work/chinook')
  expect(texts(project, 'boards')).toEqual([
    'Boards',
    'board1 — 1st board',
    'DB models',
    'chinook — 1 schema, 11 tables, 0 views',
  ])
})

test('warnings are appended as warn-tone rows', async () => {
  const files = { ...CHINOOK, '/work/chinook/queries/albums/albums_by_title.sql.json': '{not json' }
  const project = await loadProject(memfs(files), '/work/chinook')
  const last = sectionLines(project, 'queries').at(-1)
  expect(last.tone).toBe('warn')
  expect(last.text).toMatch(/^⚠ queries\/albums\/albums_by_title\.sql\.json: /)
})

test('empty sections say so', async () => {
  const project = await loadProject(memfs({ '/p/datatug-project.json': '{}' }), '/p')
  expect(texts(project, 'environments')).toEqual(['No environments.'])
  expect(texts(project, 'queries')).toEqual(['No queries.'])
})

test('summaryText prints every section under its label', async () => {
  const project = await loadProject(memfs(CHINOOK), '/work/chinook')
  const text = summaryText(project)
  expect(text.startsWith('Overview\n  DataTug Demo Project 1')).toBe(true)
  expect(text).toContain('\n\nEnvironments\n  dev')
  expect(text).toContain('\n\nQueries\n  albums/')
  expect(text).toContain('\n\nBoards & models\n  Boards')
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `claude plugin test`
Expected: FAIL — `Cannot find module '../lib/lines.js'`.

- [ ] **Step 3: Implement `lib/lines.js`**

```javascript
import { countQueries } from './project.js'

export const SECTIONS = [
  { id: 'overview', label: 'Overview', hotkey: '1' },
  { id: 'environments', label: 'Environments', hotkey: '2' },
  { id: 'queries', label: 'Queries', hotkey: '3' },
  { id: 'boards', label: 'Boards & models', hotkey: '4' },
]

const line = (text, tone = 'normal') => ({ text, tone })
const warnLines = (warnings) => warnings.map((w) => line('⚠ ' + w, 'warn'))
const plural = (n, one, many = one + 's') => n + ' ' + (n === 1 ? one : many)

function queryLines(node, indent, out) {
  for (const q of node.queries) {
    const label = q.title === q.id ? q.id : q.title + ' (' + q.id + ')'
    out.push(line(indent + label + (q.kinds.length ? ' [' + q.kinds.join(', ') + ']' : '')))
  }
  for (const child of node.children) {
    out.push(line(indent + child.name + '/', 'dim'))
    queryLines(child, indent + '  ', out)
  }
  return out
}

function countsLine(project) {
  return [
    plural(project.environments.items.length, 'environment'),
    plural(countQueries(project.queries.tree), 'query', 'queries'),
    plural(project.boards.items.length, 'board'),
    plural(project.dbModels.items.length, 'DB model'),
  ].join(' · ')
}

function environmentLine(item) {
  const detail = item.catalogs ? '  ' + item.drivers.join(', ') + ' · ' + plural(item.catalogs, 'catalog') : ''
  return line(item.id + detail)
}

export function sectionLines(project, id) {
  switch (id) {
    case 'overview': {
      const o = project.overview
      return [
        line(o.title ?? '(untitled project)'),
        line('id: ' + (o.id ?? '—'), 'dim'),
        line('access: ' + (o.access ?? '—'), 'dim'),
        line('root: ' + project.root, 'dim'),
        line(countsLine(project)),
        ...warnLines(o.warnings),
      ]
    }
    case 'environments': {
      const { items, warnings } = project.environments
      const rows = items.length ? items.map(environmentLine) : [line('No environments.', 'dim')]
      return [...rows, ...warnLines(warnings)]
    }
    case 'queries': {
      const { tree, count, warnings } = project.queries
      const rows = count ? queryLines(tree, '', []) : [line('No queries.', 'dim')]
      return [...rows, ...warnLines(warnings)]
    }
    case 'boards': {
      const boards = project.boards.items.length
        ? project.boards.items.map((b) => line(b.title ? b.id + ' — ' + b.title : b.id))
        : [line('No boards.', 'dim')]
      const models = project.dbModels.items.length
        ? project.dbModels.items.map((m) =>
            line(m.id + ' — ' + [plural(m.schemas, 'schema'), plural(m.tables, 'table'), plural(m.views, 'view')].join(', ')),
          )
        : [line('No DB models.', 'dim')]
      return [
        line('Boards', 'dim'),
        ...boards,
        line('DB models', 'dim'),
        ...models,
        ...warnLines([...project.boards.warnings, ...project.dbModels.warnings]),
      ]
    }
    default:
      return []
  }
}

export function summaryText(project) {
  return SECTIONS.map((s) =>
    [s.label, ...sectionLines(project, s.id).map((l) => '  ' + l.text)].join('\n'),
  ).join('\n\n')
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `claude plugin test`
Expected: PASS — all tests in `tests/project.test.ts` and `tests/lines.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/lines.js tests/lines.test.ts
git commit -m "feat(mod): build per-section display lines and a text summary

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Pane view and the full hooks module

**Files:**
- Create: `lib/view.js`, `tests/mod.test.ts`
- Modify: `hooks/register.js` (replace the Task 1 spike)

**Interfaces:**
- Consumes: `findProjectRoot`, `loadProject` (Task 2); `SECTIONS`, `sectionLines`, `summaryText` (Task 3).
- Produces: `buildPane(elements, project, tab, onTab): Element` where `elements = { Box, Text, Button }` from `$.ui.resolve(e)`, `tab` is a section id, `onTab(id)` switches tab. Button keys are `'tab-' + section.id`.

- [ ] **Step 1: Write the failing kit tests, `tests/mod.test.ts`**

```typescript
import { expect, test } from 'claude-code/testing'
import { CHINOOK, memfs } from './fixtures'

// What Claude Code passes to a ui.render hook for this pane, apart from the app
const PANE = {
  plugin: 'datatug',
  component: 'Pane',
  requestId: 'datatug-project',
  surface: 'terminal',
  viewport: { columns: 100, rows: 30 },
  props: {
    title: 'DataTug',
    isFocused: true,
    bodyColumns: 80,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
} as const

// Answers the mod's file and cwd calls from an in-memory project.
function stubWorld(on: any, cwd: string, files: Record<string, string> = CHINOOK) {
  const fs = memfs(files)
  on('session.cwd', () => ({ value: cwd }))
  on('fs.exists', ($: any, e: any) => ({ value: fs.exists(e.path) }))
  on('fs.read', ($: any, e: any) => {
    try {
      return { value: fs.read(e.path) }
    } catch (err: any) {
      return { deny: err.message }
    }
  })
  on('fs.list', ($: any, e: any) => {
    try {
      return { value: fs.list(e.path) }
    } catch (err: any) {
      return { deny: err.message }
    }
  })
}

test('registers /datatug at session start', async ($, on) => {
  const registered: string[] = []
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', ($: any, e: any) => {
    registered.push(e.name)
    return { value: undefined }
  })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(registered).toEqual(['datatug'])
})

test('/datatug opens the pane and the Queries tab lists the query tree', async ($, on) => {
  stubWorld(on, '/work/chinook/queries/albums')
  const opened: string[] = []
  on('ui.open', ($: any, e: any) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })

  const answer = await $.command.run({ command: 'datatug', args: '' })
  expect(answer).toEqual({})
  expect(opened).toEqual(['datatug-project'])

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'DataTug Demo Project 1' })).toBeDefined()
  await ui.press({ key: 'tab-environments' })
  expect(await ui.find({ type: 'Text', text: /^local {2}sqlite3, https-json/ })).toBeDefined()
  await ui.press({ key: 'tab-queries' })
  expect(await ui.find({ type: 'Text', text: /Albums by title/ })).toBeDefined()
  await ui.press({ key: 'tab-boards' })
  expect(await ui.find({ type: 'Text', text: /^chinook — 1 schema, 11 tables/ })).toBeDefined()
  await ui.unmount()
})

test('/datatug outside a project replies with one line and opens no pane', async ($, on) => {
  stubWorld(on, '/elsewhere')
  let opens = 0
  on('ui.open', () => {
    opens += 1
    return { value: { isPlaced: true } }
  })

  const answer = await $.command.run({ command: 'datatug', args: '' })
  expect(answer.text).toMatch(/No datatug-project\.json found in \/elsewhere/)
  expect(opens).toBe(0)
})

test('when the pane is not placed, /datatug replies with the text summary', async ($, on) => {
  stubWorld(on, '/work/chinook')
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'no interface here' } }))

  const answer = await $.command.run({ command: 'datatug', args: '' })
  expect(answer.text).toMatch(/^Overview\n {2}DataTug Demo Project 1/)
  expect(answer.text).toContain('Boards & models')
})

test('when opening a pane fails, /datatug replies with the text summary', async ($, on) => {
  stubWorld(on, '/work/chinook')
  on('ui.open', () => ({ deny: 'panes are not available' }))

  const answer = await $.command.run({ command: 'datatug', args: '' })
  expect(answer.text).toMatch(/^Overview\n {2}DataTug Demo Project 1/)
})

test('a malformed query file shows a warning row and the other tabs still render', async ($, on) => {
  const files = { ...CHINOOK, '/work/chinook/queries/albums/albums_by_title.sql.json': '{not json' }
  stubWorld(on, '/work/chinook', files)
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.command.run({ command: 'datatug', args: '' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-queries' })
  expect(await ui.find({ type: 'Text', text: /^⚠ queries\/albums\/albums_by_title\.sql\.json/ })).toBeDefined()
  await ui.press({ key: 'tab-environments' })
  expect(await ui.find({ type: 'Text', text: /^dev$/ })).toBeDefined()
  await ui.unmount()
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `claude plugin test`
Expected: the new tests FAIL (the spike `register.js` answers `cwd: ...` and never opens a pane); earlier tests still pass.

- [ ] **Step 3: Implement `lib/view.js`**

```javascript
import { SECTIONS, sectionLines } from './lines.js'

// `elements` is `{ Box, Text, Button }` from `$.ui.resolve(e)`.
export function buildPane({ Box, Text, Button }, project, tab, onTab) {
  const tabs = SECTIONS.map((section) =>
    Button({
      key: 'tab-' + section.id,
      label: section.label,
      hotkey: section.hotkey,
      plain: true,
      dimColor: tab !== section.id,
      onPress: () => onTab(section.id),
    }),
  )

  const body = sectionLines(project, tab).map((row) =>
    Text({
      wrap: 'truncate-end',
      ...(row.tone === 'warn' ? { color: 'yellow' } : {}),
      ...(row.tone === 'dim' ? { dimColor: true } : {}),
      children: [row.text],
    }),
  )

  return Box({
    flexDirection: 'column',
    children: [
      Box({ flexDirection: 'row', columnGap: 2, children: tabs }),
      Text({ children: [' '] }),
      ...body,
    ],
  })
}
```

- [ ] **Step 4: Replace `hooks/register.js` with the full module**

```javascript
import { summaryText } from '../lib/lines.js'
import { findProjectRoot, loadProject } from '../lib/project.js'
import { buildPane } from '../lib/view.js'

const PANE = 'datatug-project'

// What the pane shows: the loaded project and the open tab.
let project = null
let tab = 'overview'

// The only file access the mod has: three read-only calls.
function fsOf($) {
  return {
    exists: (path) => $.fs.exists(path),
    read: (path) => $.fs.read(path),
    list: (path) => $.fs.list(path),
  }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'datatug',
      description: 'Show the DataTug project in this directory',
    })
    return next(e)
  })

  on('command.run', { command: 'datatug' }, async ($) => {
    const cwd = await $.session.cwd()
    const fs = fsOf($)
    const root = await findProjectRoot(fs, cwd)
    if (root === null) {
      return { text: 'No datatug-project.json found in ' + cwd + ' or any parent directory.' }
    }

    project = await loadProject(fs, root)
    tab = 'overview'

    // Where nothing can draw, fall back to a plain-text summary.
    try {
      const opened = await $.ui.open({ id: PANE, title: 'DataTug', focus: true, closeOnEscape: true })
      if (opened.isPlaced) return {}
    } catch {
      // fall through to the text summary
    }
    return { text: summaryText(project) }
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE || project === null) return next(e)
    const elements = $.ui.resolve(e)
    return buildPane(elements, project, tab, (id) => {
      tab = id
      $.ui.invalidate('ui.render')
    })
  })
}
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `claude plugin test`
Expected: PASS — all tests across the three files. If `ui.mount` rejects the tree, the failure output names the bad prop (for example `Text prop "wrap" is not allowed`); fix `lib/view.js` to match the reference, do not weaken the test.

- [ ] **Step 6: Validate the mod statically**

Run: `claude plugin validate .`
Expected: `✔ Validation passed`, with
- `hooks:` line listing `session.start`, `command.run{command=datatug}`, `ui.render{component=Pane}`;
- `calls:` line containing only `$.command.register`, `$.fs.exists`, `$.fs.read`, `$.fs.list`, `$.session.cwd`, `$.ui.open`, `$.ui.resolve`, `$.ui.invalidate` (some marked `(via fsOf)`).
If validation reports `a function you import from another of your files` for `$`, move that call into `hooks/register.js` — `$` must never be passed to `lib/`.

- [ ] **Step 7: Commit**

```bash
git add lib/view.js hooks/register.js tests/mod.test.ts
git commit -m "feat(mod): add the /datatug project pane with text fallback

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Version bump, docs and spec status

**Files:**
- Modify: `.claude-plugin/plugin.json`, `plugin.json`, `gemini-extension.json`, `.github/plugin.json`, `.codex-plugin/plugin.json`, `README.md`, `spec/features/claude-code-mod/README.md`, `spec/features/namespaced-agent-skills/README.md`

- [ ] **Step 1: Advance every manifest to 0.0.3 (AC `version-advance`)**

```bash
sed -i '' 's/"version": "0.0.2"/"version": "0.0.3"/' .claude-plugin/plugin.json plugin.json gemini-extension.json .github/plugin.json .codex-plugin/plugin.json
for f in .claude-plugin/plugin.json plugin.json gemini-extension.json .github/plugin.json .codex-plugin/plugin.json; do jq -r .version "$f"; done | sort -u
```
Expected output: exactly one line, `0.0.3`.

- [ ] **Step 2: Confirm the other manifests do not reference the mod (AC `other-manifests-unchanged`)**

Run: `grep -l "hooks" plugin.json gemini-extension.json .github/plugin.json .codex-plugin/plugin.json .claude-plugin/plugin.json`
Expected: no output (exit status 1).

- [ ] **Step 3: Document the mod in `README.md`**

Add two rows to the Contents table directly after the `.claude-plugin/` row:

```markdown
| [`hooks/`](hooks/hooks.json), [`lib/`](lib/project.js) | Claude Code mod: the `/datatug` project pane (Claude Code only) |
| [`tests/`](tests/mod.test.ts) | Mod tests, run with `claude plugin test` |
```

Insert this section immediately before the `## Install` heading:

```markdown
## Claude Code mod

In Claude Code, the plugin also ships a [mod](https://code.claude.com/docs/en/plugins/mods/overview): run `/datatug` in a DataTug project to open a read-only pane with four tabs (Overview, Environments, Queries, Boards & models). It reads the project files directly (no network, no processes). Where nothing can draw (VS Code chat, `claude -p`), it prints a text summary instead. Requires Claude Code 2.1.287 or later; other hosts ignore the mod.

Develop and test it from this directory with `claude --plugin-dir .`, `claude plugin validate .` and `claude plugin test`.
```

- [ ] **Step 4: Keep the earlier feature's version criterion true**

In `spec/features/namespaced-agent-skills/README.md`, replace the single line

```
tree and every metadata version is DataTug plugin `0.0.2`; this verifies
```

with

```
tree and every metadata version is one shared DataTug plugin version (`0.0.3` since the Claude Code Project Pane Mod); this verifies
```

- [ ] **Step 5: Lint the spec tree**

Run: `specscore spec lint`
Expected: `0 violations found`.

- [ ] **Step 6: Commit**

```bash
git add .claude-plugin/plugin.json plugin.json gemini-extension.json .github/plugin.json .codex-plugin/plugin.json README.md spec/features/namespaced-agent-skills/README.md
git commit -m "chore: advance the plugin to 0.0.3 and document the Claude Code mod

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verify end to end, review, and land

**Files:**
- Modify: `spec/features/claude-code-mod/README.md` (status)

- [ ] **Step 1: Run the full verification set**

```bash
claude plugin test
claude plugin validate . --strict
specscore spec lint
```
Expected: all tests pass; `✔ Validation passed` with no warnings; `0 violations found`.

- [ ] **Step 2: Run the command against a real project**

```bash
cd /Users/alex/projects/datatug/chinook-demo && claude -p "/datatug" --plugin-dir /Users/alex/projects/.worktrees/datatug-claude-mod/github.com/datatug/ai-plugin
cd /Users/alex/projects/.worktrees/datatug-claude-mod/github.com/datatug/ai-plugin
```
Expected: the plain-text summary (a `-p` run cannot draw), starting `datatug: Overview` / `  DataTug Demo Project 1`, listing environments `QA`, `UAT`, `dev`, `local`, `prod` and the real query folders (`albums`, `artists`, `customers`, `invoices`, `reference`, `sales`, `tracks`). Compare it against `ls /Users/alex/projects/datatug/chinook-demo/queries`.

- [ ] **Step 3: Look at the real pane**

In an interactive terminal run `claude --plugin-dir <worktree path>` inside `/Users/alex/projects/datatug/chinook-demo`, type `/datatug`, press `1` to `4`, then Esc. A drawing test checks the tree, not how the terminal paints it, so confirm the tabs, dimming and truncation look right. Record anything off and fix it in `lib/view.js` with a new test.

- [ ] **Step 4: Check the other hosts tolerate `hooks/hooks.json` (known risk)**

Gemini CLI and Copilot may auto-discover `hooks/hooks.json`. If `gemini` is installed, run `gemini extensions validate .`; otherwise leave the verification note below as is. The file has a `modules` key and no `hooks` key.
Expected: no error from a host that is installed. Record any host not exercised as "unverified" in the spec's Verification Status.

- [ ] **Step 5: Move the spec to Implementing**

Add a `## Verification Status` section before the closing `---` in `spec/features/claude-code-mod/README.md` stating exactly what was run and observed in Steps 1 to 4 (including any host left unverified), then:

```bash
specscore feature change-status claude-code-mod Implementing
specscore spec lint
```
Expected: status line reads `Implementing`; `0 violations found`.

- [ ] **Step 6: Commit**

```bash
git add spec/features/README.md spec/features/claude-code-mod/README.md
git commit -m "spec: mark the Claude Code project pane mod as Implementing

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Independent review, then land**

Per rule `never-self-approve-a-landing`, an independent reviewer (not the implementer) reviews the branch diff against the spec ACs (`/code-review` or a fresh reviewer subagent). Fix findings in follow-up commits. Then run `wb pr create --help` to confirm the current flags and land the single worktree with `wb pr create ... --land --approved-by <review receipt>`. Do not use `gh pr create` or `gh pr merge`.
Expected: the PR merges, the worktree and branch are cleaned up by `wb`, and the canonical clone is on the updated `main`.

---

## Self-review (spec coverage)

| Spec AC | Task |
| :- | :- |
| `project-discovery` | Task 2 (`findProjectRoot`, `loadProject` tests) |
| `pane-tabs` | Task 4 (`/datatug opens the pane…` test, steps 1 and 3 of Task 6) |
| `no-project` | Task 4 (`outside a project` test) |
| `text-fallback` | Task 4 (`not placed` and `opening fails` tests), Task 6 step 2 |
| `malformed-file-isolated` | Task 2 and Task 4 (malformed tests) |
| `no-side-effects` | Task 4 step 6 (`claude plugin validate`) |
| `other-manifests-unchanged` | Task 5 step 2 |
| `version-advance` | Task 5 step 1 |
