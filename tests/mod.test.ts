import { expect, test } from 'claude-code/testing'
import { MIN_CLI_VERSION } from '../lib/cli.js'
import { KEY, fakeCli } from './fixtures'

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
  expect(await ui.find({ type: 'Text', text: /Customer invoices \(customer-invoices\) \[SQL\]/ })).toBeDefined()
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
  on('process.run', cli.stub)
  on('ui.open', () => ({ value: { isPlaced: true } }))

  expect(await $.command.run({ command: 'datatug', args: '' })).toEqual({})
  expect(cli.calls.length).toBe(4)
})

test('when the pane is not placed, /datatug replies with the text summary', async ($, on) => {
  on('session.cwd', () => ({ value: CWD }))
  on('process.run', fakeCli().stub)
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'no interface here' } }))

  const answer = await $.command.run({ command: 'datatug', args: '' })
  expect(answer.text).toMatch(/^Overview\n {2}DataTug Demo Project 1/)
  expect(answer.text).toContain('\n\nBoards\n  board1 — 1st board')
})

test('when opening a pane fails, /datatug replies with the text summary', async ($, on) => {
  on('session.cwd', () => ({ value: CWD }))
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
  on('process.run', cli.stub)
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.command.run({ command: 'datatug', args: '' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-boards' })
  expect(await ui.find({ type: 'Text', text: '⚠ datatug board list: board "b1" cannot be loaded' })).toBeDefined()
  await ui.press({ key: 'tab-queries' })
  expect(await ui.find({ type: 'Text', text: 'top-level' })).toBeDefined()
  await ui.unmount()
})

test('a listing command that cannot be started is a warning, not a crash', async ($, on) => {
  const cli = fakeCli({ [KEY.queries]: new Error('timed out') })
  on('session.cwd', () => ({ value: CWD }))
  on('process.run', cli.stub)
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.command.run({ command: 'datatug', args: '' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-queries' })
  expect(await ui.find({ type: 'Text', text: /^⚠ datatug queries: / })).toBeDefined()
  await ui.unmount()
})
