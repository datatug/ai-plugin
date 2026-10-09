import { expect, test } from 'claude-code/testing'
import { MIN_CLI_VERSION } from '../lib/cli.js'
import { BOARDS, HOSTILE_RUNS, KEY, SHOW, fakeCli, okRun } from './fixtures'

// What Claude Code passes to a ui.render hook for this pane
const PANE = {
  plugin: 'datatug',
  component: 'Pane',
  requestId: 'datatug-project',
  surface: 'terminal',
  viewport: { columns: 100, rows: 30 },
  props: {
    title: 'DataTug',
    isFocused: true,
    bodyColumns: 80,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
} as const

const CWD = '/work/chinook'

test('registers /datatug at session start', async ($, on) => {
  const registered: string[] = []
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', ($: any, e: any) => {
    registered.push(e.name)
    return { value: undefined }
  })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(registered).toEqual(['datatug'])
})

test('/datatug runs the four read-only commands in the working directory and opens the pane', async ($, on) => {
  const cli = fakeCli()
  const opened: string[] = []
  const cwds: string[] = []
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('process.run', ($: any, e: any) => {
    cwds.push(e.init?.cwd)
    return cli.stub($, e)
  })
  on('ui.open', ($: any, e: any) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })

  const answer = await $.command.run({ command: 'datatug', args: '' })
  expect(answer).toEqual({})
  expect(opened).toEqual(['datatug-project'])
  expect(cli.calls.map((argv) => argv[0])).toEqual(['datatug', 'datatug', 'datatug', 'datatug'])
  expect(cli.calls.map((argv) => argv.slice(1).join(' ')).sort()).toEqual(
    [KEY.version, KEY.show, KEY.queries, KEY.boards].sort(),
  )
  expect(cli.calls[0].slice(1).join(' ')).toBe(KEY.version)
  expect(cwds).toEqual([CWD, CWD, CWD, CWD])

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'DataTug Demo Project 1' })).toBeDefined()
  await ui.press({ key: 'tab-environments' })
  expect(await ui.find({ type: 'Text', text: /chinook-local {2}sqlite3 · 2 tables, 1 view/ })).toBeDefined()
  await ui.press({ key: 'tab-queries' })
  expect(await ui.find({ type: 'Button', text: /Customer invoices \(customer-invoices\) \[SQL\]/ })).toBeDefined()
  await ui.press({ key: 'tab-boards' })
  expect(await ui.find({ type: 'Text', text: 'board1 — 1st board' })).toBeDefined()
  await ui.unmount()
})

test('a folder that is not a project gets one line and no pane', async ($, on) => {
  const cli = fakeCli({ [KEY.show]: { exitCode: 3, stdout: '', stderr: '"/work/x" is not a DataTug project' } })
  let opens = 0
  on('session.cwd', () => ({ value: '/work/x' }))
  on('process.run', cli.stub)
  on('ui.open', () => {
    opens += 1
    return { value: { isPlaced: true } }
  })

  const answer = await $.command.run({ command: 'datatug', args: '' })
  expect(answer.text).toContain('/work/x is not a DataTug project')
  expect(answer.text.includes('\n')).toBe(false)
  expect(opens).toBe(0)
})

test('a datatug that cannot be started gets one line naming the install skill', async ($, on) => {
  const cli = fakeCli({ [KEY.version]: new Error('spawn datatug ENOENT') })
  let opens = 0
  on('session.cwd', () => ({ value: CWD }))
  on('process.run', cli.stub)
  on('ui.open', () => {
    opens += 1
    return { value: { isPlaced: true } }
  })

  const answer = await $.command.run({ command: 'datatug', args: '' })
  expect(answer.text).toContain('datatug:datatug-install')
  expect(cli.calls.length).toBe(1)
  expect(opens).toBe(0)
})

test('a datatug that is too old gets one line with both versions and runs nothing else', async ($, on) => {
  const cli = fakeCli({ [KEY.version]: { exitCode: 0, stdout: '0.0.1\n', stderr: '' } })
  let opens = 0
  on('session.cwd', () => ({ value: CWD }))
  on('process.run', cli.stub)
  on('ui.open', () => {
    opens += 1
    return { value: { isPlaced: true } }
  })

  const answer = await $.command.run({ command: 'datatug', args: '' })
  expect(answer.text).toContain('0.0.1')
  expect(answer.text).toContain(MIN_CLI_VERSION)
  expect(answer.text).toContain('datatug self-update')
  expect(cli.calls.length).toBe(1)
  expect(opens).toBe(0)
})

