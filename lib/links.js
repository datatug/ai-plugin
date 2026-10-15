// "Open in DataTug" links of the panel's Table, Table records and Record cards. Pure: running the
// CLI is the hooks module's job. The mod never builds a web UI address: `datatug daemon url` does,
// and this module only decides whether what the CLI printed may be drawn as a link.

// The first datatug release whose `daemon url` puts the record key and a one-time code in the link
// fragment, and whose agent admits only the hosted web UI's origin.
export const LINK_MIN_CLI_VERSION = '0.86.0'

// How long a fetched link is drawn before `daemon url` is asked again.
export const LINK_TTL_MS = 60000

// The one web UI a link may open.
export const UI_ORIGIN = 'https://datatug.app'

// The web UI origin of a development host the person named in the plugin's settings: exactly
// http(s)://datatug.localhost with an optional port, else null. Never taken from the CLI.
export function parseDevHost(value) {
  if (typeof value !== 'string') return null
  const m = /^(https?):\/\/datatug\.localhost(?::(\d{1,5}))?\/?$/.exec(value.trim())
  if (m === null) return null
  if (m[2] !== undefined && (Number(m[2]) < 1 || Number(m[2]) > 65535 || m[2].startsWith('0'))) return null
  return `${m[1]}://datatug.localhost${m[2] === undefined ? '' : `:${m[2]}`}`
}

// The three kinds `daemon url` prints, one per card.
export const KINDS = { table: 'table-metadata', records: 'table-records', record: 'record' }

// The arguments after `datatug` for one card's link, or null when the request is not well formed.
// `req`: { kind: 'table' | 'records' | 'record', db: a datatug:// reference, table, schema?,
// isView?, limit?, key? (an object of primary-key column to value) }.
export function urlArgs(req) {
  if (req === null || typeof req !== 'object') return null
  if (typeof req.db !== 'string' || !req.db.startsWith('datatug://')) return null
  if (typeof req.table !== 'string' || req.table === '' || req.table.startsWith('-')) return null
  const args = ['daemon', 'url', '--db', req.db, '--table', req.table]
  if (typeof req.schema === 'string' && req.schema !== '') {
    if (req.schema.startsWith('-')) return null
    args.push('--schema', req.schema)
  }
  if (req.isView === true) args.push('--view')
  if (req.kind === 'records') args.push('--records', '--limit', String(req.limit ?? 50))
  else if (req.kind === 'record') {
    if (req.key === null || typeof req.key !== 'object' || Object.keys(req.key).length === 0) return null
    args.push('--record', JSON.stringify(req.key))
  } else if (req.kind !== 'table') return null
  args.push('--format', 'json')
  return args
}

export const STATUS_ARGS = ['daemon', 'status', '--format', 'json']

// What a card shows in place of a link, by state. None of them carries a link, a key or a row.
export const MESSAGES = {
  checking: 'Checking the DataTug web link…',
  down: 'DataTug web link unavailable: the local DataTug agent is not running (datatug daemon start)',
  pending: 'The DataTug web UI cannot open this view yet',
  'old-cli': `Open in DataTug needs datatug ${LINK_MIN_CLI_VERSION} or later: update the DataTug CLI (datatug self-update)`,
  dev: 'This DataTug CLI points at a development web UI; no link',
  unavailable: 'DataTug web link unavailable: the CLI did not give a link the mod can check',
  'same-host': 'Open in DataTug works only on the machine that runs the agent',
  'not-in-project': 'Add this database to a project to open it in DataTug',
}

export function sourceUnavailableText(name) {
  return `No DataTug web link: start the DataTug agent from an environment that sets ${name}`
}

// Whether a link may be drawn where the card is drawn. Only the terminal is known to open a link on
// the machine that runs the agent: the Desktop app, VS Code and mobile are remote surfaces, and a
// terminal reached over SSH opens links on another machine.
export function isSameHost(surface, ssh) {
  return surface === 'terminal' && !ssh
}

