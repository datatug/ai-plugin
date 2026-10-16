// A fake datatug CLI and file system for the result card: what `query run --result-id` leaves on
// disk and what `query results locate`, `daemon status` and `daemon url --result` print.

export const ROOT = '/home/u/.datatug/query-results'
export const REF = 'datatug://demo/chinook?env=local'

type Col = { name: string; type: string; declaredType?: string | null; nullable?: boolean | null; pk?: number | null; source?: unknown; foreignKeys?: unknown[] }

export function metaDoc(id: string, opts: { columns?: Col[]; ref?: string | null; participants?: unknown[]; related?: unknown[]; unavailable?: Record<string, string>; version?: number; kept?: number; hasMore?: boolean; dataBytes?: number } = {}) {
  const src = (relation: string, column: string, instance = 'root') => ({ instance, schema: 'main', relation, column })
  const columns: Col[] = opts.columns ?? [
    { name: '$key', type: 'string', declaredType: null, nullable: null, pk: null, source: null, foreignKeys: null as never },
    { name: 'InvoiceId', type: 'integer', declaredType: 'int', nullable: false, pk: 1, source: src('Invoice', 'InvoiceId'), foreignKeys: [] },
    { name: 'CustomerId', type: 'integer', declaredType: 'int', nullable: false, pk: null, source: src('Invoice', 'CustomerId'), foreignKeys: [{ refSchema: 'main', refRelation: 'Customer', refColumn: 'CustomerId' }] },
    { name: 'FirstName', type: 'string', declaredType: 'string', nullable: false, pk: null, source: src('Customer', 'FirstName', 'c'), foreignKeys: [] },
    { name: 'Total', type: 'decimal', declaredType: 'decimal', nullable: false, pk: null, source: null, foreignKeys: [] },
  ]
  const ref = opts.ref === undefined ? REF : opts.ref
  return {
    format: 'datatug.query-result.meta',
    version: opts.version ?? 1,
    id,
    createdAt: '2026-10-16T06:00:00Z',
    expiresAt: '2026-10-23T06:00:00Z',
    cliVersion: '0.94.0',
    dataBytes: opts.dataBytes ?? 0,
    db: { ref, project: ref === null ? null : 'demo', env: ref === null ? null : 'local', source: ref === null ? null : 'chinook', driver: 'sqlite' },
    query: { kind: 'dtql', dtql: 'from: Invoice', policy: 'none' },
    rows: { kept: opts.kept ?? 3, hasMore: opts.hasMore ?? false, truncatedBy: 'none' },
    provenance: null,
    columns,
    participants: opts.participants ?? [
      { instance: 'root', schema: 'main', relation: 'Invoice', alias: 'i', kind: 'table', role: 'from' },
      { instance: 'c', schema: 'main', relation: 'Customer', alias: 'c', kind: 'table', role: 'join', join: { type: 'inner', on: [{ left: 'i.CustomerId', right: 'c.CustomerId' }] } },
    ],
    related: opts.related ?? [
      { candidateId: 'x1', fromInstance: 'root', target: { schema: 'main', relation: 'InvoiceLine', kind: 'table' }, constraintId: 'k1', direction: 'incoming', cardinality: 'one-to-many', fields: [{ sourceField: 'InvoiceId', targetField: 'InvoiceId' }], evidence: 'foreign-key' },
      { candidateId: 'x2', fromInstance: 'c', target: { schema: 'main', relation: 'Employee', kind: 'table' }, constraintId: 'k2', direction: 'outgoing', cardinality: 'many-to-one', fields: [{ sourceField: 'SupportRepId', targetField: 'EmployeeId' }], evidence: 'foreign-key' },
    ],
    unavailable: opts.unavailable ?? {},
  }
}

export function dataDoc(id: string, columns: { name: string; type: string }[], rows: (string | null)[][]) {
  return {
    format: 'datatug.query-result.data',
    version: 1,
    id,
    recordset: { columns, rows: rows.map(r => r.map((v, i) => ({ type: v === null ? 'null' : columns[i].type, value: v }))) },
  }
}

export const DATA_COLUMNS = [
  { name: '$key', type: 'string' },
  { name: 'InvoiceId', type: 'integer' },
  { name: 'CustomerId', type: 'integer' },
  { name: 'FirstName', type: 'string' },
  { name: 'Total', type: 'decimal' },
]
export const DATA_ROWS = [
  ['k1', '1', '2', 'SECRET-ALICE', '1.98'],
  ['k2', '2', '4', 'Bob', '3.96'],
  ['k3', '9007199254740993', '8', 'Carol', '5.94'],
]

