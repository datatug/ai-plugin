import { expect, test } from 'claude-code/testing'

import { dataDoc, fakeWorld, result, toolUse } from './card-fixtures'
import { nextSort, sortedOrder, toCsv, toJson } from '../lib/rows.js'

const CMD = 'datatug query run --db datatug://demo/chinook --from Album --no-policies'
const run = ($: any, id: string, command = CMD) => $.tool.call({ tool: 'Bash', tool_use_id: id, command } as never)
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
const PANE_ARGS = { plugin: 'datatug', surface: 'terminal', component: 'Pane', requestId: 'datatug', props: { bodyColumns: 100 } }
// The text of cell `col` of drawn rows 0..n-1, as the grid shows them.
const colCells = (drawn: string, id: string, col: number, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const m = drawn.match(new RegExp(`"key":"${key(id, 'c', i, col)}"[^]*?"children":\\["([^"]*)"\\]`))
    return m === null ? '' : m[1]
  })
const plain = (cols: { name: string; type: string }[]) => cols.map(c => ({ ...c, declaredType: null, nullable: null, pk: null, source: null, foreignKeys: [] }))

test('the header names what the card is: source, database and environment, rows and columns', async ($, on) => {
  fakeWorld(on, result('h1'))
  await run($, 'h1')
  const drawn = await text(await $.ui.mount(toolUse('h1', CMD) as never))
  expect(drawn).toContain('Invoice, Customer · chinook (local) · 3 rows x 4 columns (shown to you, not to Claude)')
})

test('the header for a native SQL query and a cut result; a database in no project has no database part', async ($, on) => {
  fakeWorld(on, { ...result('s2', { participants: [], related: [], unavailable: { participants: 'native-sql' }, ref: null }), ...result('s3', { hasMore: true, kept: 3 }) })
  for (const id of ['s2', 's3']) await run($, id)
  const s2 = await text(await $.ui.mount(toolUse('s2', CMD) as never))
  expect(s2).toContain('SQL query · 3 rows x 4 columns')
  expect(s2).not.toContain('chinook')
  expect(await text(await $.ui.mount(toolUse('s3', CMD) as never))).toContain('3 rows (at least 4) x 4 columns')
})

test('the header names a saved query by its id', async ($, on) => {
  const files = result('s1')
  const path = Object.keys(files).find(f => f.endsWith('meta.json')) as string
  const meta = JSON.parse(files[path])
  meta.query = { kind: 'saved', savedQueryId: 'customers/customer-invoices', policy: 'none' }
  files[path] = JSON.stringify(meta)
  fakeWorld(on, files)
  await run($, 's1')
  expect(await text(await $.ui.mount(toolUse('s1', CMD) as never))).toContain('Saved query customers/customer-invoices · chinook (local)')
})

test('a hostile name in the header cannot make a link', async ($, on) => {
  fakeWorld(on, result('h2', { participants: [{ instance: 'root', schema: 'main', relation: 'x](https://evil.example)', alias: '', kind: 'table', role: 'from' }] }))
  await run($, 'h2')
  const drawn = await text(await $.ui.mount(toolUse('h2', CMD) as never))
  expect(drawn.includes('https://evil.example')).toBe(false)
  expect(drawn).toContain('evil.example')
})

test('the transcript notice is said once per session, not after every query', async ($, on) => {
  const cli = fakeWorld(on, { ...result('o1'), ...result('o2'), ...result('o3') })
  await run($, 'o1')
  await run($, 'o2')
  await run($, 'o3')
  expect(cli.logs).toHaveLength(1)
  expect(cli.logs[0]).toContain('result card above')
  // The panel is still opened for each result.
  expect(cli.opened).toEqual(['datatug', 'datatug', 'datatug'])
})

test('an unplaced panel is told once, with /datatug', async ($, on) => {
  const cli = fakeWorld(on, { ...result('o4'), ...result('o5') })
  cli.placed = false
  await run($, 'o4')
  await run($, 'o5')
  expect(cli.logs).toHaveLength(1)
  expect(cli.logs[0]).toContain('/datatug')
})

test('Link and Check again sit on the header row, top right', async ($, on) => {
  fakeWorld(on, result('l1'))
  await run($, 'l1')
  const tree = await $.ui.mount(toolUse('l1', CMD) as never)
  const head = ((await tree.findAll({ type: 'Box' } as never)) as any[]).find(b => b.props?.key === key('l1', 'head-row'))
  expect(head.props.flexDirection).toBe('row')
  expect(head.props.justifyContent).toBe('space-between')
  const inside = JSON.stringify(head)
  expect(inside).toContain('Open in DataTug')
  expect(inside).toContain(key('l1', 'check'))
  const drawn = await text(tree)
  expect(drawn.indexOf(key('l1', 'check'))).toBeLessThan(drawn.indexOf('Open these records'))
})

