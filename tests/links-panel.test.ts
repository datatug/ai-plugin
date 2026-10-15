import { expect, mock, test } from 'claude-code/testing'

// The "Open in DataTug" links of the Table, Table records and Record cards, against a fake datatug
// that prints what datatug 0.86.0 prints. Every datatug call is recorded with its argument list and
// environment.

const CODE = 'v1.1792102025.FA7rMn3JXdmlXSxgNGgviQ.Q-D8dlpnyOYsqQ6lXO550An8-OcBqtYFViaarabdpGI'
const SECRET = 's3cret-9'

type Call = { argv: string[]; env: Record<string, string> }
type Cli = {
  version?: string
  running?: boolean
  uiSupport?: Record<string, string>
  base?: string
  urlExit?: { exitCode: number; stderr: string }
  isMissing?: boolean
  projects?: { id: string }[]
  sources?: { id: string; driver: string; dsnEnv?: string }[]
  hrefOf?: (href: string) => string
  gate?: Promise<void>
}

const TABLES = [
  { schema: 'main', name: 'Album', kind: 'table', columns: [{ name: 'AlbumId', type: 'INTEGER', primaryKeyPosition: 1 }, { name: 'Title', type: 'NVARCHAR(160)' }] },
  { schema: 'main', name: 'PlaylistTrack', kind: 'table', columns: [{ name: 'PlaylistId', type: 'INTEGER', primaryKeyPosition: 1 }, { name: 'TrackId', type: 'INTEGER', primaryKeyPosition: 2 }, { name: 'Note', type: 'TEXT' }] },
  { schema: 'main', name: 'Big', kind: 'table', columns: [{ name: 'Id', type: 'INTEGER', primaryKeyPosition: 1 }, { name: 'Secret', type: 'TEXT' }] },
  { schema: 'main', name: 'Loose', kind: 'table', columns: [{ name: 'a', type: 'TEXT' }] },
  { schema: 'main', name: 'TopAlbums', kind: 'view', columns: [{ name: 'Title', type: 'TEXT' }] },
]
const ROWS: Record<string, string> = {
  Album: '{"AlbumId":1,"Title":"For Those"}\n{"AlbumId":2,"Title":"Balls"}\n',
  PlaylistTrack: '{"$key":"rid","TrackId":3402,"PlaylistId":1,"Note":"n"}\n',
  Big: `{"Id":9007199254740993,"Secret":"${SECRET}"}\n`,
  Loose: '{"a":"x"}\n',
  TopAlbums: '{"Title":"x"}\n',
}

const arg = (argv: string[], flag: string) => {
  const i = argv.indexOf(flag)
  return i < 0 ? undefined : argv[i + 1]
}

// What `datatug daemon url` prints for an argument list, the way 0.86.0 builds it.
function daemonUrl(argv: string[], cli: Cli) {
  const ref = /^datatug:\/\/([^/]+)\/([^?]+)\?env=(.+)$/.exec(arg(argv, '--db') ?? '')
  const table = arg(argv, '--table') ?? ''
  const schema = arg(argv, '--schema') ?? ''
  const kind = argv.includes('--record') ? 'record' : argv.includes('--records') ? 'table-records' : 'table-metadata'
  const running = cli.running ?? true
  let url = `${cli.base ?? 'https://datatug.app'}/store/http-127.0.0.1:8989/project/${ref?.[1]}/env/${ref?.[3]}/db/${ref?.[2]}/${argv.includes('--view') ? 'view' : 'table'}/${table}`
  const code = running ? `code=${CODE}` : ''
  if (kind === 'table-records') url += `/records?limit=${arg(argv, '--limit')}&schema=${schema}`
  else if (kind === 'record') {
    const key = JSON.parse(arg(argv, '--record') ?? '{}') as Record<string, unknown>
    const sorted = Object.fromEntries(Object.keys(key).sort().map(k => [k, key[k]]))
    url += `/record?schema=${schema}#${code}${code === '' ? '' : '&'}pk=${encodeURIComponent(JSON.stringify(sorted))}`
  } else url += `?schema=${schema}`
  if (kind !== 'record' && code !== '') url += `#${code}`
  return { url: cli.hrefOf ? cli.hrefOf(url) : url, kind, running, uiSupport: cli.uiSupport?.[kind] ?? 'available' }
}

