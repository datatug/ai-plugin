import { expect, test } from 'claude-code/testing'

import { bagPrompt, resolveBagDb } from '../hooks/register'
import type { BagEntry } from '../types'

const DB = 'datatug://demo-project-1/chinook-local?env=local'
const table: BagEntry = { id: 't', address: 'contextBag.table', value: 'Artist', source: 'sqlite table', isOn: true, kind: 'table', table: 'Artist', db: DB }
const column: BagEntry = { id: 'c', address: 'contextBag.column', value: 'Album.Title', source: 'sqlite column', isOn: true, kind: 'column', table: 'Album', column: 'Title', db: DB }
const record: BagEntry = { id: 'r', address: 'contextBag.Artist.ArtistId', value: '5', source: 'Artist row 1', isOn: true, kind: 'value', table: 'Artist', column: 'ArtistId', db: DB }

const TAIL =
  'Quote the reference as shown; use --db with it only (never --project with --db). Never look for connection strings and never read the DataTug store. ' +
  'The rows appear in the panel card, not to you. "Top N" with no ranking column named means the first N rows (--limit N). The environment is the one in the reference. ' +
  'Ask only if the database is not recorded and the project has several. Then reply with one line saying the result is in the panel card; do not offer to read, list or paste rows.\n\n'
const head = (db: string) => `Answer by running this at once, without asking and without loading skills: datatug query run --db '${db}' --from <table> --limit <N> --no-policies\n`

test('a table item names its database and the one command to run', () => {
  expect(bagPrompt([table], 'demo-project-1')).toBe(
    `My DataTug context bag (project demo-project-1):\n- table Artist (database ${DB})\n\n${head(DB)}${TAIL}`,
  )
})

test('a column item', () => {
  expect(bagPrompt([column], 'demo-project-1')).toBe(
    `My DataTug context bag (project demo-project-1):\n- column Album.Title (database ${DB})\n\n${head(DB)}${TAIL}`,
  )
})

test('a record item (a value of a result row)', () => {
  expect(bagPrompt([record], 'demo-project-1')).toBe(
    `My DataTug context bag (project demo-project-1):\n- Artist.ArtistId = 5 (database ${DB})\n\n${head(DB)}${TAIL}`,
  )
})

test('several items, each with its database', () => {
  const other = 'datatug://demo-project-1/chinook-prod?env=prod'
  const out = bagPrompt([table, { ...column, db: other }], 'demo-project-1')
  expect(out).toContain(`- table Artist (database ${DB})\n- column Album.Title (database ${other})\n`)
  expect(out).toContain(head(DB))
})

test('an item with no database uses the database the panel has open', () => {
  const bare: BagEntry = { ...table, db: undefined }
  expect(bagPrompt([bare], 'demo-project-1', DB)).toContain(`- table Artist (database ${DB})`)
  expect(bagPrompt([bare], 'demo-project-1', DB)).toContain(head(DB))
})

test('with no database at all the prompt says so and keeps the command shape', () => {
  const bare: BagEntry = { ...table, db: undefined }
  const out = bagPrompt([bare], null)
  expect(out).toBe(`My DataTug context bag:\n- table Artist (database not recorded)\n\n${head('<datatug:// database ref>')}${TAIL}`)
})

test('only a datatug:// reference is ever written as the database; a connection string is not', () => {
  const bad: BagEntry = { ...table, db: 'postgres://app:pw-s3cret@host/shop' }
  const out = bagPrompt([bad], 'p', 'sqlite:///tmp/x.db')
  expect(out.includes('pw-s3cret')).toBe(false)
  expect(out.includes('postgres://')).toBe(false)
  expect(out.includes('sqlite://')).toBe(false)
  expect(out).toContain('database not recorded')
})

const LOCAL = { id: 'chinook-local', env: 'local' }
const PROD = { id: 'chinook-prod', env: 'prod' }
const PROD_REF = 'datatug://demo-project-1/chinook-prod?env=prod'
const old: BagEntry = { ...table, db: undefined }

test('the prompt never carries a "My question:" label and ends after the instruction block', () => {
  const out = bagPrompt([table], 'demo-project-1')
  expect(out.includes('My question')).toBe(false)
  expect(out.endsWith('rows.\n\n')).toBe(true)
  expect(out.includes('paste the rows')).toBe(false)
})

test('an old persisted entry with no database, two sources (local and prod): the local one is the default and says so', () => {
  const out = bagPrompt([old], 'demo-project-1', '', [PROD, LOCAL])
  expect(out).toContain(`- table Artist (database ${DB}, default: local)`)
  expect(out).toContain(head(DB))
  expect(out.includes(PROD_REF)).toBe(false)
})

test('two sources and none local: still not recorded, Claude asks', () => {
  const out = bagPrompt([old], 'demo-project-1', '', [PROD, { id: 'chinook-stage', env: 'stage' }])
  expect(out).toContain('- table Artist (database not recorded)')
  expect(out).toContain(head('<datatug:// database ref>'))
})

test('two local sources are ambiguous too', () => {
  expect(resolveBagDb(undefined, '', 'p', [LOCAL, { id: 'b', env: 'local' }]).ref).toBe('')
})

test('one source is used and says so', () => {
  const out = bagPrompt([old], 'demo-project-1', '', [PROD])
  expect(out).toContain(`- table Artist (database ${PROD_REF}, default: the only database)`)
})

test('the open database and a recorded reference win over the default; a recorded prod stays prod', () => {
  expect(resolveBagDb(undefined, DB, 'p', [PROD, LOCAL])).toEqual({ ref: DB, rule: '' })
  expect(resolveBagDb(PROD_REF, '', 'p', [LOCAL])).toEqual({ ref: PROD_REF, rule: '' })
})

test('a default is always a datatug:// reference, even for odd ids', () => {
  const r = resolveBagDb(undefined, '', 'p', [{ id: 'a b@c', env: 'local' }])
  expect(r.ref.startsWith('datatug://')).toBe(true)
})