test('with more than 10 columns Check again sits beside the columns note, not the link', async ($, on) => {
  const cols = Array.from({ length: 12 }, (_, i) => ({ name: `c${i}`, type: 'string' }))
  fakeWorld(on, result('w1', { columns: plain(cols), data: dataDoc('w1', cols, [cols.map(() => 'v')]), kept: 1 }))
  await run($, 'w1')
  const tree = await $.ui.mount(toolUse('w1', CMD) as never)
  const boxes = (await tree.findAll({ type: 'Box' } as never)) as any[]
  const head = boxes.find(b => b.props?.key === key('w1', 'head-row'))
  expect(JSON.stringify(head)).not.toContain(key('w1', 'check'))
  const note = boxes.find(b => b.props?.flexDirection === 'row' && JSON.stringify(b.children).includes('Columns 1-10 of 12') && JSON.stringify(b.children).includes(key('w1', 'check')) && !JSON.stringify(b.children).includes('Copy CSV'))
  expect(note).toBeDefined()
  // In another view the note is gone and Check again is beside the link again.
  await tree.press({ key: key('w1', 'view', 'columns') } as never)
  const head2 = ((await tree.findAll({ type: 'Box' } as never)) as any[]).find(b => b.props?.key === key('w1', 'head-row'))
  expect(JSON.stringify(head2)).toContain(key('w1', 'check'))
})

test('a narrow panel stacks the header and the link, a wide one keeps them on one row', async ($, on) => {
  fakeWorld(on, result('p1'))
  await run($, 'p1')
  const heads = async (bodyColumns: number) => {
    const pane = await $.ui.mount({ ...PANE_ARGS, props: { bodyColumns } } as never)
    const found = ((await pane.findAll({ type: 'Box' } as never)) as any[]).find(b => b.props?.key === key('p1', 'head-row'))
    await pane.unmount()
    return found
  }
  expect((await heads(160)).props.flexDirection).toBe('row')
  expect((await heads(40)).props.flexDirection).toBe('column')
})

test('the panel views have no hotkeys; the close control is one symbol', async ($, on) => {
  fakeWorld(on, result('k1'))
  await run($, 'k1')
  const drawn = await text(await $.ui.mount(PANE_ARGS as never))
  expect(drawn).not.toMatch(/"hotkey":"[1-5]"/)
  expect(drawn).toContain('"children":["✕"]')
  expect(drawn).not.toContain('✕ Close')
})

test('sort: a header press sorts ascending, again descending, a third clears; numbers by value, nulls last', async ($, on) => {
  const cols = [{ name: 'N', type: 'integer' }, { name: 'S', type: 'string' }, { name: 'T', type: 'string' }, { name: 'U', type: 'string' }]
  const rows = [['10', 'b', 'x', 'p'], ['9', null, 'y', 'q'], ['9007199254740993', 'A', 'z', 'r'], [null, 'c', 'w', 's'], ['2', 'a', 'v', 't']]
  fakeWorld(on, result('t1', { columns: plain(cols), data: dataDoc('t1', cols, rows), kept: 5 }))
  await run($, 't1')
  const tree = await $.ui.mount(toolUse('t1', CMD) as never)
  const u = async () => colCells(await text(tree), 't1', 3, 5)
  expect(await u()).toEqual(['p', 'q', 'r', 's', 't'])
  await tree.press({ key: key('t1', 'sort', 0) } as never)
  expect(await text(tree)).toContain('N ▲')
  expect(await u()).toEqual(['t', 'q', 'p', 'r', 's'])
  await tree.press({ key: key('t1', 'sort', 0) } as never)
  expect(await text(tree)).toContain('N ▼')
  expect(await u()).toEqual(['r', 'p', 'q', 't', 's'])
  await tree.press({ key: key('t1', 'sort', 0) } as never)
  const cleared = await text(tree)
  expect(cleared.includes('▲') || cleared.includes('▼')).toBe(false)
  expect(await u()).toEqual(['p', 'q', 'r', 's', 't'])
  // Strings: a, A (equal, kept in order), b, c, and the null last.
  await tree.press({ key: key('t1', 'sort', 1) } as never)
  expect(await u()).toEqual(['r', 't', 'p', 's', 'q'])
  await tree.press({ key: key('t1', 'sort', 2) } as never)
  const moved = await text(tree)
  expect(moved).toContain('T ▲')
  expect(moved.includes('S ▲')).toBe(false)
})

test('a sorted row number opens that row of the loaded order; no query runs again', async ($, on) => {
  const cli = fakeWorld(on, result('t2'))
  await run($, 't2')
  const tree = await $.ui.mount(toolUse('t2', CMD) as never)
  await tree.press({ key: key('t2', 'sort', 1) } as never) // CustomerId ascending: 2, 4, 8
  await tree.press({ key: key('t2', 'sort', 1) } as never) // descending: 8, 4, 2
  await tree.press({ key: key('t2', 'row', 0) } as never)
  const drawn = await text(tree)
  expect(drawn).toContain('Row 3 of 3')
  expect(drawn).toContain('Carol')
  expect(cli.bash).toHaveLength(1)
})