function fakeDatatug(on: Parameters<Parameters<typeof test>[1]>[1], cli: Cli) {
  const calls: Call[] = []
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.scroll', () => ({ value: {} }) as never)
  on('session.cwd', () => ({ value: '/work' }) as never)
  on('session.surfaces', () => ({ value: ['terminal'] }) as never)
  on('fs.exists', () => ({ value: true }) as never)
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'bottom') as never)
  on('process.run', (_$, e) => {
    const call = e as { argv: string[]; init?: { env?: Record<string, string> } }
    calls.push({ argv: call.argv, env: call.init?.env ?? {} })
    const tail = call.argv.slice(1).join(' ')
    const ok = (v: unknown) => ({ value: { exitCode: 0, stdout: typeof v === 'string' ? v : JSON.stringify(v), stderr: '' } }) as never
    if (tail === '--version') return ok(`datatug ${cli.version ?? '0.86.0'}\n`)
    if (tail.startsWith('projects')) return ok(cli.projects ?? [{ id: 'p1', title: '', origin: '' }])
    if (tail.startsWith('show')) return ok({ environments: [{ id: 'local', sources: cli.sources ?? [{ id: 'chinook', driver: 'sqlite3' }] }] })
    if (tail.startsWith('db schema')) return ok({ provider: call.argv.includes('env:DATATUG_OPEN_DB') && (call.init?.env?.DATATUG_OPEN_DB ?? '').startsWith('postgres') ? 'postgres' : 'sqlite', tables: TABLES })
    if (tail.startsWith('db add')) {
      const name = arg(call.argv, '--name') ?? 'x'
      return ok({ added: true, id: name, env: 'local', driver: 'sqlite3', dbRef: `datatug://p1/${name}?env=local` })
    }
    if (tail.startsWith('daemon')) {
      if (cli.isMissing === true) throw new Error('spawn datatug ENOENT')
      if (tail.startsWith('daemon status')) return ok({ running: cli.running ?? true, url: 'http://127.0.0.1:8989', uiBase: 'https://datatug.app/store/http-127.0.0.1:8989', port: 8989 })
      if (tail.startsWith('daemon url')) {
        if (cli.urlExit !== undefined) return { value: { exitCode: cli.urlExit.exitCode, stdout: '', stderr: cli.urlExit.stderr } } as never
        return ok(daemonUrl(call.argv, cli))
      }
    }
    return { value: { exitCode: 1, stdout: '', stderr: `unexpected: ${tail}` } } as never
  })
  on('process.spawn', async function* (_$, e) {
    if (cli.gate !== undefined) await cli.gate
    const table = arg((e as { argv: string[] }).argv, '--from') ?? ''
    yield { stream: 'stdout', text: ROWS[table] ?? '' }
    return { value: { code: 0, signal: null } }
  } as never)
  return calls
}

type Pane = Awaited<ReturnType<Parameters<Parameters<typeof test>[1]>[0]['ui']['mount']>>

async function openPanel($: Parameters<Parameters<typeof test>[1]>[0], surface = 'terminal') {
  await $.command.run({ command: 'datatug', args: '' } as never)
  return $.ui.mount({ plugin: 'datatug', surface, component: 'Pane', requestId: 'datatug', props: { bodyColumns: 100 } } as never)
}

// Every Link element drawn, with its href, named after the card's link row it sits in.
function linksOf(tree: unknown): { key?: string; href: string }[] {
  const out: { key?: string; href: string }[] = []
  const walk = (n: unknown, row: string | undefined) => {
    if (n === null || typeof n !== 'object') return
    const node = n as { type?: string; props?: { key?: string; href?: string }; children?: unknown[] }
    const key = node.props?.key
    const here = typeof key === 'string' && key.startsWith('link-row:') ? `link:${key.slice('link-row:'.length)}` : row
    if (node.type === 'Link') out.push({ key: here, href: node.props?.href ?? '' })
    for (const c of node.children ?? []) walk(c, here)
  }
  walk(tree, undefined)
  return out
}

// Everything the mod writes to its session state, as JSON, by key.
function stateWrites(on: Parameters<Parameters<typeof test>[1]>[1]) {
  const writes: Record<string, string[]> = {}
  on('state.set', (_$, e, next) => {
    const w = e as { key?: string; ref?: { key?: string }; value?: unknown }
    const key = w.key ?? w.ref?.key ?? '?'
    ;(writes[key] ??= []).push(JSON.stringify(w.value ?? w))
    return next(e)
  })
  return (key: string) => (writes[key] ?? []).join('\n')
}