function parseJson(text) {
  try {
    const at = String(text ?? '').indexOf('{')
    return at < 0 ? null : JSON.parse(String(text).slice(at))
  } catch {
    return null
  }
}

// An older CLI says so on stderr.
export function isUnknownCommand(text) {
  return /unknown (command|flag|shorthand flag)|no such command|invalid command|flag provided but not defined/i.test(String(text ?? ''))
}

// The port the daemon listens on, from `datatug daemon status --format json`, or null.
export function statusPort(run) {
  if (run === null || run.exitCode !== 0) return null
  const doc = parseJson(run.stdout)
  const port = doc?.port
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null
}

// Decides what a card draws from the answers of `daemon status` and `daemon url`:
// { status: 'ok', href } or { status } with a key of MESSAGES. `kind` is the card's (table, records,
// record), `devOrigin` the configured development origin or null.
export function readLink(statusRun, urlRun, kind, devOrigin) {
  if (urlRun === null) return { status: 'down' }
  if (urlRun.exitCode !== 0) return { status: isUnknownCommand(`${urlRun.stderr ?? ''}${urlRun.stdout ?? ''}`) ? 'old-cli' : 'unavailable' }
  const doc = parseJson(urlRun.stdout)
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return { status: 'unavailable' }
  if (doc.kind !== KINDS[kind]) return { status: typeof doc.kind === 'string' ? 'unavailable' : 'old-cli' }
  if (doc.uiSupport !== 'available') return { status: 'pending' }
  if (doc.running !== true) return { status: 'down' }
  const port = statusPort(statusRun)
  if (port === null) return { status: 'unavailable' }
  return checkHref(doc.url, kind, port, devOrigin)
}

const PARAM = /^[A-Za-z0-9._~%-]*$/

function params(text) {
  const out = new Map()
  if (text === '') return out
  for (const part of text.split('&')) {
    const eq = part.indexOf('=')
    if (eq <= 0) return null
    const name = part.slice(0, eq)
    const value = part.slice(eq + 1)
    if (out.has(name) || !PARAM.test(value)) return null
    out.set(name, value)
  }
  return out
}