test('sortedOrder is stable and does not change the rows; nextSort cycles', () => {
  const rows = [['b', '1'], ['a', '2'], ['b', '3'], [null, '4'], ['a', '5']]
  const copy = JSON.stringify(rows)
  expect(sortedOrder(rows, 0, false, false)).toEqual([1, 4, 0, 2, 3])
  expect(sortedOrder(rows, 0, false, true)).toEqual([0, 2, 1, 4, 3])
  expect(JSON.stringify(rows)).toBe(copy)
  // Numbers by value first (negatives included), text (by letters) after them.
  expect(sortedOrder([['x'], ['1'], ['-5'], ['abc']], 0, true, false)).toEqual([2, 1, 3, 0])
  expect(nextSort(undefined, 'a')).toEqual({ col: 'a', desc: false })
  expect(nextSort({ col: 'a', desc: false }, 'a')).toEqual({ col: 'a', desc: true })
  expect(nextSort({ col: 'a', desc: true }, 'a')).toBeUndefined()
  expect(nextSort({ col: 'a', desc: true }, 'b')).toEqual({ col: 'b', desc: false })
})

test('numeric sorting preserves exact decimal digits, mixed integers and stable equivalents', () => {
  const cases = [
    ['9007199254740992.2', '9007199254740992.1'],
    ['9007199254740993', '9007199254740992.9'],
    ['-9007199254740992.1', '-9007199254740992.2'],
    ['0.00000000000000000002', '0.00000000000000000001'],
    ['1.001', '1.0009'],
    ['2e999999999999999999999', '1e999999999999999999999'],
    ['2e-999999999999999999999', '1e-999999999999999999999'],
    ['Infinity', '1e9999'],
    ['-1e9999', '-Infinity'],
  ]
  for (const values of cases) {
    const rows = values.map(v => [v])
    expect(sortedOrder(rows, 0, true, false)).toEqual([1, 0])
    expect(sortedOrder(rows, 0, true, true)).toEqual([0, 1])
    expect(rows.map(r => r[0])).toEqual(values)
  }
  for (const values of [['1', '1.0', '10e-1', '+01.00'], ['0', '-0.0', '0e999999999999999999999']]) {
    const rows = values.map(v => [v])
    expect(sortedOrder(rows, 0, true, false)).toEqual(values.map((_, i) => i))
    expect(sortedOrder(rows, 0, true, true)).toEqual(values.map((_, i) => i))
  }
  const rows = [['z'], [null], ['0x10'], ['15.999999999999999999'], [''], [undefined], ['A']]
  expect(sortedOrder(rows, 0, true, false)).toEqual([3, 2, 4, 6, 0, 1, 5])
  expect(sortedOrder(rows, 0, true, true)).toEqual([0, 6, 4, 2, 3, 1, 5])
})

test('CSV quotes commas, quotes and line breaks; JSON keeps numbers exact and is keyed by column', () => {
  const rows = [['a,b', 'say "hi"', 'x\ny', null, '9007199254740993'], ['plain', '', '=SUM(A1)', 'r\r', '1.50']]
  expect(toCsv(['c1', 'c "2"', 'c3', 'c4', 'n'], rows)).toBe('c1,"c ""2""",c3,c4,n\n"a,b","say ""hi""","x\ny",,9007199254740993\nplain,,=SUM(A1),"r\r",1.50\n')
  const json = toJson(['c1', 'n', 'q'], ['string', 'integer', 'decimal'], [['a"', '9007199254740993', null], ['b', 'not a number', '1e3']])
  expect(json).toContain('"n": 9007199254740993')
  expect(json).toContain('"n": "not a number"')
  expect(json).toContain('"q": 1e3')
  expect(JSON.parse(json.replace('9007199254740993', '1').replace('1e3', '1000'))).toEqual([{ c1: 'a"', n: 1, q: null }, { c1: 'b', n: 'not a number', q: 1000 }])
  expect(toJson(['a'], ['string'], [])).toBe('[]\n')
})