const drawn = async (pane: Pane, clock: { settle: () => Promise<void> }) => {
  await clock.settle()
  await clock.settle()
  const tree = await pane.drawn()
  return { tree, text: JSON.stringify(tree), links: linksOf(tree) }
}

const urlCalls = (calls: Call[]) => calls.filter(c => c.argv[1] === 'daemon' && c.argv[2] === 'url')
const TABLE_HREF = `https://datatug.app/store/http-127.0.0.1:8989/project/p1/env/local/db/chinook/table/Album?schema=#code=${CODE}`

async function openChinook($: Parameters<Parameters<typeof test>[1]>[0], surface = 'terminal') {
  const pane = await openPanel($, surface)
  await pane.press({ key: 'dbs-open:local:chinook' } as never)
  return pane
}

test('the Table card links to the table metadata view with the exact link the CLI printed', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.env(on, {})
  const calls = fakeDatatug(on, {})
  const pane = await openChinook($)
  let d = await drawn(pane, clock)
  // Nothing is asked before a table is open.
  expect(urlCalls(calls)).toHaveLength(0)
  await pane.press({ key: 'odbt:table:Album' } as never)
  d = await drawn(pane, clock)
  expect(d.links).toEqual([{ key: 'link:table', href: TABLE_HREF }])
  expect(d.text).toContain('link-check:table')
  expect(urlCalls(calls).map(c => c.argv)).toEqual([['datatug', 'daemon', 'url', '--db', 'datatug://p1/chinook?env=local', '--table', 'Album', '--format', 'json']])
  // Every datatug call names the mod as its caller, and the mod never starts the daemon itself.
  for (const c of calls.filter(x => x.argv[0] === 'datatug')) expect(c.env.DATATUG_CLIENT).toBe('claude-mod')
  expect(calls.some(c => c.argv.includes('start'))).toBe(false)
  // A view is linked as a view.
  await pane.press({ key: 'odbt:view:TopAlbums' } as never)
  d = await drawn(pane, clock)
  expect(d.links[0]?.href).toContain('/view/TopAlbums?schema=#code=')
  expect(urlCalls(calls).at(-1)?.argv).toContain('--view')
})

test('the Table records card links to its top 100 records once they are read; the Table card link stays as it was', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.env(on, {})
  const calls = fakeDatatug(on, { uiSupport: { 'table-records': 'pending' } })
  const pane = await openChinook($)
  await pane.press({ key: 'odbt:table:Album' } as never)
  let d = await drawn(pane, clock)
  expect(d.links).toEqual([{ key: 'link:table', href: TABLE_HREF }])
  await pane.press({ key: 'dbtable-records' } as never)
  d = await drawn(pane, clock)
  // uiSupport pending for the records view: its message and no link, never a dead URL.
  expect(d.links).toEqual([])
  expect(d.text).toContain('The DataTug web UI cannot open this view yet')
  expect(d.text).toContain('link-check:records')
  expect(urlCalls(calls).at(-1)?.argv).toEqual(['datatug', 'daemon', 'url', '--db', 'datatug://p1/chinook?env=local', '--table', 'Album', '--records', '--limit', '100', '--format', 'json'])
  await pane.press({ key: 'dbrecords-meta' } as never)
  d = await drawn(pane, clock)
  expect(d.links).toEqual([{ key: 'link:table', href: TABLE_HREF }])
})

test('the records link is drawn when the view is available', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.env(on, {})
  fakeDatatug(on, {})
  const pane = await openChinook($)
  await pane.press({ key: 'odbt:table:Album' } as never)
  await pane.press({ key: 'dbtable-records' } as never)
  const d = await drawn(pane, clock)
  expect(d.links).toEqual([{ key: 'link:records', href: `https://datatug.app/store/http-127.0.0.1:8989/project/p1/env/local/db/chinook/table/Album/records?limit=100&schema=#code=${CODE}` }])
})

