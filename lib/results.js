// The result files `datatug query run --result-id` writes, as the chat card reads them. Pure: the
// hooks module runs the CLI and reads the files.
import { stripUnsafe } from './text.js'

// The first datatug release that writes both result files with columns, sources and related tables.
export const CARD_MIN_CLI_VERSION = '0.92.0'
// The first release with `datatug ui --result` and `daemon url --result`: the command and the link.
export const OPEN_MIN_CLI_VERSION = '0.94.0'

// The first release with `daemon url --result-view <view>`; older ones take `--view=<view>`.
export const RESULT_VIEW_MIN_CLI_VERSION = '0.98.0'

export const VIEWS = ['table', 'record', 'columns', 'sources', 'related']
export const VIEW_LABELS = { table: 'Table', record: 'Record', columns: 'Columns', sources: 'Sources', related: 'Related' }

// Bounds the mod holds itself to, whatever the files say.
export const MAX_META_BYTES = 1 << 20
export const MAX_DATA_BYTES = 4_000_000
export const MAX_ROWS = 2000
export const MAX_COLUMNS = 400
export const MAX_PARTICIPANTS = 32
export const MAX_RELATED = 200
const NAME = 80

const ID = /^[A-Za-z0-9_-]{1,128}$/

// The result id of a tool call: its tool_use_id with every other character made `_`.
export function resultId(toolUseId) {
  const id = String(toolUseId ?? '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128)
  return ID.test(id) ? id : null
}

export const isResultId = id => typeof id === 'string' && ID.test(id)

// What the model or the card reads when a step fails.
export const TEXT = {
  oldCli: 'DataTug is older than the mod expects; run the query again',
  rerun: 'Run the query again',
  ran: 'The DataTug query ran; its result is shown to the user in a card, not to Claude.',
  background: 'The DataTug query went to the background; the user can load its result in the card when it is done. Its rows are withheld from you.',
}

// The line the card shows for a state that has no result to draw.
export const STATE_TEXT = {
  load: 'Press Load to show these results again',
  loading: 'Reading the result files…',
  expired: 'These results expired (DataTug keeps them 7 days). Run the query again',
  'not-found': 'No saved result for this call (removed, or run without result files)',
  incomplete: 'The result files are not complete yet. Press Load to try again',
  unreadable: 'The result files are not readable, so nothing was read',
  'too-large': 'This result is too large to show here, so nothing was read',
  inconsistent: 'The result files do not agree with each other, so nothing was read. Run the query again',
  version: 'Update the DataTug mod: these result files are of a newer version',
  'no-locator': 'DataTug did not report its result files',
}

// Why the session went back to the plain grid, as the card's dim line says it.
export const LEGACY_TEXT = {
  'old-cli': 'Update the DataTug CLI for the Record, Columns, Sources and Related views',
  sandbox: "Allow DataTug's result store (~/.datatug/query-results) in the sandbox's writable paths to see every view",
  'inside-git': 'Every view needs the result store, and your home directory is a Git repository',
  symlink: 'Every view needs the result store, and ~/.datatug/query-results is a symbolic link',
  owner: 'Every view needs the result store, and ~/.datatug/query-results belongs to another user',
  'results-store-unwritable': 'Every view needs the result store, and ~/.datatug/query-results cannot be written',
}

export const UNAVAILABLE_TEXT = {
  'native-sql': 'Sources are not known for a native SQL query',
  'no-relationship-metadata': 'No related tables found',
  'schema-unreadable': 'The schema of this database could not be read',
  'too-many': 'Only the first entries are listed',
  'too-large': 'The query was too large to keep',
}

function parseLine(text, prefix) {
  for (const line of String(text ?? '').split('\n')) {
    const t = line.trim()
    if (!t.startsWith(prefix)) continue
    try {
      return JSON.parse(t)
    } catch {
      return null
    }
  }
  return null
}

// How a failed `query run --result-id` turns the session back to the plain grid: an older CLI
// prints `unknown flag: --result-id`; a sandboxed shell gets the store failure line. Null otherwise.
export function fallbackOf(errorText) {
  const text = String(errorText ?? '')
  if (/^\s*unknown flag: --result-id\.?\s*$/m.test(text)) return 'old-cli'
  const doc = parseLine(text, '{"resultFiles"')
  if (doc !== null && doc.resultFiles === null && doc.reason === 'results-store-unwritable') return 'sandbox'
  return null
}

// `query results check --format json`: null when usable, else the reason code.
export function storeProblem(stdout) {
  const doc = parseLine(stdout, '{')
  if (doc === null || typeof doc !== 'object') return 'results-store-unwritable'
  if (doc.usable === true) return null
  return typeof doc.reason === 'string' && LEGACY_TEXT[doc.reason] !== undefined ? doc.reason : 'results-store-unwritable'
}

const hasDots = p => p.split('/').some(s => s === '.' || s === '..')

// Checks the answer of `query results locate --id <id> --format json`:
// { files: { root, data, meta } } or { state } (a key of STATE_TEXT).
export function readLocator(stdout, id) {
  const doc = parseLine(stdout, '{"resultFiles"')
  if (doc === null || typeof doc !== 'object') return { state: 'no-locator' }
  if (doc.resultFiles === null) return { state: doc.reason === 'expired' ? 'expired' : doc.reason === 'incomplete' ? 'incomplete' : 'not-found' }
  const f = doc.resultFiles
  if (f === null || typeof f !== 'object' || f.version !== 1 || f.id !== id || !isResultId(id)) return { state: 'unreadable' }
  const { root, data, meta } = f
  if (typeof root !== 'string' || !root.startsWith('/') || root.length < 2 || root.endsWith('/') || hasDots(root) || /[\0\n\r]/.test(root)) return { state: 'unreadable' }
  if (data !== `${root}/${id}/data.json` || meta !== `${root}/${id}/meta.json`) return { state: 'unreadable' }
  return { files: { root, data, meta } }
}

// Whether a stat answer is a regular file that resolves to exactly `want` under the resolved root.
export function statLandsAt(stat, realRoot, want) {
  return stat !== null && typeof stat === 'object' && stat.kind === 'file' && typeof stat.realPath === 'string' && typeof realRoot === 'string' && stat.realPath === want && stat.realPath.startsWith(`${realRoot}/`)
}

const name = v => stripUnsafe(String(v ?? '')).replace(/\s+/g, ' ').trim().slice(0, NAME)
const optName = v => (v === null || v === undefined ? null : name(v))
const ref = v => (typeof v === 'string' && isRef(v) ? v : null)

// A datatug://<project>/<db>[?env=<env>] reference: plain characters, no credential.
export function isRef(url) {
  const part = String.raw`(?:[A-Za-z0-9._~-]|%(?!40|3a)[0-9a-f]{2})`
  return new RegExp(`^datatug://${part}+/${part}+(\\?env=${part}+)?$`, 'i').test(url)
}

// meta.json as the card keeps it: names cleaned and cut, bounds applied, nothing else.
// { meta } or { state } ('version' for a version the mod does not know, 'unreadable').
export function readMeta(text, id) {
  let doc
  try {
    doc = JSON.parse(text)
  } catch {
    return { state: 'unreadable' }
  }
  if (doc === null || typeof doc !== 'object' || doc.format !== 'datatug.query-result.meta') return { state: 'unreadable' }
  if (doc.version !== 1) return { state: 'version' }
  if (doc.id !== id || !Number.isSafeInteger(doc.dataBytes) || doc.dataBytes < 0) return { state: 'unreadable' }
  const db = doc.db ?? {}
  const rows = doc.rows ?? {}
  const un = doc.unavailable ?? {}
  const reason = v => (typeof v === 'string' && /^[a-z-]{1,40}$/.test(v) ? v : undefined)
  const columns = (Array.isArray(doc.columns) ? doc.columns : []).slice(0, MAX_COLUMNS).map(c => ({
    name: name(c?.name),
    type: name(c?.type),
    declaredType: optName(c?.declaredType),
    nullable: typeof c?.nullable === 'boolean' ? c.nullable : null,
    pk: Number.isSafeInteger(c?.pk) && c.pk > 0 ? c.pk : null,
    source: c?.source && typeof c.source === 'object' ? { instance: name(c.source.instance), schema: name(c.source.schema), relation: name(c.source.relation), column: name(c.source.column) } : null,
    foreignKeys: (Array.isArray(c?.foreignKeys) ? c.foreignKeys : []).slice(0, 8).map(f => ({ refSchema: name(f?.refSchema), refRelation: name(f?.refRelation), refColumn: name(f?.refColumn) })),
    encoding: optName(c?.encoding),
  }))
  const participants = (Array.isArray(doc.participants) ? doc.participants : []).slice(0, MAX_PARTICIPANTS).map(p => ({
    instance: name(p?.instance),
    schema: name(p?.schema),
    relation: name(p?.relation),
    alias: name(p?.alias),
    db: ref(p?.db),
    kind: name(p?.kind),
    role: name(p?.role),
    on: (Array.isArray(p?.join?.on) ? p.join.on : []).slice(0, 8).map(o => ({ left: name(o?.left), right: name(o?.right) })),
  }))
  const related = (Array.isArray(doc.related) ? doc.related : []).slice(0, MAX_RELATED).map(r => ({
    fromInstance: name(r?.fromInstance),
    schema: name(r?.target?.schema),
    relation: name(r?.target?.relation),
    kind: name(r?.target?.kind),
    direction: r?.direction === 'incoming' ? 'incoming' : 'outgoing',
    cardinality: name(r?.cardinality),
    fields: (Array.isArray(r?.fields) ? r.fields : []).slice(0, 8).map(f => ({ source: name(f?.sourceField), target: name(f?.targetField) })),
  }))
  const dbRef = ref(db.ref)
  return {
    meta: {
      dataBytes: doc.dataBytes,
      db: { ref: dbRef, project: dbRef === null ? null : optName(db.project), env: dbRef === null ? null : optName(db.env), source: dbRef === null ? null : optName(db.source), driver: name(db.driver) },
      kind: name(doc.query?.kind),
      savedId: optName(doc.query?.savedQueryId) || null,
      rows: { kept: Number.isSafeInteger(rows.kept) ? rows.kept : 0, hasMore: rows.hasMore === true },
      columns,
      participants,
      related,
      unavailable: { participants: reason(un.participants), related: reason(un.related), declaredTypes: reason(un.declaredTypes), columns: reason(un.columns), query: reason(un.query) },
      counts: { columns: Array.isArray(doc.columns) ? doc.columns.length : 0, participants: participants.length, related: related.length },
    },
  }
}

// data.json: the column names and, per row, each cell as its text (null for a null), at most
// MAX_ROWS rows. An integer stays the digits the CLI wrote. Null when it is not a data file of `id`.
export function readData(text, id) {
  let doc
  try {
    doc = JSON.parse(text)
  } catch {
    return null
  }
  if (doc === null || typeof doc !== 'object' || doc.format !== 'datatug.query-result.data' || doc.version !== 1 || doc.id !== id) return null
  const rs = doc.recordset
  if (rs === null || typeof rs !== 'object' || !Array.isArray(rs.columns) || !Array.isArray(rs.rows)) return null
  const columns = rs.columns.map(c => String(c?.name ?? ''))
  const types = rs.columns.map(c => String(c?.type ?? ''))
  const rows = rs.rows.slice(0, MAX_ROWS).map(r =>
    columns.map((_, i) => {
      const v = Array.isArray(r) ? r[i]?.value : undefined
      return v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : String(v)
    }),
  )
  return { columns, types, rows }
}

const list = (names, max) => {
  const shown = names.slice(0, max).map(n => name(n)).filter(n => n !== '')
  return names.length > max ? `${shown.join(', ')} and ${names.length - max} more` : shown.join(', ')
}

// What the model reads in place of the result: the row count, the column, source and related
// table names, and never a value, a path, an id, a link or a command.
export function resultSummary(meta) {
  const kept = meta.rows.kept
  const cols = meta.columns.map(c => c.name).filter(n => n !== '$key')
  const more = meta.counts.columns - meta.columns.length
  const parts = [
    `DataTug query returned ${kept} row${kept === 1 ? '' : 's'}${meta.rows.hasMore ? ` (at least ${kept + 1} exist; the first ${kept} were kept)` : ''} x ${cols.length + Math.max(0, more)} column${cols.length === 1 ? '' : 's'}: ${list(cols, 40)}${more > 0 ? ` (and ${more} more)` : ''}.`,
  ]
  const sources = meta.participants.map(p => (p.schema === '' || p.schema === 'main' ? p.relation : `${p.schema}.${p.relation}`))
  if (sources.length > 0) parts.push(`It reads ${list(sources, 32)}.`)
  const related = [...new Set(meta.related.map(r => (r.schema === '' || r.schema === 'main' ? r.relation : `${r.schema}.${r.relation}`)))]
  if (related.length > 0) parts.push(`Tables that can be joined to it: ${list(related, 50)}.`)
  parts.push('The rows are shown to the user in a DataTug result card and are withheld from you.')
  return parts.join(' ')
}

// The arguments after `datatug` for the link of a result's view, or null. `isViewFlag`: the CLI
// has `--result-view` (RESULT_VIEW_MIN_CLI_VERSION); otherwise the view goes as `--view=<view>`.
export function resultUrlArgs(id, view, row, isViewFlag = false) {
  if (!isResultId(id) || !VIEWS.includes(view)) return null
  const args = ['daemon', 'url', '--result', id, ...(isViewFlag ? ['--result-view', view] : [`--view=${view}`])]
  if (view === 'record' && Number.isSafeInteger(row) && row >= 1 && row <= 10000) args.push('--row', String(row))
  args.push('--format', 'json')
  return args
}

// The command that opens the result in the terminal UI, or null for an id that would need quoting.
export function uiCommand(id) {
  return isResultId(id) ? `datatug ui --result ${id}` : null
}
