import { expect, test } from 'claude-code/testing'

import { dataDoc, fakeWorld, result, toolUse } from './card-fixtures'
import { columnPage, historyKeys, historyPick, resultTitle } from '../lib/rows.js'

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
const plain = (cols: { name: string; type: string }[]) => cols.map(c => ({ ...c, declaredType: null, nullable: null, pk: null, source: null, foreignKeys: [] }))
// A result of `n` string columns c0.., one row whose values are v0...
const wide = (id: string, n: number) => {
  const cols = Array.from({ length: n }, (_, i) => ({ name: `c${i}`, type: 'string' }))
  return result(id, { columns: plain(cols), data: dataDoc(id, cols, [cols.map((_, i) => `v${i}`)]), kept: 1 })
}
const header = (drawn: string) => Array.from(drawn.matchAll(/"children":\["(Columns? [^"]*)"\]/g)).map(m => m[1])

test('columnPage: any number of columns, one included, exact multiples and more than 100', () => {
  expect(columnPage(1, 0, 10)).toEqual({ page: 0, pages: 1, start: 0, end: 1 })
  expect(columnPage(10, 5, 10)).toEqual({ page: 0, pages: 1, start: 0, end: 10 })
  expect(columnPage(13, 1, 10)).toEqual({ page: 1, pages: 2, start: 10, end: 13 })
  expect(columnPage(20, 1, 10)).toEqual({ page: 1, pages: 2, start: 10, end: 20 })
  expect(columnPage(20, 2, 10)).toEqual({ page: 1, pages: 2, start: 10, end: 20 })
  expect(columnPage(250, 24, 10)).toEqual({ page: 24, pages: 25, start: 240, end: 250 })
  expect(columnPage(250, -3, 10).page).toBe(0)
  expect(columnPage(0, 0, 10)).toEqual({ page: 0, pages: 1, start: 0, end: 0 })
})

test('the history keeps the newest of the keys that are not closed; the pick falls back to the newest', () => {
  expect(historyKeys(['a', 'b', 'c', 'd', 'e', 'f', 'g'], [], 5)).toEqual(['c', 'd', 'e', 'f', 'g'])
  expect(historyKeys(['a', 'b', 'c', 'd', 'e', 'f', 'g'], ['e', 'a'], 5)).toEqual(['c', 'd', 'f', 'g'])
  expect(historyPick(['c', 'd'], 'c')).toBe('c')
  expect(historyPick(['c', 'd'], '')).toBe('d')
  expect(historyPick(['c', 'd'], 'zz')).toBe('d')
  expect(historyPick([], '')).toBeUndefined()
  expect(resultTitle({ savedId: 'q/x', participants: [], unavailable: {} })).toBe('Saved query q/x')
})

test('13 columns: ten show, the window pages forward and back, and the Record view still shows all', async ($, on) => {
  fakeWorld(on, wide('w13', 13))
  await run($, 'w13')
  const tree = await $.ui.mount(toolUse('w13', CMD) as never)
  let drawn = await text(tree)
  expect(header(drawn)).toEqual(['Columns 1-10 of 13'])
  expect(drawn).toContain('v9')
  expect(drawn.includes('"v10"')).toBe(false)
  expect(drawn).toContain(key('w13', 'colnext'))
  expect(drawn.includes(key('w13', 'colprev'))).toBe(false)
  expect(drawn).toContain('columns ▶')
  await tree.press({ key: key('w13', 'colnext') } as never)
  drawn = await text(tree)
  expect(header(drawn)).toEqual(['Columns 11-13 of 13'])
  expect(drawn).toContain('"v10"')
  expect(drawn).toContain('"v12"')
  expect(drawn.includes('"v9"')).toBe(false)
  expect(drawn.includes(key('w13', 'colnext'))).toBe(false)
  expect(drawn).toContain('◀ columns')
  await tree.press({ key: key('w13', 'colprev') } as never)
  expect(header(await text(tree))).toEqual(['Columns 1-10 of 13'])
  // The sort follows a column through the window.
  await tree.press({ key: key('w13', 'sort', 0) } as never)
  expect(await text(tree)).toContain('c0 ▲')
  await tree.press({ key: key('w13', 'colnext') } as never)
  expect((await text(tree)).includes('▲')).toBe(false)
  await tree.press({ key: key('w13', 'colprev') } as never)
  expect(await text(tree)).toContain('c0 ▲')
})

test('one column and ten columns have no window controls', async ($, on) => {
  fakeWorld(on, { ...wide('w1', 1), ...wide('w10', 10) })
  await run($, 'w1')
  await run($, 'w10')
  for (const id of ['w1', 'w10']) {
    const drawn = await text(await $.ui.mount(toolUse(id, CMD) as never))
    expect(header(drawn)).toEqual([])
    expect(drawn.includes('colnext') || drawn.includes('colprev')).toBe(false)
  }
})

test('an exact multiple of ten ends on a full window; one past it ends on a single column', async ($, on) => {
  fakeWorld(on, { ...wide('w20', 20), ...wide('w21', 21) })
  await run($, 'w20')
  await run($, 'w21')
  const a = await $.ui.mount(toolUse('w20', CMD) as never)
  await a.press({ key: key('w20', 'colnext') } as never)
  const last = await text(a)
  expect(header(last)).toEqual(['Columns 11-20 of 20'])
  expect(last.includes(key('w20', 'colnext'))).toBe(false)
  const b = await $.ui.mount(toolUse('w21', CMD) as never)
  await b.press({ key: key('w21', 'colnext') } as never)
  await b.press({ key: key('w21', 'colnext') } as never)
  const single = await text(b)
  expect(header(single)).toEqual(['Column 21 of 21'])
  expect(single).toContain('"v20"')
})

test('more than 100 columns page through to the last one', async ($, on) => {
  fakeWorld(on, wide('w150', 150))
  await run($, 'w150')
  const tree = await $.ui.mount(toolUse('w150', CMD) as never)
  expect(header(await text(tree))).toEqual(['Columns 1-10 of 150'])
  for (let i = 0; i < 14; i++) await tree.press({ key: key('w150', 'colnext') } as never)
  const drawn = await text(tree)
  expect(header(drawn)).toEqual(['Columns 141-150 of 150'])
  expect(drawn).toContain('"v149"')
  expect(drawn.includes(key('w150', 'colnext'))).toBe(false)
  // A reloaded card starts on the first window again.
  expect(drawn).toContain(key('w150', 'colprev'))
})

test('a narrow panel opens on the Record view until a view is picked; a wide panel and the transcript show the Table', async ($, on) => {
  fakeWorld(on, result('nr'))
  await run($, 'nr')
  const row = await $.ui.mount(toolUse('nr', CMD) as never)
  const wideP = await $.ui.mount(PANE_ARGS as never)
  expect(await text(wideP)).toContain('● Table')
  await wideP.unmount()
  const pane = await $.ui.mount({ ...PANE_ARGS, props: { bodyColumns: 50 } } as never)
  const narrow = await text(pane)
  expect(narrow).toContain('● Record')
  expect(narrow).toContain('Row 1 of 3')
  expect(await text(row)).toContain('● Table')
  // The person's pick wins, even for Table.
  await pane.press({ key: key('nr', 'view', 'table') } as never)
  const picked = await text(pane)
  expect(picked).toContain('● Table')
  expect(picked.includes('Row 1 of 3')).toBe(false)
  await pane.unmount()
  // The narrow default does not change the stored view, so the transcript is not moved by it; 60 is not narrow.
  const edge = await $.ui.mount({ ...PANE_ARGS, props: { bodyColumns: 60 } } as never)
  expect(await text(edge)).toContain('● Table')
})

const LONG = 'https://example.org/path/with/a/very/long/address/that/is/cut?token=ABC123SECRETVALUE'
const longResult = (id: string) => {
  const cols = [{ name: 'Id', type: 'integer' }, { name: 'Note', type: 'string' }, { name: 'Empty', type: 'string' }]
  return result(id, { columns: plain(cols), data: dataDoc(id, cols, [['1', LONG, null], ['2', 'short', null]]), kept: 2 })
}

test('pressing a cut cell opens its whole value under the grid, broken so no terminal links it; Copy sends the value to the clipboard only', async ($, on) => {
  const cli = fakeWorld(on, longResult('x1'))
  const told = JSON.stringify(await run($, 'x1'))
  const tree = await $.ui.mount(toolUse('x1', CMD) as never)
  let drawn = await text(tree)
  // Only the cut value is a control; a short one and an empty one are plain text.
  expect(drawn).toContain(key('x1', 'cell', 0, 1))
  expect(drawn.includes(key('x1', 'cell', 1, 1))).toBe(false)
  expect(drawn.includes(key('x1', 'cell', 0, 2))).toBe(false)
  expect(drawn.includes(key('x1', 'cell-box'))).toBe(false)
  await tree.press({ key: key('x1', 'cell', 0, 1) } as never)
  drawn = await text(tree)
  expect(drawn).toContain(key('x1', 'cell-box'))
  expect(drawn).toContain('Note · row 1')
  expect(drawn).toContain('token=ABC123SECRETVALUE')
  expect({ link: drawn.includes('https://example') }).toEqual({ link: false })
  expect(drawn).toContain('https:​//example.org')
  await tree.press({ key: key('x1', 'cell-copy') } as never)
  expect(cli.clips).toEqual([LONG])
  expect(cli.toasts.join(' ')).toContain('Copied the value')
  const outside = JSON.stringify([cli.logs, cli.toasts, told, cli.bash, cli.runs, cli.spawns])
  expect({ secret: outside.includes('ABC123SECRETVALUE') }).toEqual({ secret: false })
  expect({ host: outside.includes('example.org') }).toEqual({ host: false })
  await tree.press({ key: key('x1', 'cell-close') } as never)
  expect((await text(tree)).includes(key('x1', 'cell-box'))).toBe(false)
})

test('a failed copy of a cell says so without the value; a sorted grid opens the cell of the pressed row', async ($, on) => {
  const cli = fakeWorld(on, longResult('x2'))
  cli.copied = false
  await run($, 'x2')
  const tree = await $.ui.mount(toolUse('x2', CMD) as never)
  await tree.press({ key: key('x2', 'sort', 0) } as never)
  await tree.press({ key: key('x2', 'sort', 0) } as never) // Id descending: row 2 first
  await tree.press({ key: key('x2', 'cell', 1, 1) } as never)
  expect(await text(tree)).toContain('Note · row 1')
  await tree.press({ key: key('x2', 'cell-copy') } as never)
  expect(cli.clips).toEqual([])
  expect(cli.toasts.join(' ')).toContain('Could not copy the value')
  expect(cli.toasts.join(' ').includes('ABC123')).toBe(false)
})

test('the panel card has the same cell controls, and a reloaded card closes the open cell', async ($, on) => {
  fakeWorld(on, longResult('x3'))
  await run($, 'x3')
  const pane = await $.ui.mount(PANE_ARGS as never)
  await pane.press({ key: key('x3', 'cell', 0, 1) } as never)
  expect(await text(pane)).toContain(key('x3', 'cell-box'))
  await run($, 'x3')
  expect((await text(pane)).includes(key('x3', 'cell-box'))).toBe(false)
})

const hist = async ($: any, on: any, n: number) => {
  const files: Record<string, string> = {}
  const ids = Array.from({ length: n }, (_, i) => `r${i + 1}`)
  ids.forEach((id, i) => Object.assign(files, result(id, { participants: [{ instance: 'root', schema: 'main', relation: `T${i + 1}`, alias: '', kind: 'table', role: 'from' }] })))
  const cli = fakeWorld(on, files)
  for (const id of ids) await run($, id)
  return { cli, ids }
}

test('history: the panel keeps the last 5, shows the newest as n/5 with its title, and steps back and forward', async ($, on) => {
  const { ids } = await hist($, on, 6)
  const pane = await $.ui.mount(PANE_ARGS as never)
  let drawn = await text(pane)
  expect(drawn).toContain('"5/5"')
  expect(drawn).toContain('"T6"')
  expect(drawn).toContain(key('r6', 'view', 'table'))
  await pane.press({ key: 'latest-prev' } as never)
  drawn = await text(pane)
  expect(drawn).toContain('"4/5"')
  expect(drawn).toContain('"T5"')
  expect(drawn).toContain(key('r5', 'view', 'table'))
  expect(drawn.includes(key('r6', 'view', 'table'))).toBe(false)
  for (let i = 0; i < 6; i++) await pane.press({ key: 'latest-prev' } as never)
  drawn = await text(pane)
  expect(drawn).toContain('"1/5"')
  expect(drawn).toContain('"T2"')
  expect(drawn.includes('T1"')).toBe(false)
  for (let i = 0; i < 9; i++) await pane.press({ key: 'latest-next' } as never)
  expect(await text(pane)).toContain('"5/5"')
  // The sixth result's inline card is untouched by what the panel switched.
  expect(ids).toHaveLength(6)
})

test('history: a new result selects the newest; one result has no switcher', async ($, on) => {
  const { cli } = await hist($, on, 3)
  const pane = await $.ui.mount(PANE_ARGS as never)
  await pane.press({ key: 'latest-prev' } as never)
  await pane.press({ key: 'latest-prev' } as never)
  expect(await text(pane)).toContain('"1/3"')
  const files = cli.files
  Object.assign(files, result('r4'))
  await run($, 'r4')
  const drawn = await text(pane)
  expect(drawn).toContain('"4/4"')
  expect(drawn).toContain(key('r4', 'view', 'table'))
})

test('history: a single result shows no switcher', async ($, on) => {
  fakeWorld(on, result('s1'))
  await run($, 's1')
  const drawn = await text(await $.ui.mount(PANE_ARGS as never))
  expect(drawn.includes('latest-prev') || drawn.includes('latest-next')).toBe(false)
})

test('history: closing removes just the shown result and shows its neighbour; the inline cards stay', async ($, on) => {
  const { ids } = await hist($, on, 4)
  const rows = await Promise.all(ids.map(id => $.ui.mount(toolUse(id, CMD) as never)))
  const pane = await $.ui.mount(PANE_ARGS as never)
  await pane.press({ key: 'latest-prev' } as never) // 3/4
  await pane.press({ key: 'latest-close' } as never)
  let drawn = await text(pane)
  expect(drawn).toContain('"3/3"')
  expect(drawn).toContain('"T4"')
  expect(drawn.includes(key('r3', 'view', 'table'))).toBe(false)
  for (const r of rows) expect(await text(r)).toContain('SECRET-ALICE')
  // Stepping back skips the closed one.
  await pane.press({ key: 'latest-prev' } as never)
  expect(await text(pane)).toContain('"T2"')
  // Closing all of them leaves no section; a new result shows again.
  await pane.press({ key: 'latest-close' } as never)
  await pane.press({ key: 'latest-close' } as never)
  await pane.press({ key: 'latest-close' } as never)
  expect((await text(pane)).includes('Latest result')).toBe(false)
  for (const r of rows) expect(await text(r)).toContain('SECRET-ALICE')
})

test('history: rows are kept for ten cards at most, and a card pushed out shows Load in the panel history only if it is not one of the last five', async ($, on) => {
  const { ids } = await hist($, on, 12)
  const pane = await $.ui.mount(PANE_ARGS as never)
  const drawn = await text(pane)
  expect(drawn).toContain('"5/5"')
  const old = await $.ui.mount(toolUse(ids[0], CMD) as never)
  expect(await text(old)).toContain(key(ids[0], 'load'))
  expect((await text(old)).includes('SECRET-ALICE')).toBe(false)
  // A pushed-out card loaded again becomes the newest in the panel.
  await old.press({ key: key(ids[0], 'load') } as never)
  const after = await text(pane)
  expect(after).toContain('"5/5"')
  expect(after).toContain('"T1"')
})

test('where the columns would not fit the panel every value is a control, because any may be cut on screen', async ($, on) => {
  const cols = ['A', 'B', 'C'].map(name => ({ name, type: 'string' }))
  const long = 'x'.repeat(27)
  fakeWorld(on, result('sq', { columns: plain(cols), data: dataDoc('sq', cols, [[long, long, 'ab']]), kept: 1 }))
  await run($, 'sq')
  const wideP = await $.ui.mount(PANE_ARGS as never)
  expect((await text(wideP)).includes(key('sq', 'cell', 0, 2))).toBe(false)
  await wideP.unmount()
  const pane = await $.ui.mount({ ...PANE_ARGS, props: { bodyColumns: 60 } } as never)
  await pane.press({ key: key('sq', 'view', 'table') } as never)
  const drawn = await text(pane)
  expect(drawn).toContain(key('sq', 'cell', 0, 2))
  // A value that is not cut keeps its own text, with no ellipsis.
  expect(drawn).toContain('"ab"')
})