test('a Record card links by its declared primary key in the fragment, with no $key and no other value', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.env(on, {})
  const calls = fakeDatatug(on, {})
  const pane = await openChinook($)
  await pane.press({ key: 'odbt:table:PlaylistTrack' } as never)
  await pane.press({ key: 'dbtable-records' } as never)
  await pane.press({ key: 'recrow:0' } as never)
  const d = await drawn(pane, clock)
  const record = d.links.find(l => l.key === 'link:record')
  expect(record?.href).toBe(`https://datatug.app/store/http-127.0.0.1:8989/project/p1/env/local/db/chinook/table/PlaylistTrack/record?schema=#code=${CODE}&pk=%7B%22PlaylistId%22%3A1%2C%22TrackId%22%3A3402%7D`)
  const argv = urlCalls(calls).at(-1)?.argv ?? []
  expect(arg(argv, '--record')).toBe('{"PlaylistId":1,"TrackId":3402}')
  expect(argv.join(' ').includes('$key')).toBe(false)
  expect(argv.join(' ').includes('"n"')).toBe(false)
})

test('an integer key above 2^53 - 1 reaches daemon url unrounded, as a string', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.env(on, {})
  const calls = fakeDatatug(on, {})
  const pane = await openChinook($)
  await pane.press({ key: 'odbt:table:Big' } as never)
  await pane.press({ key: 'dbtable-records' } as never)
  await pane.press({ key: 'recrow:0' } as never)
  const d = await drawn(pane, clock)
  expect(arg(urlCalls(calls).at(-1)?.argv ?? [], '--record')).toBe('{"Id":"9007199254740993"}')
  expect(d.links.find(l => l.key === 'link:record')?.href).toContain('pk=%7B%22Id%22%3A%229007199254740993%22%7D')
  // A non-key value is in no link and no argument list.
  expect(d.links.some(l => l.href.includes(SECRET))).toBe(false)
  expect(calls.some(c => c.argv.join(' ').includes(SECRET))).toBe(false)
})

test('a record of a table with no declared primary key gets no Record link and says why', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.env(on, {})
  const calls = fakeDatatug(on, {})
  const pane = await openChinook($)
  await pane.press({ key: 'odbt:table:Loose' } as never)
  await pane.press({ key: 'dbtable-records' } as never)
  await pane.press({ key: 'recrow:0' } as never)
  const d = await drawn(pane, clock)
  expect(d.text).toContain('No record link: the table has no declared primary key')
  expect(d.links.some(l => l.key === 'link:record')).toBe(false)
  expect(urlCalls(calls).some(c => c.argv.includes('--record'))).toBe(false)
  // The Table records link stays.
  expect(d.links.some(l => l.key === 'link:records')).toBe(true)
})

test('a link is fetched only after the card data call resolved', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.env(on, {})
  let release = () => {}
  const gate = new Promise<void>(r => {
    release = r
  })
  const calls = fakeDatatug(on, { gate })
  const pane = await openChinook($)
  await pane.press({ key: 'odbt:table:Album' } as never)
  await drawn(pane, clock)
  const before = urlCalls(calls).length
  void pane.press({ key: 'dbtable-records' } as never)
  let d = await drawn(pane, clock)
  expect(d.text).toContain('Reading the first')
  expect(urlCalls(calls).length).toBe(before)
  expect(d.text.includes('link-row:records')).toBe(false)
  release()
  d = await drawn(pane, clock)
  expect(urlCalls(calls).length).toBe(before + 1)
  expect(d.links.some(l => l.key === 'link:records')).toBe(true)
})

test('a daemon that is not running gives the warning and Check again; once it runs, Check again draws the link', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.env(on, {})
  const cli: Cli = { running: false }
  fakeDatatug(on, cli)
  const pane = await openChinook($)
  await pane.press({ key: 'odbt:table:Album' } as never)
  let d = await drawn(pane, clock)
  expect(d.text).toContain('DataTug web link unavailable: the local DataTug agent is not running (datatug daemon start)')
  expect(d.links).toEqual([])
  cli.running = true
  await pane.press({ key: 'link-check:table' } as never)
  d = await drawn(pane, clock)
  expect(d.links).toEqual([{ key: 'link:table', href: TABLE_HREF }])
})

test('a datatug that cannot be run gives the daemon warning, never a link', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.env(on, {})
  fakeDatatug(on, { isMissing: true })
  const pane = await openChinook($)
  await pane.press({ key: 'odbt:table:Album' } as never)
  const d = await drawn(pane, clock)
  expect(d.text).toContain('the local DataTug agent is not running')
  expect(d.links).toEqual([])
})

