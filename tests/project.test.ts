import { expect, test } from 'claude-code/testing'
import { buildProject } from '../lib/project.js'
import { BOARDS, QUERIES, SHOW, okRun } from './fixtures'

const results = (over: Record<string, unknown> = {}) => ({
  show: okRun(SHOW),
  queries: okRun(QUERIES),
  boards: okRun(BOARDS),
  ...over,
})

test('buildProject reads the overview from datatug show', async () => {
  expect(buildProject(results()).overview).toEqual({
    id: 'datatug-demo-project',
    title: 'DataTug Demo Project 1',
    access: 'public',
    warnings: [],
  })
})

test('buildProject counts the tables and views of each source', async () => {
  expect(buildProject(results()).environments).toEqual({
    items: [
      { id: 'dev', sources: [] },
      {
        id: 'local',
        sources: [
          { id: 'affiliations', driver: 'https-json', tables: 0, views: 0, notScanned: true, empty: false },
          { id: 'chinook-local', driver: 'sqlite3', tables: 2, views: 1, notScanned: false, empty: false },
          { id: 'empty-db', driver: 'sqlite3', tables: 0, views: 0, notScanned: false, empty: true },
        ],
      },
    ],
    warnings: [],
  })
})

test('buildProject turns query IDs into a folder tree', async () => {
  const { tree, count, warnings } = buildProject(results()).queries
  expect(count).toBe(3)
  expect(warnings).toEqual([])
  expect(tree.queries).toEqual([{ id: 'top-level', title: null, type: null }])
  expect(tree.children.map((c: { name: string }) => c.name)).toEqual(['customers', 'reference'])
  expect(tree.children[0].queries).toEqual([{ id: 'customer-invoices', title: 'Customer invoices', type: 'SQL' }])
  expect(tree.children[1].queries).toEqual([{ id: 'country-facts', title: null, type: 'HTTP' }])
})

test('buildProject lists boards with their titles', async () => {
  expect(buildProject(results()).boards).toEqual({
    items: [
      { id: 'board1', title: '1st board' },
      { id: 'board2', title: null },
    ],
    warnings: [],
  })
})

test('a failed listing warns on its own section and leaves the others alone', async () => {
  const project = buildProject(
    results({ boards: { exitCode: 1, stdout: '', stderr: 'ERROR\nboard "b1" cannot be loaded' } }),
  )
  expect(project.boards).toEqual({ items: [], warnings: ['datatug board list: board "b1" cannot be loaded'] })
  expect(project.queries.count).toBe(3)
  expect(project.environments.items.length).toBe(2)
  expect(project.overview.warnings).toEqual([])
})

test('a failed show warns on the overview and the environments', async () => {
  const project = buildProject(results({ show: { exitCode: 1, stdout: '', stderr: 'environment "x": its catalogs cannot be read' } }))
  const warning = 'datatug show: environment "x": its catalogs cannot be read'
  expect(project.overview).toEqual({ id: null, title: null, access: null, warnings: [warning] })
  expect(project.environments).toEqual({ items: [], warnings: [warning] })
  expect(project.queries.count).toBe(3)
  expect(project.boards.items.length).toBe(2)
})

test('JSON of an unexpected shape yields empty sections, not a crash', async () => {
  const project = buildProject({ show: okRun([1, 2]), queries: okRun({ id: 'x' }), boards: okRun([null, { title: 'no id' }, 7]) })
  expect(project.overview).toEqual({ id: null, title: null, access: null, warnings: [] })
  expect(project.environments.items).toEqual([])
  expect(project.queries.count).toBe(0)
  expect(project.boards.items).toEqual([])
})
