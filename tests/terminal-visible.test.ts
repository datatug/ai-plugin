import { expect, test } from 'claude-code/testing'

import { fakeWorld, result, toolUse } from './card-fixtures'

const PANE_ARGS = { plugin: 'datatug', surface: 'terminal', component: 'Pane', requestId: 'datatug', props: { bodyColumns: 100 } }

// The card must reach a live terminal: a folded tool group is unfolded, a card arriving after the
// row was first drawn while running redraws it, and a line is left in the transcript either way.
const CMD = 'datatug query run --db datatug://demo/chinook --from Album --no-policies'
const text = async (tree: any) => JSON.stringify(await tree.drawn())
const run = ($: any, id: string, command = CMD) => $.tool.call({ tool: 'Bash', tool_use_id: id, command } as never)

const group = (calls: { id: string; tool?: string; command?: string }[], isExpanded = false, surface = 'terminal') => ({
  plugin: 'datatug',
  surface,
  component: 'ToolGroup',
  requestId: 'g1',
  props: {
    calls: calls.map(c => ({ tool_use_id: c.id, tool: c.tool ?? 'Bash', input: { command: c.command ?? CMD }, isRunning: false, isErrored: false, isInterrupted: false })),
    isActive: false,
    isExpanded,
  },
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a folded group holding a DataTug query is unfolded (${surface})`, async ($, on) => {
    const cli = fakeWorld(on, result('g1'))
    await $.ui.mount(group([{ id: 'g1' }], false, surface) as never)
    expect(cli.groups.at(-1)).toBe(true)
  })

  test(`a group of other calls, or an unrelated Bash call, stays folded (${surface})`, async ($, on) => {
    const cli = fakeWorld(on, {})
    await $.ui.mount(group([{ id: 'r1', tool: 'Read' }, { id: 'b1', command: 'ls -la' }, { id: 'b2', command: 'datatug query run --help' }], false, surface) as never)
    expect(cli.groups.at(-1)).toBe(false)
  })
}

test('a group that is already expanded is left as it is', async ($, on) => {
  const cli = fakeWorld(on, result('g2'))
  await $.ui.mount(group([{ id: 'g2' }], true) as never)
  expect(cli.groups.at(-1)).toBe(true)
})

test('a group whose call finished with a card is unfolded even if the command was rewritten', async ($, on) => {
  const cli = fakeWorld(on, result('g3'))
  await run($, 'g3')
  await $.ui.mount(group([{ id: 'g3', command: 'datatug query run --result-id g3 --format json --db a --from T' }]) as never)
  expect(cli.groups.at(-1)).toBe(true)
})

test('a row first drawn while the call runs shows a loading line, and the card replaces it when the result lands', async ($, on) => {
  fakeWorld(on, result('p1'))
  const running = { ...toolUse('p1', CMD), props: { ...toolUse('p1', CMD).props, isRunning: true } }
  const tree = await $.ui.mount(running as never)
  expect(await text(tree)).toContain('Loading result...')
  expect(await text(tree)).not.toContain('SECRET-ALICE')
  // The state changes inside tool.call, after the row was drawn; the mounted row follows it.
  await run($, 'p1')
  const drawn = await text(tree)
  expect(drawn).toContain('SECRET-ALICE')
  expect(drawn).toContain('● Table')
  expect(drawn).not.toContain('Loading result...')
  // The call then ends: the same row is drawn again with isRunning false and keeps the card.
  await tree.redraw(toolUse('p1', CMD).props as never)
  expect(await text(tree)).toContain('SECRET-ALICE')
})

test('a running row of another command shows no loading line', async ($, on) => {
  fakeWorld(on, {})
  const running = { ...toolUse('p2', 'ls -la'), props: { ...toolUse('p2', 'ls -la').props, isRunning: true } }
  const tree = await $.ui.mount(running as never)
  expect(await text(tree)).not.toContain('Loading result...')
})

test('the first result of a session leaves one constant transcript line, later ones none: no path, id, row or command', async ($, on) => {
  const cli = fakeWorld(on, { ...result('n1'), ...result('n2') })
  const lines = cli.logs
  await run($, 'n1')
  await run($, 'n2')
  expect(lines).toHaveLength(1)
  expect(lines[0]).toContain('ctrl+o')
  expect(lines[0]).toContain('ctrl+x tab')
  // The panel is opened for the person to focus, never with the keys taken from the prompt.
  expect(cli.opened).toEqual(['datatug', 'datatug'])
  for (const word of ['n1', 'n2', 'SECRET-ALICE', 'query-results', '/home', 'datatug://', 'Album']) expect({ word, found: lines[0].includes(word) }).toEqual({ word, found: false })
})

test('no line is left for a query that gave no card', async ($, on) => {
  const cli = fakeWorld(on, {}, { locate: () => '{"resultFiles":null}' })
  const lines = cli.logs
  await run($, 'n3')
  expect(lines).toEqual([])
})

test('when the panel cannot be placed the line names /datatug instead of a key', async ($, on) => {
  const cli = fakeWorld(on, result('n4'), {})
  cli.placed = false
  await run($, 'n4')
  expect(cli.logs).toHaveLength(1)
  expect(cli.logs[0]).toContain('/datatug')
  expect(cli.logs[0]).not.toContain('ctrl+x tab')
})

test('the panel shows the newest result card with views, sharing state with the transcript row', async ($, on) => {
  fakeWorld(on, { ...result('q1'), ...result('q2') })
  await run($, 'q1')
  await run($, 'q2')
  const row = await $.ui.mount(toolUse('q2', CMD) as never)
  const first = await $.ui.mount(toolUse('q1', CMD) as never)
  const pane = await $.ui.mount(PANE_ARGS as never)
  const before = await text(pane)
  expect(before).toContain('Latest result')
  // No digit hotkeys: a plain Button would draw "1:".."5:" before each view and wrap the row.
  for (const v of ['Table', 'Record', 'Columns', 'Sources', 'Related']) expect(before).toContain(v)
  expect(before).not.toMatch(/"label":"[●○] \w+","hotkey"|"hotkey":"[1-5]"/)
  expect(before).toContain('SECRET-ALICE')
  // A press in the panel is the card's own state: the transcript row of that result follows, the other does not.
  const fp = (s: string) => {
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
    return h.toString(16).padStart(8, '0')
  }
  const firstBefore = await text(first)
  await pane.press({ key: `qr:${fp('q2')}:view:columns` } as never)
  expect(await text(pane)).toContain('● Columns')
  expect(await text(row)).toContain('● Columns')
  expect(await text(first)).toBe(firstBefore)
})

test('the panel shows no result section before any result', async ($, on) => {
  fakeWorld(on, {})
  const pane = await $.ui.mount(PANE_ARGS as never)
  expect(await text(pane)).not.toContain('Latest result')
})

test('the panel puts Latest result after the context bag, with a horizontal rule between sections', async ($, on) => {
  fakeWorld(on, result('o1'))
  await run($, 'o1')
  const pane = await $.ui.mount(PANE_ARGS as never)
  const drawn = await text(pane)
  const at = (needle: string) => drawn.indexOf(needle)
  expect(at('card-project')).toBeGreaterThan(-1)
  expect(at('card-bag')).toBeGreaterThan(at('card-project'))
  expect(at('card-latest')).toBeGreaterThan(at('card-bag'))
  // Every other section the person opens comes after the result.
  expect(at('card-opendb')).toBeGreaterThan(at('card-latest'))
  const rule = '─'.repeat(100)
  expect(drawn.split(rule).length - 1).toBeGreaterThanOrEqual(3)
  // The rule sits between neighbours: never first, never last.
  expect(at(rule)).toBeGreaterThan(at('card-project'))
  expect(drawn.lastIndexOf(rule)).toBeLessThan(drawn.lastIndexOf('card-opendb'))
})

test('the Latest result section has a close button that clears it and leaves the transcript card', async ($, on) => {
  fakeWorld(on, { ...result('x1'), ...result('x2') })
  await run($, 'x1')
  const row = await $.ui.mount(toolUse('x1', CMD) as never)
  const pane = await $.ui.mount(PANE_ARGS as never)
  let drawn = await text(pane)
  expect(drawn).toContain('latest-close')
  expect(drawn).toContain('✕')
  expect(drawn).toContain('Latest result')
  await pane.press({ key: 'latest-close' } as never)
  drawn = await text(pane)
  expect(drawn.includes('Latest result')).toBe(false)
  expect(drawn.includes('SECRET-ALICE')).toBe(false)
  // The panel's other cards stay, and the transcript card is untouched and still interactive.
  expect(drawn).toContain('card-bag')
  expect(await text(row)).toContain('SECRET-ALICE')
  await row.press({ key: `qr:${fpOf('x1')}:view:columns` } as never)
  expect(await text(row)).toContain('● Columns')
  expect((await text(pane)).includes('Latest result')).toBe(false)
  // A newer result shows again.
  await run($, 'x2')
  expect(await text(pane)).toContain('Latest result')
})

test('the close button has a hotkey, so the panel can be cleared from the keyboard', async ($, on) => {
  fakeWorld(on, result('h1'))
  await run($, 'h1')
  const drawn = await text(await $.ui.mount(PANE_ARGS as never))
  expect(drawn).toMatch(/"key":"latest-close"[^}]*"hotkey":"x"|"hotkey":"x"[^}]*"key":"latest-close"/)
})

function fpOf(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