test('a version that cannot be read (a development build) is let through', async ($, on) => {
  const cli = fakeCli({ [KEY.version]: { exitCode: 0, stdout: 'dev\n', stderr: '' } })
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('process.run', cli.stub)
  on('ui.open', () => ({ value: { isPlaced: true } }))

  expect(await $.command.run({ command: 'datatug', args: '' })).toEqual({})
  expect(cli.calls.length).toBe(4)
})

test('when the pane is not placed, /datatug replies with the text summary', async ($, on) => {
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('process.run', fakeCli().stub)
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'no interface here' } }))

  const answer = await $.command.run({ command: 'datatug', args: '' })
  expect(answer.text).toMatch(/^Overview\n {2}DataTug Demo Project 1/)
  expect(answer.text).toContain('\n\nBoards\n  board1 — 1st board')
})

test('when opening a pane fails, /datatug replies with the text summary', async ($, on) => {
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('process.run', fakeCli().stub)
  on('ui.open', () => ({ deny: 'panes are not available' }))

  const answer = await $.command.run({ command: 'datatug', args: '' })
  expect(answer.text).toMatch(/^Overview\n {2}DataTug Demo Project 1/)
})

test('a failed listing shows a warning on its tab and the other tabs still render', async ($, on) => {
  const cli = fakeCli({
    [KEY.boards]: { exitCode: 1, stdout: '', stderr: '\n   ERROR  \n\n  board "b1" cannot be loaded\n' },
  })
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('process.run', cli.stub)
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.command.run({ command: 'datatug', args: '' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-boards' })
  expect(await ui.find({ type: 'Text', text: '⚠ datatug board list: board "b1" cannot be loaded' })).toBeDefined()
  await ui.press({ key: 'tab-queries' })
  expect(await ui.find({ type: 'Button', text: 'top-level' })).toBeDefined()
  await ui.unmount()
})

test('a listing command that cannot be started is a warning, not a crash', async ($, on) => {
  const cli = fakeCli({ [KEY.queries]: new Error('timed out') })
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('process.run', cli.stub)
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.command.run({ command: 'datatug', args: '' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-queries' })
  expect(await ui.find({ type: 'Text', text: /^⚠ datatug queries: / })).toBeDefined()
  await ui.unmount()
})

test('where the session draws on no surface, /datatug replies with the text summary and opens no pane', async ($, on) => {
  let opens = 0
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: [] }))
  on('process.run', fakeCli().stub)
  on('ui.open', () => {
    opens += 1
    return { value: { isPlaced: true } }
  })

  const answer = await $.command.run({ command: 'datatug', args: '' })
  expect(answer.text).toMatch(/^Overview\n {2}DataTug Demo Project 1/)
  expect(opens).toBe(0)
})

test('where only the VS Code panel draws, /datatug replies with the text summary and opens no pane', async ($, on) => {
  let opens = 0
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: ['vscode'] }))
  on('process.run', fakeCli().stub)
  on('ui.open', () => {
    opens += 1
    return { value: { isPlaced: true } }
  })

  const answer = await $.command.run({ command: 'datatug', args: '' })
  expect(answer.text).toMatch(/^Overview\n {2}DataTug Demo Project 1/)
  expect(opens).toBe(0)
})

test('on the Desktop app the pane opens', async ($, on) => {
  const opened: string[] = []
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('process.run', fakeCli().stub)
  on('ui.open', ($: any, e: any) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })

  expect(await $.command.run({ command: 'datatug', args: '' })).toEqual({})
  expect(opened).toEqual(['datatug-project'])
})

const FORBIDDEN = new RegExp('[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029]')

