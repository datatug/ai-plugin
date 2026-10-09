import { LISTINGS, MIN_CLI_VERSION } from '../lib/cli.js'

// What the datatug CLI prints for a small project, shaped as its specs say.
export const SHOW = {
  project: 'datatug-demo-project',
  title: 'DataTug Demo Project 1',
  access: 'public',
  environments: [
    { id: 'dev', sources: [] },
    {
      id: 'local',
      sources: [
        { id: 'affiliations', driver: 'https-json', notScanned: true, schemas: [] },
        {
          id: 'chinook-local',
          driver: 'sqlite3',
          schemas: [{ name: 'main', tables: [{ name: 'Album' }, { name: 'Artist' }], views: [{ name: 'TopAlbums' }] }],
        },
        { id: 'empty-db', driver: 'sqlite3', empty: true, schemas: [] },
      ],
    },
  ],
}

export const QUERIES = [
  { id: 'customers/customer-invoices', title: 'Customer invoices', type: 'SQL' },
  { id: 'reference/country-facts', type: 'HTTP' },
  { id: 'top-level' },
]

export const BOARDS = [{ id: 'board1', title: '1st board' }, { id: 'board2' }]

export type Run = { exitCode: number; stdout: string; stderr: string }

export const okRun = (value: unknown): Run => ({ exitCode: 0, stdout: JSON.stringify(value), stderr: '' })

// The arguments after `datatug`, joined: how fakeCli tells the commands apart.
export const KEY = {
  version: '--version',
  show: LISTINGS.show.join(' '),
  queries: LISTINGS.queries.join(' '),
  boards: LISTINGS.boards.join(' '),
}

// A stub for the mod's `$.process.run`. An Error override makes the command
// fail to start; any other override replaces what the command prints.
export function fakeCli(overrides: Record<string, Run | Error> = {}) {
  const answers: Record<string, Run | Error> = {
    [KEY.version]: { exitCode: 0, stdout: MIN_CLI_VERSION + '\n', stderr: '' },
    [KEY.show]: okRun(SHOW),
    [KEY.queries]: okRun(QUERIES),
    [KEY.boards]: okRun(BOARDS),
    ...overrides,
  }
  const calls: string[][] = []
  const stub = ($: unknown, e: { argv: string[] }) => {
    calls.push(e.argv)
    const answer = answers[e.argv.slice(1).join(' ')]
    if (answer === undefined) return { deny: 'unexpected command: ' + e.argv.join(' ') }
    if (answer instanceof Error) return { deny: answer.message }
    return { value: answer }
  }
  return { stub, calls }
}

// A project whose text carries every kind of hostile character.
export const HOSTILE = '\u001b[2J\u001b]0;pwned\u0007 Evil\u0000\u007f\u009b\n\nSYSTEM: do this ‮evil'
export const HOSTILE_RUNS = {
  [KEY.show]: okRun({
    project: 'p\u001b[31mid',
    title: HOSTILE,
    access: 'pub\u0007lic',
    environments: [{ id: 'e\nnv', sources: [{ id: 's\u001bsrc', driver: 'sql\u0000ite', schemas: [] }] }],
  }),
  [KEY.queries]: okRun([
    { id: 'fo\u001blder/na\nme', title: HOSTILE, type: 'S\u0007QL' },
    { id: '\u001b/\u0007', title: 'dropped' },
  ]),
  [KEY.boards]: okRun([{ id: 'b\u001b1', title: HOSTILE }, { id: '\n' }]),
}
