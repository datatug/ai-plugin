import { atom, memberOf, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { MIN_CLI_VERSION, VERSION_ARGS, isOlder, missingCliText, parseVersion, tooOldText } from '../lib/cli.js'
import { LINK_MIN_CLI_VERSION, LINK_TTL_MS, MESSAGES, STATUS_ARGS, bigIntegers, fingerprint, isSameHost, isUnknownCommand, parseDevHost, readLink, recordKey, sourceUnavailableText, urlArgs } from '../lib/links.js'
import { CARD_MIN_CLI_VERSION, LEGACY_TEXT, MAX_DATA_BYTES, MAX_META_BYTES, OPEN_MIN_CLI_VERSION, RESULT_VIEW_MIN_CLI_VERSION, STATE_TEXT, TEXT, UNAVAILABLE_TEXT, VIEWS, VIEW_LABELS, fallbackOf, isRef, readData, readLocator, readMeta, resultId, resultSummary, resultUrlArgs, statLandsAt, storeProblem, uiCommand } from '../lib/results.js'
import { isProjectView } from '../lib/command.js'
import { FAILED_TEXT, STORE_TEXT, bashNamesStore, classify, normalizePath, pathInStore } from '../lib/bash.js'
import { stripUnsafe } from '../lib/text.js'
import { canDrawPane } from '../lib/view.js'
import { registerProject } from './project.js'

import type { Bag, BagEntry, CardMeta, CardState, CardView, DbRecordsState, DatabasesState, DbTableState, GridResult, GridView, LinkState, OpenDbState, ProjectsState, SchemaColumn, SchemaFk, SchemaState, SchemaTable } from '../types'

const PANE = 'datatug'
const TITLE = 'DataTug'
const NO_BAG: Bag = { isEnabled: true, entries: [] }
const MAX_ROWS = 2000
const MAX_CELL = 200
const CHAT_ROWS = 20
const MAX_COLS = 10
const BASE = 'https://datatug.invalid/'

const results = atom({ plugin: 'datatug', key: 'results' } as const, {} as Record<string, GridResult>)
const shownRows = atom({ plugin: 'datatug', key: 'shownRows' } as const, {} as Record<string, number>)
const projects = atom({ plugin: 'datatug', key: 'projects' } as const, {
  status: 'idle',
  items: [],
  message: '',
} as ProjectsState)
const project = atom({ plugin: 'datatug', key: 'project' } as const, { selected: null } as { selected: string | null; isOpen?: boolean })
const bags = atom({ plugin: 'datatug', key: 'bags' } as const, {} as Record<string, Bag>)
const schema = atom({ plugin: 'datatug', key: 'schema' } as const, {
  projectId: null,
  status: 'idle',
  tables: [],
  message: '',
} as SchemaState)
const openDb = atom({ plugin: 'datatug', key: 'openDb' } as const, {
  status: 'idle',
  provider: '',
  note: '',
  target: '',
  url: '',
  items: [],
  message: '',
} as OpenDbState)
const databases = atom({ plugin: 'datatug', key: 'databases' } as const, {
  projectId: null,
  status: 'idle',
  items: [],
  message: '',
  note: '',
} as DatabasesState)
const columnOrder = atom({ plugin: 'datatug', key: 'columnOrder' } as const, 'defined' as 'defined' | 'alpha' | 'type')
const dbRecords = atom({ plugin: 'datatug', key: 'dbRecords' } as const, {
  name: null,
  status: 'idle',
  message: '',
  resultId: null,
  page: 0,
} as DbRecordsState)
const dbTable = atom({ plugin: 'datatug', key: 'dbTable' } as const, {
  name: null,
  status: 'idle',
  message: '',
  result: null,
} as DbTableState)
const view = atom({ plugin: 'datatug', key: 'view' } as const, {
  current: null,
  selected: null,
  offset: 0,
} as GridView)
// The "Open in DataTug" state of each linked card (table, records, record): what it shows and when it
// was checked. Never the link itself, a key value or a row: the link is kept in memory only (`hrefs`).
const links = atom({ plugin: 'datatug', key: 'links' } as const, {} as Record<string, LinkState>)
// One result card per `datatug query run` the model ran with result files, keyed by its tool call id:
// what a press changes redraws that card alone. A card reads only its member and `columnOrder`.
const NO_CARD: CardState = { status: 'none', id: '', view: 'table', row: 0, shown: 20, page: 0 }
const cards = atom({ plugin: 'datatug', key: 'cards' } as const, NO_CARD)
// The cards that hold rows, oldest first: at most MAX_CARDS (a family cannot be listed).
const cardRows = atom({ plugin: 'datatug', key: 'cardRows' } as const, [] as string[])
const MAX_CARDS = 10
// The result the person closed in the panel (its card key), or ''. The panel shows no "Latest result"
// while the newest card is that one; the transcript row keeps its card, and a newer result shows again.
const latestClosed = atom({ plugin: 'datatug', key: 'latestClosed' } as const, '')

// Every datatug call the mod makes names the mod as its caller, so the CLI keeps the local DataTug
// agent (the daemon the web links open) running as a side effect of the cards' own calls.
const CLIENT = { DATATUG_CLIENT: 'claude-mod' } as const
const cliEnv = (env: Record<string, string> = {}) => ({ ...env, ...CLIENT })

// The datatug version `/datatug` found (null: a development build; undefined: not checked since load).
let cliVersion: number[] | null | undefined
// How this session runs the model's `datatug query run`: with result files ('new') or through the
// private capture ('legacy'); undefined until the first query asks. `legacyWhy` is a key of
// LEGACY_TEXT, or null when the version probe failed. `bashVersion` is what the probe read.
let bashMode: 'new' | 'legacy' | undefined
let legacyWhy: string | null = null
let bashVersion: number[] | null = null
// The development web UI origin the person configured in the plugin's settings, or null.
let devOrigin: string | null = null
// Links the CLI printed and the mod checked, by card, with the request they answer. Memory only:
// a link carries a one-time code.
const hrefs = new Map<string, { req: string; href: string }>()
// The request each card is fetching now, so a render does not start a second fetch.
const fetching = new Map<string, string>()

const NO_PANE_TEXT = 'The DataTug panel needs the terminal or the Desktop app. Run `/datatug project` for a text summary of the project in this folder.'
const ROWS_DIR = 'datatug-claude-mod'

// The temporary folder the capture folder goes in: the per-user one when the session has TMPDIR
// (absolute, with no quote, backslash or white space), else /tmp.
async function tmpBase($: Host): Promise<string> {
  try {
    const t = await $.env.get('TMPDIR')
    if (typeof t === 'string' && t.startsWith('/') && !/['\\\s]/.test(t)) return t.replace(/\/+$/, '') || '/tmp'
  } catch {
    // no environment here: the fixed folder stands
  }
  return '/tmp'
}

// Where a run's rows are written for the mod to read: a folder of its own under the temporary
// folder, made owner-only. The model never reads it.
async function rowsDir($: Host): Promise<string> {
  return `${await tmpBase($)}/${ROWS_DIR}`
}

async function homeDir($: Host): Promise<string | undefined> {
  try {
    const h = await $.env.get('HOME')
    return typeof h === 'string' && h.startsWith('/') && h.length > 1 ? h.replace(/\/+$/, '') : undefined
  } catch {
    return undefined
  }
}

// The folders the model's own tools must not reach: the result store and the capture folder, each
// with the folder directly above it, as spelled and as resolved where they exist.
async function storeRoots($: Host): Promise<{ dir: string; parent: string }[]> {
  const home = await homeDir($)
  const base = await tmpBase($)
  const roots = [{ dir: `${base}/${ROWS_DIR}`, parent: base }]
  if (home !== undefined) roots.push({ dir: `${home}/.datatug/query-results`, parent: `${home}/.datatug` })
  const real = async (p: string) => {
    try {
      return (await $.fs.exists(p)) ? ((await $.fs.stat(p, { resolve: true })).realPath ?? p) : p
    } catch {
      return p
    }
  }
  const resolved = await Promise.all(roots.map(async r => ({ dir: await real(r.dir), parent: await real(r.parent) })))
  return [...roots, ...resolved]
}

// Whether any of the paths a model tool was given names the store or the capture folder: by its
// spelling (folded, a glob pattern by the folder before its first wildcard), and where it resolves
// when it exists.
async function namesStore($: Host, paths: unknown[]): Promise<boolean> {
  const given = paths.filter((p): p is string => typeof p === 'string' && p.trim() !== '')
  if (given.length === 0) return false
  const roots = await storeRoots($)
  const home = await homeDir($)
  const cwd = await $.session.cwd().catch(() => undefined)
  for (const p of given) {
    if (/\.datatug\/query-results|(?:^|\/)datatug-claude-mod(?:\/|$)|\.datatug\/[^/]*[*?[{]/i.test(p)) return true
    const wild = p.search(/[*?[{]/)
    const plain = wild < 0 ? p : p.slice(0, wild).replace(/[^/]*$/, '')
    const n = normalizePath(plain === '' ? '.' : plain, home, cwd)
    if (pathInStore(n, roots)) return true
    if (n !== null && wild < 0) {
      try {
        if (await $.fs.exists(n)) {
          const realPath = (await $.fs.stat(n, { resolve: true })).realPath
          if (realPath !== undefined && pathInStore(realPath, roots)) return true
        }
      } catch {
        // a path that cannot be looked at is judged by its spelling alone
      }
    }
  }
  return false
}

// Removes a capture file through the shell (the mod's file access cannot delete), else empties it.
async function removeCapture($: Host, file: string) {
  try {
    const r = await $.process.run(['rm', '-f', file], { timeoutMs: 10000 })
    if (r.exitCode === 0) return
  } catch {
    // emptied below instead
  }
  try {
    if (await $.fs.exists(file)) await $.fs.write(file, '')
  } catch {
    // a file that can be neither removed nor emptied is left as it is
  }
}

// Control characters and line breaks would let a data value act on the terminal.
// An error with a message this module wrote itself: the only kind whose text is shown. Anything else
// (a failed spawn, a JSON error quoting CLI output) is shown as 'failed'.
class ModError extends Error {}
const failure = (err: unknown, max: number) => (err instanceof ModError ? scrub(err.message).slice(0, max) : 'failed')

function clean(text: string): string {
  return stripUnsafe(text)
}

// A connection string anywhere in text (an error message that repeats `--db`, a stored command) is
// blanked up to the last @ that follows it, so a password with an @ or a / in it cannot survive.
export function scrub(text: string): string {
  return stripUnsafe(text)
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\n]*@\S*|[a-z][a-z0-9+.-]*:\/\/\S*/gi, '***')
    .replace(/\b[a-z][a-z0-9+.-]*:[a-z0-9_]+=\S*/gi, '***')
    .replace(/\S+:\S+@\S+/g, '***')
        .replace(/--?(?:password|passwd|pwd|token|secret)[ =]+\S+/gi, '***')
    .replace(/\b(password|passwd|pwd|pass|secret|token|api_?key)\s*[=:]\s*[^\s;&]+/gi, '$1=***')
}

// A cell of the card's table: plain Text, never Markdown. A web or file address is broken so no
// terminal turns a value into a clickable link.
function gridText(value: unknown, max = 60): string {
  return cell(value)
    .slice(0, max)
    .replace(/(https?|file):\/\//gi, '$1:\u200b//')
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return clean(text)
}

// Data goes into a Markdown table: neutralise syntax and autolinks.
function md(value: unknown, max = 60): string {
  return cell(value)
    .slice(0, max)
    .replace(/(https?|file):\/\//gi, '$1:\u200b//')
    .replace(/[\\`*_[\]<>|~&]/g, m => '\\' + m)
}

// A column is numeric when every value it holds in the first rows is a number.
function isNumeric(result: GridResult, name: string): boolean {
  let seen = false
  for (const row of result.rows.slice(0, 200)) {
    const v = row[name]
    if (v === null || v === undefined) continue
    if (typeof v !== 'number') return false
    seen = true
  }
  return seen
}

// What the model reads in place of the rows: shape only, never values.
function summary(result: GridResult): string {
  const cols = result.columns.slice(0, 40).map(c => clean(c).slice(0, 60)).join(', ')
  return [
    `DataTug query returned ${result.total} row${result.total === 1 ? '' : 's'} x ${result.columns.length} column${result.columns.length === 1 ? '' : 's'}: ${cols}.`,
    result.isTruncated ? `The grid holds the first ${result.rows.length} rows.` : '',
    'The rows are shown to the user in a DataTug result grid and are withheld from you.',
  ]
    .filter(Boolean)
    .join(' ')
}

// The JSON output carries no declared column types, so they are read off the
// values: integer, number, string(<=longest seen), boolean, object, array, or
// several joined by `|`. A CLI that reports declared types (VARCHAR(10),
// NUMERIC(5,2)) would replace these.
export function inferType(rows: Record<string, unknown>[], name: string): string {
  const kinds = new Set<string>()
  let longest = 0
  let whole = 0
  let decimals = 0
  for (const row of rows.slice(0, 200)) {
    const v = row[name]
    if (v === null || v === undefined) continue
    if (typeof v === 'number') {
      if (Number.isInteger(v)) {
        kinds.add('integer')
      } else {
        kinds.add('number')
        const [int, frac = ''] = String(Math.abs(v)).split('.')
        whole = Math.max(whole, int.length)
        decimals = Math.max(decimals, frac.length)
      }
    } else if (typeof v === 'string') {
      kinds.add('string')
      longest = Math.max(longest, [...v].length)
    } else if (typeof v === 'boolean') kinds.add('boolean')
    else kinds.add(Array.isArray(v) ? 'array' : 'object')
  }
  if (kinds.size === 0) return 'null'
  return [...kinds]
    .map(k => (k === 'string' ? `string(≤${longest})` : k === 'number' ? `number(${whole + decimals},${decimals})` : k))
    .join('|')
}

// What the loaded rows say about one column (never the declared schema).
export function profileColumn(result: GridResult, name: string) {
  let nonNull = 0
  let nulls = 0
  const seen = new Set<string>()
  const samples: string[] = []
  let min: number | string | undefined
  let max: number | string | undefined
  let minLen = Infinity
  let maxLen = 0
  for (const row of result.rows) {
    const v = row[name]
    if (v === null || v === undefined) {
      nulls++
      continue
    }
    nonNull++
    const text = cell(v)
    if (seen.size < 5000) seen.add(text)
    if (samples.length < 4 && !samples.includes(text.slice(0, 40))) samples.push(text.slice(0, 40))
    if (typeof v === 'number') {
      if (min === undefined || v < (min as number)) min = v
      if (max === undefined || v > (max as number)) max = v
    } else if (typeof v === 'string') {
      if (min === undefined || v < (min as string)) min = v
      if (max === undefined || v > (max as string)) max = v
      minLen = Math.min(minLen, [...v].length)
      maxLen = Math.max(maxLen, [...v].length)
    }
  }
  return { nonNull, nulls, distinct: seen.size, min, max, minLen: minLen === Infinity ? 0 : minLen, maxLen, samples }
}

// `$key` is dalgo's internal record key. It is never metadata, and a data view drops it once the
// table's own primary key is known.
const KEY = '$key'
export function metaColumns(columns: string[]): string[] {
  return columns.filter(c => c !== KEY)
}
export function dataColumns(columns: string[], table: SchemaTable | undefined): string[] {
  const hasPk = table?.columns.some(c => c.pk !== null) === true
  return hasPk ? metaColumns(columns) : columns
}

// The key mark of a column: just 🔑 when the primary key has one column, 🔑 and its position when it has several.
export function keyMark(table: SchemaTable | undefined, pk: number | null): string {
  if (pk === null) return ''
  const parts = table?.columns.filter(c => c.pk !== null).length ?? 0
  return parts > 1 ? `🔑 ${pk}` : '🔑'
}

// The prompt for the checked context bag items: the items (each with its database reference), the one
// command to run, and the user's own question. Short and imperative so a small model runs the command at
// once; the rows reach the card, never the model. `openDb` is the database the panel has open, for an
// item that carries none.
export type BagSource = { id: string; env: string }

// The database an item without a recorded reference is asked against: the one it carries, else the open
// database, else the project's only database, else (several) the one source whose environment is
// `local`, never a production one by default. '' when still ambiguous: the prompt then lets Claude ask.
// Applied when the prompt is built, so an item bagged before the reference was recorded is upgraded too.
export function resolveBagDb(entryDb: string | undefined, openDb: string, projectId: string | null, sources: BagSource[]): { ref: string; rule: string } {
  if (entryDb !== undefined && isDbRef(entryDb)) return { ref: entryDb, rule: '' }
  if (isDbRef(openDb)) return { ref: openDb, rule: '' }
  if (projectId === null || projectId === '') return { ref: '', rule: '' }
  if (sources.length === 1) return { ref: dbRef(projectId, sources[0]), rule: ', default: the only database' }
  const local = sources.filter(s => s.env.toLowerCase() === 'local')
  if (local.length === 1) return { ref: dbRef(projectId, local[0]), rule: ', default: local' }
  return { ref: '', rule: '' }
}

export function bagPrompt(entries: BagEntry[], projectId: string | null, openDb = '', sources: BagSource[] = []): string {
  const shown = entries.slice(0, 50)
  const resolve = (e: BagEntry) => resolveBagDb(e.db, openDb, projectId, sources)
  const lines = shown.map(e => {
    const kind = e.kind ?? (e.address === 'contextBag.table' ? 'table' : e.address === 'contextBag.column' ? 'column' : 'value')
    const what = kind === 'value' ? `${clean(e.address).replace(/^contextBag\./, '')} = ${clean(e.value).slice(0, 200)}` : `${kind} ${clean(e.value).slice(0, 200)}`
    const r = resolve(e)
    return `- ${what} (${r.ref === '' ? 'database not recorded' : `database ${r.ref}${r.rule}`})`
  })
  const where = projectId !== null && projectId !== '' ? ` (project ${clean(projectId).slice(0, 80)})` : ''
  const dbOf = shown.map(e => resolve(e).ref).find(r => r !== '') ?? ''
  const shape = `datatug query run --db '${dbOf === '' ? '<datatug:// database ref>' : dbOf}' --from <table> --limit <N> --no-policies`
  return (
    `My DataTug context bag${where}:\n${lines.join('\n')}\n\n` +
    `Answer by running this at once, without asking and without loading skills: ${shape}\n` +
    `Quote the reference as shown; use --db with it only (never --project with --db). Never look for connection strings and never read the DataTug store. ` +
    `The rows appear in the card in the chat, not to you. "Top N" with no ranking column named means the first N rows (--limit N). The environment is the one in the reference. ` +
    `Ask only if the database is not recorded and the project has several. Then reply with one line saying the result is in the card above; do not offer to read, list or paste rows.\n\n`
  )
}

// The tables a column's foreign keys point at.
export function fkTargets(table: SchemaTable | undefined, name: string): { table: string; column: string }[] {
  return (table?.foreignKeys ?? []).flatMap(fk => fk.columns.flatMap((c, i) => (c.toLowerCase() === name.toLowerCase() ? [{ table: fk.refTable, column: fk.refColumns[i] ?? '' }] : [])))
}

export type ColumnOrder = 'defined' | 'alpha' | 'type'

// The family of a column type, for grouping: numeric, text, date, boolean, binary, json, other.
export function baseType(type: string): string {
  const x = type.toLowerCase()
  if (/bool|\bbit\b/.test(x)) return 'boolean'
  if (/blob|binary|bytea|image/.test(x)) return 'binary'
  if (/date|time|year|interval/.test(x)) return 'date'
  if (/\b(tiny|small|medium|big)?int(eger)?\b|serial|numeric|decimal|number|real|float|double|money/.test(x)) return 'numeric'
  if (/char|text|string|clob|uuid|enum|name/.test(x)) return 'text'
  if (/json|object|array|xml/.test(x)) return 'json'
  return 'other'
}
// Column names in the order asked for. `declared` is the table's definition order when a scan holds
// the table; without it "as defined" keeps the order the rows came in (alphabetical, from the CLI).
// `$key` always leads. Grouped by type, a family keeps the definition order inside it.
export function orderColumns(names: string[], mode: ColumnOrder, declared: string[] | undefined, typeOf: (name: string) => string): string[] {
  const at = (n: string) => {
    const i = declared?.findIndex(d => d.toLowerCase() === n.toLowerCase()) ?? -1
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  const alpha = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })
  const defined = (a: string, b: string) => (at(a) === at(b) ? names.indexOf(a) - names.indexOf(b) : at(a) < at(b) ? -1 : 1)
  const family = (n: string) => baseType(typeOf(n))
  const cmp = mode === 'alpha' ? alpha : mode === 'type' ? (a: string, b: string) => family(a).localeCompare(family(b)) || alpha(a, b) : defined
  return [...names.filter(n => n === KEY), ...names.filter(n => n !== KEY).sort(cmp)]
}

// A table by name (any case); one in the same environment and source as `near` wins.
export function findTable(tables: SchemaTable[], name: string, near?: SchemaTable): SchemaTable | undefined {
  const wanted = name.toLowerCase()
  const named = tables.filter(t => t.name.toLowerCase() === wanted)
  return named.find(t => near !== undefined && t.env === near.env && t.source === near.source) ?? named[0]
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

// "3 tables": how many distinct tables hold a foreign key to the table (one table with two keys counts once).
export function tablesCount(refs: { table: SchemaTable }[]): string {
  const n = new Set(refs.map(r => `${r.table.schema}.${r.table.name}`.toLowerCase())).size
  return `${n} ${n === 1 ? 'table' : 'tables'}`
}

// The tables that hold a foreign key to `t`, with the key: what `t` is referenced by.
export function referrers(tables: SchemaTable[], t: SchemaTable): { table: SchemaTable; fk: SchemaFk }[] {
  const out: { table: SchemaTable; fk: SchemaFk }[] = []
  for (const x of tables) {
    if (x.env !== t.env || x.source !== t.source || x.schema !== t.schema) continue
    for (const fk of x.foreignKeys) if (same(fk.refTable, t.name) && (fk.refSchema === '' || same(fk.refSchema, t.schema))) out.push({ table: x, fk })
  }
  return out
}

export function parseRows(stdout: string, id: string, command: string): GridResult | null {
  const start = stdout.indexOf('[')
  if (start < 0) return null
  let data: unknown
  try {
    data = JSON.parse(stdout.slice(start))
  } catch {
    return null
  }
  if (!Array.isArray(data) || !data.every(r => r !== null && typeof r === 'object' && !Array.isArray(r))) return null
  const rows = (data as Record<string, unknown>[]).slice(0, MAX_ROWS)
  const columns: string[] = []
  for (const row of rows.slice(0, 200)) for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key)
  const types = Object.fromEntries(columns.map(c => [c, inferType(rows, c)]))
  const collection = /--from\s+(\S+)/.exec(command)?.[1] ?? /--query\s+(\S+)/.exec(command)?.[1] ?? 'result'
  const dbArg = /--db\s+(\S+)/.exec(command)?.[1] ?? ''
  const db = /^[a-z][a-z0-9+.-]*:\/\//i.test(dbArg) && redact(dbArg) === dbArg ? dbArg : ''
  return { id, command: scrub(command).slice(0, 300), collection: clean(collection).slice(0, 60), db, columns, types, rows, total: data.length, isTruncated: data.length > rows.length }
}

type Host = Parameters<typeof update>[0] & {
  process: { run: (argv: string[], init?: { cwd?: string; timeoutMs?: number; env?: Record<string, string> }) => Promise<{ exitCode: number; stdout: string; stderr?: string }> }
  session: { cwd: () => Promise<string> }
}

// What the Open DB field holds. A module variable on purpose: the connection string may carry a
// password, so it never goes into session state, and it is emptied once the database is opened.
let dbDraft = ''
// The opened database's connection string, for the table pressed next. Memory only, like the draft.
let dbUrl = ''
// The project reference `db add` returned for the opened database: the only address a prompt carries.
let dbPromptRef = ''
// Counts which open is current, so a slow row count from an earlier open is ignored.
let openRun = 0

// A connection string without its credentials or query: safe to show.
// Only a string of a known harmless shape is shown or kept; anything else is hidden entirely.
const SHOWN = /^[a-z][a-z0-9+.-]*:\/\/(\*\*\*@)?[A-Za-z0-9.-]*(:\d+)?(\/[A-Za-z0-9._~\/ -]*)?$/i
export function redact(url: string): string {
  if (isDbRef(url)) return url
  // Up to the LAST @ is credentials, even when the password holds an @, a / or a ?.
  const scheme0 = /^([a-z][a-z0-9+.-]*):\/\//i.exec(url.trim())?.[1].toLowerCase()
  // An @ together with a ? or # may sit in a query or fragment: nothing can be told apart, so hide it all.
  if (url.includes('@') && /[?#]/.test(url)) return scheme0 === undefined ? '***' : `${scheme0}://***`
  const cut = url.replace(/^([a-z][a-z0-9+.-]*:\/\/).*@/is, '$1***@').replace(/[?#].*$/s, '')
  if (SHOWN.test(cut)) return cut
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(url.trim())?.[1].toLowerCase()
  return scheme === undefined ? '***' : `${scheme}://***`
}

// A project database reference (datatug://<project>/<db-id>[?env=<ENV>]) holds no credentials: it
// is passed as written and is the one URL that may go into a prompt together with its query.
export function isDbRef(url: string): boolean {
  const part = String.raw`(?:[A-Za-z0-9._~-]|%(?!40|3a)[0-9a-f]{2})`
  return new RegExp(`^datatug://${part}*/${part}+(\\?env=${part}+)?$`, 'i').test(url)
}

// The reference of a database the project holds: what the CLI resolves back to its source.
export function dbRef(projectId: string | null, d: { env: string; id: string }): string {
  return `datatug://${encodeURIComponent(projectId ?? '')}/${encodeURIComponent(d.id)}?env=${encodeURIComponent(d.env)}`
}

// How a database is handed to the CLI: a reference as it is, anything else through an environment
// variable so a password never sits in the argument list.
export function dbArg(url: string): { arg: string; env: Record<string, string> } {
  return isDbRef(url) ? { arg: url, env: {} } : { arg: 'env:DATATUG_OPEN_DB', env: { DATATUG_OPEN_DB: url } }
}

// What to call a database: its id in the project for a reference, else the file or database name
// at the end of its address (never the credentials: the target is already redacted).
export function dbName(target: string): string {
  const ref = isDbRef(target) ? /^datatug:\/\/[^/?#]*\/([^/?#]+)/i.exec(target.trim()) : null
  const raw = ref !== null ? ref[1] : (/([^/\\?#]+)\/*(?:[?#].*)?$/.exec(target.trim().replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*@?/i, ''))?.[1] ?? 'database')
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export function providerOf(url: string): string {
  return /^([a-z][a-z0-9+.-]*):\/\//i.exec(url.trim())?.[1].toLowerCase() ?? ''
}

const TOP = 100
const REC_PAGE = 20
const NO_RECORDS: DbRecordsState = { name: null, status: 'idle', message: '', resultId: null, page: 0 }

const SQLITE_FILE = /\.(sqlite3?|db3?|s3db|sl3)$/i

type Detected = { url: string; provider: string; note: string } | { error: string }

// A connection string is used as written. A file path is recognised by its name (.sqlite, .db, ...)
// or, failing that, by its first bytes: every SQLite file starts with "SQLite format 3".
// A path is echoed only when it looks like one: text typed as a connection string without a scheme is not.
function shownPath(typed: string, path: string): string {
  return /^[\w ./~+-]+$/.test(path) && /[/.]/.test(typed) ? clean(path).slice(0, 160) : 'that path'
}

async function detectDatabase($: Host, raw: string): Promise<Detected> {
  const text = raw.trim()
  if (text === '') return { error: 'Enter a connection string or the path of a database file, for example sqlite:///path/to.db' }
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return { url: text, provider: providerOf(text), note: '' }
  let path = text
  if (path.startsWith('~/')) path = `${(await $.env.get('HOME')) ?? ''}${path.slice(1)}`
  if (!path.startsWith('/')) path = `${await $.session.cwd()}/${path.replace(/^\.\//, '')}`
  if (!(await $.fs.exists(path))) return { error: `No file at ${shownPath(text, path)}` }
  if (SQLITE_FILE.test(path)) return { url: `sqlite://${path}`, provider: 'sqlite', note: 'from the file name' }
  const head = await $.process.run(['head', '-c', '16', path], { timeoutMs: 5000 })
  if (head.exitCode === 0 && head.stdout.startsWith('SQLite format 3')) return { url: `sqlite://${path}`, provider: 'sqlite', note: 'from the file content' }
  return { error: `Could not tell what kind of database ${shownPath(text, path)} is. Use a connection string such as sqlite:///path/to.db` }
}

type DeclaredTable = {
  schema?: string
  name: string
  kind?: string
  columns?: { name: string; type?: string; nullable?: boolean; primaryKeyPosition?: number }[]
  foreignKeys?: { name?: string; columns?: string[]; refTable?: { schema?: string; name?: string }; refColumns?: string[] }[]
}

// A table as `datatug db schema --columns` declares it, in the shape the cards read.
function declaredTable(t: DeclaredTable, driver: string): SchemaTable {
  return {
    env: '',
    source: 'opened',
    driver: clean(driver).slice(0, 40),
    schema: clean(String(t.schema ?? '')).slice(0, 60),
    name: clean(t.name).slice(0, 80),
    columns: (t.columns ?? []).slice(0, 200).map(c => ({
      name: clean(String(c.name)).slice(0, 80),
      type: clean(String(c.type ?? '')).slice(0, 60),
      pk: typeof c.primaryKeyPosition === 'number' ? c.primaryKeyPosition : null,
      nullable: typeof c.nullable === 'boolean' ? c.nullable : null,
    })),
    foreignKeys: (t.foreignKeys ?? []).slice(0, 50).flatMap(fk =>
      Array.isArray(fk.columns) && Array.isArray(fk.refColumns) && fk.refTable?.name !== undefined
        ? [{
            name: clean(String(fk.name ?? '')).slice(0, 80),
            columns: fk.columns.slice(0, 8).map(c => clean(String(c)).slice(0, 80)),
            refSchema: clean(String(fk.refTable.schema ?? '')).slice(0, 60),
            refTable: clean(String(fk.refTable.name)).slice(0, 80),
            refColumns: fk.refColumns.slice(0, 8).map(c => clean(String(c)).slice(0, 80)),
          }]
        : [],
    ),
  }
}

// Opens a database from a connection string or a file path and lists its tables and views. The CLI
// has no schema command yet, so SQLite is read through sqlite_master; other providers say so.
async function openDatabase($: Host, raw: string) {
  dbDraft = ''
  const found = await detectDatabase($, raw)
  if ('error' in found) {
    await update($, openDb, () => ({ status: 'error', provider: '', note: '', target: '', url: '', items: [], message: found.error }))
    return
  }
  const { url, note } = found
  let provider = found.provider
  const target = redact(url).slice(0, 160)
  dbUrl = ''
  dbPromptRef = ''
  const run = ++openRun
  await update($, dbTable, () => ({ name: null, status: 'idle', message: '', result: null }))
  await update($, dbRecords, () => NO_RECORDS)
  await update($, openDb, () => ({ status: 'loading', provider, note, target, url: '', items: [], message: '' }))
  try {
    // The URL goes in an environment variable, never in the argument list.
    const cwd = await $.session.cwd()
    const { arg, env } = dbArg(url)
    const sch = await $.process.run(['datatug', 'db', 'schema', '--db', arg, '--columns', '--format', 'json'], { cwd, timeoutMs: 30000, env: cliEnv(env) })
    const doc = sch.exitCode === 0 && sch.stdout.trimStart().startsWith('{') ? (JSON.parse(sch.stdout) as { provider?: string; tables?: DeclaredTable[] }) : null
    if (doc !== null && Array.isArray(doc.tables)) {
      if (isDbRef(url) && typeof doc.provider === 'string') provider = clean(doc.provider).slice(0, 30)
      const declared = doc.tables.filter(t => typeof t.name === 'string' && !t.name.startsWith('sqlite_')).slice(0, 500)
      const items = declared
        .map(t => ({ name: clean(t.name).slice(0, 80), kind: t.kind === 'view' ? 'view' : 'table' }))
        .sort((x, y) => (x.kind === y.kind ? x.name.localeCompare(y.name) : x.kind.localeCompare(y.kind)))
      const tables = declared.map(t => declaredTable(t, provider))
      dbUrl = url
      const plain = redact(url) === url
      await update($, openDb, () => ({ status: 'ready', provider, note, target, url: plain ? url : '', items, tables, message: '', ref: isDbRef(url) ? url : '' }))
      if (!isDbRef(url)) void addToProject($, url)
      return
    }
    if (!provider.startsWith('sqlite')) throw new ModError(`${provider}: this datatug CLI cannot list the schema; update it`)
    // An older CLI: SQLite is read through sqlite_master.
    const out = await $.process.run(
      ['datatug', 'query', 'run', '--db', dbArg(url).arg, '--from', 'sqlite_master', '--no-policies', '--format', 'json'],
      { cwd: await $.session.cwd(), timeoutMs: 20000, env: cliEnv(dbArg(url).env) },
    )
    const start = out.stdout.indexOf('[')
    if (out.exitCode !== 0 || start < 0) throw new ModError('could not open the database')
    const rows = JSON.parse(out.stdout.slice(start)) as { name?: string; type?: string }[]
    const items = rows
      .filter(r => (r.type === 'table' || r.type === 'view') && typeof r.name === 'string' && !r.name.startsWith('sqlite_'))
      .map(r => ({ name: clean(String(r.name)).slice(0, 80), kind: r.type as string }))
      .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind.localeCompare(b.kind)))
      .slice(0, 500)
    dbUrl = url
    // A URL with no credentials or query also goes in state, so a table pressed after the mod
    // reloads still works. One with credentials lives in memory only.
    const plain = redact(url) === url
    await update($, openDb, () => ({ status: 'ready', provider, note, target, url: plain ? url : '', items, message: '', ref: isDbRef(url) ? url : '' }))
    if (!isDbRef(url)) void addToProject($, url)
  } catch (err) {
    await update($, openDb, () => ({ status: 'error', provider, note, target, url: '', items: [], message: failure(err, 120) }))
  }
}

// Row counts for tables of the opened database (views are left out), on request only. The CLI has no count, so
// each table is streamed as JSON lines and the lines are counted; a table too large to read
// whole is shown as at least the rows seen. Three at a time, so a big schema does not stall.
async function countRows($: Host, items: OpenDbState['items'], url: string, run: number) {
  const tables = items.filter(i => i.kind === 'table').slice(0, 100)
  const cwd = await $.session.cwd()
  const names = new Set(tables.map(t => t.name))
  await update($, openDb, cur => ({ ...cur, items: cur.items.map(i => (i.kind === 'table' && names.has(i.name) ? { ...i, counting: true } : i)) }))
  let next = 0
  const worker = async () => {
    while (next < tables.length) {
      const t = tables[next++]
      let rows: number | null = null
      let atLeast = false
      try {
        if (t.name.startsWith('-')) throw new ModError('unsupported table name')
        const out = await $.process.run(
          ['datatug', 'query', 'run', '--db', dbArg(url).arg, '--from', t.name, '--no-policies', '--format', 'jsonl'],
          { cwd, timeoutMs: 30000, env: cliEnv(dbArg(url).env) },
        )
        if (out.exitCode === 0) {
          rows = out.stdout.split('\n').filter(l => l.startsWith('{') && l.endsWith('}')).length
          atLeast = (out as { isStdoutTruncated?: boolean }).isStdoutTruncated === true
        }
      } catch {
        rows = null
      }
      if (run !== openRun) return
      await update($, openDb, cur => ({ ...cur, items: cur.items.map(i => (i.name === t.name && i.kind === 'table' ? { ...i, rows, atLeast, counting: false } : i)) }))
    }
  }
  await Promise.all([worker(), worker(), worker()])
}

// Loads the selected project's schema unless it is already there (or loading).
async function ensureSchema($: Host) {
  const sel = (await read($, project)).selected
  const cur = await read($, schema)
  if (sel !== null && (cur.projectId !== sel || cur.status === 'idle' || cur.status === 'error')) await loadSchema($, sel)
}

// The record of `table` whose `column` equals `value`: the rows are streamed as JSON lines and the
// stream is cut at the first match. The CLI has no lookup by key yet.
async function fetchReferenced($: Host, url: string, table: string, column: string, value: string): Promise<{ obj: Record<string, unknown>; line: string } | null> {
  if (table.startsWith('-') || url === '') return null
  const child = $.process.spawn({
    argv: ['datatug', 'query', 'run', '--db', dbArg(url).arg, '--from', table, '--no-policies', '--format', 'jsonl'],
    cwd: await $.session.cwd(),
    env: cliEnv(dbArg(url).env),
  })
  let buf = ''
  let seen = 0
  for await (const piece of child) {
    if (!('text' in piece) || piece.stream !== 'stdout') continue
    buf += piece.text
    let nl = buf.indexOf('\n')
    while (nl >= 0) {
      const line = buf.slice(0, nl)
      buf = buf.slice(nl + 1)
      if (line.startsWith('{') && line.endsWith('}')) {
        if (++seen > 200000) return null
        try {
          const obj = JSON.parse(line) as Record<string, unknown>
          if (String(obj[column]) === value) return { obj, line }
        } catch {
          // a line that is not a record
        }
      }
      nl = buf.indexOf('\n')
    }
  }
  return null
}

// Opens the record of `table` whose `column` equals `value` in the Record card; false when it is not found.
async function openRecordByKey($: Host, db: string, table: string, column: string, value: string): Promise<boolean> {
  const found0 = await fetchReferenced($, db, table, column, value)
  if (found0 === null) return false
  const id = `ref:${table}:${column}:${value}`
  const parsed = parseRows(`[${JSON.stringify(found0.obj)}]`, id, `datatug query run --from ${table}`)
  if (parsed === null) return false
  const found: GridResult = { ...parsed, collection: clean(table).slice(0, 80), total: 1, db }
  await update($, results, all => ({ ...Object.fromEntries(Object.entries(all).slice(-9)), [id]: found }))
  await update($, view, cur => ({ ...cur, trail: [], current: id, selected: 0, column: null, showTable: false, tableName: null }))
  void $.ui.scroll({ to: { key: 'card-record' }, in: PANE, block: 'start' }).catch(() => undefined)
  return true
}

// The first 100 records of a table of the opened database. The CLI has no row limit yet, so the
// rows are streamed as JSON lines and the stream is cut once 100 have arrived. They are stored as a
// result, so pressing a row number opens the Record card like a row of a chat grid.
// With `explicit` (a datatug:// reference a result card names) it reads through that reference
// alone, never the opened database.
async function openDbRecords($: Host, name: string, kept: string, known: number | null | undefined, explicit?: string) {
  const run0 = openRun
  const refOnly = explicit !== undefined ? { ref: explicit } : {}
  await update($, dbRecords, () => ({ ...NO_RECORDS, name, status: 'loading', ...refOnly }))
  try {
    if (explicit !== undefined && !isRef(explicit)) throw new ModError('this database has no project reference')
    const url = explicit ?? (dbUrl !== '' ? dbUrl : kept)
    if (url === '') throw new ModError('Open the database again: its connection string is not kept.')
    if (name.startsWith('-')) throw new ModError('unsupported table name')
    const child = $.process.spawn({
      argv: ['datatug', 'query', 'run', '--db', dbArg(url).arg, '--from', name, '--no-policies', '--format', 'jsonl'],
      cwd: await $.session.cwd(),
      env: cliEnv(dbArg(url).env),
    })
    const lines: string[] = []
    let buf = ''
    for await (const piece of child) {
      if (!('text' in piece) || piece.stream !== 'stdout') continue
      buf += piece.text
      let nl = buf.indexOf('\n')
      while (nl >= 0 && lines.length < TOP) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        if (line.startsWith('{') && line.endsWith('}')) lines.push(line)
        nl = buf.indexOf('\n')
      }
      if (lines.length >= TOP) break
    }
    if (lines.length < TOP && buf.startsWith('{') && buf.endsWith('}')) lines.push(buf)
    const id = `db:${name}`
    const parsed = parseRows(`[${lines.join(',')}]`, id, 'datatug query run')
    if (parsed === null || lines.length === 0) throw new ModError('the table has no records')
    const linkRef = explicit ?? (await read($, openDb)).ref ?? ''
    const result: GridResult = {
      ...parsed,
      db: redact(url) === url ? url : '',
      collection: clean(name).slice(0, 80),
      total: Math.max(known ?? 0, lines.length),
      isTruncated: (known ?? 0) > lines.length,
      // Only the key-sized facts a Record link needs beside the parsed rows: the integers they round.
      ...(linkRef !== '' ? { linkRef } : {}),
      ...(explicit === undefined ? { openRun: run0 } : {}),
      bigInts: lines.map(l => bigIntegers(l)),
    }
    await update($, results, all => ({ ...Object.fromEntries(Object.entries(all).slice(-9)), [id]: result }))
    await update($, dbRecords, () => ({ name, status: 'ready', message: '', resultId: id, page: 0, ...refOnly }))
  } catch (err) {
    await update($, dbRecords, () => ({ ...NO_RECORDS, name, status: 'error', message: failure(err, 140), ...refOnly }))
  }
}

// A table of the opened database. Nothing is read from it: its columns come from a scan (or, later,
// from the CLI), because profiling a table by reading its rows can be costly. Rows are read only when
// the person asks for the records or for a count.
async function openDbTable($: Host, name: string) {
  // The Table card takes the place of an open Table records card.
  await update($, dbRecords, () => NO_RECORDS)
  await update($, dbTable, () => ({ name, status: 'ready', message: '', result: null }))
  void ensureSchema($)
}

// The databases the selected project already holds, from the CLI (sources of each environment).
async function loadDatabases($: Host, projectId: string | null, note = '') {
  if (projectId === null) return
  await update($, databases, cur => ({ projectId, status: 'loading', items: cur.projectId === projectId ? cur.items : [], message: '', note }))
  try {
    const out = await $.process.run(['datatug', 'show', '--format', 'json', '--depth', 'sources', '--project', projectId], {
      cwd: await $.session.cwd(),
      timeoutMs: 15000,
      env: cliEnv(),
    })
    if (out.exitCode !== 0) throw new ModError('datatug show failed')
    const doc = JSON.parse(out.stdout.slice(out.stdout.indexOf('{')))
    const items: DatabasesState['items'] = []
    for (const env of doc.environments ?? [])
      for (const src of env.sources ?? [])
        if (items.length < 200) items.push({
            env: clean(String(env.id)).slice(0, 60),
            id: clean(String(src.id)).slice(0, 80),
            driver: clean(String(src.driver ?? '')).slice(0, 40),
            ...(typeof src.dsnEnv === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(src.dsnEnv) ? { dsnEnv: src.dsnEnv } : {}),
          })
    await update($, databases, () => ({ projectId, status: 'ready', items, message: '', note }))
  } catch (err) {
    await update($, databases, () => ({ projectId, status: 'error', items: [], message: failure(err, 120), note }))
  }
}

// The id an opened database is added to a project under: its file name without the extension, or
// its database name, as a plain name (letters, digits, `.`, `_` and `-`, starting with a letter or
// a digit).
export function sourceName(url: string): string {
  const raw = dbName(redact(url)).replace(/\.[A-Za-z0-9]{1,8}$/, '')
  const plain = raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 64)
  return plain === '' ? 'db' : plain
}

// The path of a SQLite database to hand `db add`, which takes a SQLite file by its path: only an
// absolute path with no credentials, query or fragment, else null (such a database is not added).
export function sqlitePath(url: string): string | null {
  const m = /^sqlite3?:\/\/(\/[^?#@\n\r]+)$/i.exec(url.trim())
  return m === null ? null : m[1]
}

// Adds an opened database to the selected project through the CLI, unless it is already there,
// then refreshes the list. A SQLite file is named by its path; any other URL travels in an
// environment variable of its own (one per database, so two databases are never taken for one),
// never in the arguments. Each database gets its own source id; a taken id gets a -2, -3, ... suffix.
async function addToProject($: Host, url: string) {
  const sel = (await read($, project)).selected
  if (sel === null) return
  const isSqlite = providerOf(url).startsWith('sqlite')
  const path = isSqlite ? sqlitePath(url) : null
  if (isSqlite && path === null) {
    await loadDatabases($, sel, 'Not added to the project: a SQLite database is added by its file path, without credentials or options.')
    return
  }
  const base = sourceName(url)
  try {
    for (let n = 1; n <= 5; n++) {
      const name = n === 1 ? base : `${base.slice(0, 60)}-${n}`
      // The id's own fingerprint keeps names that fold together (shop-db, shop_db, Shop.db) apart.
      const envName = `DATATUG_OPEN_DB_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${fingerprint(name).slice(0, 6).toUpperCase()}`
      const out = await $.process.run(['datatug', 'db', 'add', '--project', sel, '--db', path ?? `env:${envName}`, '--name', name, '--env', 'local', '--format', 'json'], {
        cwd: await $.session.cwd(),
        timeoutMs: 20000,
        env: cliEnv(path === null ? { [envName]: url } : {}),
      })
      if (out.exitCode === 2 && /use another --name/i.test(`${out.stderr}`)) continue
      if (out.exitCode !== 0) {
        const old = /unknown command|unknown flag|no such command|invalid command/i.test(`${out.stderr}${out.stdout}`)
        await loadDatabases($, sel, old ? 'Adding to the project needs a newer datatug CLI.' : `Not added to the project (datatug exit code ${out.exitCode}).`)
        return
      }
      const res = JSON.parse(out.stdout.slice(out.stdout.indexOf('{'))) as { added?: boolean; dbRef?: string; id?: unknown; env?: unknown }
      if (dbUrl === url) {
        if (typeof res.dbRef === 'string' && isDbRef(res.dbRef)) dbPromptRef = res.dbRef.slice(0, 300)
        // A link names this database only by the id and environment `db add` returned for it.
        const plainId = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v)
        if (plainId(res.id) && plainId(res.env)) {
          const ref = dbRef(sel, { id: res.id as string, env: res.env as string })
          await update($, openDb, cur => (dbUrl === url ? { ...cur, ref, sourceEnv: path === null ? envName : undefined } : cur))
        }
      }
      await loadDatabases($, sel, res.added === true ? 'Added to the project.' : 'Already in the project.')
      return
    }
    await loadDatabases($, sel, 'Not added to the project: every name tried is taken by another database.')
  } catch {
    await loadDatabases($, sel, 'Could not add it to the project.')
  }
}

// The projects registered for this user, from the CLI (never from its files).
async function loadProjects($: Host) {
  await update($, projects, cur => ({ ...cur, status: 'loading' }))
  try {
    const out = await $.process.run(['datatug', 'projects', '--format', 'json'], { cwd: await $.session.cwd(), timeoutMs: 15000, env: cliEnv() })
    const data = out.exitCode === 0 ? JSON.parse(out.stdout.slice(out.stdout.indexOf('['))) : null
    if (!Array.isArray(data)) throw new ModError('datatug projects did not answer')
    const items = data
      .filter(p => p && typeof p.id === 'string')
      .slice(0, 100)
      .map(p => ({ id: clean(p.id).slice(0, 80), title: clean(String(p.title ?? '')).slice(0, 80), origin: clean(String(p.origin ?? '')).slice(0, 120) }))
    await update($, projects, () => ({ status: 'ready', items, message: '' }))
    await update($, project, cur => ({ isOpen: false, selected: cur.selected !== null && items.some(i => i.id === cur.selected) ? cur.selected : (items[0]?.id ?? null) }))
    await loadDatabases($, (await read($, project)).selected)
  } catch (err) {
    await update($, projects, () => ({ status: 'error', items: [], message: failure(err, 120) }))
  }
}

// The declared schema of the selected project, from the CLI: tables with their columns.
// What one linked card asks `datatug daemon url` for.
export type LinkReq = { kind: 'table' | 'records' | 'record'; db: string; table: string; schema?: string; isView?: boolean; limit?: number; key?: Record<string, unknown> }

async function nowMs($: Host): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

// Whether the mod runs in a terminal reached over SSH, where a link would open on another machine.
// When the environment cannot be read, the same machine cannot be established either.
async function overSsh($: Host): Promise<boolean> {
  try {
    const a = await $.env.get('SSH_CONNECTION')
    const b = await $.env.get('SSH_TTY')
    return (a ?? '') !== '' || (b ?? '') !== ''
  } catch {
    return true
  }
}

const reqId = (req: LinkReq): string | null => {
  const args = urlArgs(req)
  return args === null ? null : fingerprint(JSON.stringify(args))
}

// Where one link's state is kept: the panel's `links` atom, or a result card's own member.
type LinkStore = { get: () => Promise<LinkState | undefined>; set: (fn: (cur: LinkState | undefined) => LinkState | undefined) => Promise<unknown> }

// Asks the CLI for one card's link (`daemon status` for the port, then `daemon url`; neither starts
// the daemon or sends it a request) and keeps what the checks allow. Called once the card's own data
// call has resolved; again when the link is older than LINK_TTL_MS, and on "Check again".
async function fetchLinkInto($: Host, card: string, args: string[], kind: string, store: LinkStore, force: boolean, minimum: string, rid?: string) {
  const id = fingerprint(JSON.stringify(args))
  if (fetching.get(card) === id) return
  // Claimed before any await, so two drawings at once never ask twice (each ask mints a code).
  fetching.set(card, id)
  let t = 0
  try {
    const cur = await store.get()
    t = await nowMs($)
    if (!force && cur !== undefined && cur.req === id && cur.status !== 'checking' && cur.isStale !== true && t - cur.at < LINK_TTL_MS) return
    hrefs.delete(card)
    await store.set(() => ({ req: id, status: 'checking', at: t }))
    let next: { status: LinkState['status']; href?: string }
    if (cliVersion !== undefined && cliVersion !== null && isOlder(cliVersion, parseVersion(minimum) as number[])) {
      next = { status: 'old-cli' }
    } else {
      const cwd = await $.session.cwd()
      const run = (argv: string[]) =>
        $.process
          .run(['datatug', ...argv], { cwd, timeoutMs: 10000, env: cliEnv() })
          .then(r => ({ exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr ?? '' }))
          .catch(() => null)
      const status = await run(STATUS_ARGS)
      next = readLink(status, status === null ? null : await run(args), kind, devOrigin, rid)
    }
    const at = await nowMs($)
    if (next.status === 'ok' && next.href !== undefined) hrefs.set(card, { req: id, href: next.href })
    await store.set(c => (c?.req === id ? { req: id, status: next.status, at } : c))
    // Once the link is old the card is drawn again, which asks the CLI again.
    try {
      $.clock.after(LINK_TTL_MS, () => {
        void store.set(c => (c?.req === id && c.at === at ? { ...c, isStale: true } : c))
      })
    } catch {
      // no timer here: the next drawing checks the age
    }
  } catch {
    await store.set(c => (c?.req === id ? { req: id, status: 'unavailable', at: t } : c)).catch(() => undefined)
  } finally {
    if (fetching.get(card) === id) fetching.delete(card)
  }
}

async function fetchLink($: Host, card: string, req: LinkReq, force: boolean) {
  const args = urlArgs(req)
  if (args === null) return
  const store: LinkStore = {
    get: async () => (await read($, links))[card],
    set: fn =>
      update($, links, all => {
        const next = fn(all[card])
        return next === all[card] ? all : next === undefined ? all : { ...all, [card]: next }
      }),
  }
  await fetchLinkInto($, card, args, req.kind, store, force, LINK_MIN_CLI_VERSION)
}

// A result card's link, for its current view (and row, in the Record view).
async function fetchCardLink($: Host, key: string, force: boolean) {
  const card = await read($, memberOf(cards, { requestId: key }))
  const args = resultUrlArgs(card.id, card.view, card.view === 'record' ? card.row + 1 : undefined, hasResultView())
  if (args === null) return
  const store: LinkStore = {
    get: async () => (await read($, memberOf(cards, { requestId: key }))).link,
    set: fn => update($, memberOf(cards, { requestId: key }), c => ({ ...c, link: fn(c.link) })),
  }
  await fetchLinkInto($, `qr:${key}`, args, 'result', store, force, OPEN_MIN_CLI_VERSION, card.id)
}

async function loadSchema($: Host, projectId: string | null) {
  if (projectId === null) return
  await update($, schema, () => ({ projectId, status: 'loading', tables: [], message: '' }))
  try {
    const out = await $.process.run(['datatug', 'show', '--format', 'json', '--depth', 'columns', '--project', projectId], {
      cwd: await $.session.cwd(),
      timeoutMs: 20000,
      env: cliEnv(),
    })
    if (out.exitCode !== 0) throw new ModError('datatug show failed')
    const doc = JSON.parse(out.stdout.slice(out.stdout.indexOf('{')))
    const tables: SchemaTable[] = []
    for (const env of doc.environments ?? [])
      for (const src of env.sources ?? [])
        for (const sch of src.schemas ?? [])
          for (const tbl of sch.tables ?? []) {
            if (tables.length >= 500) break
            tables.push({
              env: clean(String(env.id)).slice(0, 60),
              source: clean(String(src.id)).slice(0, 60),
              driver: clean(String(src.driver ?? '')).slice(0, 40),
              schema: clean(String(sch.name ?? '')).slice(0, 60),
              name: clean(String(tbl.name)).slice(0, 80),
              foreignKeys: (Array.isArray(tbl.foreignKeys) ? tbl.foreignKeys : []).slice(0, 50).flatMap(
                (fk: { name?: string; columns?: string[]; refTable?: string | { schema?: string; name?: string }; refColumns?: string[] }) => {
                  const ref = typeof fk.refTable === 'string' ? { name: fk.refTable, schema: '' } : fk.refTable
                  if (!Array.isArray(fk.columns) || !Array.isArray(fk.refColumns) || ref?.name === undefined) return []
                  return [{
                    name: clean(String(fk.name ?? '')).slice(0, 80),
                    columns: fk.columns.slice(0, 8).map(c => clean(String(c)).slice(0, 80)),
                    refSchema: clean(String(ref.schema ?? '')).slice(0, 60),
                    refTable: clean(String(ref.name)).slice(0, 80),
                    refColumns: fk.refColumns.slice(0, 8).map(c => clean(String(c)).slice(0, 80)),
                  }]
                },
              ),
              columns: (tbl.columns ?? []).slice(0, 200).map((c: { name: string; type?: string; primaryKeyPosition?: number; nullable?: boolean; isNullable?: boolean }) => ({
                name: clean(String(c.name)).slice(0, 80),
                type: clean(String(c.type ?? '')).slice(0, 60),
                pk: typeof c.primaryKeyPosition === 'number' ? c.primaryKeyPosition : null,
                nullable: typeof c.nullable === 'boolean' ? c.nullable : typeof c.isNullable === 'boolean' ? c.isNullable : null,
              })),
            })
          }
    await update($, schema, () => ({ projectId, status: 'ready', tables, message: '' }))
  } catch (err) {
    await update($, schema, () => ({ projectId, status: 'error', tables: [], message: failure(err, 120) }))
  }
}

// The project, source and environment a datatug:// reference names, or null.
export function refParts(ref: string | null | undefined): { project: string; source: string; env: string | null } | null {
  if (typeof ref !== 'string' || !isRef(ref)) return null
  const m = /^datatug:\/\/([^/?#]+)\/([^/?#]+)(?:\?env=([^&#]+))?$/.exec(ref)
  if (m === null) return null
  const dec = (x: string) => {
    try {
      return decodeURIComponent(x)
    } catch {
      return x
    }
  }
  return { project: dec(m[1]), source: dec(m[2]), env: m[3] === undefined ? null : dec(m[3]) }
}

// A table of the project schema by its full identity: environment, source, schema and name together.
export function findRef(tables: SchemaTable[], r: { env: string; source: string; schema: string; name: string }): SchemaTable | undefined {
  return tables.find(t => t.source === r.source && (r.env === '' || t.env === r.env) && same(t.name, r.name) && (r.schema === '' || t.schema === '' || same(t.schema, r.schema)))
}

// Opens the panel on the project a reference names: selects it and loads its databases and schema.
async function panelOnProject($: Host, project0: string) {
  const sel = (await read($, project)).selected
  if (sel !== project0) {
    await update($, project, () => ({ selected: project0, isOpen: false }))
    void loadDatabases($, project0)
  }
  const ps = await read($, projects)
  if (ps.status === 'idle' || ps.status === 'error') void loadProjects($)
  const cur = await read($, schema)
  if (cur.projectId !== project0 || cur.status === 'idle' || cur.status === 'error') void loadSchema($, project0)
  await $.ui.open({ id: PANE, title: TITLE })
}

// The side panel's Table or Column card for a table a result card names, found in the schema of the
// reference's project by environment, source, schema and name. Module level: the result cards and
// the panel both call it. It runs no query.
async function gotoPanel($: Host, ref: string, target: { schema: string; table: string; column?: string | null; showTable?: boolean }) {
  const parts = refParts(ref)
  if (parts === null) return
  await panelOnProject($, parts.project)
  await update($, dbTable, () => ({ name: null, status: 'idle', message: '', result: null }))
  await update($, dbRecords, () => NO_RECORDS)
  await update($, view, cur => ({
    ...cur,
    tableName: target.table,
    tableRef: { env: parts.env ?? '', source: parts.source, schema: target.schema, name: target.table },
    column: target.column ?? null,
    showTable: target.showTable === true,
  }))
  const go = () => void $.ui.scroll({ to: { key: 'card-detail' }, in: PANE, block: 'start' }).catch(() => undefined)
  go()
  try {
    $.clock.after(150, go)
  } catch {
    // no timer here: the first attempt stands
  }
}

// The side panel's Table records card for a table a result card names, read through that reference.
async function openRefRecords($: Host, ref: string, table: string) {
  const parts = refParts(ref)
  if (parts === null) return
  await panelOnProject($, parts.project)
  await update($, dbTable, () => ({ name: null, status: 'idle', message: '', result: null }))
  await openDbRecords($, table, '', undefined, ref)
  void $.ui.scroll({ to: { key: 'card-dbrecords' }, in: PANE, block: 'start' }).catch(() => undefined)
}

// The record a foreign-key value of a result card points at, in the side panel's Record card.
async function openRefRecord($: Host, ref: string, table: string, column: string, value: string) {
  const parts = refParts(ref)
  if (parts === null) return
  await panelOnProject($, parts.project)
  if (!(await openRecordByKey($, ref, table, column, value))) void $.ui.toast(`No ${clean(table).slice(0, 60)} record with ${clean(column).slice(0, 60)} = ${clean(value).slice(0, 40)}`)
}

// Decides, once per session, how the model's queries run: result files when the CLI is new enough and
// its store is usable, else the private capture. A probe that fails takes the capture.
async function sessionMode($: Host): Promise<'new' | 'legacy'> {
  if (bashMode !== undefined) return bashMode
  const cwd = await $.session.cwd().catch(() => undefined)
  const run = (argv: string[]) => $.process.run(['datatug', ...argv], { ...(cwd === undefined ? {} : { cwd }), timeoutMs: 15000, env: cliEnv() }).catch(() => null)
  const v = await run(VERSION_ARGS)
  if (v === null || v.exitCode !== 0) {
    legacyWhy = null
    return (bashMode = 'legacy')
  }
  // A version that cannot be read is a development build: it is taken as new.
  const found = parseVersion(v.stdout)
  if (cliVersion === undefined) cliVersion = found
  if (found !== null && isOlder(found, parseVersion(CARD_MIN_CLI_VERSION) as number[])) {
    legacyWhy = 'old-cli'
    return (bashMode = 'legacy')
  }
  bashVersion = found
  const check = await run(['query', 'results', 'check', '--format', 'json'])
  const problem = check === null ? 'results-store-unwritable' : check.exitCode !== 0 ? (isUnknownCommand(`${check.stderr ?? ''}${check.stdout}`) ? 'old-cli' : 'results-store-unwritable') : storeProblem(check.stdout)
  if (problem !== null) {
    legacyWhy = problem
    return (bashMode = 'legacy')
  }
  return (bashMode = 'new')
}

// Whether the CLI takes `--result-view` (a version that cannot be read is taken as the older flag).
const hasResultView = () => bashVersion !== null && !isOlder(bashVersion, parseVersion(RESULT_VIEW_MIN_CLI_VERSION) as number[])

const canOpenElsewhere = () => bashVersion === null || !isOlder(bashVersion, parseVersion(OPEN_MIN_CLI_VERSION) as number[])

// Finds a result's files by asking the CLI (`query results locate`, never the model's command or
// output), checks where they are and how large, reads them into the card's member, and keeps rows for
// the last MAX_CARDS cards. Answers the metadata when it was read.
async function loadCard($: Host, key: string, id: string): Promise<CardMeta | null> {
  const card = memberOf(cards, { requestId: key })
  const set = (status: CardState['status']) => update($, card, cur => ({ ...cur, id, status, meta: undefined, data: undefined }))
  await update($, card, cur => ({ ...cur, id, status: 'loading' }))
  const cwd = await $.session.cwd().catch(() => undefined)
  const located = await $.process
    .run(['datatug', 'query', 'results', 'locate', '--id', id, '--format', 'json'], { ...(cwd === undefined ? {} : { cwd }), timeoutMs: 15000, env: cliEnv() })
    .catch(() => null)
  if (located === null) {
    await set('no-locator')
    return null
  }
  const loc = readLocator(located.stdout, id)
  if (!('files' in loc)) {
    await set(loc.state as CardState['status'])
    return null
  }
  const stat = (p: string) => $.fs.stat(p, { resolve: true }).catch(() => null)
  const root = await stat(loc.files.root)
  const realRoot = root?.kind === 'dir' ? root.realPath : undefined
  const ms = await stat(loc.files.meta)
  const ds = await stat(loc.files.data)
  if (realRoot === undefined || !statLandsAt(ms, realRoot, `${realRoot}/${id}/meta.json`) || !statLandsAt(ds, realRoot, `${realRoot}/${id}/data.json`)) {
    await set('unreadable')
    return null
  }
  if ((ms as { size: number }).size > MAX_META_BYTES || (ds as { size: number }).size > MAX_DATA_BYTES) {
    await set('too-large')
    return null
  }
  // Each file is read at the resolved path that was checked, not at the path as written.
  const metaText = await $.fs.read(`${realRoot}/${id}/meta.json`).catch(() => null)
  const m = metaText === null ? { state: 'unreadable' } : readMeta(metaText, id)
  if (!('meta' in m)) {
    await set(m.state as CardState['status'])
    return null
  }
  if ((ds as { size: number }).size !== m.meta.dataBytes) {
    await set('inconsistent')
    return null
  }
  const dataText = await $.fs.read(`${realRoot}/${id}/data.json`).catch(() => null)
  const data = dataText === null ? null : readData(dataText, id)
  if (data === null) {
    await set('unreadable')
    return null
  }
  const canOpen = canOpenElsewhere()
  await update($, card, cur => ({ ...cur, id, status: 'ready', view: 'table', row: 0, shown: 20, page: 0, meta: m.meta, data, canOpen, link: undefined }))
  let dropped: string[] = []
  await update($, cardRows, cur => {
    const next = [...cur.filter(k => k !== key), key]
    dropped = next.slice(0, Math.max(0, next.length - MAX_CARDS))
    return next.slice(-MAX_CARDS)
  })
  for (const old of dropped) await update($, memberOf(cards, { requestId: old }), cur => (cur.status === 'ready' ? { ...cur, status: 'load', data: undefined, link: undefined } : cur))
  return m.meta
}

// One constant line in the transcript for each result, so a card the engine folded into a count line,
// refused or failed to draw is never silent. `$.ui.log` is the transcript line (dim, not sent to the
// model); `$.ui.notice` only puts a line under an open permission dialog. No path, id, row or command.
const NOTICE_PLACED = 'DataTug: result card above; ctrl+x tab to use it in the DataTug panel, Esc returns (ctrl+o expands folded tool calls).'
const NOTICE_UNPLACED = 'DataTug: result card above; run /datatug to use it in the DataTug panel (ctrl+o expands folded tool calls).'
async function announceCard($: Host): Promise<void> {
  try {
    // The panel shows the newest card with the views as focusable buttons. Opened without `focus`: it
    // never takes the keys from what the person is typing. An open panel is only redrawn by the state.
    const opened = await ($ as unknown as { ui: { open: (p: { id: string; title: string }) => Promise<{ isPlaced?: boolean } | undefined> } }).ui.open({ id: PANE, title: TITLE }).catch(() => undefined)
    ;($ as unknown as { ui: { log: (text: string) => void } }).ui.log(opened?.isPlaced === true ? NOTICE_PLACED : NOTICE_UNPLACED)
  } catch {
    // a line that cannot be drawn is not worth failing the query for
  }
}

// Whether a Bash row's command is one the mod gave result files: the plain form as the model wrote
// it, or the rewritten one naming this result id.
function isCardCommand(command: string, id: string): boolean {
  const c = classify(command, false)
  if (c.kind === 'plain') return c.format === null || c.format === 'json'
  return new RegExp(`(?:^|\\s)query\\s+run\\s+--result-id\\s+${id}(?:\\s|$)`).test(command)
}

// What the row of a call with a card draws in place of the model-facing sentence: the model keeps
// its own text (the stored result is untouched); the person reads the card under the row.
const SEEN_TEXT = 'DataTug query ran; the result card is below.'
function hideOutput<T extends { props: { output?: unknown } }>(e: T): T {
  const out = e.props.output as { stdout?: unknown } | null | undefined
  if (out === null || out === undefined || typeof out !== 'object' || typeof out.stdout !== 'string' || out.stdout === '') return e
  return { ...e, props: { ...e.props, output: { ...out, stdout: SEEN_TEXT } } }
}

const NUMERIC = new Set(['integer', 'number', 'decimal'])
const VIEW_KEYS: CardView[] = VIEWS as CardView[]

// One result card under its `datatug query run` row: a header, the five-view switcher, the view,
// and, when the CLI can open the result elsewhere, the web link and the terminal command. It reads
// nothing but its own member and the column order; a press writes only its member.
async function drawCard($: Host, e: { requestId: string; surface: string; component?: string; props: { bodyColumns?: number } }, row: unknown, card: CardState, hotkeys = false) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Box, Text, Button, Markdown, Link, Code } = $.ui.resolve(e as never) as any
  const key = e.requestId
  const fp = fingerprint(key)
  const k = (...parts: (string | number)[]) => `qr:${fp}:${parts.join(':')}`
  const set = (fn: (c: CardState) => CardState) => update($, memberOf(cards, { requestId: key }), fn)
  const load = () => {
    if (card.id !== '') void loadCard($, key, card.id)
  }
  if (card.status !== 'ready' || card.meta === undefined || card.data === undefined) {
    const why = card.status === 'fallback' ? (LEGACY_TEXT[card.why as keyof typeof LEGACY_TEXT] ?? STATE_TEXT['no-locator']) : (STATE_TEXT[card.status as keyof typeof STATE_TEXT] ?? STATE_TEXT.load)
    const canLoad = card.status === 'load' || card.status === 'incomplete' || card.status === 'no-locator' || (card.status === 'ready' && card.data === undefined)
    return (
      <Box flexDirection="column">
        {row}
        <Box flexDirection="row" gap={1} alignItems="center">
          <Text dimColor>{card.status === 'ready' ? STATE_TEXT.load : why}</Text>
          {canLoad && (
            <Button key={k('load')} onPress={load}>
              Load
            </Button>
          )}
        </Box>
      </Box>
    )
  }
  const meta = card.meta
  const data = card.data
  const order = await read($, columnOrder)
  const colMeta = (n: string) => meta.columns.find(c => c.name === n)
  const pkKnown = meta.columns.some(c => c.pk !== null)
  const names = data.columns.filter(n => !(pkKnown && n === '$key'))
  const typeOf = (n: string) => colMeta(n)?.type ?? data.types[data.columns.indexOf(n)] ?? ''
  const ordered = orderColumns(names, order, names, n => colMeta(n)?.declaredType ?? typeOf(n))
  const at = (r: (string | null)[], n: string) => r[data.columns.indexOf(n)] ?? null
  const total = data.rows.length
  const dbRef0 = meta.db.ref
  const noProject = <Text dimColor>Add this database to a project to open its tables</Text>
  const cell0 = (w: number, child: unknown, right = false) => (
    <Box width={w} flexShrink={0} justifyContent={right ? 'flex-end' : 'flex-start'} paddingRight={1}>
      {child}
    </Box>
  )
  const nameOf = (schema0: string, rel: string) => (schema0 === '' || schema0 === 'main' ? rel : `${schema0}.${rel}`)
  // A name that opens a side-panel card when the database is in a project, else plain text.
  const opener = (bkey: string, label: string, ref: string | null, onPress: (ref: string) => unknown) =>
    ref === null ? <Text>{clean(label)}</Text> : (
      <Button key={bkey} plain onPress={() => void onPress(ref)}>
        {clean(label)}
      </Button>
    )
  const instRef = (instance: string) => meta.participants.find(p => p.instance === instance)?.db ?? dbRef0
  const unavailable = (reason: string | undefined) => (reason === undefined ? null : <Text dimColor>{UNAVAILABLE_TEXT[reason as keyof typeof UNAVAILABLE_TEXT] ?? 'Not known for this result'}</Text>)

  let body: unknown
  if (card.view === 'table') {
    const cols = ordered.slice(0, MAX_COLS)
    const start = card.page * 50
    const shown = data.rows.slice(start, start + card.shown)
    const canMore = card.page === 0 && card.shown < 50 && total > card.shown
    // A table of Boxes, not Markdown: the row number is a Button (a press opens that row in the Record
    // view), never a link, so no placeholder address is ever drawn or hovered. Values are plain Text.
    const num = Math.max(2, String(start + shown.length).length)
    const widths = cols.map(c => Math.min(28, Math.max(c.length, 3, ...shown.map(r => gridText(at(r, c)).length))) + 1)
    const gcell = (gk: string, w: number, child: unknown, right = false) => (
      <Box key={gk} width={w} flexShrink={1} minWidth={0} justifyContent={right ? 'flex-end' : 'flex-start'} paddingRight={1}>
        {child}
      </Box>
    )
    body = (
      <Box flexDirection="column" key={k('grid')}>
        {ordered.length > cols.length && <Text dimColor>{`First ${cols.length} of ${ordered.length} columns shown; the Record view shows them all.`}</Text>}
        <Box flexDirection="row" key={k('head')}>
          <Box width={num + 1} flexShrink={0} justifyContent="flex-end" paddingRight={1}>
            <Text bold dimColor>#</Text>
          </Box>
          {cols.map((c, j) =>
            gcell(k('h', j), widths[j], <Text bold dimColor wrap="truncate-end">{gridText(c, 40)}</Text>, NUMERIC.has(typeOf(c)))
          )}
        </Box>
        {shown.map((r, i) => (
          <Box key={k('r', start + i)} flexDirection="row">
            <Box width={num + 1} flexShrink={0} justifyContent="flex-end" paddingRight={1}>
              <Button key={k('row', start + i)} plain onPress={() => set(c => ({ ...c, view: 'record', row: start + i }))}>
                {String(start + i + 1)}
              </Button>
            </Box>
            {cols.map((c, j) => (
              gcell(k('c', start + i, j), widths[j], <Text wrap="truncate-end">{gridText(at(r, c))}</Text>, NUMERIC.has(typeOf(c)))
            ))}
          </Box>
        ))}
        {canMore && (
          <Box marginTop={1}>
            <Button key={k('more')} plain onPress={() => set(c => ({ ...c, shown: 50 }))}>
              {`Show ${Math.min(30, total - card.shown)} more`}
            </Button>
          </Box>
        )}
        {card.shown >= 50 && total > 50 && (
          <Box flexDirection="row" gap={1}>
            {card.page > 0 && (
              <Button key={k('prev50')} onPress={() => set(c => ({ ...c, page: Math.max(0, c.page - 1) }))}>
                ◀ Prev 50
              </Button>
            )}
            {start + 50 < total && (
              <Button key={k('next50')} onPress={() => set(c => ({ ...c, page: c.page + 1 }))}>
                Next 50 ▶
              </Button>
            )}
          </Box>
        )}
      </Box>
    )
  } else if (card.view === 'record') {
    const index = Math.min(Math.max(0, card.row), Math.max(0, total - 1))
    const r = data.rows[index] ?? []
    const step = (by: number) => set(c => ({ ...c, row: Math.min(Math.max(0, c.row + by), Math.max(0, total - 1)) }))
    const tw = Math.min(16, Math.max(6, ...ordered.map(n => typeOf(n).length)) + 2)
    const nw = Math.min(32, Math.max(6, ...ordered.map(n => n.length)) + 2)
    body = (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1} alignItems="center">
          <Text dimColor>{`Row ${index + 1} of ${total}`}</Text>
          <Button key={k('prev')} onPress={() => step(-1)}>
            ◀ Prev
          </Button>
          <Button key={k('next')} onPress={() => step(1)}>
            Next ▶
          </Button>
        </Box>
        {ordered.map((n, i) => {
          const c = colMeta(n)
          const v = at(r, n)
          const fk = c?.foreignKeys[0]
          const ref = c?.source === null || c?.source === undefined ? dbRef0 : instRef(c.source.instance)
          const shownValue = v === null ? '' : clean(v).slice(0, 800)
          return (
            <Box key={k('f', i)} flexDirection="row">
              {cell0(tw, <Text dimColor>{clean(typeOf(n))}</Text>)}
              {cell0(nw, <Text>{clean(n)}</Text>)}
              <Box flexGrow={1} flexShrink={1} minWidth={0}>
                {fk !== undefined && ref !== null && v !== null && !fk.refRelation.startsWith('-') ? (
                  <Button key={k('fk', i)} plain onPress={() => void openRefRecord($, ref, fk.refRelation, fk.refColumn, v)}>
                    {shownValue}
                  </Button>
                ) : (
                  <Text>{shownValue}</Text>
                )}
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  } else if (card.view === 'columns') {
    const w = { n: 4, name: Math.min(28, Math.max(6, ...ordered.map(n => n.length)) + 2), type: 10, decl: 14, nul: 9, key: 6 }
    body = (
      <Box flexDirection="column">
        <Box flexDirection="row">
          {cell0(w.n, <Text bold dimColor>#</Text>, true)}
          {cell0(w.name, <Text bold dimColor>Name</Text>)}
          {cell0(w.type, <Text bold dimColor>Type</Text>)}
          {cell0(w.decl, <Text bold dimColor>Declared</Text>)}
          {cell0(w.nul, <Text bold dimColor>Nullable</Text>)}
          {cell0(w.key, <Text bold dimColor>Key</Text>)}
          <Text bold dimColor>Source</Text>
        </Box>
        {ordered.map((n, i) => {
          const c = colMeta(n)
          const src = c?.source ?? null
          const ref = src === null ? null : instRef(src.instance)
          const pkParts = meta.columns.filter(x => x.pk !== null).length
          return (
            <Box key={k('c', i)} flexDirection="row">
              {cell0(w.n, <Text dimColor>{String(i + 1)}</Text>, true)}
              {cell0(w.name, src === null ? <Text>{clean(n)}</Text> : opener(k('cn', i), n, ref, rf => gotoPanel($, rf, { schema: src.schema, table: src.relation, column: src.column })))}
              {cell0(w.type, <Text>{clean(typeOf(n))}</Text>)}
              {cell0(w.decl, <Text dimColor={c?.declaredType == null}>{c?.declaredType == null ? '—' : clean(c.declaredType)}</Text>)}
              {cell0(w.nul, <Text dimColor={c?.nullable == null}>{c?.nullable == null ? '—' : c.nullable ? 'yes' : 'no'}</Text>)}
              {cell0(w.key, <Text>{c?.pk == null ? '' : pkParts > 1 ? `🔑 ${c.pk}` : '🔑'}</Text>)}
              <Box flexDirection="row" gap={1} flexShrink={1} minWidth={0}>
                {src === null ? (
                  <Text dimColor>computed</Text>
                ) : (
                  opener(k('cs', i), `${src.relation}.${src.column}`, ref, rf => gotoPanel($, rf, { schema: src.schema, table: src.relation, showTable: true }))
                )}
                {(c?.foreignKeys ?? []).slice(0, 3).map((f, j) => (
                  <Box key={k('cfk', i, j)} flexDirection="row" gap={1}>
                    <Text dimColor>FK</Text>
                    {opener(k('cf', i, j), f.refRelation, ref, rf => gotoPanel($, rf, { schema: f.refSchema, table: f.refRelation, showTable: true }))}
                  </Box>
                ))}
              </Box>
            </Box>
          )
        })}
        {unavailable(meta.unavailable.declaredTypes ?? meta.unavailable.columns)}
        {dbRef0 === null && noProject}
      </Box>
    )
  } else if (card.view === 'sources') {
    const w = { n: 4, rel: Math.min(32, Math.max(8, ...meta.participants.map(p => nameOf(p.schema, p.relation).length)) + 2), kind: 9, alias: Math.min(16, Math.max(7, ...meta.participants.map(p => p.alias.length)) + 2), role: 7 }
    body = (
      <Box flexDirection="column">
        {meta.participants.length > 0 && (
          <Box flexDirection="row">
            {cell0(w.n, <Text bold dimColor>#</Text>, true)}
            {cell0(w.rel, <Text bold dimColor>Source</Text>)}
            {cell0(w.kind, <Text bold dimColor>Kind</Text>)}
            {cell0(w.alias, <Text bold dimColor>Alias</Text>)}
            {cell0(w.role, <Text bold dimColor>Role</Text>)}
          </Box>
        )}
        {meta.participants.map((p, i) => {
          const ref = p.db ?? dbRef0
          return (
            <Box key={k('s', i)} flexDirection="row">
              {cell0(w.n, <Text dimColor>{String(i + 1)}</Text>, true)}
              {cell0(w.rel, opener(k('st', i), nameOf(p.schema, p.relation), ref, rf => gotoPanel($, rf, { schema: p.schema, table: p.relation, showTable: true })))}
              {cell0(w.kind, <Text dimColor>{clean(p.kind)}</Text>)}
              {cell0(w.alias, <Text>{clean(p.alias)}</Text>)}
              {cell0(w.role, <Text dimColor>{clean(p.role)}</Text>)}
              <Box flexDirection="row" gap={1} flexShrink={1} minWidth={0}>
                {p.on.length > 0 && <Text dimColor>{clean(p.on.map(o => `${o.left} = ${o.right}`).join(', '))}</Text>}
                {ref !== null && !p.relation.startsWith('-') && (
                  <Button key={k('sr', i)} plain onPress={() => void openRefRecords($, ref, p.relation)}>
                    Records
                  </Button>
                )}
              </Box>
            </Box>
          )
        })}
        {unavailable(meta.unavailable.participants)}
        {meta.participants.length === 0 && meta.unavailable.participants === undefined && <Text dimColor>No sources reported for this result</Text>}
        {dbRef0 === null && meta.participants.length > 0 && noProject}
      </Box>
    )
  } else {
    const w = { n: 4, rel: Math.min(32, Math.max(8, ...meta.related.map(r => nameOf(r.schema, r.relation).length)) + 2), kind: 9, dir: 17, card: 13 }
    const fromName = (inst: string) => meta.participants.find(p => p.instance === inst)?.relation ?? ''
    body = (
      <Box flexDirection="column">
        {meta.related.length > 0 && (
          <Box flexDirection="row">
            {cell0(w.n, <Text bold dimColor>#</Text>, true)}
            {cell0(w.rel, <Text bold dimColor>Table</Text>)}
            {cell0(w.kind, <Text bold dimColor>Kind</Text>)}
            {cell0(w.dir, <Text bold dimColor>Direction</Text>)}
            {cell0(w.card, <Text bold dimColor>Cardinality</Text>)}
          </Box>
        )}
        {meta.related.map((r, i) => {
          const ref = instRef(r.fromInstance)
          const from = fromName(r.fromInstance)
          return (
            <Box key={k('r', i)} flexDirection="row">
              {cell0(w.n, <Text dimColor>{String(i + 1)}</Text>, true)}
              {cell0(w.rel, opener(k('rt', i), nameOf(r.schema, r.relation), ref, rf => gotoPanel($, rf, { schema: r.schema, table: r.relation, showTable: true })))}
              {cell0(w.kind, <Text dimColor>{clean(r.kind)}</Text>)}
              {cell0(w.dir, <Text dimColor>{r.direction === 'incoming' ? '← referenced by' : '→ references'}</Text>)}
              {cell0(w.card, <Text dimColor>{clean(r.cardinality)}</Text>)}
              <Box flexDirection="row" gap={1} flexShrink={1} minWidth={0}>
                <Text dimColor>{clean(r.fields.map(f => `${from === '' ? '' : `${from}.`}${f.source} = ${r.relation}.${f.target}`).join(', '))}</Text>
                {ref !== null && !r.relation.startsWith('-') && (
                  <Button key={k('rr', i)} plain onPress={() => void openRefRecords($, ref, r.relation)}>
                    Records
                  </Button>
                )}
              </Box>
            </Box>
          )
        })}
        {unavailable(meta.unavailable.related)}
        {meta.related.length === 0 && meta.unavailable.related === undefined && <Text dimColor>No related tables found</Text>}
        {dbRef0 === null && meta.related.length > 0 && noProject}
      </Box>
    )
  }

  // The web link and the terminal command: only from a CLI that opens a result elsewhere.
  let open: unknown = null
  const openLabel = card.view === 'record' ? 'Open row in DataTug ↗' : 'Open in DataTug ↗'
  const command = uiCommand(card.id)
  if (card.canOpen === true && command !== null) {
    const isHere = isSameHost(e.surface, await overSsh($))
    let linkBody: unknown
    if (!isHere) linkBody = <Text dimColor>{MESSAGES['same-host']}</Text>
    else {
      const args = resultUrlArgs(card.id, card.view, card.view === 'record' ? card.row + 1 : undefined, hasResultView())
      const want = args === null ? null : fingerprint(JSON.stringify(args))
      const st = card.link
      const t = await nowMs($)
      const fresh = st !== undefined && st.req === want && st.status !== 'checking' && st.isStale !== true && t - st.at < LINK_TTL_MS
      const held = hrefs.get(`qr:${key}`)
      if (want !== null && (!fresh || (st.status === 'ok' && held?.req !== want))) void fetchCardLink($, key, st !== undefined && st.status === 'ok' && held?.req !== want)
      linkBody =
        fresh && st.status === 'ok' && held?.req === want ? (
          <Link key={k('link')} href={held.href} label={openLabel} />
        ) : held !== undefined && st?.status === 'checking' ? (
          <Text dimColor>{`${openLabel} (updating…)`}</Text>
        ) : (
          <Text dimColor>{MESSAGES[fresh && st.status !== 'ok' ? st.status : 'checking']}</Text>
        )
    }
    const copy = async () => {
      const done = await ($.ui as unknown as { copy: (a: { text: string; surface: string }) => Promise<{ isCopied: boolean }> }).copy({ text: command, surface: e.surface }).catch(() => ({ isCopied: false }))
      if (!done.isCopied) void $.ui.toast('Select the command to copy it')
    }
    // Two labelled blocks with a blank line above each: the web link and its re-check on their own
    // row, then the terminal command in a dim frame with Copy right under it.
    open = (
      <Box flexDirection="column" marginTop={1}>
        <Box flexDirection="row" gap={2} alignItems="center">
          {linkBody}
          {isHere && (
            <Button key={k('check')} plain onPress={() => void fetchCardLink($, key, true)}>
              Check again
            </Button>
          )}
        </Box>
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>
            Open these records in the DataTug terminal UI
          </Text>
          <Box borderStyle="round" borderDimColor paddingX={1} flexShrink={1}>
            <Code key={k('cmd')} source={command} language="sh" />
          </Box>
          <Box flexDirection="row">
            <Button key={k('copy')} plain onPress={() => void copy()}>
              Copy
            </Button>
          </Box>
        </Box>
      </Box>
    )
  }

  const kept = meta.rows.kept
  // In the transcript the card is a bordered, padded block with a blank line above and below, like the
  // panel's cards; in the panel it sits inside the "Latest result" card, which has the border.
  const frame = hotkeys
    ? ({ flexDirection: 'column' } as const)
    : ({ key: k('frame'), flexDirection: 'column', borderStyle: 'round', paddingX: 1, marginTop: 1, marginBottom: 1 } as const)
  return (
    <Box flexDirection="column">
      {row}
      <Box {...frame}>
        <Text dimColor>
          {`${kept} row${kept === 1 ? '' : 's'}${meta.rows.hasMore ? ` (at least ${kept + 1})` : ''} x ${names.length} column${names.length === 1 ? '' : 's'} (shown to you, not to Claude)`}
        </Text>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {VIEW_KEYS.map((v, i) => (
            <Button key={k('view', v)} plain {...(hotkeys ? { hotkey: String(i + 1) } : {})} onPress={() => set(c => ({ ...c, view: v }))}>
              {`${card.view === v ? '●' : '○'} ${VIEW_LABELS[v]}`}
            </Button>
          ))}
        </Box>
        {body}
        {open}
      </Box>
    </Box>
  )
}

export const register: Register = (on, options) => {
  // A development web UI host is used only when the person named one in the plugin's settings.
  devOrigin = parseDevHost((options as Record<string, unknown> | undefined)?.webDevHost)
  // The plugin has one hooks module: it adds the project pane (hooks/project.js), which registers
  // `/datatug` and answers `/datatug project`; this module answers plain `/datatug` with the panel.
  registerProject(on)
  on('command.run', { command: 'datatug' }, async ($, e, next) => {
    if (isProjectView((e as { args?: unknown }).args)) return next(e)
    // Back to the root: close every optional card, show the project list and the Open DB card.
    dbDraft = ''
    dbUrl = ''
    dbPromptRef = ''
    const cwd = await $.session.cwd()
    const version = await $.process
      .run(['datatug', ...VERSION_ARGS], { cwd, timeoutMs: 15000, env: cliEnv() })
      .then(r => ({ isStarted: true, stdout: r.stdout }))
      .catch(() => ({ isStarted: false, stdout: '' }))
    if (!version.isStarted) return { text: missingCliText() }
    // A version that cannot be read is a development build: let it through.
    const found = parseVersion(version.stdout)
    if (found !== null && isOlder(found, parseVersion(MIN_CLI_VERSION) as number[])) return { text: tooOldText(found.join('.')) }
    cliVersion = found
    // Where nothing shows panes (`claude -p`, the VS Code chat), say so and name the text view.
    const surfaces = await $.session.surfaces().catch(() => null)
    if (surfaces !== null && !canDrawPane(surfaces)) return { text: NO_PANE_TEXT }
    await update($, dbTable, () => ({ name: null, status: 'idle', message: '', result: null }))
    await update($, dbRecords, () => NO_RECORDS)
    await update($, view, cur => ({ ...cur, selected: null, column: null, showTable: false, tableName: null }))
    await update($, openDb, () => ({ status: 'idle', provider: '', note: '', target: '', url: '', items: [], message: '' }))
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    if ((opened as { isPlaced?: boolean } | undefined)?.isPlaced === false) return { text: NO_PANE_TEXT }
    await loadProjects($ as Host)
    await update($, project, cur => ({ ...cur, isOpen: true }))
    return { text: 'DataTug panel opened.' }
  }).catch(() => ({ text: 'The DataTug panel could not be opened. Run `/datatug` again, or `/datatug project` for a text summary of the project in this folder.' }))

  // The model's own file tools never reach the result store or the capture folder. Judged on the
  // model's input, before any rewrite; a guard that fails denies.
  const guarded: [string, string[]][] = [
    ['Read', ['file_path']],
    ['Grep', ['path']],
    ['Glob', ['path', 'pattern']],
    ['Edit', ['file_path']],
    ['Write', ['file_path']],
    ['NotebookEdit', ['notebook_path']],
  ]
  for (const [tool, keys] of guarded)
    on('tool.call', { tool } as never, async ($: Host, e: Record<string, unknown>, next: (e: unknown) => unknown) =>
      (await namesStore($, keys.map(k => e[k]))) ? { deny: STORE_TEXT } : next(e),
    ).catch(() => ({ deny: STORE_TEXT }) as never)

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command0 = String(e.command ?? '')
    if (bashNamesStore(command0, await homeDir($ as Host))) return { deny: STORE_TEXT }
    const c = classify(command0, (e as { run_in_background?: unknown }).run_in_background === true)
    if (c.kind === 'none' || c.kind === 'help') return next(e)
    if (c.kind === 'deny') return { deny: c.reason }
    // A CLI new enough writes the result to its own private files: `--result-id` (and `--format json`
    // when the model gave none) goes right after `query run`, with no redirect or other shell syntax.
    const explicitFormat = c.format !== null && c.format !== 'json'
    if (!explicitFormat && (await sessionMode($ as Host)) === 'new') {
      const id = resultId(e.tool_use_id)
      if (id === null) throw new ModError('no result id')
      const key = e.tool_use_id
      const ran = await next({ ...e, command: `${c.head} --result-id ${id}${c.format === null ? ' --format json' : ''}${c.tail}` })
      if (ran.deny !== undefined) return ran
      const out = (ran.result ?? {}) as object
      if (typeof (ran.result as { backgroundTaskId?: unknown } | undefined)?.backgroundTaskId === 'string') {
        await update($, memberOf(cards, { requestId: key }), () => ({ ...NO_CARD, id, status: 'load' }))
        return { result: { ...out, stdout: TEXT.background } } as typeof ran
      }
      if (ran.isError === true) {
        // Only two error lines are read: an older CLI's unknown flag, and the store failure line of a
        // sandboxed shell. Either turns the session back to the private capture.
        const fb = fallbackOf(`${ran.text ?? ''}\n${String((ran.result as { stderr?: unknown } | undefined)?.stderr ?? '')}\n${String((ran.result as { stdout?: unknown } | undefined)?.stdout ?? '')}`)
        if (fb === null) return ran
        bashMode = 'legacy'
        legacyWhy = fb
        await update($, memberOf(cards, { requestId: key }), () => ({ ...NO_CARD, id, status: 'fallback', why: fb }))
        return { deny: fb === 'old-cli' ? TEXT.oldCli : TEXT.rerun }
      }
      // Never the tool's stdout for paths: the mod asks the CLI where the files are.
      const meta = await loadCard($ as Host, key, id)
      if (meta !== null) await announceCard($ as Host)
      return { result: { ...out, stdout: meta === null ? TEXT.ran : resultSummary(meta) } } as typeof ran
    }
    // The plain form, private capture: the rows go to a file of the mod's, never through Bash's output.
    const dir = await rowsDir($ as Host)
    const file = `${dir}/${e.tool_use_id.replace(/[^A-Za-z0-9_-]/g, '_')}.json`
    const run = c.format === null ? `${c.head} --format json${c.tail}` : `${c.head}${c.tail}`
    // The folder must be ours and not a link before the rows are written, the file is owner-only, and
    // `set -C` refuses a file that is already there (one planted as a link) instead of writing through it.
    const command = `umask 077 && mkdir -p -m 700 '${dir}' && [ ! -L '${dir}' ] && [ -O '${dir}' ] && chmod 700 '${dir}' && (set -C; ${run} > '${file}')`
    let ran: Awaited<ReturnType<typeof next>>
    let stdout: string | null = null
    let isBackground = false
    try {
      ran = await next({ ...e, command })
      isBackground = typeof (ran.result as { backgroundTaskId?: unknown } | undefined)?.backgroundTaskId === 'string'
      if (ran.deny === undefined && !isBackground) {
        try {
          stdout = await $.fs.read(file)
        } catch {
          // unreadable: nothing to show
        }
      }
    } finally {
      // Whatever happened, the rows are not left on disk.
      await removeCapture($ as Host, file)
    }
    if (ran.deny !== undefined) return ran
    const out = (ran.result ?? {}) as object
    if (isBackground) return { result: { ...out, stdout: 'The DataTug query went to the background, so its rows were not captured. Run it in the foreground to see them in a card.' } } as typeof ran
    if (ran.isError === true || stdout === null) return ran
    if (c.format !== null && c.format !== 'json') return { result: { ...out, stdout: 'The output was captured privately; leave out --format to see the result in a card.' } } as typeof ran
    const parsed0 = parseRows(stdout, e.tool_use_id, e.command)
    if (parsed0 === null) return ran
    const parsed: GridResult = legacyWhy !== null && LEGACY_TEXT[legacyWhy as keyof typeof LEGACY_TEXT] !== undefined ? { ...parsed0, note: LEGACY_TEXT[legacyWhy as keyof typeof LEGACY_TEXT] } : parsed0
    await update($, results, all => {
      const keep = Object.entries(all).slice(-9)
      return { ...Object.fromEntries(keep), [parsed.id]: parsed }
    })
    await update($, view, () => ({ current: parsed.id, selected: null, offset: 0 }))
    void ensureSchema($ as Host)
    await announceCard($ as Host)
    // Not `ran`'s ref or text: core would use the messages it already made for the model.
    return { result: { ...out, stdout: summary(parsed) } } as typeof ran
  }).catch(() => ({ deny: FAILED_TEXT }) as never)

  // The engine folds a run of shell commands into one count line ("Ran 1 shell command") and draws no
  // ToolUse row for them, so the card under the row would never be drawn. A group holding a DataTug
  // query call is unfolded (`isExpanded`, the one ToolGroup prop a rewrite changes on screen); each
  // row it unfolds into is a ToolUse the hook below draws the card under. The group reads the calls'
  // own card members, so it is drawn again when a result lands.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.props.isExpanded) return next(e)
    const all = await read($, results)
    let hasCard = false
    for (const call of e.props.calls) {
      if (call.tool !== 'Bash' || call.tool_use_id === undefined) continue
      const id = resultId(call.tool_use_id)
      const command = String(((call.input ?? {}) as { command?: unknown }).command ?? '')
      const card = await read($, memberOf(cards, { requestId: call.tool_use_id }))
      if (card.status !== 'none' || all[call.tool_use_id] !== undefined || (id !== null && isCardCommand(command, id))) hasCard = true
    }
    return next(hasCard ? { ...e, props: { ...e.props, isExpanded: true } } : e)
  })

  // The same for a row drawn on its own: its result block carries the model-facing sentence, which the
  // person does not need above a card that shows the result.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (e.props.tool !== 'Bash' || e.props.isErrored) return next(e)
    const card = await read($, memberOf(cards, { requestId: e.requestId }))
    return next(card.status === 'ready' ? hideOutput(e) : e)
  })

  // The grid in the chat, under the call's own row: a Markdown table whose first
  // column links each row; pressing a link opens that record's card in the pane.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.props.tool !== 'Bash') return next(e)
    // A result card reads its own member and the column order only: a press, a side-panel action or a
    // schema load redraws no other card.
    const card = await read($, memberOf(cards, { requestId: e.requestId }))
    if (card.status !== 'none') return drawCard($ as Host, e, await next(card.status === 'ready' ? hideOutput(e) : e), card)
    const all = await read($, results)
    const result = all[e.requestId]
    if (result === undefined) {
      // A row whose call ran with result files, after the state lost it (a reload, a resumed session).
      const input = (e.props.input ?? {}) as { command?: unknown }
      const id = resultId(e.requestId)
      if (id === null || !isCardCommand(String(input.command ?? ''), id)) return next(e)
      // While the call runs the row already carries a short line, so the result's arrival is an update
      // of a drawn row and not its first drawing.
      if (e.props.isRunning) {
        const { Box, Text } = $.ui.resolve(e)
        return (
          <Box flexDirection="column">
            {await next(e)}
            <Text dimColor>Loading result...</Text>
          </Box>
        )
      }
      return drawCard($ as Host, e, await next(hideOutput(e)), { ...NO_CARD, id, status: 'load' })
    }
    const limits = await read($, shownRows)
    const row = await next(e)
    const { Box, Text, Markdown } = $.ui.resolve(e)
    const shown = Math.min(result.rows.length, limits[result.id] ?? CHAT_ROWS)
    const sch0 = await read($, schema)
    const tblC = findTable(sch0.tables, result.collection)
    const ord0 = await read($, columnOrder)
    const visible = orderColumns(dataColumns(result.columns, tblC), ord0, tblC?.columns.map(c => c.name), n => tblC?.columns.find(c => same(c.name, n))?.type ?? result.types[n] ?? '')
    const cols = visible.slice(0, MAX_COLS)
    const head = `| # | ${cols.map(c => md(c)).join(' | ')} |`
    const rule = `| ---: |${cols.map(c => (isNumeric(result, c) ? ' ---: ' : ' --- ')).join('|')}|`
    const lines = result.rows
      .slice(0, shown)
      .map((r, i) => `| [${i + 1}](${BASE}row/${i}) | ${cols.map(c => md(r[c])).join(' | ')} |`)
    const more = result.rows.length - shown
    const text = [head, rule, ...lines].join('\n') + (more > 0 ? `\n\n[Show ${Math.min(more, 50)} more](${BASE}more)` : '')
    const open = async (index: number) => {
      await update($, view, () => ({ current: result.id, selected: index, offset: 0 }))
      await $.ui.open({ id: PANE, title: TITLE })
      void ensureSchema($ as Host)
    }
    return (
      <Box flexDirection="column">
        {row}
        <Text dimColor>
          {result.total} rows x {visible.length} columns (shown to you, not to Claude)
          {visible.length > cols.length ? `; first ${cols.length} columns shown` : ''}. Press a row number to open its card.
        </Text>
        {result.note !== undefined && <Text dimColor>{result.note}</Text>}
        <Markdown
          key="grid"
          text={text}
          pressableLinks={[`${BASE}more`, ...result.rows.slice(0, shown).map((_, i) => `${BASE}row/${i}`)]}
          onLinkPress={link => {
            if (link.href === `${BASE}more`) return update($, shownRows, cur => ({ ...cur, [result.id]: shown + 50 }))
            const index = Number(link.href.slice(`${BASE}row/`.length))
            if (Number.isInteger(index)) return open(index)
          }}
        />
      </Box>
    )
  })

  // The side panel: two cards that are always there (project, context bag) and
  // optional ones that appear on demand (the record card).
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input, Link } = $.ui.resolve(e)
    const [all, latestKeys, closedKey] = await Promise.all([read($, results), read($, cardRows), read($, latestClosed)])
    const v = await read($, view)
    const ps = await read($, projects)
    const proj = await read($, project)
    const chosen = proj.selected
    const bagByProject = await read($, bags)
    const sch1 = await read($, schema)
    const sch = { ...sch1, tables: [...((await read($, openDb)).tables ?? []), ...sch1.tables] }
    const order = await read($, columnOrder)
    const bag = bagByProject[chosen ?? ''] ?? NO_BAG
    const result = v.current === null ? undefined : all[v.current]
    const card = { flexDirection: 'column', borderStyle: 'round', paddingX: 1, gap: 1 } as const

    // A glyph-only plain Button (real Buttons are what the surface presses reliably);
    // its name shows in a solid box while the pointer is over it.
    const iconButton = (key: string, glyph: string, tip: string, onPress: () => unknown) => (
      <Box key={`${key}:hover`} flexDirection="row">
        <Button key={key} plain onPress={() => onPress()}>
          {glyph}
        </Button>
        <Box position="absolute" top={1} right={0} display="none" hover={{ display: 'flex' }} backgroundColor="text" paddingX={1}>
          <Text color="inverseText">{tip}</Text>
        </Box>
      </Box>
    )

    // As defined | A–Z | By type: one setting for every column list in the panel.
    const orderSwitch = (scope: string, known: boolean) => (
      <Box flexDirection="row" gap={1} alignItems="center">
        <Text bold dimColor>
          Columns
        </Text>
        {([['defined', 'As defined'], ['alpha', 'A–Z'], ['type', 'By type']] as const).map(([mode, label]) => (
          <Button key={`order:${scope}:${mode}`} plain onPress={() => update($, columnOrder, () => mode)}>
            {`${order === mode ? '●' : '○'} ${label}`}
          </Button>
        ))}
        {order === 'defined' && !known && <Text dimColor>(definition order unknown here)</Text>}
      </Box>
    )

    const setBag = (fn: (b: Bag) => Bag) =>
      update($, bags, cur => ({ ...cur, [chosen ?? '']: fn(cur[chosen ?? ''] ?? NO_BAG) }))

    // Metadata goes in the bag too: a table (contextBag.table = Invoice) or a column
    // (contextBag.column = Invoice.InvoiceDate).
    // The reference of the project database that holds a table, from the project's scan. A table that
    // several databases hold (local and prod) names none here: the prompt resolves it by rule.
    const declaredDb = (table: string) => {
      const t = findTable(sch.tables, table)
      const homes = new Set(sch.tables.filter(x => x.name.toLowerCase() === table.toLowerCase()).map(x => `${x.env}/${x.source}`))
      if (homes.size > 1) return ''
      if (t === undefined || chosen === null || t.source === '' || t.env === '') return ''
      const r = dbRef(chosen, { id: t.source, env: t.env })
      return isDbRef(r) ? r : ''
    }
    // The database the panel has open (a project reference), for an item seen where no database is named.
    const openRef = () => (dbPromptRef !== '' ? dbPromptRef : isDbRef(dbUrl) ? dbUrl : '')
    const bagHas = (address: string, value: string) => bag.entries.some(x => x.address === address && x.value === value)
    const addMeta = (address: string, value: string, source: string, db = '') =>
      setBag(b => {
        if (b.entries.some(x => x.address === address && x.value === value)) return b
        const isCol = address === 'contextBag.column'
        const dot = value.lastIndexOf('.')
        const entry: BagEntry = {
          id: `meta:${address}:${value}`,
          address,
          value: clean(value).slice(0, MAX_CELL),
          source,
          isOn: true,
          kind: isCol ? 'column' : 'table',
          table: isCol && dot > 0 ? value.slice(0, dot) : value,
          column: isCol && dot > 0 ? value.slice(dot + 1) : undefined,
          db: db !== '' ? db : declaredDb(isCol && dot > 0 ? value.slice(0, dot) : value) || openRef(),
        }
        return { ...b, entries: [...b.entries, entry].slice(-200) }
      })

    // A 🛒 beside a table name: adds the table to the bag (again is a no-op).
    const tableBag = (key: string, name: string, source: string) =>
      iconButton(key, '🛒', bagHas('contextBag.table', name) ? 'In context bag' : 'Add table to context bag', () => addMeta('contextBag.table', name, source))

    const kv = (key: string, label: string, value: unknown) => (
      <Box key={`kv:${key}`} flexDirection="row">
        <Box width={19} flexShrink={0} justifyContent="flex-end" paddingRight={2}>
          <Text dimColor>{label}</Text>
        </Box>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          {typeof value === 'string' ? <Text>{value}</Text> : value}
        </Box>
      </Box>
    )

    // Project selection: no card border; label and a full-width picker on one line. Opened,
    // it lists the registered projects as a table (the demo project included).
    const chosenItem = ps.items.find(p => p.id === chosen) ?? ps.items[0]
    const labelOf = (p: { id: string; title: string }) => (p.title === '' ? p.id : `${p.title} (${p.id})`)
    const isOpen = proj.isOpen === true
    const toggle = () => update($, project, cur => ({ ...cur, isOpen: !cur.isOpen }))
    const hasDemo = ps.items.some(p => /demo/i.test(p.id))
    const projectRows = [
      ...ps.items.map(p => ({ id: p.id, title: p.title, origin: p.origin, pick: true })),
      ...(hasDemo ? [] : [{ id: 'demo', title: 'DataTug demo project', origin: 'not installed: run `datatug demo`', pick: false }]),
    ]
    const gridCell = (width: number, child: unknown, right = false) => (
      <Box width={width} flexShrink={0} justifyContent={right ? 'flex-end' : 'flex-start'} paddingRight={1}>
        {child}
      </Box>
    )
    const pw = {
      mark: 3,
      id: Math.min(28, Math.max(7, ...projectRows.map(r => r.id.length)) + 2),
      title: Math.min(34, Math.max(5, ...projectRows.map(r => r.title.length)) + 2),
    }
    const projectCard = (
      <Box key="card-project" flexDirection="column" paddingX={1}>
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Text bold dimColor>
            Project
          </Text>
          {chosenItem !== undefined ? (
            <Box flexGrow={1} flexShrink={1} minWidth={0} borderStyle="round" paddingX={1} justifyContent="space-between">
              <Button key="project-current" plain onPress={() => toggle()}>
                {clean(labelOf(chosenItem))}
              </Button>
              <Button key="project-arrow" plain onPress={() => toggle()}>
                {isOpen ? '▴' : '▾'}
              </Button>
            </Box>
          ) : (
            <Text dimColor>
              {ps.status === 'loading'
                ? 'Loading projects…'
                : ps.status === 'error'
                  ? `Could not list projects: ${ps.message}`
                  : 'No projects registered. Run `datatug projects add`.'}
            </Text>
          )}
        </Box>
        {isOpen && (
          <Box flexDirection="column" paddingLeft={1} paddingTop={1}>
            <Box flexDirection="row">
              {gridCell(pw.mark, <Text bold dimColor> </Text>)}
              {gridCell(pw.id, <Text bold dimColor>Project</Text>)}
              {gridCell(pw.title, <Text bold dimColor>Title</Text>)}
              {gridCell(10, <Text bold dimColor>Origin</Text>)}
            </Box>
            {projectRows.map(r => (
              <Box key={`prow:${r.id}`} flexDirection="row">
                {gridCell(pw.mark, <Text>{r.id === chosenItem?.id ? '✓' : ' '}</Text>)}
                {gridCell(
                  pw.id,
                  r.pick ? (
                    <Button key={`project:${r.id}`} plain onPress={() => { void update($, project, () => ({ selected: r.id, isOpen: false })); void loadDatabases($ as Host, r.id) }}>
                      {clean(r.id)}
                    </Button>
                  ) : (
                    <Text dimColor>{clean(r.id)}</Text>
                  ),
                )}
                {gridCell(pw.title, <Text dimColor={!r.pick}>{clean(r.title)}</Text>)}
                {gridCell(10, <Text dimColor>{clean(r.origin)}</Text>)}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    )

    // Root card: open a database from a connection string and list its tables and views.
    const od = await read($, openDb)
    const dbw = { n: 4, name: Math.min(34, Math.max(5, ...od.items.map(i => i.name.length)) + 2), kind: 8, rows: 10 }
    // Databases: the project's databases and the form that opens another one; an opened database
    // is added to the project (when it is not there yet) and the list refreshes.
    const dbs = await read($, databases)

    // "Open in DataTug": one line under a linked card, drawn once the card's own data has loaded. It is
    // the link `datatug daemon url` printed and the mod checked, or one line saying why there is none,
    // and always "Check again". `pre` is a reason known without asking the CLI.
    const isHere = isSameHost(e.surface, await overSsh($ as Host))
    const allLinks = await read($, links)
    const linkTime = await nowMs($ as Host)
    const envOf = (ref: string): string | undefined => {
      const m = /^datatug:\/\/[^/?#]*\/([^/?#]+)(?:\?env=([^&#]+))?$/.exec(ref)
      const dec = (x: string | undefined) => {
        try {
          return x === undefined ? undefined : decodeURIComponent(x)
        } catch {
          return x
        }
      }
      const id = dec(m?.[1])
      const env = dec(m?.[2])
      const src = dbs.items.find(d => d.id === id && (env === undefined || d.env === env))
      return src?.dsnEnv ?? (ref === od.ref ? od.sourceEnv : undefined)
    }
    const linkRow = (card: string, pre: string | null, req: LinkReq | null) => {
      const id = req === null ? null : reqId(req)
      if (pre === null && id === null) return null
      const recheck = () => {
        hrefs.delete(card)
        void update($, links, all => Object.fromEntries(Object.entries(all).filter(([k]) => k !== card))).then(() => {
          if (pre === null && req !== null) return fetchLink($ as Host, card, req, true)
        })
      }
      let body
      if (pre !== null) body = <Text dimColor>{pre}</Text>
      else {
        const st = allLinks[card]
        const fresh = st !== undefined && st.req === id && st.status !== 'checking' && st.isStale !== true && linkTime - st.at < LINK_TTL_MS
        const held = hrefs.get(card)
        if (!fresh || (st.status === 'ok' && held?.req !== id)) void fetchLink($ as Host, card, req as LinkReq, st !== undefined && st.status === 'ok' && held?.req !== id)
        body =
          fresh && st.status === 'ok' && held?.req === id ? (
            <Link key={`link:${card}`} href={held.href} label="Open in DataTug ↗" />
          ) : (
            <Text dimColor>{MESSAGES[fresh && st.status !== 'ok' ? st.status : 'checking']}</Text>
          )
      }
      return (
        <Box key={`link-row:${card}`} flexDirection="row" gap={1} alignItems="center">
          {body}
          <Button key={`link-check:${card}`} plain onPress={recheck}>
            Check again
          </Button>
        </Box>
      )
    }
    // Why a card of the opened database has no link before the CLI is asked, or null.
    const dbLinkBlock = (): string | null => {
      const ref = od.ref ?? ''
      if (ref === '') return MESSAGES['not-in-project']
      const name = envOf(ref)
      if (name !== undefined) return sourceUnavailableText(name)
      return isHere ? null : MESSAGES['same-host']
    }
    // The schema a link names: none for SQLite, which has no schemas, else the declared one.
    const linkSchema = (name: string) => (od.provider.startsWith('sqlite') ? undefined : findTable(sch.tables, name)?.schema || undefined)
    const openCard = (
      <Box key="card-opendb" {...card}>
        <Text bold>Databases</Text>
        {dbs.status === 'loading' && dbs.items.length === 0 && <Text dimColor>Loading…</Text>}
        {dbs.status === 'error' && <Text dimColor>{dbs.message}</Text>}
        {dbs.items.map(d => (
          <Box key={`dbs:${d.env}:${d.id}`} flexDirection="row" gap={1}>
            <Button key={`dbs-open:${d.env}:${d.id}`} plain onPress={() => void openDatabase($ as Host, dbRef(dbs.projectId, d))}>
              {clean(d.id)}
            </Button>
            <Text dimColor>{`${d.env}${d.driver === '' ? '' : ` · ${d.driver}`}`}</Text>
          </Box>
        ))}
        {dbs.status === 'ready' && dbs.items.length === 0 && <Text dimColor>No databases in this project yet.</Text>}
        <Box flexDirection="row" alignItems="center" gap={1} width="100%">
          <Box flexGrow={1} flexShrink={1} minWidth={0} width="100%">
            <Input
              key="opendb-input"
              placeholder="Connection string or file path"
              value={dbDraft}
              submitLabel="Open"
              onInput={value => {
                dbDraft = value
              }}
              onSubmit={value => void openDatabase($ as Host, value)}
            />
          </Box>
        </Box>
        {od.status === 'loading' && <Text dimColor>Opening…</Text>}
        {od.status === 'error' && <Text dimColor>{od.message}</Text>}
        {dbs.note !== '' && <Text dimColor>{dbs.note}</Text>}
      </Box>
    )

    // Database: the opened database's tables and views; closing it brings the Open DB card back.
    const closeDatabase = () => {
      dbUrl = ''
      dbPromptRef = ''
      openRun++
      void update($, dbTable, () => ({ name: null, status: 'idle', message: '', result: null }))
      void update($, dbRecords, () => NO_RECORDS)
      void update($, openDb, () => ({ status: 'idle', provider: '', note: '', target: '', url: '', items: [], message: '' }))
    }
    const databaseCard = (
      <Box key="card-database" {...card}>
        <Box justifyContent="space-between" alignItems="center">
          <Box flexDirection="row" gap={1} alignItems="center">
            <Text bold>
              <Text dimColor>Database </Text>
              {clean(dbName(od.target)).slice(0, 80)}
            </Text>
          </Box>
          <Box flexDirection="row" gap={1} alignItems="center">
            <Button key="database-count" plain onPress={() => void countRows($ as Host, od.items, dbUrl !== '' ? dbUrl : od.url, openRun)}>
              Count rows
            </Button>
            {iconButton('database-close', '✕', 'Close', () => closeDatabase())}
          </Box>
        </Box>
        <Box flexDirection="column" gap={1}>
          <Text>
            <Text bold dimColor>Target </Text>
            {clean(od.target)}
            <Text dimColor>{od.note === '' ? ` · ${od.provider}` : ` · ${od.provider} (detected ${od.note})`}</Text>
          </Text>
          <Box flexDirection="column">
            <Box flexDirection="row">
              {gridCell(dbw.n, <Text bold dimColor>#</Text>, true)}
              {gridCell(dbw.name, <Text bold dimColor>Name</Text>)}
              {gridCell(4, <Text> </Text>)}
              {gridCell(dbw.kind, <Text bold dimColor>Kind</Text>)}
              {gridCell(dbw.rows, <Text bold dimColor>Rows</Text>, true)}
            </Box>
            {od.items.map((i, n) => (
              <Box key={`odb:${i.kind}:${i.name}`} flexDirection="row">
                {gridCell(dbw.n, <Text dimColor>{String(n + 1)}</Text>, true)}
                {gridCell(
                  dbw.name,
                  <Button key={`odbt:${i.kind}:${i.name}`} plain onPress={() => void openDbTable($ as Host, i.name)}>
                    {i.name}
                  </Button>,
                )}
                {gridCell(4, tableBag(`odbbag:${i.kind}:${i.name}`, i.name, `${od.provider} ${i.kind}`))}
                {gridCell(dbw.kind, <Text dimColor>{i.kind}</Text>)}
                {gridCell(
                  dbw.rows,
                  i.kind !== 'table' ? (
                    <Text> </Text>
                  ) : i.counting === true ? (
                    <Text dimColor>…</Text>
                  ) : i.rows === undefined ? (
                    <Button key={`odbc:${i.name}`} plain onPress={() => void countRows($ as Host, [i], dbUrl !== '' ? dbUrl : od.url, openRun)}>
                      ?
                    </Button>
                  ) : (
                    <Button key={`odbr:${i.name}`} plain onPress={() => void openDbRecords($ as Host, i.name, od.url, i.rows)}>
                      {i.rows === null ? 'n/a' : `${i.atLeast ? '≥' : ''}${i.rows}`}
                    </Button>
                  ),
                  true,
                )}
              </Box>
            ))}
            {od.items.length === 0 && <Text dimColor>No tables or views.</Text>}
          </Box>
        </Box>
      </Box>
    )

    // The pressed table of the opened database: columns profiled from its rows, and a way to hand it to Claude.
    const dt = await read($, dbTable)
    const heldUrl = dbUrl !== '' ? dbUrl : od.url
    // A prompt names the database by its project reference, never by a connection string.
    const promptDb = isDbRef(heldUrl) ? heldUrl : dbPromptRef
    const canDraft = promptDb !== '' && /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(dt.name ?? '')
    let dbTableCard = null
    // The Table card and the Table records card take turns in the same place.
    if (dt.name !== null && (await read($, dbRecords)).name === null) {
      const kind = od.items.find(i => i.name === dt.name)?.kind ?? 'table'
      const item = od.items.find(i => i.name === dt.name)
      // Declared facts come from the project's scan when it holds a table of this name. Nothing is read
      // from the table, and `$key` (dalgo's internal key) is not a column.
      const declT = findTable(sch.tables, dt.name)
      const declNames = declT === undefined ? [] : orderColumns(declT.columns.map(c => c.name), order, declT.columns.map(c => c.name), n => declT.columns.find(x => x.name === n)?.type ?? '')
      const prof = declNames.map(name => {
        const d = declT?.columns.find(x => x.name === name) as SchemaColumn
        return {
          name,
          type: d.type,
          nullable: d.nullable === true ? 'NULLABLE' : d.nullable === false || d.pk !== null ? 'NOT NULL' : '—',
          key: keyMark(declT, d.pk),
          fks: fkTargets(declT, name),
        }
      })
      const w = {
        n: 4,
        name: Math.min(30, Math.max(6, ...prof.map(r => r.name.length)) + 2),
        type: Math.min(28, Math.max(6, ...prof.map(r => r.type.length)) + 2),
        key: Math.min(44, Math.max(7, ...prof.map(r => r.key.length + r.fks.reduce((n, f) => n + f.table.length + 5, 0))) + 2),
      }
      // The tables that hold a foreign key to this one, as a list like the Database card's.
      const refs = declT === undefined ? [] : referrers(sch.tables, declT)
      const anyFk = sch.tables.some(x => x.foreignKeys.length > 0)
      const rw = {
        n: 4,
        name: Math.min(30, Math.max(6, ...refs.map(r => r.table.name.length)) + 2),
        col: Math.min(30, Math.max(8, ...refs.map(r => r.fk.columns.join(', ').length)) + 2),
      }
      const tableBlock = dbLinkBlock()
      const tableLink =
        dt.status === 'ready' && od.status === 'ready'
          ? linkRow('table', tableBlock, tableBlock === null ? { kind: 'table', db: od.ref ?? '', table: dt.name, schema: linkSchema(dt.name), isView: kind === 'view' } : null)
          : null
      dbTableCard = (
        <Box key="card-opendb-table" {...card}>
          <Box justifyContent="space-between" alignItems="center">
            <Box flexDirection="row" gap={1} alignItems="center">
              <Text bold>{clean(dt.name)}</Text>
              <Text dimColor>
                {kind}{' '}
                <Text italic>(top {TOP})</Text>
              </Text>
              <Button key="dbtable-bag" onPress={() => addMeta('contextBag.table', dt.name as string, `${od.provider} ${kind}`, promptDb)}>
                {bagHas('contextBag.table', dt.name) ? 'In 🛒' : 'Add to 🛒'}
              </Button>
            </Box>
            {iconButton('dbtable-close', '✕', 'Close', () => update($, dbTable, () => ({ name: null, status: 'idle', message: '', result: null })))}
          </Box>
          <Text>
            <Text bold dimColor>Database </Text>
            {clean(`${od.provider} · ${od.target}`)}
          </Text>
          {tableLink}
          <Box flexDirection="row" gap={1} alignItems="center">
            <Text bold dimColor>Rows</Text>
            <Text bold>{item?.counting === true ? '…' : item?.rows === undefined ? '—' : item.rows === null ? 'n/a' : `${item.atLeast ? '≥' : ''}${item.rows}`}</Text>
            {kind === 'table' && item?.rows === undefined && item?.counting !== true && (
              <Button key="dbtable-count" onPress={() => void countRows($ as Host, [item as { name: string; kind: string }], dbUrl !== '' ? dbUrl : od.url, openRun)}>
                Count
              </Button>
            )}
            <Button key="dbtable-records" onPress={() => void openDbRecords($ as Host, dt.name as string, od.url, item?.rows)}>
              Show records
            </Button>
            {canDraft && (
              <Button
                key="dbtable-ask"
                onPress={() => void $.prompt.fill({ text: `Show me the ${dt.name} table of ${clean(dbName(od.target))}: datatug query run --db ${promptDb} --from ${dt.name} --no-policies`, mode: 'append' })}
              >
                Ask Claude to show the rows
              </Button>
            )}
          </Box>
          {orderSwitch('dbtable', declT !== undefined)}
          {declT !== undefined && (
            <Box flexDirection="column">
              <Box flexDirection="row">
                {gridCell(w.n, <Text bold dimColor>#</Text>, true)}
                {gridCell(w.name, <Text bold dimColor>Name</Text>)}
                {gridCell(4, <Text> </Text>)}
                {gridCell(w.type, <Text bold dimColor>Type</Text>)}
                {gridCell(11, <Text bold dimColor>Nullable</Text>)}
                {gridCell(w.key, <Text bold dimColor>Key</Text>)}
              </Box>
              {prof.map((r, i) => (
                <Box key={`dbc:${r.name}`} flexDirection="row">
                  {gridCell(w.n, <Text dimColor>{String(i + 1)}</Text>, true)}
                  {gridCell(
                    w.name,
                    <Button key={`dbcol:${r.name}`} plain onPress={() => { void ensureSchema($ as Host); goto({ table: dt.name as string, column: r.name }) }}>
                      {clean(r.name)}
                    </Button>,
                  )}
                  {gridCell(4, iconButton(`dbbag:${r.name}`, '🛒', 'Add column to context bag', () => addMeta('contextBag.column', `${dt.name}.${r.name}`, `${od.provider} column`, promptDb)))}
                  {gridCell(w.type, <Text>{clean(r.type)}</Text>)}
                  {gridCell(11, <Text dimColor={r.nullable === '—'}>{r.nullable}</Text>)}
                  {gridCell(
                    w.key,
                    <Box flexDirection="row" gap={1}>
                      {r.key !== '' && <Text>{r.key}</Text>}
                      {r.fks.map(f => (
                        <Box key={`dbfk:${r.name}:${f.table}`} flexDirection="row" gap={1}>
                          <Text dimColor>FK</Text>
                          <Button
                            key={`dbfkb:${r.name}:${f.table}`}
                            plain
                            onPress={() => {
                              void ensureSchema($ as Host)
                              goto({ table: f.table, showTable: true })
                            }}
                          >
                            {clean(f.table)}
                          </Button>
                        </Box>
                      ))}
                    </Box>,
                  )}
                </Box>
              ))}
            </Box>
          )}
          {declT !== undefined && (
            <Box flexDirection="column">
              <Text>
                <Text bold>Referenced by</Text> <Text dimColor>{tablesCount(refs)}</Text>
              </Text>
              {refs.length === 0 ? (
                <Text dimColor>{anyFk ? 'No table has a foreign key to this table.' : 'Foreign keys are not reported by this datatug version.'}</Text>
              ) : (
                <Box flexDirection="column">
                  <Box flexDirection="row">
                    {gridCell(rw.n, <Text bold dimColor>#</Text>, true)}
                    {gridCell(rw.name, <Text bold dimColor>Name</Text>)}
                    {gridCell(4, <Text> </Text>)}
                    {gridCell(rw.col, <Text bold dimColor>Column</Text>)}
                    {gridCell(10, <Text bold dimColor>Rows</Text>, true)}
                  </Box>
                  {refs.map((r, n) => {
                    const it = od.items.find(i => same(i.name, r.table.name))
                    const rkey = `${r.table.name}:${r.fk.name}:${r.fk.columns.join(',')}`
                    return (
                      <Box key={`dbref:${rkey}`} flexDirection="row">
                        {gridCell(rw.n, <Text dimColor>{String(n + 1)}</Text>, true)}
                        {gridCell(
                          rw.name,
                          <Button key={`dbreft:${rkey}`} plain onPress={() => void openDbTable($ as Host, r.table.name)}>
                            {clean(r.table.name)}
                          </Button>,
                        )}
                        {gridCell(4, tableBag(`dbrefbag:${rkey}`, r.table.name, `${od.provider} table`))}
                        {gridCell(
                          rw.col,
                          <Box flexDirection="row" gap={1}>
                            {r.fk.columns.map(c => (
                              <Button key={`dbrefc:${rkey}:${c}`} plain onPress={() => { void ensureSchema($ as Host); goto({ table: r.table.name, column: c }) }}>
                                {clean(c)}
                              </Button>
                            ))}
                          </Box>,
                        )}
                        {gridCell(
                          10,
                          it === undefined || it.kind !== 'table' ? (
                            <Text> </Text>
                          ) : it.counting === true ? (
                            <Text dimColor>…</Text>
                          ) : it.rows === undefined ? (
                            <Button key={`dbrefn:${rkey}`} plain onPress={() => void countRows($ as Host, [it], dbUrl !== '' ? dbUrl : od.url, openRun)}>
                              ?
                            </Button>
                          ) : (
                            <Button key={`dbrefr:${rkey}`} plain onPress={() => void openDbRecords($ as Host, it.name, od.url, it.rows)}>
                              {it.rows === null ? 'n/a' : `${it.atLeast ? '≥' : ''}${it.rows}`}
                            </Button>
                          ),
                          true,
                        )}
                      </Box>
                    )
                  })}
                </Box>
              )}
            </Box>
          )}
          <Text dimColor>
            {declT !== undefined
              ? `Columns from the project scan (${declT.env} · ${declT.source}), matched by table name. No data was read; Nullable shows — where the scan does not say.`
              : 'No column metadata yet: this table is not in the project scan, and no rows are read to guess it. `datatug db schema --columns` (CLI 0.80 and later) will report it.'}
          </Text>
          {!canDraft && <Text dimColor>A prompt names the database by its project reference: it appears once the database is added to the project.</Text>}
        </Box>
      )
    }

    // Table records: the first 100 records of the pressed table, 20 to a page; a row number opens its Record card.
    const dr = await read($, dbRecords)
    const recResult = dr.resultId === null ? undefined : (await read($, results))[dr.resultId]
    let recordsCard = null
    if (dr.name !== null) {
      const body = () => {
        if (dr.status === 'loading') return <Text dimColor>Reading the first {TOP} records…</Text>
        if (dr.status === 'error' || recResult === undefined) return <Text dimColor>{dr.message === '' ? 'No records.' : dr.message}</Text>
        const pages = Math.max(1, Math.ceil(recResult.rows.length / REC_PAGE))
        const page = Math.min(Math.max(0, dr.page), pages - 1)
        const start = page * REC_PAGE
        const shown = recResult.rows.slice(start, start + REC_PAGE)
        const room = Math.max(30, (e.props.bodyColumns ?? 80) - 12)
        const picked: { name: string; width: number }[] = []
        let used = 0
        const recDecl = findTable(sch.tables, recResult.collection)
        const visibleCols = orderColumns(dataColumns(recResult.columns, recDecl), order, recDecl?.columns.map(c => c.name), n => recDecl?.columns.find(c => same(c.name, n))?.type ?? recResult.types[n] ?? '')
        for (const name of visibleCols) {
          let width = Math.max(name.length, ...shown.map(r => cell(r[name]).length))
          width = Math.min(width, 22) + 2
          if (picked.length > 0 && used + width > room) break
          picked.push({ name, width })
          used += width
        }
        const clip = (text: string, w: number) => (text.length > w - 2 ? `${text.slice(0, Math.max(0, w - 3))}…` : text)
        const go = (to: number) => update($, dbRecords, cur => ({ ...cur, page: Math.min(Math.max(0, to), pages - 1) }))
        const openRow = (index: number) => {
          void update($, view, cur => ({ ...cur, current: recResult.id, selected: index, offset: 0, column: null, showTable: false, tableName: null, trail: [] }))
          void ensureSchema($ as Host)
          void $.ui.scroll({ to: { key: 'card-record' }, in: PANE, block: 'start' }).catch(() => undefined)
        }
        return (
          <Box flexDirection="column" gap={1}>
            <Box justifyContent="space-between" alignItems="center">
              <Text dimColor>
                Records {start + 1}–{start + shown.length} of {recResult.rows.length}
                {recResult.isTruncated ? ` (table has ${recResult.total})` : ''}
              </Text>
              <Box gap={1}>
                {iconButton('rec-first', '⏮', 'First page', () => go(0))}
                <Button key="rec-prev" onPress={() => go(page - 1)}>
                  ◀ Prev
                </Button>
                <Button key="rec-next" onPress={() => go(page + 1)}>
                  Next ▶
                </Button>
                {iconButton('rec-last', '⏭', 'Last page', () => go(pages - 1))}
              </Box>
            </Box>
            {orderSwitch('records', recDecl !== undefined)}
            <Box flexDirection="column">
              <Box flexDirection="row">
                {gridCell(5, <Text bold dimColor>#</Text>, true)}
                {picked.map(c => gridCell(c.width, <Text bold dimColor>{clean(c.name)}</Text>, isNumeric(recResult, c.name)))}
              </Box>
              {shown.map((r, i) => (
                <Box key={`rec:${start + i}`} flexDirection="row">
                  {gridCell(
                    5,
                    <Button key={`recrow:${start + i}`} plain onPress={() => openRow(start + i)}>
                      {String(start + i + 1)}
                    </Button>,
                    true,
                  )}
                  {picked.map(c => gridCell(c.width, <Text>{clip(cell(r[c.name]), c.width)}</Text>, isNumeric(recResult, c.name)))}
                </Box>
              ))}
            </Box>
            {visibleCols.length > picked.length && <Text dimColor>+{visibleCols.length - picked.length} more columns: open a row to see them all.</Text>}
          </Box>
        )
      }
      // Records a result card opened link through the reference they were read with.
      const recordsRef = dr.ref ?? od.ref ?? ''
      const recordsBlock = dr.ref !== undefined ? (isHere ? null : MESSAGES['same-host']) : dbLinkBlock()
      const recordsLink =
        dr.status === 'ready' && recResult !== undefined
          ? linkRow(
              'records',
              recordsBlock,
              recordsBlock === null
                ? { kind: 'records', db: recordsRef, table: dr.name, schema: dr.ref !== undefined ? undefined : linkSchema(dr.name), isView: od.items.find(i => i.name === dr.name)?.kind === 'view', limit: TOP }
                : null,
            )
          : null
      recordsCard = (
        <Box key="card-dbrecords" {...card}>
          <Box justifyContent="space-between" alignItems="center">
            <Box flexDirection="row" gap={1} alignItems="center">
              <Text bold>{clean(dr.name)}</Text>
              <Text dimColor>
                {od.items.find(i => i.name === dr.name)?.kind === 'view' ? 'view' : 'table'}{' '}
                <Text italic>(top {TOP})</Text>
              </Text>
            </Box>
            <Box flexDirection="row" gap={1} alignItems="center">
              <Button
                key="dbrecords-meta"
                onPress={() => {
                  void update($, dbRecords, () => NO_RECORDS)
                  if (dt.name !== dr.name) void openDbTable($ as Host, dr.name as string, od.url)
                }}
              >
                Show table metadata
              </Button>
              {iconButton('dbrecords-close', '✕', 'Close', () => update($, dbRecords, () => NO_RECORDS))}
            </Box>
          </Box>
          {recordsLink}
          {body()}
        </Box>
      )
    }

    // Ask Claude about the checked bag items: what the user selected goes into the prompt as a list.
    const checked = bag.entries.filter(x => x.isOn)
    const askAboutBag = () =>
      void $.prompt.fill({ text: bagPrompt(checked, chosen, openRef(), dbs.projectId === chosen ? dbs.items : []), mode: 'append' })

    // Card 2: context bag
    const bagCard = (
      <Box key="card-bag" {...card}>
        <Box justifyContent="space-between">
          <Text bold>🛒 Context bag</Text>
          <Box gap={1}>
            <Button key="bag-enabled" onPress={() => setBag(b => ({ ...b, isEnabled: !b.isEnabled }))}>
              {bag.isEnabled ? '☑ On' : '☐ Off'}
            </Button>
            {checked.length > 0 && (
              <Button key="bag-ask" onPress={askAboutBag}>
                Ask Claude…
              </Button>
            )}
            {bag.entries.length > 0 && (
              <Button key="bag-clear" plain onPress={() => setBag(b => ({ ...b, entries: [] }))}>
                Clear
              </Button>
            )}
          </Box>
        </Box>
        {bag.entries.length === 0 ? (
          <Text dimColor>Empty. Use 🛒 to add items.</Text>
        ) : (
          <Box flexDirection="column" gap={1}>
            {bag.entries.map(entry => (
              <Box key={`bag:${entry.id}`} flexDirection="row" gap={1}>
                <Button
                  key={`bag-on:${entry.id}`}
                  onPress={() => setBag(b => ({ ...b, entries: b.entries.map(x => (x.id === entry.id ? { ...x, isOn: !x.isOn } : x)) }))}
                >
                  {entry.isOn ? '☑' : '☐'}
                </Button>
                <Box flexGrow={1} flexShrink={1} minWidth={0}>
                  <Button key={`bag-open:${entry.id}`} plain dimColor={!bag.isEnabled || !entry.isOn} onPress={() => void openBagEntry(entry)}>
                    {`${clean(entry.address).replace(/^contextBag\./, '')}.`}
                    <Text bold>{entry.value}</Text>
                  </Button>
                </Box>
                {iconButton(`bag-rm:${entry.id}`, '✕', 'Remove', () => setBag(b => ({ ...b, entries: b.entries.filter(x => x.id !== entry.id) })))}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    )

    // A column name was pressed: show its card and make sure the project's schema is loaded.
    // The detail card opens below a long record: scroll it into view once it is drawn.
    const reveal = () => {
      const go = () => void $.ui.scroll({ to: { key: 'card-detail' }, in: PANE, block: 'start' }).catch(() => undefined)
      go()
      try {
        $.clock.after(150, go)
      } catch {
        // no timer here: the first attempt stands
      }
    }
    // A bagged item opens its card: a table, a column, or (for a value) the record it came from.
    const openBagEntry = async (entry: BagEntry) => {
      const dot = entry.address.replace(/^contextBag\./, '').lastIndexOf('.')
      const kind = entry.kind ?? (entry.address === 'contextBag.table' ? 'table' : entry.address === 'contextBag.column' ? 'column' : 'value')
      const tbl = entry.table ?? (kind === 'table' ? entry.value : kind === 'column' ? entry.value.slice(0, entry.value.lastIndexOf('.')) : entry.address.replace(/^contextBag\./, '').slice(0, dot))
      const col = entry.column ?? (kind === 'column' ? entry.value.slice(entry.value.lastIndexOf('.') + 1) : kind === 'value' ? entry.address.replace(/^contextBag\./, '').slice(dot + 1) : undefined)
      void ensureSchema($ as Host)
      if (kind === 'table') return goto({ table: tbl, showTable: true })
      if (kind === 'value' && (entry.db ?? '') !== '' && col !== undefined && (await openRecordByKey($ as Host, entry.db as string, tbl, col, entry.value))) return
      if (col !== undefined) goto({ table: tbl, column: col })
    }

    // Where the detail card points: a table (null = the result's own), a column and/or the table itself.
    const goto = (target: { table?: string | null; column?: string | null; showTable?: boolean }) => {
      void update($, dbTable, () => ({ name: null, status: 'idle', message: '', result: null }))
      void update($, view, cur => ({ ...cur, tableName: target.table ?? null, tableRef: null, column: target.column ?? null, showTable: target.showTable === true }))
      reveal()
    }
    const showColumn = (name: string | null) => {
      if (name === null) void update($, view, cur => ({ ...cur, column: null, showTable: false, tableName: null }))
      else goto({ column: name })
    }
    const openColumn = (name: string) => {
      showColumn(name)
      if (sch.projectId !== chosen || sch.status === 'idle' || sch.status === 'error') void loadSchema($ as Host, chosen)
    }
    // Optional card: the chosen record
    let recordCard = null
    if (result !== undefined && v.selected !== null) {
      const index = Math.min(v.selected, result.rows.length - 1)
      const row = result.rows[index]
      const recTable = findTable(sch.tables, result.collection)
      const declNames = recTable?.columns.map(c => c.name)
      const typeOfRec = (n: string) => recTable?.columns.find(c => same(c.name, n))?.type ?? result.types[n] ?? ''
      const fields = orderColumns(dataColumns(result.columns, recTable), order, declNames, typeOfRec)
      const types = fields.map(name => clean(result.types[name] ?? ''))
      const typeWidth = Math.min(28, Math.max(...types.map(t => t.length)) + 2)
      const nameWidth = Math.min(32, Math.max(...fields.map(n => n.length)) + 2)
      const step = (by: number) =>
        update($, view, cur => ({ ...cur, selected: Math.min(Math.max(0, (cur.selected ?? 0) + by), result.rows.length - 1) }))
      const addToBag = (name: string) => {
        const entry: BagEntry = {
          id: `${result.id}:${index}:${name}`,
          address: `contextBag.${result.collection}.${clean(name)}`,
          value: cell(row[name]).slice(0, MAX_CELL),
          source: `${result.collection} row ${index + 1}`,
          isOn: true,
          kind: 'value',
          table: result.collection,
          column: name,
          db: result.db ?? '',
        }
        return setBag(b => (b.entries.some(x => x.address === entry.address && x.value === entry.value) ? b : { ...b, entries: [...b.entries, entry].slice(-200) }))
      }
      // The record itself goes in by its key: `$key` when the result has one, else the first column.
      const pkNames = recTable?.columns.filter(c => c.pk !== null).map(c => c.name) ?? []
      const pkField = pkNames.length === 1 ? result.columns.find(c => same(c, pkNames[0])) : undefined
      const keyField = pkField ?? (result.columns.includes(KEY) ? KEY : result.columns[0])
      const keyAddress = `contextBag.${result.collection}.${clean(keyField)}`
      const keyValue = cell(row[keyField]).slice(0, MAX_CELL)
      const isInBag = bag.entries.some(x => x.address === keyAddress && x.value === keyValue)
      // A foreign-key value opens the record it points to; ← goes back along the trail.
      const fkOf = (name: string) => recTable?.foreignKeys.find(fk => fk.columns.length === 1 && same(fk.columns[0], name))
      const trail = v.trail ?? []
      const goBack = () => {
        const prev = trail[trail.length - 1]
        if (prev !== undefined) void update($, view, cur => ({ ...cur, current: prev.current, selected: prev.selected, trail: (cur.trail ?? []).slice(0, -1), column: null, showTable: false, tableName: null }))
      }
      const openReferenced = async (fk: SchemaFk, name: string) => {
        const refCol = fk.refColumns[0]
        const value = cell(row[name])
        const got = await fetchReferenced($ as Host, result.db ?? '', fk.refTable, refCol, value)
        if (got === null) {
          void $.ui.toast(`No ${clean(fk.refTable)} record with ${clean(refCol)} = ${value.slice(0, 40)}`)
          return
        }
        const id = `ref:${fk.refTable}:${refCol}:${value}`
        const parsed = parseRows(`[${JSON.stringify(got.obj)}]`, id, `datatug query run --from ${fk.refTable}`)
        if (parsed === null) return
        // A record reached from a project database keeps that database's reference for its link.
        const refResult: GridResult = {
          ...parsed,
          collection: clean(fk.refTable).slice(0, 80),
          total: 1,
          db: result.db ?? '',
          ...(result.linkRef !== undefined ? { linkRef: result.linkRef } : {}),
          ...(result.openRun !== undefined ? { openRun: result.openRun } : {}),
          bigInts: [bigIntegers(got.line)],
        }
        await update($, results, all => ({ ...Object.fromEntries(Object.entries(all).slice(-9)), [id]: refResult }))
        await update($, view, cur => ({ ...cur, trail: [...(cur.trail ?? []), { current: result.id, selected: index }].slice(-10), current: id, selected: 0, column: null, showTable: false, tableName: null }))
        void $.ui.scroll({ to: { key: 'card-record' }, in: PANE, block: 'start' }).catch(() => undefined)
      }
      // A record of a project database links to its record view by its declared primary key; a row of a
      // chat grid has no project, database or table identity, so it gets no line at all.
      let recordLink = null
      // A record of the opened database read before `db add` returned takes the reference it returned.
      const recRef = result.linkRef ?? (result.openRun !== undefined && result.openRun === openRun ? (od.ref ?? '') : undefined)
      if (recRef === '') recordLink = linkRow('record', MESSAGES['not-in-project'], null)
      else if (recRef !== undefined) {
        const pkCols = (recTable?.columns ?? []).filter(c => c.pk !== null).sort((a, b) => (a.pk as number) - (b.pk as number)).map(c => c.name)
        const key = recordKey(pkCols, row, result.bigInts?.[index])
        const srcEnv = envOf(recRef)
        const pre = srcEnv !== undefined ? sourceUnavailableText(srcEnv) : 'why' in key ? `No record link: ${key.why}` : isHere ? null : MESSAGES['same-host']
        const schemaOf = recTable === undefined || recTable.driver.startsWith('sqlite') ? undefined : recTable.schema || undefined
        recordLink = linkRow('record', pre, pre === null && 'key' in key ? { kind: 'record', db: recRef, table: result.collection, schema: schemaOf, key: key.key } : null)
      }
      recordCard = (
        <Box key="card-record" {...card}>
          <Box justifyContent="space-between" alignItems="center">
            <Box gap={1} alignItems="center">
              {trail.length > 0 && iconButton('record-back', '←', 'Back', goBack)}
              <Text bold>Record</Text>
              <Button key="record-add" onPress={() => addToBag(keyField)}>
                {isInBag ? 'In 🛒' : 'Add to 🛒'}
              </Button>
            </Box>
            {iconButton('record-close', '✕', 'Close', () => update($, view, cur => ({ ...cur, selected: null, trail: [] })))}
          </Box>
          <Box justifyContent="space-between" alignItems="center">
            <Text dimColor>
              Row {index + 1} of {result.total}
            </Text>
            <Box gap={1}>
              {iconButton('first-row', '⏮', 'First row', () => update($, view, cur => ({ ...cur, selected: 0 })))}
              <Button key="prev-row" onPress={() => step(-1)}>
                ◀ Prev
              </Button>
              <Button key="next-row" onPress={() => step(1)}>
                Next ▶
              </Button>
              {iconButton('last-row', '⏭', 'Last row', () => update($, view, cur => ({ ...cur, selected: result.rows.length - 1 })))}
            </Box>
          </Box>
          {recordLink}
          {orderSwitch('record', recTable !== undefined)}
          <Box flexDirection="column" gap={1}>
            {fields.map((name, i) => (
              <Box key={`f:${name}`} flexDirection="row">
                <Box width={typeWidth} flexShrink={0}>
                  <Text dimColor>{types[i]}</Text>
                </Box>
                <Box width={nameWidth} flexShrink={0} justifyContent="flex-end" paddingLeft={2}>
                  {name === KEY ? (
                    <Text dimColor>{name}</Text>
                  ) : (
                    <Button key={`col:${name}`} plain onPress={() => openColumn(name)}>
                      {clean(name)}
                    </Button>
                  )}
                </Box>
                <Box flexGrow={1} paddingLeft={2}>
                  {(() => {
                    const fk = fkOf(name)
                    const shownValue = cell(row[name]).slice(0, MAX_CELL * 4)
                    return fk !== undefined && (result.db ?? '') !== '' && row[name] !== null && row[name] !== undefined ? (
                      <Button key={`fkv:${name}`} plain onPress={() => void openReferenced(fk, name)}>
                        {shownValue}
                      </Button>
                    ) : (
                      <Text>{shownValue}</Text>
                    )
                  })()}
                </Box>
                {iconButton(`add:${name}`, '🛒', 'Add to context bag', () => addToBag(name))}
              </Box>
            ))}
          </Box>
        </Box>
      )
    }

    // Optional detail card: a column or a table. It is the result's own table, or one a foreign key leads to.
    let detailCard = null
    const base = result === undefined ? undefined : findTable(sch.tables, result.collection)
    const tName = v.tableName ?? result?.collection ?? ''
    // A table a result card opened is found by its full identity, never by its name alone.
    const byRef = v.tableRef != null && v.tableName != null && same(v.tableRef.name, v.tableName) ? v.tableRef : null
    const table = v.tableName == null ? base : byRef !== null ? findRef(sch.tables, byRef) : findTable(sch.tables, v.tableName, base)
    const own = result !== undefined && same(tName, result.collection) ? result : undefined
    const schemaNote =
      sch.projectId !== chosen || sch.status === 'idle'
        ? 'schema not loaded'
        : sch.status === 'loading'
          ? 'loading the project schema…'
          : sch.status === 'error'
            ? `schema unavailable: ${sch.message}`
            : `'${tName}' is not in the scanned schema of this project`
    const colNames = metaColumns(own?.columns ?? table?.columns.map(c => c.name) ?? [])
    const isFkMember = (t: SchemaTable | undefined, name: string) => t?.foreignKeys.some(fk => fk.columns.some(c => same(c, name))) === true

    // The table's columns as a grid: #, name (press to open it), type, nullable, key.
    const columnGrid = (t: SchemaTable) => {
      const orderedCols = orderColumns(t.columns.map(c => c.name), order, t.columns.map(c => c.name), n => t.columns.find(c => c.name === n)?.type ?? '').map(n => t.columns.find(c => c.name === n) as SchemaColumn)
      const rowsOf = orderedCols.map((c, i) => {
        const mine = own?.columns.find(n => same(n, c.name))
        const seen = own === undefined || mine === undefined ? undefined : profileColumn(own, mine)
        const nullable = c.nullable === true ? 'NULLABLE' : c.nullable === false || c.pk !== null ? 'NOT NULL' : seen !== undefined && seen.nulls > 0 ? 'NULLABLE' : '—'
        return {
          n: String(i + 1),
          name: c.name,
          type: clean(c.type),
          nullable,
          key: keyMark(t, c.pk),
          fks: fkTargets(t, c.name),
        }
      })
      const w = {
        n: Math.max(3, String(rowsOf.length).length + 2),
        name: Math.min(30, Math.max(6, ...rowsOf.map(r => r.name.length)) + 2),
        type: Math.min(26, Math.max(6, ...rowsOf.map(r => r.type.length)) + 2),
        nullable: 11,
        key: Math.min(44, Math.max(9, ...rowsOf.map(r => r.key.length + r.fks.reduce((n, f) => n + f.table.length + 5, 0))) + 2),
      }
      const cellBox = (width: number, right: boolean, child: unknown) => (
        <Box width={width} flexShrink={0} justifyContent={right ? 'flex-end' : 'flex-start'} paddingRight={right ? 1 : 0}>
          {child}
        </Box>
      )
      return (
        <Box flexDirection="column">
          <Box flexDirection="row">
            {cellBox(w.n, true, <Text bold dimColor>#</Text>)}
            {cellBox(w.name, false, <Text bold dimColor>Name</Text>)}
            {cellBox(4, false, <Text> </Text>)}
            {cellBox(w.type, false, <Text bold dimColor>Type</Text>)}
            {cellBox(w.nullable, false, <Text bold dimColor>Nullable</Text>)}
            {cellBox(w.key, false, <Text bold dimColor>Key</Text>)}
          </Box>
          {rowsOf.map(r => (
            <Box key={`tr:${r.name}`} flexDirection="row">
              {cellBox(w.n, true, <Text dimColor>{r.n}</Text>)}
              {cellBox(w.name, false, (
                <Button key={`tcol:${r.name}`} plain onPress={() => goto({ table: v.tableName ?? null, column: r.name })}>
                  {clean(r.name)}
                </Button>
              ))}
              {cellBox(4, false, iconButton(`tbag:${r.name}`, '🛒', 'Add column to context bag', () => addMeta('contextBag.column', `${t.name}.${r.name}`, `${t.source} column`)))}
              {cellBox(w.type, false, <Text>{r.type}</Text>)}
              {cellBox(w.nullable, false, <Text dimColor={r.nullable === '—'}>{r.nullable}</Text>)}
              {cellBox(
                w.key,
                false,
                <Box flexDirection="row" gap={1}>
                  {r.key !== '' && <Text>{r.key}</Text>}
                  {r.fks.map(f => (
                    <Box key={`tfk:${r.name}:${f.table}`} flexDirection="row" gap={1}>
                      <Text dimColor>FK</Text>
                      <Button key={`tfkb:${r.name}:${f.table}`} plain onPress={() => goto({ table: f.table, showTable: true })}>
                        {clean(f.table)}
                      </Button>
                    </Box>
                  ))}
                </Box>,
              )}
            </Box>
          ))}
        </Box>
      )
    }

    if ((result !== undefined || v.tableName != null) && v.showTable !== true && v.column !== null && v.column !== undefined && colNames.includes(v.column)) {
      const col = v.column
      const decl = table?.columns.find(c => same(c.name, col))
      const prof = own === undefined ? undefined : profileColumn(own, col)
      const cap = own?.isTruncated ? ` (first ${own.rows.length} of ${own.total} rows)` : ''
      const isText = own?.types[col]?.startsWith('string')
      // Foreign keys out of this column, and the columns elsewhere that point at it.
      const outgoing = (table?.foreignKeys ?? []).flatMap(fk => fk.columns.flatMap((c, i) => (same(c, col) ? [{ fk, ref: fk.refColumns[i] }] : [])))
      const incoming = table === undefined ? [] : referrers(sch.tables, table).flatMap(r => r.fk.refColumns.flatMap((c, i) => (same(c, col) ? [{ table: r.table, fk: r.fk, column: r.fk.columns[i] }] : [])))
      detailCard = (
        <Box key="card-detail" {...card}>
          <Box justifyContent="space-between" alignItems="center">
            <Box flexDirection="row" gap={1} alignItems="center">
              <Text bold>Column</Text>
              <Button key="cbag-col" onPress={() => addMeta('contextBag.column', `${tName}.${col}`, `${table?.source ?? 'result'} column`)}>
                {bagHas('contextBag.column', `${tName}.${col}`) ? 'In 🛒' : 'Add to 🛒'}
              </Button>
            </Box>
            {iconButton('column-close', '✕', 'Close', () => showColumn(null))}
          </Box>
          <Box flexDirection="column" gap={1}>
            {kv('name', 'Name', <Text bold>{clean(col)}</Text>)}
            {kv('table', 'Table', (
              <Button key="column-table" plain onPress={() => goto({ table: v.tableName ?? null, column: col, showTable: true })}>
                {clean(tName)}
              </Button>
            ))}
            {kv('pos', 'Position', `${colNames.indexOf(col) + 1} of ${colNames.length}`)}
            {kv('dtype', 'Declared type', decl !== undefined ? decl.type : table !== undefined ? 'not found in the scanned table' : schemaNote)}
            {own !== undefined && kv('otype', 'Observed type', clean(own.types[col] ?? ''))}
            {kv('pk', 'Primary key', decl !== undefined ? (decl.pk !== null ? ((table?.columns.filter(c => c.pk !== null).length ?? 0) > 1 ? `yes, position ${decl.pk}` : 'yes') : 'no') : 'unknown')}
            {outgoing.length > 0 && kv('fk', 'References', (
              <Box flexDirection="column">
                {outgoing.map(o => (
                  <Button key={`fk:${o.fk.refTable}.${o.ref}`} plain onPress={() => goto({ table: o.fk.refTable, column: o.ref })}>
                    {`${clean(o.fk.refTable)}.${clean(o.ref ?? '')}`}
                  </Button>
                ))}
              </Box>
            ))}
            {incoming.length > 0 && kv('refby', 'Referenced by', (
              <Box flexDirection="column">
                {incoming.map(o => (
                  <Button key={`rb:${o.table.name}.${o.column}`} plain onPress={() => goto({ table: o.table.name, column: o.column })}>
                    {`${clean(o.table.name)}.${clean(o.column ?? '')}`}
                  </Button>
                ))}
              </Box>
            ))}
            {prof !== undefined && kv('null', 'Nullable', `${prof.nulls > 0 ? 'yes' : 'no'} in the loaded rows (${prof.nulls} of ${prof.nonNull + prof.nulls} empty). The declared setting is not reported by the CLI.`)}
            {prof !== undefined && kv('distinct', 'Distinct values', `${prof.distinct}${prof.distinct >= 5000 ? '+' : ''}${cap}`)}
            {prof?.min !== undefined && kv('range', 'Min · max', `${clean(String(prof.min)).slice(0, 40)} · ${clean(String(prof.max)).slice(0, 40)}`)}
            {prof !== undefined && isText && kv('len', 'Length', `${prof.minLen} to ${prof.maxLen} characters`)}
            {prof !== undefined && prof.samples.length > 0 && kv('samples', 'Samples', prof.samples.join(', '))}
            {own === undefined && kv('rows', 'Values', 'not loaded: run a query on this table to see nulls, ranges and samples')}
            {table !== undefined && kv('from', 'Schema from', `${table.env} · ${table.source} (${table.driver}) · ${table.schema}`)}
          </Box>
        </Box>
      )
    }
    if ((result !== undefined || v.tableName != null) && v.showTable === true) {
      const refs = table === undefined ? [] : referrers(sch.tables, table)
      const anyFk = sch.tables.some(x => x.foreignKeys.length > 0)
      detailCard = (
        <Box key="card-detail" {...card}>
          <Box justifyContent="space-between" alignItems="center">
            <Box flexDirection="row" gap={1} alignItems="center">
              <Text bold>{clean(table?.name ?? tName)}</Text>
              <Text dimColor>table</Text>
              {table !== undefined && (
                <Button key="tbag-table" onPress={() => addMeta('contextBag.table', table.name, `${table.source} table`)}>
                  {bagHas('contextBag.table', table.name) ? 'In 🛒' : 'Add to 🛒'}
                </Button>
              )}
            </Box>
            {iconButton('table-close', '✕', 'Close', () => update($, view, cur => ({ ...cur, showTable: false })))}
          </Box>
          {table === undefined ? (
            <Text dimColor>
              {clean(tName)}: {schemaNote}. Tables come from `datatug scan`; the result's own columns are listed in the Record card.
            </Text>
          ) : (
            <Box flexDirection="column" gap={1}>
              <Box flexDirection="column" gap={1}>
                {kv('src', 'Source', `${table.source} (${table.driver})`)}
                {kv('env', 'Environment', table.env)}
                {kv('schema', 'Schema', table.schema)}
                {kv('cols', 'Columns', String(table.columns.length))}
              </Box>
              {orderSwitch('table', true)}
              {columnGrid(table)}
              <Text dimColor>
                Nullable comes from the scan when it records it (CLI 0.80 and later). Otherwise: NOT NULL = primary key; NULLABLE = a null was seen in the loaded rows; — = unknown.
              </Text>
              <Box flexDirection="column">
                <Text>
                  <Text bold>Referenced by</Text> <Text dimColor>{tablesCount(refs)}</Text>
                </Text>
                {refs.length === 0 && (
                  <Text dimColor>{anyFk ? 'No table has a foreign key to this table.' : 'Foreign keys are not reported by this datatug version.'}</Text>
                )}
                {refs.map(r => (
                  <Box key={`ref:${r.table.name}:${r.fk.name}:${r.fk.columns.join(',')}`} flexDirection="row" gap={1}>
                    <Button key={`reft:${r.table.name}:${r.fk.name}:${r.fk.columns.join(',')}`} plain onPress={() => goto({ table: r.table.name, showTable: true })}>
                      {clean(r.table.name)}
                    </Button>
                    {tableBag(`refbag:${r.table.name}:${r.fk.name}:${r.fk.columns.join(',')}`, r.table.name, `${table.source} table`)}
                    <Text dimColor>·</Text>
                    {r.fk.columns.map(c => (
                      <Button key={`refc:${r.table.name}:${r.fk.name}:${c}`} plain onPress={() => goto({ table: r.table.name, column: c })}>
                        {clean(c)}
                      </Button>
                    ))}
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      )
    }

    // The newest result card, the one the transcript row also draws, from the same code and the same
    // member, so a press here and a press there are one state. Its views take the keys 1-5.
    const latest = latestKeys.at(-1)
    const latestState = latest === undefined || latest === closedKey ? NO_CARD : await read($, memberOf(cards, { requestId: latest }))
    // "✕" closes the section (the transcript row keeps its card and can show it again by Load); the
    // key x does the same while the panel holds the keys, and Esc, as everywhere, hands them back.
    const closeLatest = () => update($, latestClosed, () => latest ?? '')
    const latestCard =
      latest === undefined || latestState.status === 'none' ? null : (
        <Box key="card-latest" flexDirection="column" borderStyle="round" paddingX={1}>
          <Box flexDirection="row" justifyContent="space-between" alignItems="center">
            <Text bold dimColor>
              Latest result
            </Text>
            <Button key="latest-close" plain hotkey="x" onPress={() => void closeLatest()}>
              ✕ Close
            </Button>
          </Box>
          {await drawCard($ as Host, { requestId: latest, surface: e.surface, component: e.component, props: {} }, null, latestState, true)}
        </Box>
      )

    // Sections, top to bottom: project, context bag, the latest result, then what the person opens
    // (databases, table, records, record, detail). A rule separates neighbours.
    const width = Math.max(10, Math.min(200, (e.props as { bodyColumns?: number }).bodyColumns ?? 60))
    const sections = [projectCard, bagCard, latestCard, openCard, od.status === 'ready' ? databaseCard : null, dbTableCard, recordsCard, recordCard, detailCard].filter(x => x !== null && x !== undefined && x !== false)
    return (
      <Box flexDirection="column">
        {sections.map((section, i) => (
          <Box key={`section:${i}`} flexDirection="column">
            {i > 0 && (
              <Box key={`rule:${i}`} marginY={1}>
                <Text dimColor wrap="truncate-end">
                  {'─'.repeat(width)}
                </Text>
              </Box>
            )}
            {section}
          </Box>
        ))}
      </Box>
    )
  })
}
