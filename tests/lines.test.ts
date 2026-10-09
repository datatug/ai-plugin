import { expect, test } from 'claude-code/testing'
import { MAX_ROWS, SECTIONS, sectionLines, summaryText } from '../lib/lines.js'
import { buildProject } from '../lib/project.js'
import { BOARDS, QUERIES, SHOW, okRun } from './fixtures'

const project = (over: Record<string, unknown> = {}) =>
  buildProject({ show: okRun(SHOW), queries: okRun(QUERIES), boards: okRun(BOARDS), ...over })

const texts = (p: unknown, id: string) => sectionLines(p, id).map((l: { text: string }) => l.text)

test('the four sections are in tab order with hotkeys 1 to 4', async () => {
  expect(SECTIONS.map((s: { id: string }) => s.id)).toEqual(['overview', 'environments', 'queries', 'boards'])
  expect(SECTIONS.map((s: { label: string }) => s.label)).toEqual(['Overview', 'Environments', 'Queries', 'Boards'])
  expect(SECTIONS.map((s: { hotkey: string }) => s.hotkey)).toEqual(['1', '2', '3', '4'])
})

test('overview lines show title, id, access and counts', async () => {
  expect(texts(project(), 'overview')).toEqual([
    'DataTug Demo Project 1',
    'id: datatug-demo-project',
    'access: public',
    '2 environments · 3 queries · 2 boards',
  ])
})

test('environment lines list each source with its driver and what was scanned', async () => {
  expect(texts(project(), 'environments')).toEqual([
    'dev',
    '  no sources',
    'local',
    '  affiliations  https-json · not scanned',
    '  chinook-local  sqlite3 · 2 tables, 1 view',
    '  empty-db  sqlite3 · no tables or views',
  ])
})

test('query lines are an indented folder tree with title and type', async () => {
  expect(texts(project(), 'queries')).toEqual([
    'top-level',
    'customers/',
    '  Customer invoices (customer-invoices) [SQL]',
    'reference/',
    '  country-facts [HTTP]',
  ])
})

test('board lines show the id and the title when there is one', async () => {
  expect(texts(project(), 'boards')).toEqual(['board1 — 1st board', 'board2'])
})

test('a warning is appended as a warn-tone row', async () => {
  const p = project({ boards: { exitCode: 1, stdout: '', stderr: 'board "b1" cannot be loaded' } })
  expect(sectionLines(p, 'boards')).toEqual([
    { text: 'No boards.', tone: 'dim' },
    { text: '⚠ datatug board list: board "b1" cannot be loaded', tone: 'warn' },
  ])
})

test('a failed show says the project details are unavailable', async () => {
  const p = project({ show: { exitCode: 1, stdout: '', stderr: 'boom' } })
  expect(texts(p, 'overview')).toEqual([
    '(project details unavailable)',
    '? environments · 3 queries · 2 boards',
    '⚠ datatug show: boom',
  ])
  expect(texts(p, 'environments')).toEqual(['No environments.', '⚠ datatug show: boom'])
})

test('empty sections say so', async () => {
  const p = project({ show: okRun({ project: 'p' }), queries: okRun([]), boards: okRun([]) })
  expect(texts(p, 'overview')).toEqual(['(untitled project)', 'id: p', 'access: —', '0 environments · 0 queries · 0 boards'])
  expect(texts(p, 'environments')).toEqual(['No environments.'])
  expect(texts(p, 'queries')).toEqual(['No queries.'])
  expect(texts(p, 'boards')).toEqual(['No boards.'])
  expect(sectionLines(p, 'nope')).toEqual([])
})

test('one environment, query and board are counted in the singular', async () => {
  const p = project({
    show: okRun({ project: 'p', environments: [{ id: 'dev', sources: [] }] }),
    queries: okRun([{ id: 'q' }]),
    boards: okRun([{ id: 'b' }]),
  })
  expect(texts(p, 'overview').at(-1)).toBe('1 environment · 1 query · 1 board')
})

test('summaryText prints every section under its label', async () => {
  const text = summaryText(project())
  expect(text.startsWith('Overview\n  DataTug Demo Project 1')).toBe(true)
  expect(text).toContain('\n\nEnvironments\n  dev')
  expect(text).toContain('\n\nQueries\n  top-level')
  expect(text).toContain('\n\nBoards\n  board1 — 1st board')
})

test('a failed boards listing shows ? in place of the board count', async () => {
  const p = project({ boards: { exitCode: 1, stdout: '', stderr: 'boom' } })
  expect(texts(p, 'overview').at(-1)).toBe('2 environments · 3 queries · ? boards')
})

test('a failed queries listing shows ? in place of the query count', async () => {
  const p = project({ queries: { exitCode: 1, stdout: '', stderr: 'boom' } })
  expect(texts(p, 'overview').at(-1)).toBe('2 environments · ? queries · 2 boards')
})

test('a section shows at most MAX_ROWS rows, says how many it left out, and keeps its warnings', async () => {
  expect(MAX_ROWS).toBe(200)
  const many = Array.from({ length: 250 }, (_, i) => ({ id: 'board' + i }))
  const p = project({ boards: okRun(many) })
  const rows = texts(p, 'boards')
  expect(rows.length).toBe(201)
  expect(rows[199]).toBe('board199')
  expect(rows[200]).toBe('… 50 more')
  expect(sectionLines(p, 'boards')[200].tone).toBe('dim')

  const queries = Array.from({ length: 6000 }, (_, i) => ({ id: 'f' + (i % 10) + '/q' + i }))
  const q = texts(project({ queries: okRun(queries) }), 'queries')
  expect(q.length).toBe(201)
  expect(q[200]).toMatch(/^… \d+ more$/)

  const exact = texts(project({ boards: okRun(many.slice(0, 200)) }), 'boards')
  expect(exact.length).toBe(200)
})