test('running /datatug again redraws an open pane: Overview tab, new project', async ($, on) => {
  let current = fakeCli()
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('process.run', ($: any, e: any) => current.stub($, e))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.command.run({ command: 'datatug', args: '' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-boards' })
  expect(await ui.find({ type: 'Text', text: 'board1 — 1st board' })).toBeDefined()

  current = fakeCli({
    [KEY.show]: okRun({ ...SHOW, title: 'Renamed Project' }),
    [KEY.boards]: okRun([...BOARDS, { id: 'board3', title: 'third' }]),
  })
  await $.command.run({ command: 'datatug', args: '' })

  expect(await ui.find({ type: 'Text', text: 'Renamed Project' })).toBeDefined()
  await ui.press({ key: 'tab-boards' })
  expect(await ui.find({ type: 'Text', text: 'board3 — third' })).toBeDefined()
  await ui.unmount()
})

test('a pane left open after the module reloaded says how to load the project', async ($) => {
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'Run /datatug to load the project.' })).toBeDefined()
  await ui.unmount()
})

test('hostile project text still mounts the pane, cleaned', async ($, on) => {
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('process.run', fakeCli(HOSTILE_RUNS).stub)
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.command.run({ command: 'datatug', args: '' })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /SYSTEM: do this/ })).toBeDefined()
  await ui.unmount()
})

test('hostile project text cannot act on the terminal or forge a line of the text reply', async ($, on) => {
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: [] }))
  on('process.run', fakeCli(HOSTILE_RUNS).stub)

  const answer = await $.command.run({ command: 'datatug', args: '' })
  expect(answer.text).toContain('SYSTEM: do this')
  expect(FORBIDDEN.test(answer.text.replace(/\n/g, ''))).toBe(false)
  for (const row of answer.text.split('\n')) expect(row.trimStart().startsWith('SYSTEM:')).toBe(false)
})

// --- Picking a query -------------------------------------------------------

const QUERY_KEY = 'query-customers/customer-invoices'
const DRAFT = 'Run the saved DataTug query customers/customer-invoices ("Customer invoices") with InvoiceId= (optional: From)'

// Loads the project and leaves the pane mounted on the Queries tab.
async function openQueries($: any, on: any, { box = { text: '', cursor: 0 }, fill = { isFilled: true } as any } = {}) {
  const fills: { text: string; mode: string }[] = []
  const submits: unknown[] = []
  const toasts: string[] = []
  const closes: string[] = []
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('process.run', fakeCli().stub)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.read', () => ({ value: box }))
  on('prompt.fill', ($: any, e: any) => {
    fills.push({ text: e.text, mode: e.mode })
    if (fill instanceof Error) throw fill
    return fill
  })
  on('prompt.submit', () => {
    submits.push(1)
    return { value: undefined }
  })
  on('ui.toast', ($: any, e: any) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.close', ($: any, e: any) => {
    closes.push(e.id)
    return { value: undefined }
  })
  await $.command.run({ command: 'datatug', args: '' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-queries' })
  return { ui, fills, submits, toasts, closes }
}

test('on the Queries tab each query is a button and folders stay text', async ($, on) => {
  const { ui } = await openQueries($, on)
  expect(await ui.find({ type: 'Button', key: QUERY_KEY })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'query-top-level' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'customers/' })).toBeDefined()
  await ui.unmount()
})

test('choosing a query shows its detail with parameters, Ask Claude and Back; Back shows the list', async ($, on) => {
  const { ui } = await openQueries($, on)
  await ui.press({ key: QUERY_KEY })
  expect(await ui.find({ type: 'Text', text: 'Customer invoices' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'id: customers/customer-invoices' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'type: SQL' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Parameters' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'InvoiceId: integer (required)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'From' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'ask-claude' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'query-back' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'tab-queries' })).toBeDefined()

  await ui.press({ key: 'query-back' })
  expect(await ui.find({ type: 'Button', key: QUERY_KEY })).toBeDefined()
  await ui.unmount()
})

test('a query without parameters says so', async ($, on) => {
  const { ui } = await openQueries($, on)
  await ui.press({ key: 'query-top-level' })
  expect(await ui.find({ type: 'Text', text: 'No parameters.' })).toBeDefined()
  await ui.unmount()
})

