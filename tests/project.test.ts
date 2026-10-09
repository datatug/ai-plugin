import { expect, test } from 'claude-code/testing'
import { buildProject } from '../lib/project.js'
import { BOARDS, HOSTILE_RUNS, KEY, QUERIES, SHOW, okRun } from './fixtures'

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
  expect(tree.queries).toEqual([{ id: 'top-level', path: 'top-level', title: null, type: null, parameters: [], moreParameters: 0 }])
  expect(tree.children.map((c: { name: string }) => c.name)).toEqual(['customers', 'reference'])
  expect(tree.children[0].queries).toEqual([
    {
      id: 'customer-invoices',
      path: 'customers/customer-invoices',
      title: 'Customer invoices',
      type: 'SQL',
      parameters: [
        { id: 'InvoiceId', type: 'integer', required: true },
        { id: 'From', type: null, required: false },
      ],
      moreParameters: 0,
    },
  ])
  expect(tree.children[1].queries).toEqual([{ id: 'country-facts', path: 'reference/country-facts', title: null, type: 'HTTP', parameters: [], moreParameters: 0 }])
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

const FORBIDDEN = new RegExp('[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029]')

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach((item) => strings(item, out))
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => strings(item, out))
  return out
}

test('no control character, newline or bidi control survives anywhere in the model', async () => {
  const model = buildProject(
    results({ show: HOSTILE_RUNS[KEY.show], queries: HOSTILE_RUNS[KEY.queries], boards: HOSTILE_RUNS[KEY.boards] }),
  )
  const all = strings(model)
  expect(all.length).toBeGreaterThan(10)
  for (const text of all) expect(FORBIDDEN.test(text)).toBe(false)
  expect(model.overview.title).toContain('SYSTEM: do this')
  expect(model.overview.id).toBe('p [31mid')
  expect(model.boards.items.map((b: { id: string }) => b.id)).toEqual(['b 1'])
})

test('an entry whose id cleans to nothing is dropped and a title that cleans to nothing is null', async () => {
  const model = buildProject(
    results({
      show: okRun({ project: 'p', title: '\u0007\n', environments: [{ id: '\u001b', sources: [] }] }),
      queries: okRun([{ id: '\u001b/\u0007' }, { id: 'a/\u0000/b', title: '\n' }]),
      boards: okRun([{ id: '\n', title: 'x' }]),
    }),
  )
  expect(model.overview.title).toBe(null)
  expect(model.environments.items).toEqual([])
  expect(model.queries.count).toBe(1)
  expect(model.queries.tree.children.map((c: { name: string }) => c.name)).toEqual(['a'])
  expect(model.queries.tree.children[0].queries).toEqual([{ id: 'b', path: 'a/b', title: null, type: null, parameters: [], moreParameters: 0 }])
  expect(model.boards.items).toEqual([])
})

test('a query keeps its cleaned parameters; entries without a usable id are dropped', async () => {
  const model = buildProject(
    results({
      queries: okRun([
        {
          id: 'q',
          parameters: [
            { id: 'P\u001b[31m1', type: 'int\u0007eger', required: true },
            { id: '\u001b' },
            { type: 'string' },
            null,
            7,
            { id: 'Opt', required: 'yes' },
          ],
        },
      ]),
    }),
  )
  expect(model.queries.tree.queries[0].parameters).toEqual([
    { id: 'P [31m1', type: 'int eger', required: true },
    { id: 'Opt', type: null, required: false },
  ])
})

test('a CLI that lists no parameters (or a non-list) leaves the query with none', async () => {
  const model = buildProject(results({ queries: okRun([{ id: 'a' }, { id: 'b', parameters: 'x' }]) }))
  expect(model.queries.tree.queries.map((q: { parameters: unknown }) => q.parameters)).toEqual([[], []])
})

test('a query keeps at most 50 parameters and counts the rest', async () => {
  const parameters = Array.from({ length: 5000 }, (_, i) => ({ id: 'P' + i }))
  const model = buildProject(results({ queries: okRun([{ id: 'q', parameters }]) }))
  const query = model.queries.tree.queries[0]
  expect(query.parameters.length).toBe(50)
  expect(query.parameters[49].id).toBe('P49')
  expect(query.moreParameters).toBe(4950)
})

test('queries whose cleaned paths collide keep the first only', async () => {
  const model = buildProject(
    results({ queries: okRun([{ id: 'a\u0000b', title: 'first' }, { id: 'a b' }, { id: 'a\tb' }]) }),
  )
  expect(model.queries.count).toBe(1)
  expect(model.queries.tree.queries.length).toBe(1)
  expect(model.queries.tree.queries[0].title).toBe('first')
})