// One complete result on the fake disk: meta.json and data.json, the latter's size in dataBytes.
export function result(id: string, opts: Parameters<typeof metaDoc>[1] & { data?: ReturnType<typeof dataDoc> } = {}) {
  const data = JSON.stringify(opts.data ?? dataDoc(id, DATA_COLUMNS, DATA_ROWS))
  const meta = JSON.stringify(metaDoc(id, { dataBytes: data.length, ...opts }))
  return { [`${ROOT}/${id}/data.json`]: data, [`${ROOT}/${id}/meta.json`]: meta }
}

export type Cli = {
  version: string | Error
  check: string
  locate: (id: string) => string
  link: (args: string[]) => unknown
  status: unknown
  runs: string[][]
  spawns: string[][]
  reads: string[]
  files: Record<string, string>
  stats: Record<string, { kind: 'file' | 'dir'; size?: number; realPath?: string }>
  copied: boolean
  // What the person's clipboard took (the test's only view of it).
  clips: string[]
  toasts: string[]
  bash: string[]
  bashAnswer: (cmd: string) => unknown
  renders: Record<string, number>
  // The `output` prop each ToolUse and ToolResult row reached the engine with.
  outputs: Record<string, unknown>
  resultOutputs: Record<string, unknown>
  // The transcript lines the plugin logged, and the isExpanded each ToolGroup reached the engine with.
  logs: string[]
  placed: boolean
  opened: string[]
  groups: boolean[]
  // What the private capture file holds (the legacy path).
  capture: string
}

export const locator = (id: string) => JSON.stringify({ resultFiles: { version: 1, id, root: ROOT, data: `${ROOT}/${id}/data.json`, meta: `${ROOT}/${id}/meta.json` } })

export const SHOW = {
  environments: [
    {
      id: 'local',
      sources: [
        {
          id: 'chinook',
          driver: 'sqlite3',
          schemas: [
            {
              name: 'main',
              tables: [
                { name: 'Invoice', columns: [{ name: 'InvoiceId', type: 'INTEGER', primaryKeyPosition: 1 }, { name: 'CustomerId', type: 'INTEGER' }], foreignKeys: [{ name: 'fk1', columns: ['CustomerId'], refTable: { schema: 'main', name: 'Customer' }, refColumns: ['CustomerId'] }] },
                { name: 'Customer', columns: [{ name: 'CustomerId', type: 'INTEGER', primaryKeyPosition: 1 }, { name: 'FirstName', type: 'NVARCHAR(40)' }] },
                { name: 'InvoiceLine', columns: [{ name: 'InvoiceLineId', type: 'INTEGER', primaryKeyPosition: 1 }, { name: 'InvoiceId', type: 'INTEGER' }] },
              ],
            },
          ],
        },
        { id: 'other', driver: 'sqlite3', schemas: [{ name: 'main', tables: [{ name: 'Customer', columns: [{ name: 'Wrong', type: 'TEXT' }] }] }] },
      ],
    },
  ],
}

