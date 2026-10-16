import { expect, test } from 'claude-code/testing'

import { DATA_COLUMNS, REF, ROOT, dataDoc, fakeWorld, locator, result, toolUse } from './card-fixtures'

const CMD = 'datatug query run --db datatug://demo/chinook --from Album --no-policies'
const run = ($: any, id: string, command = CMD, extra: Record<string, unknown> = {}) => $.tool.call({ tool: 'Bash', tool_use_id: id, command, ...extra } as never)
const text = async (tree: any) => JSON.stringify(await tree.drawn())
const fp = (s: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
const key = (id: string, ...parts: (string | number)[]) => `qr:${fp(id)}:${parts.join(':')}`

test('the plain form gets --result-id and --format json right after query run, with no redirect', async ($, on) => {
  const cli = fakeWorld(on, { ...result('t1'), ...result('t2'), ...result('t3'), ...result('t4') })
  await run($, 't1')
  await run($, 't2', 'env X=1 datatug query run --db a --from T')
  await run($, 't3', '/usr/local/bin/datatug query run --db a --from T --format json')
  await run($, 't4', 'datatug query run --project demo --query customers/customer-invoices --as u1 --var CustomerId=2')
  expect(cli.bash).toEqual([
    'datatug query run --result-id t1 --format json --db datatug://demo/chinook --from Album --no-policies',
    'env X=1 datatug query run --result-id t2 --format json --db a --from T',
    '/usr/local/bin/datatug query run --result-id t3 --db a --from T --format json',
    'datatug query run --result-id t4 --format json --project demo --query customers/customer-invoices --as u1 --var CustomerId=2',
  ])
  // The version and the store are asked once per session, and the files are found by asking the CLI.
  expect(cli.runs.filter(a => a[1] === '--version')).toHaveLength(1)
  expect(cli.runs.filter(a => a.join(' ') === 'datatug query results check --format json')).toHaveLength(1)
  expect(cli.runs.filter(a => a[2] === 'results' && a[3] === 'locate').map(a => a[5])).toEqual(['t1', 't2', 't3', 't4'])
})

test('the model reads a summary of names only: no value, id, path, link or command', async ($, on) => {
  const id = 'toolu_res_42'
  const cli = fakeWorld(on, result(id))
  const out = JSON.stringify(await run($, id))
  for (const word of ['3 rows', 'InvoiceId', 'CustomerId', 'FirstName', 'Invoice', 'Customer', 'InvoiceLine', 'Employee']) expect(out).toContain(word)
  for (const word of ['SECRET-ALICE', 'Bob', '9007199254740993', id, ROOT, 'query-results', 'datatug.app', 'datatug ui', 'resultFiles', 'c0de']) expect({ word, found: out.includes(word) }).toEqual({ word, found: false })
  expect(cli.reads).toEqual([`${ROOT}/${id}/meta.json`, `${ROOT}/${id}/data.json`])
})

test('the summary says at least N+1 when more rows exist, and cuts long lists', async ($, on) => {
  const cols = Array.from({ length: 45 }, (_, i) => ({ name: `c${i}`, type: 'string' }))
  const data = dataDoc('m1', cols, [cols.map(() => 'v')])
  fakeWorld(on, result('m1', { kept: 2000, hasMore: true, columns: cols.map(c => ({ ...c, declaredType: null, nullable: null, pk: null, source: null, foreignKeys: [] })), data }))
  const out = JSON.stringify(await run($, 'm1'))
  expect(out).toContain('2000 rows (at least 2001 exist')
  expect(out).toContain('and 5 more')
})

for (const surface of ['terminal', 'desktop']) {
  test(`a press switches only its own card's view (${surface})`, async ($, on) => {
    const cli = fakeWorld(on, { ...result('a1'), ...result('a2') })
    await run($, 'a1')
    await run($, 'a2')
    const first = await $.ui.mount(toolUse('a1', CMD, surface) as never)
    const second = await $.ui.mount(toolUse('a2', CMD, surface) as never)
    const before = await text(first)
    const renders = cli.renders.a1
    expect(await text(second)).toContain('● Table')
    expect(await text(second)).toContain('SECRET-ALICE')
    await second.press({ key: key('a2', 'view', 'record') } as never)
    let drawn = await text(second)
    expect(drawn).toContain('● Record')
    expect(drawn).toContain('○ Table')
    expect(drawn).toContain('Row 1 of 3')
    await second.press({ key: key('a2', 'next') } as never)
    drawn = await text(second)
    expect(drawn).toContain('Row 2 of 3')
    expect(drawn).toContain('Bob')
    await second.press({ key: key('a2', 'view', 'columns') } as never)
    drawn = await text(second)
    expect(drawn).toContain('● Columns')
    expect(drawn).toContain('"int"')
    expect(drawn).toContain('🔑')
    expect(drawn).toContain('computed')
    await second.press({ key: key('a2', 'view', 'sources') } as never)
    drawn = await text(second)
    expect(drawn).toContain('● Sources')
    expect(drawn).toContain('i.CustomerId = c.CustomerId')
    // A side-panel Records card opened in between redraws no card.
    await second.press({ key: key('a2', 'sr', 1) } as never)
    await second.press({ key: key('a2', 'view', 'related') } as never)
    drawn = await text(second)
    expect(drawn).toContain('● Related')
    expect(drawn).toContain('← referenced by')
    expect(drawn).toContain('Invoice.InvoiceId = InvoiceLine.InvoiceId')
    expect(drawn).toContain('Customer.SupportRepId = Employee.EmployeeId')
    expect(cli.renders.a1).toBe(renders)
    expect(await text(first)).toBe(before)
  })
}

test('a row number opens that row in the Record view of the same card', async ($, on) => {
  fakeWorld(on, result('r1'))
  await run($, 'r1')
  const tree = await $.ui.mount(toolUse('r1', CMD) as never)
  const drawn = await text(tree)
  expect(drawn.includes('$key')).toBe(false)
  expect(drawn).toContain('9007199254740993')
  // The number is a Button, not a link: nothing in the card carries the placeholder address.
  expect(drawn.includes('datatug.invalid')).toBe(false)
  expect((await tree.findAll({ type: 'Link' } as never)).filter((l: any) => !JSON.stringify(l).includes('datatug.app'))).toHaveLength(0)
  expect(await tree.findAll({ type: 'Markdown' } as never)).toHaveLength(0)
  expect(drawn).toContain(key('r1', 'row', 2))
  await tree.press({ key: key('r1', 'row', 2) } as never)
  const rec = await text(tree)
  expect(rec).toContain('Row 3 of 3')
  expect(rec).toContain('Carol')
  expect(rec.includes('datatug.invalid')).toBe(false)
})

test('the Record view offers Open row in DataTug, from the same link call as the table link', async ($, on) => {
  const cli = fakeWorld(on, result('o1'))
  await run($, 'o1')
  const tree = await $.ui.mount(toolUse('o1', CMD) as never)
  let drawn = await text(tree)
  expect(drawn).toContain('Open in DataTug')
  expect(drawn.includes('Open row in DataTug')).toBe(false)
  await tree.press({ key: key('o1', 'row', 1) } as never)
  await text(tree)
  drawn = await text(tree)
  expect(drawn).toContain('Open row in DataTug')
  expect(drawn).toContain('result/o1?view=record&row=2#code=c0de')
  expect(cli.runs.some(a => a.join(' ') === 'datatug daemon url --result o1 --view=record --row 2 --format json')).toBe(true)
  // No code is drawn anywhere but in the link, and no press minted one beyond the view's own ask.
  expect(cli.logs.join(' ').includes('c0de')).toBe(false)
  expect(cli.toasts.join(' ').includes('c0de')).toBe(false)
})

test('the transcript card has a border, inner padding and an outer margin; the panel adds no second frame', async ($, on) => {
  fakeWorld(on, result('b1'))
  await run($, 'b1')
  const tree = await $.ui.mount(toolUse('b1', CMD) as never)
  const frame = (await tree.findAll({ type: 'Box' } as never)).map((b: any) => b.props ?? {}).find((p: any) => p.borderStyle === 'round' && p.paddingX === 1 && p.marginTop === 1 && p.marginBottom === 1)
  expect(frame).toBeDefined()
  const pane = await $.ui.mount({ plugin: 'datatug', surface: 'terminal', component: 'Pane', requestId: 'datatug', props: { bodyColumns: 100 } } as never)
  const margins = (await pane.findAll({ type: 'Box' } as never)).filter((b: any) => b.props?.marginTop === 1 && b.props?.marginBottom === 1 && b.props?.borderStyle === 'round')
  expect(margins).toHaveLength(0)
})

test('the terminal command is a labelled section: a blank line above, a dim frame, Copy under it, and the link row apart', async ($, on) => {
  fakeWorld(on, result('c1'))
  await run($, 'c1')
  const tree = await $.ui.mount(toolUse('c1', CMD) as never)
  const boxes = (await tree.findAll({ type: 'Box' } as never)).map((b: any) => b.props ?? {})
  expect(boxes.some((p: any) => p.marginTop === 1 && p.flexDirection === 'column' && !p.borderStyle)).toBe(true)
  expect(boxes.some((p: any) => p.borderStyle === 'round' && p.borderDimColor === true)).toBe(true)
  const drawn = await text(tree)
  const at = (needle: string) => drawn.indexOf(needle)
  expect(at('Open in DataTug')).toBeGreaterThan(-1)
  expect(at('Check again')).toBeGreaterThan(at('Open in DataTug'))
  expect(at('Open these records in the DataTug terminal UI')).toBeGreaterThan(at('Check again'))
  expect(at('datatug ui --result c1')).toBeGreaterThan(at('Open these records'))
  expect(at(key('c1', 'copy'))).toBeGreaterThan(at('datatug ui --result c1'))
  expect(drawn.includes('terminal UI:')).toBe(false)
})

test('the row of a call with a card does not draw the model-facing sentence; the model keeps it', async ($, on) => {
  const cli = fakeWorld(on, result('m1'))
  const told = JSON.stringify(await run($, 'm1'))
  expect(told).toContain('withheld from you')
  expect(told.includes('ask the user')).toBe(false)
  const props = { ...toolUse('m1', CMD).props, output: { stdout: 'DataTug query returned 3 rows. The rows are shown to the user in a DataTug result card and are withheld from you.', stderr: '' } }
  await $.ui.mount({ ...toolUse('m1', CMD), props } as never)
  expect(JSON.stringify(cli.outputs.m1)).not.toContain('withheld')
  expect(JSON.stringify(cli.outputs.m1)).toContain('result card is below')
  // A call without a card keeps its output as it was.
  await $.ui.mount({ ...toolUse('m2', 'ls'), props: { ...toolUse('m2', 'ls').props, output: { stdout: 'a b', stderr: '' } } } as never)
  expect(JSON.stringify(cli.outputs.m2)).toContain('a b')
  const res = { plugin: 'datatug', surface: 'terminal', component: 'ToolResult', requestId: 'm1', props: { tool_use_id: 'm1', tool: 'Bash', output: props.output, isErrored: false } }
  await $.ui.mount(res as never)
  expect(JSON.stringify(cli.resultOutputs.m1)).not.toContain('withheld')
})

test('names open the side-panel cards through the result reference, never the opened database', async ($, on) => {
  const cli = fakeWorld(on, result('p1'))
  await run($, 'p1')
  const tree = await $.ui.mount(toolUse('p1', CMD) as never)
  const pane = await $.ui.mount({ plugin: 'datatug', surface: 'terminal', component: 'Pane', requestId: 'datatug', props: { bodyColumns: 100 } } as never)
  // Another database is open in the panel, by a connection string with a password.
  await pane.input({ key: 'opendb-input', text: 'postgres://app:pw-s3cret@db.example/shop', kind: 'submit' } as never)
  expect(await text(pane)).toContain('card-database')
  await tree.press({ key: key('p1', 'view', 'sources') } as never)
  await tree.press({ key: key('p1', 'st', 1) } as never)
  let panel = await text(pane)
  expect(panel).toContain('card-detail')
  expect(panel).toContain('"Customer"')
  expect(panel).toContain('FirstName')
  expect(panel.includes('Wrong')).toBe(false)
  await tree.press({ key: key('p1', 'view', 'related') } as never)
  await tree.press({ key: key('p1', 'rt', 0) } as never)
  panel = await text(pane)
  expect(panel).toContain('InvoiceLineId')
  await tree.press({ key: key('p1', 'rr', 0) } as never)
  const argv = cli.spawns[cli.spawns.length - 1]
  expect(argv[argv.indexOf('--db') + 1]).toBe(REF)
  expect(argv[argv.indexOf('--from') + 1]).toBe('InvoiceLine')
  expect(JSON.stringify(cli.spawns).includes('DATATUG_OPEN_DB')).toBe(false)
  expect(JSON.stringify(cli.spawns).includes('pw-s3cret')).toBe(false)
  expect(await text(pane)).toContain('card-dbrecords')
  await tree.press({ key: key('p1', 'view', 'columns') } as never)
  await tree.press({ key: key('p1', 'cn', 1) } as never)
  panel = await text(pane)
  expect(panel).toContain('"Column"')
  expect(panel).toContain('CustomerId')
  // No press ran the query again.
  expect(cli.bash).toHaveLength(1)
})

test('a result whose database is in no project draws names as text with the hint', async ($, on) => {
  fakeWorld(on, result('n1', { ref: null }))
  await run($, 'n1')
  const tree = await $.ui.mount(toolUse('n1', CMD) as never)
  await tree.press({ key: key('n1', 'view', 'sources') } as never)
  const drawn = await text(tree)
  expect(drawn).toContain('Add this database to a project to open its tables')
  expect(drawn.includes(key('n1', 'st', 0))).toBe(false)
  expect(drawn.includes(key('n1', 'sr', 0))).toBe(false)
})

test('a federated participant opens its own database', async ($, on) => {
  const parts = [
    { instance: 'root', schema: 'main', relation: 'Invoice', alias: '', kind: 'table', role: 'from' },
    { instance: 'o', schema: 'main', relation: 'Customer', alias: 'o', kind: 'table', role: 'join', db: 'datatug://demo/other?env=local' },
  ]
  const cli = fakeWorld(on, result('f1', { participants: parts }))
  await run($, 'f1')
  const tree = await $.ui.mount(toolUse('f1', CMD) as never)
  const pane = await $.ui.mount({ plugin: 'datatug', surface: 'terminal', component: 'Pane', requestId: 'datatug', props: { bodyColumns: 100 } } as never)
  await tree.press({ key: key('f1', 'view', 'sources') } as never)
  await tree.press({ key: key('f1', 'st', 1) } as never)
  expect(await text(pane)).toContain('Wrong')
  await tree.press({ key: key('f1', 'sr', 1) } as never)
  const argv = cli.spawns[cli.spawns.length - 1]
  expect(argv[argv.indexOf('--db') + 1]).toBe('datatug://demo/other?env=local')
})

test('a native SQL saved query shows its rows and says its sources are not known', async ($, on) => {
  fakeWorld(on, result('s1', { participants: [], related: [], unavailable: { participants: 'native-sql', related: 'native-sql' } }))
  await run($, 's1', 'datatug query run --project demo --query reports/by-sql')
  const tree = await $.ui.mount(toolUse('s1', 'datatug query run --project demo --query reports/by-sql') as never)
  expect(await text(tree)).toContain('SECRET-ALICE')
  await tree.press({ key: key('s1', 'view', 'sources') } as never)
  expect(await text(tree)).toContain('Sources are not known for a native SQL query')
  await tree.press({ key: key('s1', 'view', 'related') } as never)
  expect(await text(tree)).toContain('Sources are not known for a native SQL query')
})

test('a provider without relationship metadata says no related tables were found', async ($, on) => {
  fakeWorld(on, result('h1', { related: [], unavailable: { related: 'no-relationship-metadata' } }))
  await run($, 'h1')
  const tree = await $.ui.mount(toolUse('h1', CMD) as never)
  await tree.press({ key: key('h1', 'view', 'related') } as never)
  expect(await text(tree)).toContain('No related tables found')
})

test('a bad locate answer is never read and the card names the state', async ($, on) => {
  const id = 'b1'
  const cases: [Record<string, unknown>, string][] = [
    [{ locate: () => locator('other') }, 'not readable'],
    [{ locate: () => JSON.stringify({ resultFiles: { version: 1, id, root: ROOT, data: '/etc/passwd', meta: `${ROOT}/${id}/meta.json` } }) }, 'not readable'],
    [{ locate: () => JSON.stringify({ resultFiles: { version: 1, id, root: ROOT, data: `${ROOT}/${id}/data.json`, meta: `${ROOT}/${id}/../other/meta.json` } }) }, 'not readable'],
    [{ locate: () => JSON.stringify({ resultFiles: { version: 1, id, root: `${ROOT}/../x`, data: `${ROOT}/../x/${id}/data.json`, meta: `${ROOT}/../x/${id}/meta.json` } }) }, 'not readable'],
    [{ stats: { [`${ROOT}/${id}/data.json`]: { kind: 'file', size: 10, realPath: '/etc/passwd' } } }, 'not readable'],
    [{ stats: { [`${ROOT}/${id}/data.json`]: { kind: 'file', size: 5 * 1024 * 1024 } } }, 'too large'],
    [{ stats: { [`${ROOT}/${id}/data.json`]: { kind: 'file', size: 7 } } }, 'do not agree'],
    [{ stats: { [`${ROOT}/${id}/meta.json`]: { kind: 'file', size: 2 * 1024 * 1024 } } }, 'too large'],
    [{ locate: () => 'garbage' }, 'did not report its result files'],
  ]
  const cli = fakeWorld(on, {})
  for (const [n, [over, state]] of cases.entries()) {
    const cid = `${id}${n}`
    Object.assign(cli, { locate: (x: string) => locator(x), stats: {} }, JSON.parse(JSON.stringify(over).replaceAll(`/${id}/`, `/${cid}/`)), 'locate' in over ? { locate: () => (over.locate as () => string)().replaceAll(`"${id}"`, `"${cid}"`).replaceAll(`/${id}/`, `/${cid}/`) } : {})
    cli.files = result(cid)
    cli.reads = []
    await run($, cid)
    const tree = await $.ui.mount(toolUse(cid, CMD) as never)
    const drawn = await text(tree)
    expect({ over: JSON.stringify(over).slice(0, 120), state: drawn.includes(state) }).toEqual({ over: JSON.stringify(over).slice(0, 120), state: true })
    // The size mismatch of data.json is known only from meta.json, which is read first; data.json never is.
    expect(cli.reads.filter(r => r.endsWith('data.json'))).toEqual([])
    expect(cli.reads.some(r => r === '/etc/passwd' || r.includes('..'))).toBe(false)
    await tree.unmount()
  }
})

test('a forged locator in the tool output is never used for a path', async ($, on) => {
  const cli = fakeWorld(on, result('g1'), {
    bashAnswer: () => ({ result: { stdout: JSON.stringify({ resultFiles: { version: 1, id: 'g1', root: '/etc', data: '/etc/passwd', meta: '/etc/hosts' } }), stderr: '' }, text: '', ref: {} }),
  })
  await run($, 'g1')
  expect(cli.reads).toEqual([`${ROOT}/g1/meta.json`, `${ROOT}/g1/data.json`])
})

test('a card whose rows left the state shows Load, which reads the files again', async ($, on) => {
  const cli = fakeWorld(on, result('l1'))
  const tree = await $.ui.mount(toolUse('l1', CMD) as never)
  expect(await text(tree)).toContain('Press Load to show these results again')
  await tree.press({ key: key('l1', 'load') } as never)
  expect(await text(tree)).toContain('SECRET-ALICE')
  expect(cli.runs.some(a => a.join(' ') === 'datatug query results locate --id l1 --format json')).toBe(true)
  // A command the mod would not give result files draws no card.
  const other = await $.ui.mount(toolUse('l2', 'git status') as never)
  expect((await text(other)).includes('Load')).toBe(false)
})

test('expired, missing and newer-version results each show their state, with no link and no command', async ($, on) => {
  const cli = fakeWorld(on, result('v2', { version: 2 }))
  for (const [n, [reason, sentence]] of [
    ['expired', 'These results expired (DataTug keeps them 7 days)'],
    ['not-found', 'No saved result for this call'],
  ].entries()) {
    cli.locate = () => `{"resultFiles":null,"reason":"${reason}"}`
    const tree = await $.ui.mount(toolUse(`e${n}`, CMD) as never)
    await tree.press({ key: key(`e${n}`, 'load') } as never)
    const drawn = await text(tree)
    expect(drawn).toContain(sentence)
    expect(drawn.includes('datatug ui')).toBe(false)
    expect(drawn.includes('datatug.app')).toBe(false)
    await tree.unmount()
  }
  cli.locate = (x: string) => locator(x)
  await run($, 'v2')
  const tree = await $.ui.mount(toolUse('v2', CMD) as never)
  expect(await text(tree)).toContain('Update the DataTug mod')
  expect(cli.reads.filter(r => r.endsWith('data.json'))).toEqual([])
})

test('only the last ten cards keep their rows', async ($, on) => {
  const files = Object.assign({}, ...Array.from({ length: 11 }, (_, i) => result(`k${i}`)))
  fakeWorld(on, files)
  for (let i = 0; i < 11; i++) await run($, `k${i}`)
  expect(await text(await $.ui.mount(toolUse('k0', CMD) as never))).toContain('Press Load')
  expect(await text(await $.ui.mount(toolUse('k1', CMD) as never))).toContain('SECRET-ALICE')
})

test('a query moved to the background shows Load', async ($, on) => {
  const cli = fakeWorld(on, result('bg'), { bashAnswer: () => ({ result: { stdout: '', stderr: '', backgroundTaskId: 'b1', interrupted: false }, text: '', ref: {} }) })
  const out = JSON.stringify(await run($, 'bg'))
  expect(out).toContain('background')
  expect(cli.reads).toEqual([])
  expect(await text(await $.ui.mount(toolUse('bg', CMD) as never))).toContain('Press Load')
})

test('an older CLI keeps the private capture and the grid, with the update line and no link or command', async ($, on) => {
  const cli = fakeWorld(on, {}, { version: '0.91.0' })
  const out = JSON.stringify(await run($, 'o1'))
  expect(cli.bash[0]).toContain("(set -C; datatug query run --format json --db datatug://demo/chinook --from Album --no-policies > '/tmp/datatug-claude-mod/o1.json')")
  expect(cli.bash[0].includes('--result-id')).toBe(false)
  expect(cli.runs.some(a => a[0] === 'rm' && a[2] === '/tmp/datatug-claude-mod/o1.json')).toBe(true)
  expect(out.includes('SECRET-ALICE')).toBe(false)
  const drawn = await text(await $.ui.mount(toolUse('o1', CMD) as never))
  expect(drawn).toContain('Update the DataTug CLI for the Record, Columns, Sources and Related views')
  expect(drawn).toContain('| # | name |')
  expect(drawn.includes('● Table')).toBe(false)
  expect(drawn.includes('datatug ui')).toBe(false)
})

test('a version probe that fails takes the private capture', async ($, on) => {
  const cli = fakeWorld(on, {}, { version: new Error('no datatug') })
  await run($, 'o2')
  expect(cli.bash[0]).toContain('(set -C; ')
})

test('a development build (no readable version) is taken as new', async ($, on) => {
  const cli = fakeWorld(on, result('d1'), { version: 'datatug dev' })
  await run($, 'd1')
  expect(cli.bash[0]).toContain('--result-id d1')
})

test('an unknown --result-id from the shell turns the session legacy; a typo does not', async ($, on) => {
  const answers: unknown[] = [
    { isError: true, result: { stdout: '', stderr: 'unknown flag: --formt' }, text: '\n   ERROR\n\n  unknown flag: --formt.\n', ref: {} },
    { isError: true, result: { stdout: '', stderr: '' }, text: '  unknown flag: --result-id\n', ref: {} },
    { result: { stdout: '', stderr: '' }, text: '', ref: {} },
  ]
  const cli = fakeWorld(on, result('u1'), { bashAnswer: () => answers.shift() })
  const typo = JSON.stringify(await run($, 'u0', 'datatug query run --db a --from T --formt json'))
  expect(typo).toContain('--formt')
  const old = JSON.stringify(await run($, 'u1'))
  expect(old).toContain('DataTug is older than the mod expects; run the query again')
  await run($, 'u2')
  expect(cli.bash[0]).toContain('--result-id u0')
  expect(cli.bash[1]).toContain('--result-id u1')
  expect(cli.bash[2]).toContain('(set -C; ')
})

test('a sandboxed shell that cannot write the store turns the session legacy and the card says why', async ($, on) => {
  const answers: unknown[] = [
    { isError: true, result: { stdout: '{"resultFiles":null,"reason":"results-store-unwritable"}', stderr: '' }, text: 'Exit code 2\n{"resultFiles":null,"reason":"results-store-unwritable"}\n', ref: {} },
    { result: { stdout: '', stderr: '' }, text: '', ref: {} },
  ]
  const cli = fakeWorld(on, {}, { bashAnswer: () => answers.shift() })
  const out = JSON.stringify(await run($, 'w1'))
  expect(out).toContain('Run the query again')
  expect(await text(await $.ui.mount(toolUse('w1', CMD) as never))).toContain("Allow DataTug's result store (~/.datatug/query-results) in the sandbox's writable paths")
  await run($, 'w2')
  expect(cli.bash[1]).toContain('(set -C; ')
  expect(await text(await $.ui.mount(toolUse('w2', CMD) as never))).toContain("Allow DataTug's result store")
})

test('an unusable store found by the check sends the session through the capture and names the reason', async ($, on) => {
  const cli = fakeWorld(on, {}, { check: '{"usable":false,"reason":"inside-git"}' })
  await run($, 'i1')
  expect(cli.bash[0]).toContain('(set -C; ')
  expect(await text(await $.ui.mount(toolUse('i1', CMD) as never))).toContain('your home directory is a Git repository')
})

test('the link follows the view, and the command is drawn with Copy', async ($, on) => {
  const cli = fakeWorld(on, result('w9'))
  await run($, 'w9')
  const tree = await $.ui.mount(toolUse('w9', CMD) as never)
  let drawn = await text(tree)
  expect(drawn).toContain('https://datatug.app/store/http-127.0.0.1:7777/result/w9?view=table#code=c0de')
  expect(drawn).toContain('datatug ui --result w9')
  await tree.press({ key: key('w9', 'view', 'sources') } as never)
  drawn = await text(tree)
  expect(drawn).toContain('result/w9?view=sources#code=c0de')
  await tree.press({ key: key('w9', 'view', 'record') } as never)
  await tree.press({ key: key('w9', 'next') } as never)
  expect(await text(tree)).toContain('result/w9?view=record&row=2#code=c0de')
  expect(cli.runs.some(a => a.join(' ') === 'datatug daemon url --result w9 --view=record --row 2 --format json')).toBe(true)
  await tree.press({ key: key('w9', 'copy') } as never)
  expect(cli.toasts).toEqual([])
  cli.copied = false
  await tree.press({ key: key('w9', 'copy') } as never)
  expect(cli.toasts.join(' ')).toContain('Select the command to copy it')
})

test('the link line says why there is no link', async ($, on) => {
  const cli = fakeWorld(on, {})
  const base = { contract: 1, kind: 'query-result', running: true, uiSupport: 'available', resultExists: true, warnings: [] }
  for (const [link, line] of [
    [{ ...base, uiSupport: 'pending', url: 'https://datatug.app/store/http-127.0.0.1:7777/result/x1?view=table#code=c' }, 'cannot open this view yet'],
    [{ ...base, running: false, url: 'https://datatug.app/store/http-127.0.0.1:7777/result/x1?view=table#code=c' }, 'not running'],
    [{ ...base, resultExists: false }, 'no saved result'],
    [{ ...base, url: 'https://evil.example/store/http-127.0.0.1:7777/result/x1?view=table#code=c' }, 'development web UI'],
    [{ ...base, url: 'https://datatug.app/store/http-127.0.0.1:7777/result/x2?view=table#code=c' }, 'did not give a link'],
    [{ ...base, url: 'https://datatug.app/store/http-127.0.0.1:7777/result/x1?view=table&db=chinook#code=c' }, 'did not give a link'],
  ] as [unknown, string][]) {
    cli.link = () => link
    cli.files = result('x1')
    await run($, 'x1')
    const tree = await $.ui.mount(toolUse('x1', CMD) as never)
    const drawn = await text(tree)
    expect({ line, ok: drawn.includes(line) }).toEqual({ line, ok: true })
    expect(drawn.includes('"Link"')).toBe(false)
    await tree.unmount()
  }
})

test('a remote surface gets the same-machine line and no daemon url call', async ($, on) => {
  const cli = fakeWorld(on, result('y1'))
  await run($, 'y1')
  const drawn = await text(await $.ui.mount(toolUse('y1', CMD, 'desktop') as never))
  expect(drawn).toContain('works only on the machine that runs the agent')
  expect(drawn).toContain('datatug ui --result y1')
  expect(cli.runs.some(a => a[1] === 'daemon')).toBe(false)
})

test('a CLI with the card but not the open-elsewhere commands draws no link and no command', async ($, on) => {
  const cli = fakeWorld(on, result('z1'), { version: '0.93.0' })
  await run($, 'z1')
  const drawn = await text(await $.ui.mount(toolUse('z1', CMD) as never))
  expect(drawn).toContain('● Table')
  expect(drawn.includes('datatug ui')).toBe(false)
  expect(cli.runs.some(a => a[1] === 'daemon')).toBe(false)
})

test('hostile names are drawn as text and never reach the link or the command', async ($, on) => {
  const cols = [
    { name: 'x](https://evil.example)', type: 'string' },
    { name: 'a\u001b[2Jb', type: 'string' },
    { name: '`rm -rf ~`', type: 'string' },
  ]
  const metaCols = cols.map(c => ({ ...c, declaredType: 'text', nullable: true, pk: null, source: { instance: 'root', schema: 'main', relation: 'x](https://evil.example)', column: c.name }, foreignKeys: [] }))
  const parts = [{ instance: 'root', schema: 'main', relation: 'x](https://evil.example)', alias: '', kind: 'table', role: 'from' }]
  const cli = fakeWorld(on, result('j1', { columns: metaCols, participants: parts, related: [], data: dataDoc('j1', cols, [['[y](https://evil.example/b)', 'v\u001b]0;t\u0007', '<b>']]) }))
  await run($, 'j1')
  const tree = await $.ui.mount(toolUse('j1', CMD) as never)
  for (const v of ['table', 'record', 'columns', 'sources', 'related']) {
    await tree.press({ key: key('j1', 'view', v) } as never)
    const drawn = await text(tree)
    expect({ v, markdown: (await tree.findAll({ type: 'Markdown' } as never)).length }).toEqual({ v, markdown: 0 })
    // The table breaks a web address so no terminal links it.
    if (v === 'table') {
      expect(drawn).toContain('evil.example')
      expect(drawn.includes('https://evil.example')).toBe(false)
    }
    expect({ v, href: (await tree.findAll({ type: 'Link' } as never)).some((l: any) => JSON.stringify(l).includes('evil')) }).toEqual({ v, href: false })
    expect({ v, control: /\\u001b|\\u0007/.test(drawn) }).toEqual({ v, control: false })
  }
  const asked = cli.runs.filter(a => a[1] === 'daemon').map(a => a.join(' '))
  expect(asked.length).toBeGreaterThan(0)
  expect(asked.some(a => a.includes('evil') || a.includes('rm -rf'))).toBe(false)
  expect((await text(tree)).includes('datatug ui --result j1')).toBe(true)
})

test('fifty rows of ten wide escapable columns stay well under the drawing bound', async ($, on) => {
  const cols = Array.from({ length: 10 }, (_, i) => ({ name: `c${i}`, type: 'string' }))
  const rows = Array.from({ length: 120 }, () => cols.map(() => '|*_`<>&'.repeat(10)))
  fakeWorld(on, result('big', { kept: 120, columns: cols.map(c => ({ ...c, declaredType: null, nullable: null, pk: null, source: null, foreignKeys: [] })), data: dataDoc('big', cols, rows) }))
  await run($, 'big')
  const tree = await $.ui.mount(toolUse('big', CMD) as never)
  expect(await text(tree)).toContain('Show 30 more')
  await tree.press({ key: key('big', 'more') } as never)
  const md = await text(tree)
  expect(md.length).toBeGreaterThan(1000)
  expect(md.length).toBeLessThan(400000)
  expect(md).toContain(key('big', 'row', 49))
  await tree.press({ key: key('big', 'next50') } as never)
  const page2 = await text(tree)
  expect(page2).toContain(key('big', 'row', 50))
  expect(page2.includes(key('big', 'row', 49))).toBe(false)
  expect(await text(tree)).toContain('◀ Prev 50')
})

test('the model cannot read the store through its own tools while cards are drawn', async ($, on) => {
  fakeWorld(on, result('q1'))
  await run($, 'q1')
  const out = JSON.stringify(await $.tool.call({ tool: 'Read', tool_use_id: 'r9', file_path: `${ROOT}/q1/data.json` } as never))
  expect(out).toContain('shown in the card, not to Claude')
  expect(DATA_COLUMNS.length).toBe(5)
})

test('a size that disagrees with meta.json says the files are inconsistent, not too large', async ($, on) => {
  const cli = fakeWorld(on, result('n1'), { stats: { [`${ROOT}/n1/data.json`]: { kind: 'file', size: 7 } } })
  await run($, 'n1')
  const drawn = await text(await $.ui.mount(toolUse('n1', CMD) as never))
  expect(drawn).toContain('The result files do not agree with each other')
  expect(drawn).not.toContain('too large')
  expect(cli.reads.filter(r => r.endsWith('data.json'))).toEqual([])
})

test('each file is read at the resolved path that was checked', async ($, on) => {
  const files = result('s1')
  const real = '/real/store'
  const cli = fakeWorld(
    on,
    Object.fromEntries(Object.entries(files).map(([k, v]) => [k.replace(ROOT, real), v])),
    {
      stats: {
        [ROOT]: { kind: 'dir', realPath: real },
        [`${ROOT}/s1/meta.json`]: { kind: 'file', size: files[`${ROOT}/s1/meta.json`].length, realPath: `${real}/s1/meta.json` },
        [`${ROOT}/s1/data.json`]: { kind: 'file', size: files[`${ROOT}/s1/data.json`].length, realPath: `${real}/s1/data.json` },
      },
    },
  )
  await run($, 's1')
  expect(await text(await $.ui.mount(toolUse('s1', CMD) as never))).toContain('SECRET-ALICE')
  expect(cli.reads).toEqual([`${real}/s1/meta.json`, `${real}/s1/data.json`])
})

test('a CLI with --result-view gets it, an older one keeps --view=', async ($, on) => {
  const cli = fakeWorld(on, result('rv1'), { version: '0.98.0' })
  await run($, 'rv1')
  const tree = await $.ui.mount(toolUse('rv1', CMD) as never)
  await text(tree)
  expect(cli.runs.some(a => a.join(' ') === 'datatug daemon url --result rv1 --result-view table --format json')).toBe(true)
  expect(cli.runs.some(a => a.some(x => x.startsWith('--view=')))).toBe(false)
})