test('a stale link is checked again after 60 seconds, without any request to the daemon, and turns into the warning when it stopped', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.env(on, {})
  const cli: Cli = {}
  const calls = fakeDatatug(on, cli)
  const pane = await openChinook($)
  await pane.press({ key: 'odbt:table:Album' } as never)
  let d = await drawn(pane, clock)
  expect(d.links).toHaveLength(1)
  expect(urlCalls(calls)).toHaveLength(1)
  await clock.advance(30000)
  d = await drawn(pane, clock)
  expect(urlCalls(calls)).toHaveLength(1)
  expect(d.links).toHaveLength(1)
  // The daemon idled out: the next check says so.
  cli.running = false
  await clock.advance(31000)
  d = await drawn(pane, clock)
  expect(urlCalls(calls)).toHaveLength(2)
  expect(d.links).toEqual([])
  expect(d.text).toContain('the local DataTug agent is not running')
  // Only daemon status and daemon url were asked: neither starts the daemon or sends it a request.
  const daemonCalls = calls.filter(c => c.argv[1] === 'daemon').map(c => c.argv[2])
  expect([...new Set(daemonCalls)].sort()).toEqual(['status', 'url'])
})

for (const surface of ['desktop', 'vscode', 'mobile']) {
  test(`on ${surface} (e.surface) the cards say a link opens only on the agent machine`, async ($, on) => {
    const clock = mock.clock(on, { now: 1000 })
    mock.env(on, {})
    const calls = fakeDatatug(on, {})
    const pane = await openChinook($, surface)
    await pane.press({ key: 'odbt:table:Album' } as never)
    await pane.press({ key: 'dbtable-records' } as never)
    await pane.press({ key: 'recrow:0' } as never)
    const d = await drawn(pane, clock)
    for (const card of ['records', 'record']) expect(d.text).toContain(`link-check:${card}`)
    expect(d.text).toContain('Open in DataTug works only on the machine that runs the agent')
    expect(d.links).toEqual([])
    expect(urlCalls(calls)).toHaveLength(0)
  })
}

for (const env of [{ SSH_CONNECTION: '10.0.0.2 5000 10.0.0.1 22' }, { SSH_TTY: '/dev/ttys001' }]) {
  test(`a terminal with ${Object.keys(env)[0]} set gets the same-machine warning`, async ($, on) => {
    const clock = mock.clock(on, { now: 1000 })
    mock.env(on, env)
    const calls = fakeDatatug(on, {})
    const pane = await openChinook($)
    await pane.press({ key: 'odbt:table:Album' } as never)
    const d = await drawn(pane, clock)
    expect(d.text).toContain('Open in DataTug works only on the machine that runs the agent')
    expect(d.links).toEqual([])
    expect(urlCalls(calls)).toHaveLength(0)
  })
}

const DEV = (href: string) => href.replace('https://datatug.app', 'http://datatug.localhost:4200')

test('a CLI that points at a development web UI gives the development message, not a link', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.env(on, {})
  fakeDatatug(on, { hrefOf: DEV })
  const pane = await openChinook($)
  await pane.press({ key: 'odbt:table:Album' } as never)
  const d = await drawn(pane, clock)
  expect(d.text).toContain('This DataTug CLI points at a development web UI; no link')
  expect(d.links).toEqual([])
})

test('the development host is linked when the person configured exactly it', { options: { webDevHost: 'http://datatug.localhost:4200' } }, async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.env(on, {})
  fakeDatatug(on, { hrefOf: DEV })
  const pane = await openChinook($)
  await pane.press({ key: 'odbt:table:Album' } as never)
  const d = await drawn(pane, clock)
  expect(d.links).toEqual([{ key: 'link:table', href: DEV(TABLE_HREF) }])
})

test('a configured look-alike of the development host gives no link', { options: { webDevHost: 'http://datatug.localhost.evil.com:4200' } }, async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.env(on, {})
  fakeDatatug(on, { hrefOf: href => href.replace('https://datatug.app', 'http://datatug.localhost.evil.com:4200') })
  const pane = await openChinook($)
  await pane.press({ key: 'odbt:table:Album' } as never)
  const d = await drawn(pane, clock)
  expect(d.links).toEqual([])
  expect(d.text).toContain('development web UI')
})