test('Copy CSV and Copy JSON copy the loaded rows in the card order, raw, to the clipboard only', async ($, on) => {
  const cli = fakeWorld(on, result('c1'))
  const told = JSON.stringify(await run($, 'c1'))
  const tree = await $.ui.mount(toolUse('c1', CMD) as never)
  await tree.press({ key: key('c1', 'rows-csv') } as never)
  expect(cli.clips).toEqual(['InvoiceId,CustomerId,FirstName,Total\n1,2,SECRET-ALICE,1.98\n2,4,Bob,3.96\n9007199254740993,8,Carol,5.94\n'])
  await tree.press({ key: key('c1', 'rows-json') } as never)
  const json = JSON.parse(cli.clips[1].replace('9007199254740993', '"big"'))
  expect(json).toEqual([
    { InvoiceId: 1, CustomerId: 2, FirstName: 'SECRET-ALICE', Total: 1.98 },
    { InvoiceId: 2, CustomerId: 4, FirstName: 'Bob', Total: 3.96 },
    { InvoiceId: 'big', CustomerId: 8, FirstName: 'Carol', Total: 5.94 },
  ])
  // The order the person sees: descending CustomerId.
  await tree.press({ key: key('c1', 'sort', 1) } as never)
  await tree.press({ key: key('c1', 'sort', 1) } as never)
  await tree.press({ key: key('c1', 'rows-csv') } as never)
  expect(cli.clips[2].split('\n')[1]).toBe('9007199254740993,8,Carol,5.94')
  // Nothing the clipboard took is in a log, a toast, the notice, a command or what the model read.
  const outside = JSON.stringify([cli.logs, cli.toasts, told, cli.bash])
  for (const v of ['SECRET-ALICE', 'Bob', 'Carol', '9007199254740993', '1.98']) expect({ v, found: outside.includes(v) }).toEqual({ v, found: false })
  expect(cli.toasts.join(' ')).toContain('Copied 3 rows as CSV')
})

test('a failed copy says so in a toast and shows no value', async ($, on) => {
  const cli = fakeWorld(on, result('c2'))
  cli.copied = false
  await run($, 'c2')
  const tree = await $.ui.mount(toolUse('c2', CMD) as never)
  await tree.press({ key: key('c2', 'rows-json') } as never)
  expect(cli.clips).toEqual([])
  expect(cli.toasts.join(' ')).toContain('Could not copy the rows')
  expect(cli.toasts.join(' ').includes('SECRET-ALICE')).toBe(false)
})

test('the copy buttons are in the panel card too', async ($, on) => {
  fakeWorld(on, result('c3'))
  await run($, 'c3')
  const drawn = await text(await $.ui.mount(PANE_ARGS as never))
  expect(drawn).toContain('Copy CSV')
  expect(drawn).toContain('Copy JSON')
})

test('a press in the panel card leaves Latest result where it is', async ($, on) => {
  fakeWorld(on, result('c4'))
  await run($, 'c4')
  const pane = await $.ui.mount(PANE_ARGS as never)
  await pane.press({ key: key('c4', 'rows-csv') } as never)
  await pane.press({ key: key('c4', 'sort', 1) } as never)
  expect(await text(pane)).toContain('Latest result')
})

test('a long header wraps in a narrow panel: the counts and the disclosure are never cut', async ($, on) => {
  const long = (c: string) => ({ instance: c, schema: 'main', relation: c.repeat(80), alias: '', kind: 'table', role: 'from' })
  fakeWorld(on, result('n1', { participants: [long('a'), long('b'), long('c')] }))
  await run($, 'n1')
  const pane = await $.ui.mount({ ...PANE_ARGS, props: { bodyColumns: 50 } } as never)
  const head = ((await pane.findAll({ type: 'Box' } as never)) as any[]).find(b => b.props?.key === key('n1', 'head-row'))
  const texts = JSON.stringify(head)
  expect(texts).toContain('3 rows x 4 columns (shown to you, not to Claude)')
  expect(texts).not.toContain('truncate')
  expect(head.props.flexDirection).toBe('column')
})

test('the sort is per card and a reloaded card is back in the loaded order', async ($, on) => {
  const files: Record<string, string> = {}
  const ids = Array.from({ length: 11 }, (_, i) => `e${i}`)
  for (const id of ids) Object.assign(files, result(id))
  fakeWorld(on, files)
  for (const id of ids.slice(0, 2)) await run($, id)
  const a = await $.ui.mount(toolUse('e0', CMD) as never)
  const b = await $.ui.mount(toolUse('e1', CMD) as never)
  await a.press({ key: key('e0', 'sort', 1) } as never)
  await a.press({ key: key('e0', 'sort', 1) } as never)
  expect(await text(a)).toContain('▼')
  expect((await text(b)).includes('▼') || (await text(b)).includes('▲')).toBe(false)
  // Ten newer cards push e0 out: it shows Load, and loading it again starts unsorted.
  for (const id of ids.slice(2)) await run($, id)
  expect(await text(a)).toContain(key('e0', 'load'))
  await a.press({ key: key('e0', 'load') } as never)
  const after = await text(a)
  expect(after.includes('▼') || after.includes('▲')).toBe(false)
  expect(colCells(after, 'e0', 2, 3)).toEqual(['SECRET-ALICE', 'Bob', 'Carol'])
})