// Mounts the fake CLI, disk, clipboard and Bash tool on the test's `on`.
export function fakeWorld(on: any, files: Record<string, string>, over: Partial<Cli> = {}): Cli {
  const cli: Cli = {
    version: '0.94.0',
    check: '{"usable":true}',
    locate: id => locator(id),
    status: { running: true, port: 7777 },
    link: args => {
      const id = args[args.indexOf('--result') + 1]
      const view = (args.find(a => a.startsWith('--view=')) ?? '--view=table').slice(7)
      const row = args.includes('--row') ? `&row=${args[args.indexOf('--row') + 1]}` : ''
      return { contract: 1, kind: 'query-result', running: true, uiSupport: 'available', resultExists: true, warnings: [], url: `https://datatug.app/store/http-127.0.0.1:7777/result/${id}?view=${view}${row}#code=c0de` }
    },
    runs: [],
    spawns: [],
    reads: [],
    files,
    stats: {},
    copied: true,
    clips: [],
    toasts: [],
    bash: [],
    bashAnswer: () => ({ result: { stdout: '{"resultFiles":{"version":1},"rowsKept":3,"hasMore":false,"columns":5}\n', stderr: '' }, text: '', ref: {} }),
    renders: {},
    outputs: {},
    resultOutputs: {},
    logs: [],
    placed: true,
    opened: [],
    groups: [],
    capture: '[{"name":"SECRET-ALICE"}]',
    ...over,
  }
  on('session.cwd', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('env.get', (_$: unknown, e: { name: string }) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))
  on('ui.open', (_$: unknown, e: { id: string; focus?: boolean }) => {
    cli.opened.push(`${e.id}${e.focus === true ? ':focus' : ''}`)
    return { value: cli.placed ? { isPlaced: true } : { isPlaced: false, reason: 'narrow' } }
  })
  on('ui.scroll', () => ({ value: {} }))
  on('ui.log', (_$: unknown, e: { text: string }) => {
    cli.logs.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_$: unknown, e: unknown) => {
    cli.toasts.push(JSON.stringify(e))
    return { value: {} }
  })
  on('ui.copy', (_$: unknown, e: { text: string }) => {
    if (cli.copied) cli.clips.push(e.text)
    return { value: cli.copied ? { isCopied: true } : { isCopied: false, reason: 'remote' } }
  })
  on('ui.render', (_$: any, e: any) => {
    cli.renders[e.requestId] = (cli.renders[e.requestId] ?? 0) + 1
    if (e.component === 'ToolGroup') cli.groups.push(e.props.isExpanded)
    if (e.component === 'ToolUse') cli.outputs[e.requestId] = e.props.output
    if (e.component === 'ToolResult') cli.resultOutputs[e.requestId] = e.props.output
    return h(_$.ui.resolve(e).Text, {}, 'row')
  })
  on('process.run', (_$: unknown, e: { argv: string[] }) => {
    const a = e.argv.slice(1)
    cli.runs.push(e.argv)
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } })
    const t = a.join(' ')
    if (t === '--version') return cli.version instanceof Error ? { deny: cli.version.message } : ok(`${cli.version}\n`)
    if (t === 'query results check --format json') return ok(cli.check)
    if (t.startsWith('query results locate --id ')) return ok(cli.locate(a[4]))
    if (t === 'daemon status --format json') return ok(JSON.stringify(cli.status))
    if (t.startsWith('daemon url --result ')) return ok(JSON.stringify(cli.link(a)))
    if (t.startsWith('show ')) return ok(JSON.stringify(SHOW))
    if (t.startsWith('projects')) return ok('[{"id":"demo","title":"","origin":""}]')
    if (t.startsWith('db schema')) return ok(JSON.stringify({ provider: 'postgres', tables: [{ schema: 'public', name: 'InvoiceLine', kind: 'table', columns: [] }] }))
    if (t.startsWith('db add')) return ok(JSON.stringify({ added: true, id: 'shop', env: 'local', dbRef: 'datatug://demo/shop?env=local' }))
    if (e.argv[0] === 'rm') return ok('')
    return { deny: `unexpected command: ${e.argv.join(' ')}` }
  })
  on('process.spawn', async function* (_$: unknown, e: { argv: string[] }) {
    cli.spawns.push(e.argv)
    yield { stream: 'stdout', text: '{"InvoiceLineId":1,"InvoiceId":1}\n{"CustomerId":2,"FirstName":"Ann"}\n' }
    return { value: { code: 0, signal: null } }
  })
  on('fs.stat', (_$: unknown, e: { path: string }) => {
    const over0 = cli.stats[e.path]
    if (over0 !== undefined) return { value: { size: 0, mtimeMs: 0, isLink: false, realPath: e.path, ...over0 } }
    if (e.path === ROOT) return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false, realPath: ROOT } }
    const text = cli.files[e.path]
    if (text === undefined) throw new Error('ENOENT')
    return { value: { kind: 'file', size: text.length, mtimeMs: 0, isLink: false, realPath: e.path } }
  })
  on('fs.exists', (_$: unknown, e: { path: string }) => ({ value: cli.files[e.path] !== undefined || e.path === ROOT }))
  on('fs.read', (_$: unknown, e: { path: string }) => {
    cli.reads.push(e.path)
    if (e.path.startsWith('/tmp/datatug-claude-mod/')) return { value: cli.capture }
    const text = cli.files[e.path]
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('tool.call', { tool: 'Bash' }, (_$: unknown, e: { command: string }) => {
    cli.bash.push(e.command)
    return cli.bashAnswer(e.command)
  })
  return cli
}

export const toolUse = (id: string, command: string, surface = 'terminal') => ({
  plugin: 'datatug',
  surface,
  component: 'ToolUse',
  requestId: id,
  props: { tool_use_id: id, tool: 'Bash', input: { command }, isRunning: false, isErrored: false, isInterrupted: false },
})