const HOSTILE: [string, (h: string) => string][] = [
  ['another origin', h => h.replace('https://datatug.app', 'https://evil.example')],
  ['credentials in the path', h => h.replace('/project/', '/project/u:s3cret@h/')],
  ['a connection string in the query', h => h.replace('?schema=', '?schema=&dsn=postgres%3A%2F%2Fu%3As3cret%40h')],
  ['an extra fragment value', h => `${h}&token=s3cret`],
  ['another agent host', h => h.replace('/store/http-127.0.0.1:8989/', '/store/http-evil.example:80/')],
]
for (const [what, hrefOf] of HOSTILE) {
  test(`a link from the CLI with ${what} is never drawn`, async ($, on) => {
    const clock = mock.clock(on, { now: 1000 })
    mock.env(on, {})
    fakeDatatug(on, { hrefOf })
    const pane = await openChinook($)
    await pane.press({ key: 'odbt:table:Album' } as never)
    const d = await drawn(pane, clock)
    expect(d.links).toEqual([])
    expect(d.text).toMatch(/development web UI; no link|did not give a link the mod can check/)
    expect(d.text.includes('s3cret')).toBe(false)
    expect(d.text.includes('evil.example')).toBe(false)
  })
}

test('a CLI older than 0.86.0 opens the panel, and the cards say to update it without asking for a link', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.env(on, {})
  const calls = fakeDatatug(on, { version: '0.85.2' })
  const pane = await openChinook($)
  await pane.press({ key: 'odbt:table:Album' } as never)
  const d = await drawn(pane, clock)
  expect(d.text).toContain('Open in DataTug needs datatug 0.86.0 or later: update the DataTug CLI')
  expect(d.links).toEqual([])
  expect(urlCalls(calls)).toHaveLength(0)
})

const OLD: [string, Cli][] = [
  ['a development build with no daemon url', { version: 'dev', urlExit: { exitCode: 1, stderr: 'Error: unknown command "url" for "datatug daemon"' } }],
  ['a link with no one-time code', { hrefOf: (h: string) => h.replace(/#code=[^&]*&?/, '') }],
]
for (const [what, cli] of OLD) {
  test(`${what} is an old CLI: no link`, async ($, on) => {
    const clock = mock.clock(on, { now: 1000 })
    mock.env(on, {})
    fakeDatatug(on, cli)
    const pane = await openChinook($)
    await pane.press({ key: 'odbt:table:Album' } as never)
    const d = await drawn(pane, clock)
    expect(d.text).toContain('update the DataTug CLI')
    expect(d.links).toEqual([])
  })
}

test('a database opened by path has no link until db add returns its reference, and no link argument holds the path', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.env(on, {})
  const calls = fakeDatatug(on, { projects: [] })
  const pane = await openPanel($)
  await pane.input({ key: 'opendb-input', text: '/home/user/secret-dir/shop.sqlite', kind: 'submit' } as never)
  await pane.press({ key: 'odbt:table:Album' } as never)
  const d = await drawn(pane, clock)
  expect(d.text).toContain('Add this database to a project to open it in DataTug')
  expect(d.links).toEqual([])
  expect(urlCalls(calls)).toHaveLength(0)
})

test('after db add the link names the database by the id and environment it returned', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const stateOf = stateWrites(on)
  mock.env(on, {})
  const calls = fakeDatatug(on, {})
  const pane = await openPanel($)
  await pane.input({ key: 'opendb-input', text: '/home/user/secret-dir/shop.sqlite', kind: 'submit' } as never)
  await clock.settle()
  await pane.press({ key: 'odbt:table:Album' } as never)
  const d = await drawn(pane, clock)
  const add = calls.find(c => c.argv[1] === 'db' && c.argv[2] === 'add')
  expect(add?.argv).toEqual(['datatug', 'db', 'add', '--project', 'p1', '--db', '/home/user/secret-dir/shop.sqlite', '--name', 'shop', '--env', 'local', '--format', 'json'])
  expect(d.links).toEqual([{ key: 'link:table', href: `https://datatug.app/store/http-127.0.0.1:8989/project/p1/env/local/db/shop/table/Album?schema=#code=${CODE}` }])
  for (const c of urlCalls(calls)) expect(c.argv.join(' ').includes('secret-dir')).toBe(false)
  const state = stateOf('links')
  // The observer saw the card's state written (a positive control), and it holds no link.
  expect(state).toContain('"ok"')
  expect(state.includes('secret-dir')).toBe(false)
  expect(state.includes(CODE)).toBe(false)
  expect(state.includes('datatug.app')).toBe(false)
})

test('a PostgreSQL database with a password is added under its own variable, and its cards say the source is unavailable', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const stateOf = stateWrites(on)
  mock.env(on, {})
  const calls = fakeDatatug(on, {})
  const pane = await openPanel($)
  await pane.input({ key: 'opendb-input', text: `postgres://app:${SECRET}@db.example/shop`, kind: 'submit' } as never)
  await clock.settle()
  await pane.press({ key: 'odbt:table:Album' } as never)
  const d = await drawn(pane, clock)
  const add = calls.find(c => c.argv[1] === 'db' && c.argv[2] === 'add')
  expect(add?.argv).toEqual(['datatug', 'db', 'add', '--project', 'p1', '--db', 'env:DATATUG_OPEN_DB_SHOP', '--name', 'shop', '--env', 'local', '--format', 'json'])
  expect(add?.env.DATATUG_OPEN_DB_SHOP).toContain(SECRET)
  expect(d.text).toContain('No DataTug web link: start the DataTug agent from an environment that sets DATATUG_OPEN_DB_SHOP')
  expect(d.links).toEqual([])
  expect(urlCalls(calls)).toHaveLength(0)
  expect(calls.some(c => c.argv.join(' ').includes(SECRET) || c.argv.join(' ').includes('postgres://'))).toBe(false)
  expect(d.text.includes(SECRET)).toBe(false)
  for (const key of ['links', 'openDb', 'databases']) expect(stateOf(key).includes(SECRET)).toBe(false)
})

