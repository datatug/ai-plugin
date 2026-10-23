// "More rows" for a result card: when a result is a plain table read, the card can read the same table
// again with another row count. Pure: the hooks module runs the CLI. Nothing here reads a row, and the
// model is never told: the re-run is the card's own call, not a tool call.
import { LEGACY_TEXT, isRef, isResultId } from './results.js'

// The row counts the buttons offer; 500 is the cap (the CLI keeps 2000 rows by default, so none needs
// --result-rows).
export const ROW_COUNTS = [10, 50, 100, 500]

// A table name the card will put in an argument: plain characters, nothing a CLI flag, a path or a
// shell could read as more than a name. `--from=<table>` is also one argument, never `--from <table>`.
const TABLE = /^[A-Za-z0-9_][A-Za-z0-9_.$-]*$/
const MAX_TABLE = 128

// The dim line the card shows in place of the buttons, per reason: names the reason, never a value.
export const MORE_TEXT = {
  saved: 'Rows buttons need a table read; this result is a saved query',
  kind: 'Rows buttons need a table read; this result is a query written in TugQL',
  policy: 'Rows buttons need a table read without policies',
  ref: 'Rows buttons need a database that is in a project',
  offset: 'Rows buttons need a table read from the first row',
  table: 'Rows buttons need a plain table name',
  id: 'Rows buttons need a shorter result id',
  old: 'Rows buttons need a newer DataTug CLI',
}

// The id of the result a row count writes: the first result's id, `-r`, the count. A result id is at
// most 128 characters of `A-Za-z0-9_-`; null for anything else.
export function moreId(base, n) {
  if (!ROW_COUNTS.includes(n) || !isResultId(base)) return null
  const id = `${base}-r${n}`
  return isResultId(id) ? id : null
}

// Whether the displayed result (its CardMeta, `base` the first result's id) may be read again with
// another row count: { ok: true, table, dbRef } or { ok: false, reason } (a key of MORE_TEXT).
// Only a table read without policies qualifies: the CLI takes --limit only with --from, and a replay with
// --no-policies must never be wider than the original run.
export function moreGate(meta, base) {
  const q = meta?.query
  if (meta?.kind === 'saved') return { ok: false, reason: 'saved' }
  if (meta?.kind !== 'from') return { ok: false, reason: 'kind' }
  if (q === undefined || q === null || typeof q.policy !== 'string' || typeof q.text !== 'string' || typeof q.from !== 'string') return { ok: false, reason: 'old' }
  if (q.policy !== 'none') return { ok: false, reason: 'policy' }
  if (typeof q.dbRef !== 'string' || !isRef(q.dbRef)) return { ok: false, reason: 'ref' }
  if (/offset["']?\s*:/i.test(q.text)) return { ok: false, reason: 'offset' }
  if (q.from.length > MAX_TABLE || !TABLE.test(q.from)) return { ok: false, reason: 'table' }
  // The longest id there is, so one verdict holds for every button.
  if (moreId(base, 500) === null) return { ok: false, reason: 'id' }
  return { ok: true, table: q.from, dbRef: q.dbRef }
}

// The arguments after `datatug` for the re-run, or null when anything is off. Fixed shape, no shell:
// each value is one argument, and the table cannot be read as a flag (it follows `--from=`).
export function moreArgs(dbRef, table, n, id) {
  if (!ROW_COUNTS.includes(n) || typeof dbRef !== 'string' || !isRef(dbRef)) return null
  if (typeof table !== 'string' || table.length > MAX_TABLE || !TABLE.test(table)) return null
  if (typeof id !== 'string' || !isResultId(id) || !id.endsWith(`-r${n}`)) return null
  return ['query', 'run', `--db=${dbRef}`, `--from=${table}`, `--limit=${n}`, '--no-policies', '--result-id', id, '--format', 'json']
}

// The reason code of a failed `query run --result-id`: the failure line on stdout, else the store's
// message on stderr. Null for anything else; never any other text.
export function failureReason(stdout, stderr) {
  for (const line of String(stdout ?? '').split('\n')) {
    const t = line.trim()
    if (!t.startsWith('{"resultFiles"')) continue
    try {
      const doc = JSON.parse(t)
      if (doc?.resultFiles === null && typeof doc.reason === 'string' && /^[a-z-]{1,40}$/.test(doc.reason)) return doc.reason
    } catch {
      return null
    }
  }
  const m = /query results: ([a-z-]{1,40})\s*$/m.exec(String(stderr ?? ''))
  return m === null ? null : m[1]
}

// The card's line for a failed re-run: path-free, and the reasons the store names are said as the
// card says them elsewhere.
export function moreErrorText(reason) {
  if (reason !== null && Object.hasOwn(LEGACY_TEXT, reason)) return LEGACY_TEXT[reason]
  if (reason === 'unreachable') return 'The DataTug CLI did not answer. Try again'
  if (reason === 'unshown') return 'The new rows could not be shown. Try again'
  return 'DataTug could not read those rows. Try again'
}