// Re-checks a link the CLI printed against the fixed allow-list before it is drawn:
// https://datatug.app (or the configured development origin), the agent's own store path on
// 127.0.0.1:<port>, no credentials, no second scheme, at most 2048 characters, only the expected
// query and fragment parameters, and a one-time code in the fragment.
export function checkHref(url, kind, port, devOrigin) {
  if (typeof url !== 'string' || url === '' || url.length > 2048) return { status: 'unavailable' }
  const m = /^(https?:\/\/[^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/s.exec(url)
  if (m === null) return { status: 'unavailable' }
  const [, origin, path, query = '', fragment = ''] = m
  if (origin !== UI_ORIGIN && (devOrigin === null || origin !== devOrigin)) return { status: /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(origin) ? 'dev' : 'unavailable' }
  const rest = url.slice(origin.length)
  if (url.split('#')[0].includes('@') || rest.includes('://') || /[\s\\<>"'`]/.test(url)) return { status: 'unavailable' }
  const store = `/store/http-127.0.0.1:${port}/`
  if (!path.startsWith(store) || /(^|\/)\.\.?(\/|$)/.test(path)) return { status: 'unavailable' }
  const q = params(query)
  const f = params(fragment)
  if (q === null || f === null) return { status: 'unavailable' }
  const wantQuery = kind === 'records' ? ['limit', 'schema'] : ['schema']
  if (![...q.keys()].every(k => wantQuery.includes(k)) || !q.has('schema') || (kind === 'records' && !q.has('limit'))) return { status: 'unavailable' }
  if (![...f.keys()].every(k => k === 'code' || (kind === 'record' && k === 'pk'))) return { status: 'unavailable' }
  // A link with no one-time code does not open: it comes from a CLI older than the access model.
  if (!f.has('code') || f.get('code') === '') return { status: 'old-cli' }
  if (kind === 'record' && (!f.has('pk') || f.get('pk') === '')) return { status: 'unavailable' }
  return { status: 'ok', href: url }
}

// The raw JSON text of each top-level field of one JSON object (one line of `--format jsonl`), so
// a key column is read without JSON.parse rounding an integer above 2^53 - 1. Null when the text is
// not one object.
export function rawFields(line) {
  const s = String(line ?? '')
  let i = 0
  const ws = () => {
    while (i < s.length && ' \t\r\n'.includes(s[i])) i++
  }
  const str = () => {
    const start = i
    if (s[i] !== '"') return null
    i++
    while (i < s.length && s[i] !== '"') i += s[i] === '\\' ? 2 : 1
    if (i >= s.length) return null
    i++
    return s.slice(start, i)
  }
  const value = () => {
    const start = i
    if (s[i] === '"') return str()
    if (s[i] === '{' || s[i] === '[') {
      let depth = 0
      while (i < s.length) {
        const c = s[i]
        if (c === '"') {
          if (str() === null) return null
          continue
        }
        if (c === '{' || c === '[') depth++
        if (c === '}' || c === ']') depth--
        i++
        if (depth === 0) return s.slice(start, i)
      }
      return null
    }
    while (i < s.length && !',}] \t\r\n'.includes(s[i])) i++
    return i > start ? s.slice(start, i) : null
  }
  const out = {}
  ws()
  if (s[i] !== '{') return null
  i++
  ws()
  if (s[i] === '}') return out
  while (i < s.length) {
    ws()
    const k = str()
    if (k === null) return null
    ws()
    if (s[i] !== ':') return null
    i++
    ws()
    const v = value()
    if (v === null) return null
    let name
    try {
      name = JSON.parse(k)
    } catch {
      return null
    }
    out[name] = v
    ws()
    if (s[i] === ',') {
      i++
      continue
    }
    if (s[i] === '}') return out
    return null
  }
  return null
}

const MAX_SAFE = 9007199254740991n
const MAX_KEY_TEXT = 256

// One key value from its raw JSON text: an integer stays a number while JavaScript holds it exactly
// and becomes its digits as a string above that; a string stays a string. Null, an object, an
// array, a boolean or a value over 256 characters gives no record link.
export function keyValue(raw) {
  if (typeof raw !== 'string') return { why: 'a key value is missing' }
  const text = raw.trim()
  if (text.startsWith('"')) {
    let v
    try {
      v = JSON.parse(text)
    } catch {
      return { why: 'a key value cannot be read' }
    }
    if (v === '' || Array.from(v).length > MAX_KEY_TEXT) return { why: 'a key value is empty or longer than 256 characters' }
    return { value: v }
  }
  if (/^-?(0|[1-9]\d*)$/.test(text)) {
    const big = BigInt(text)
    return { value: big > MAX_SAFE || big < -MAX_SAFE ? text : Number(text) }
  }
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(text)) return { why: 'a key value is not a whole number or text' }
  return { why: 'a key value is empty, binary or not a plain value' }
}

// The record key for a Record link, from the declared primary-key columns (in key order) and the
// row's raw JSON line: { key } or { why } (the one line the card shows in place of the link).
export function recordKey(pkColumns, line) {
  if (!Array.isArray(pkColumns) || pkColumns.length === 0) return { why: 'the table has no declared primary key' }
  const fields = rawFields(line)
  if (fields === null) return { why: 'the record cannot be read' }
  const key = {}
  for (const col of pkColumns) {
    const name = Object.keys(fields).find(f => f.toLowerCase() === String(col).toLowerCase())
    const v = keyValue(name === undefined ? undefined : fields[name])
    if ('why' in v) return v
    key[name] = v.value
  }
  return { key }
}

// A short, stable fingerprint of a request, so session state never holds a key value or a link.
export function fingerprint(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
