import { expect, test } from 'claude-code/testing'

import { fakeWorld, result, toolUse } from './card-fixtures'

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

test('each result leaves one constant transcript line: no path, id, row or command', async ($, on) => {
  const cli = fakeWorld(on, { ...result('n1'), ...result('n2') })
  const lines = cli.logs
  await run($, 'n1')
  await run($, 'n2')
  expect(lines).toHaveLength(2)
  expect(lines[0]).toBe(lines[1])
  expect(lines[0]).toContain('ctrl+o')
  for (const word of ['n1', 'n2', 'SECRET-ALICE', 'query-results', '/home', 'datatug://', 'Album']) expect({ word, found: lines[0].includes(word) }).toEqual({ word, found: false })
})

test('no line is left for a query that gave no card', async ($, on) => {
  const cli = fakeWorld(on, {}, { locate: () => '{"resultFiles":null}' })
  const lines = cli.logs
  await run($, 'n3')
  expect(lines).toEqual([])
})