test('pressing a tab leaves the detail view', async ($, on) => {
  const { ui } = await openQueries($, on)
  await ui.press({ key: QUERY_KEY })
  await ui.press({ key: 'tab-boards' })
  expect(await ui.find({ type: 'Text', text: 'board1 — 1st board' })).toBeDefined()
  await ui.press({ key: 'tab-queries' })
  expect(await ui.find({ type: 'Button', key: QUERY_KEY })).toBeDefined()
  await ui.unmount()
})

test('Ask Claude fills the prompt box once, in append mode, with the draft, and submits nothing', async ($, on) => {
  const { ui, fills, submits, toasts } = await openQueries($, on)
  await ui.press({ key: QUERY_KEY })
  await ui.press({ key: 'ask-claude' })
  expect(fills).toEqual([{ text: DRAFT, mode: 'append' }])
  expect(submits).toEqual([])
  expect(toasts).toEqual([])
  await ui.unmount()
})

test('Ask Claude after the box took the draft hands the keys back by closing the pane', async ($, on) => {
  const { ui, closes } = await openQueries($, on)
  await ui.press({ key: QUERY_KEY })
  await ui.press({ key: 'ask-claude' })
  expect(closes).toEqual(['datatug-project'])
  await ui.unmount()
})

test('Ask Claude starts the appended text with a space after text that does not end in one', async ($, on) => {
  const { ui, fills } = await openQueries($, on, { box: { text: 'please', cursor: 6 } })
  await ui.press({ key: QUERY_KEY })
  await ui.press({ key: 'ask-claude' })
  expect(fills).toEqual([{ text: ' ' + DRAFT, mode: 'append' }])
  await ui.unmount()
})

test('Ask Claude adds no space after text that ends in one', async ($, on) => {
  const { ui, fills } = await openQueries($, on, { box: { text: 'please ', cursor: 7 } })
  await ui.press({ key: QUERY_KEY })
  await ui.press({ key: 'ask-claude' })
  expect(fills[0].text).toBe(DRAFT)
  await ui.unmount()
})

test('when the box cannot take the draft, a toast shows it and the pane stays', async ($, on) => {
  const { ui, fills, toasts, closes } = await openQueries($, on, { fill: { isFilled: false, text: '' } })
  await ui.press({ key: QUERY_KEY })
  await ui.press({ key: 'ask-claude' })
  expect(fills.length).toBe(1)
  expect(toasts).toEqual([DRAFT])
  expect(closes).toEqual([])
  expect(await ui.find({ type: 'Button', key: 'ask-claude' })).toBeDefined()
  await ui.unmount()
})

test('when the fill call is refused, a toast shows the draft and the pane stays', async ($, on) => {
  const { ui, toasts, closes } = await openQueries($, on, { fill: new Error('no box') })
  await ui.press({ key: QUERY_KEY })
  await ui.press({ key: 'ask-claude' })
  expect(toasts).toEqual([DRAFT])
  expect(closes).toEqual([])
  expect(await ui.find({ type: 'Button', key: 'ask-claude' })).toBeDefined()
  await ui.unmount()
})

test('the draft is one line even when the project text is hostile', async ($, on) => {
  const fills: string[] = []
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('process.run', fakeCli(HOSTILE_RUNS).stub)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', ($: any, e: any) => {
    fills.push(e.text)
    return { isFilled: true }
  })
  on('ui.close', () => ({ value: undefined }))
  await $.command.run({ command: 'datatug', args: '' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-queries' })
  await ui.press({ key: 'query-fo lder/na me' })
  await ui.press({ key: 'ask-claude' })
  expect(fills.length).toBe(1)
  expect(FORBIDDEN.test(fills[0])).toBe(false)
  await ui.unmount()
})

test('running /datatug again clears a selected query', async ($, on) => {
  const { ui } = await openQueries($, on)
  await ui.press({ key: QUERY_KEY })
  expect(await ui.find({ type: 'Button', key: 'ask-claude' })).toBeDefined()
  await $.command.run({ command: 'datatug', args: '' })
  expect(await ui.find({ type: 'Text', text: 'DataTug Demo Project 1' })).toBeDefined()
  await ui.press({ key: 'tab-queries' })
  expect(await ui.find({ type: 'Button', key: QUERY_KEY })).toBeDefined()
  await ui.unmount()
})