test('a project source the CLI lists with a dsnEnv says the source is unavailable', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.env(on, {})
  const calls = fakeDatatug(on, { sources: [{ id: 'chinook', driver: 'postgres', dsnEnv: 'DATATUG_PG_CHINOOK' }] })
  const pane = await openChinook($)
  await pane.press({ key: 'odbt:table:Album' } as never)
  const d = await drawn(pane, clock)
  expect(d.text).toContain('sets DATATUG_PG_CHINOOK')
  expect(urlCalls(calls)).toHaveLength(0)
})

test('a Record card of a chat grid has no link line', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.env(on, {})
  const calls = fakeDatatug(on, {})
  on('fs.read', () => ({ value: '[{"AlbumId":1,"Title":"x"}]' }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '' }, text: '', ref: {} }) as never)
  const pane = await openPanel($)
  await $.tool.call({ tool: 'Bash', tool_use_id: 't1', command: 'datatug query run --db datatug://p1/chinook --from Album' } as never)
  const chat = await $.ui.mount({
    plugin: 'datatug', surface: 'terminal', component: 'ToolUse', requestId: 't1',
    props: { tool_use_id: 't1', tool: 'Bash', input: {}, isRunning: false, isErrored: false, isInterrupted: false },
  } as never)
  await chat.press({ key: 'grid', link: { href: 'https://datatug.invalid/row/0' } } as never)
  const d = await drawn(pane, clock)
  expect(d.text).toContain('card-record')
  expect(d.text.includes('link-row:record')).toBe(false)
  expect(urlCalls(calls)).toHaveLength(0)
})

test('no link, key or row reaches a tool result, a notice, the context bag or a prompt', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const stateOf = stateWrites(on)
  mock.env(on, {})
  fakeDatatug(on, {})
  const seen: string[] = []
  on('ui.toast', (_$, e) => {
    seen.push(JSON.stringify(e))
    return { value: undefined } as never
  })
  on('ui.notify', (_$, e) => {
    seen.push(JSON.stringify(e))
    return { value: { isSent: true } } as never
  })
  on('prompt.fill', (_$, e) => {
    seen.push(JSON.stringify(e))
    return { isFilled: true } as never
  })
  const pane = await openChinook($)
  await pane.press({ key: 'odbt:table:Big' } as never)
  await pane.press({ key: 'dbtable-ask' } as never)
  await pane.press({ key: 'dbtable-records' } as never)
  await pane.press({ key: 'recrow:0' } as never)
  const d = await drawn(pane, clock)
  expect(d.links.find(l => l.key === 'link:record')).toBeDefined()
  await pane.press({ key: 'record-add' } as never)
  await pane.press({ key: 'bag-ask' } as never)
  const bag = stateOf('bags')
  expect(bag).toContain('Big')
  expect(seen.filter(x => x.includes('Big')).length).toBeGreaterThanOrEqual(2)
  for (const text of [...seen, bag]) {
    expect(text.includes(CODE)).toBe(false)
    expect(text.includes('datatug.app')).toBe(false)
    expect(text.includes('#pk=') || text.includes('&pk=')).toBe(false)
    expect(text.includes(SECRET)).toBe(false)
  }
})
