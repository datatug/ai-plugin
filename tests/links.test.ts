import { expect, test } from 'claude-code/testing'

import { MIN_CLI_VERSION } from '../lib/cli.js'
import { LINK_MIN_CLI_VERSION, MESSAGES, bigIntegers, checkHref, fingerprint, isSameHost, keyValue, parseDevHost, rawFields, readLink, recordKey, statusPort, urlArgs } from '../lib/links.js'
import { sourceName, sqlitePath } from '../hooks/register'

// What `datatug daemon url --format json` 0.86.0 prints, as run against the demo project.
const CODE = 'v1.1792102025.FA7rMn3JXdmlXSxgNGgviQ.Q-D8dlpnyOYsqQ6lXO550An8-OcBqtYFViaarabdpGI'
const STORE = 'https://datatug.app/store/http-127.0.0.1:8989/project/demo-project-1/env/local/db/chinook-local'
const TABLE = `${STORE}/table/Album?schema=#code=${CODE}`
const RECORDS = `${STORE}/table/Album/records?limit=100&schema=#code=${CODE}`
const RECORD = `${STORE}/table/PlaylistTrack/record?schema=#code=${CODE}&pk=%7B%22PlaylistId%22%3A1%2C%22TrackId%22%3A3402%7D`

const run = (value: unknown, exitCode = 0, stderr = '') => ({ exitCode, stdout: typeof value === 'string' ? value : JSON.stringify(value, null, 2), stderr })
const STATUS = run({ running: true, url: 'http://127.0.0.1:8989', uiBase: 'https://datatug.app/store/http-127.0.0.1:8989', port: 8989 })
const url = (u: string, kind: string, over: Record<string, unknown> = {}) => run({ url: u, kind, running: true, uiSupport: 'available', ...over })

test('the link feature needs datatug 0.86.0, later than the panel itself', () => {
  expect(LINK_MIN_CLI_VERSION).toBe('0.86.0')
  expect(MIN_CLI_VERSION).toBe('0.84.1')
})

test('the three links the CLI prints pass the checks as they are', () => {
  expect(readLink(STATUS, url(TABLE, 'table-metadata'), 'table', null)).toEqual({ status: 'ok', href: TABLE })
  expect(readLink(STATUS, url(RECORDS, 'table-records'), 'records', null)).toEqual({ status: 'ok', href: RECORDS })
  expect(readLink(STATUS, url(RECORD, 'record'), 'record', null)).toEqual({ status: 'ok', href: RECORD })
})

test('a daemon that is not running, a pending view and a missing CLI give their warnings, never a link', () => {
  expect(readLink(STATUS, url(TABLE, 'table-metadata', { running: false }), 'table', null)).toEqual({ status: 'down' })
  expect(readLink(STATUS, url(TABLE, 'table-metadata', { uiSupport: 'pending' }), 'table', null)).toEqual({ status: 'pending' })
  expect(readLink(STATUS, url(TABLE, 'table-metadata', { uiSupport: 'unavailable' }), 'table', null)).toEqual({ status: 'pending' })
  expect(readLink(null, null, 'table', null)).toEqual({ status: 'down' })
})

test('an older CLI is told apart: an unknown command, no kind, or a link without a one-time code', () => {
  expect(readLink(STATUS, run('', 1, 'Error: unknown command "url" for "datatug daemon"'), 'table', null)).toEqual({ status: 'old-cli' })
  expect(readLink(STATUS, run({ url: TABLE }), 'table', null)).toEqual({ status: 'old-cli' })
  // v0.84 put the key in the query: not a link the mod trusts.
  expect(readLink(STATUS, url(`${STORE}/table/Album/record?pk=%7B%22AlbumId%22%3A1%7D`, 'record'), 'record', null).status).not.toBe('ok')
  expect(readLink(STATUS, url(`${STORE}/table/Album?schema=`, 'table-metadata'), 'table', null)).toEqual({ status: 'old-cli' })
})

test('a failed or unreadable answer is unavailable', () => {
  expect(readLink(STATUS, run('', 2, 'identifiers must be ids'), 'table', null)).toEqual({ status: 'unavailable' })
  expect(readLink(STATUS, run('not json'), 'table', null)).toEqual({ status: 'unavailable' })
  expect(readLink(STATUS, url(TABLE, 'record'), 'table', null)).toEqual({ status: 'unavailable' })
  expect(readLink(run('', 1), url(TABLE, 'table-metadata'), 'table', null)).toEqual({ status: 'unavailable' })
})

test('no link with credentials, another origin, another port or path, a second scheme or extra parameters is drawn', () => {
  const bad = [
    TABLE.replace('https://datatug.app', 'https://u:s3cret@datatug.app'),
    TABLE.replace('/project/', '/project/u@h/'),
    TABLE.replace('https://datatug.app', 'https://datatug.app.evil.com'),
    TABLE.replace('https://datatug.app', 'http://datatug.app'),
    TABLE.replace('https://datatug.app', 'https://x.datatug.app'),
    TABLE.replace('8989', '9999'),
    TABLE.replace('http-127.0.0.1', 'http-localhost'),
    TABLE.replace('/project/', '/project/postgres://u:p@h/'),
    TABLE.replace('/table/Album', '/table/../../evil'),
    TABLE.replace('?schema=', '?schema=&where=1'),
    TABLE.replace('?schema=', '?dsn=postgres%3A%2F%2Fu'),
    `${TABLE}&token=abc`,
    `${TABLE}&pk=%7B%7D`,
    `${TABLE.split('#')[0]}#code=`,
    `${TABLE} `,
    `${TABLE}${'a'.repeat(2048)}`,
    'javascript:alert(1)',
    '',
  ]
  for (const href of bad) expect(checkHref(href, 'table', 8989, null).status).not.toBe('ok')
  expect(checkHref(RECORD.replace(/&pk=.*$/, ''), 'record', 8989, null).status).not.toBe('ok')
  expect(checkHref(RECORDS.replace('limit=100&', ''), 'records', 8989, null).status).not.toBe('ok')
})

test('a base other than https://datatug.app is a development build unless it is the configured dev host', () => {
  const dev = TABLE.replace('https://datatug.app', 'http://datatug.localhost:4200')
  expect(checkHref(dev, 'table', 8989, null)).toEqual({ status: 'dev' })
  expect(checkHref(dev, 'table', 8989, 'http://datatug.localhost:4201')).toEqual({ status: 'dev' })
  expect(checkHref(dev, 'table', 8989, 'http://datatug.localhost:4200')).toEqual({ status: 'ok', href: dev })
  expect(checkHref(TABLE.replace('https://datatug.app', 'http://localhost:4200'), 'table', 8989, 'http://datatug.localhost:4200')).toEqual({ status: 'dev' })
  // A configured dev host never turns away the hosted UI.
  expect(checkHref(TABLE, 'table', 8989, 'http://datatug.localhost:4200')).toEqual({ status: 'ok', href: TABLE })
})

test('only http(s)://datatug.localhost with an optional port is a development host', () => {
  expect(parseDevHost('http://datatug.localhost')).toBe('http://datatug.localhost')
  expect(parseDevHost('https://datatug.localhost:4200/')).toBe('https://datatug.localhost:4200')
  for (const v of ['', 'datatug.localhost', 'http://evil.datatug.localhost', 'http://datatug.localhost.evil.com', 'http://xdatatug.localhost', 'http://datatug.localhost@evil.com', 'http://datatug.localhost:0', 'http://datatug.localhost:70000', 'http://datatug.localhost/app', 'https://datatug.app', 'http://localhost:4200', undefined, 42])
    expect(parseDevHost(v)).toBe(null)
})

test('the daemon port comes from daemon status', () => {
  expect(statusPort(STATUS)).toBe(8989)
  expect(statusPort(run({ port: 'x' }))).toBe(null)
  expect(statusPort(run('', 1))).toBe(null)
  expect(statusPort(null)).toBe(null)
})

test('a link is drawn only on the terminal of the machine that runs the agent', () => {
  expect(isSameHost('terminal', false)).toBe(true)
  expect(isSameHost('terminal', true)).toBe(false)
  for (const s of ['desktop', 'vscode', 'mobile', undefined]) expect(isSameHost(s, false)).toBe(false)
})

test('daemon url is asked with a project reference and never a connection string', () => {
  const db = 'datatug://p1/chinook?env=local'
  expect(urlArgs({ kind: 'table', db, table: 'Album' })).toEqual(['daemon', 'url', '--db', db, '--table', 'Album', '--format', 'json'])
  expect(urlArgs({ kind: 'records', db, table: 'v', isView: true, limit: 100, schema: 'public' })).toEqual(['daemon', 'url', '--db', db, '--table', 'v', '--schema', 'public', '--view', '--records', '--limit', '100', '--format', 'json'])
  expect(urlArgs({ kind: 'record', db, table: 'T', key: { Id: '9007199254740993' } })).toEqual(['daemon', 'url', '--db', db, '--table', 'T', '--record', '{"Id":"9007199254740993"}', '--format', 'json'])
  for (const bad of ['postgres://u:s3cret@h/d', 'env:DATATUG_OPEN_DB', '/home/user/secret-dir/x.sqlite', ''])
    expect(urlArgs({ kind: 'table', db: bad, table: 'Album' })).toBe(null)
  expect(urlArgs({ kind: 'table', db, table: '-x' })).toBe(null)
  expect(urlArgs({ kind: 'record', db, table: 'T', key: {} })).toBe(null)
})

test('key values are read losslessly from the raw row', () => {
  expect(rawFields('{"Id":9007199254740993,"Name":"a,\\"}b","N":{"x":[1,{"y":"}"}]},"z":null}')).toEqual({ Id: '9007199254740993', Name: '"a,\\"}b"', N: '{"x":[1,{"y":"}"}]}', z: 'null' })
  expect(rawFields('[1]')).toBe(null)
  expect(rawFields('{"a":1')).toBe(null)
  expect(keyValue('9007199254740993')).toEqual({ value: '9007199254740993' })
  expect(keyValue('-9007199254740993')).toEqual({ value: '-9007199254740993' })
  expect(keyValue('9007199254740991')).toEqual({ value: 9007199254740991 })
  expect(keyValue('"x@y.com"')).toEqual({ value: 'x@y.com' })
  for (const raw of ['null', 'true', '{"a":1}', '[1]', '""', JSON.stringify('x'.repeat(257)), '1.5', undefined]) expect('why' in keyValue(raw as string)).toBe(true)
})

test('the record key holds the declared primary-key columns only, never $key or another column', () => {
  const row = { $key: 'rid', PlaylistId: 1, TrackId: 3402, Secret: 's3cret' }
  expect(recordKey(['PlaylistId', 'TrackId'], row, null)).toEqual({ key: { PlaylistId: 1, TrackId: 3402 } })
  expect(recordKey(['playlistid'], row, null)).toEqual({ key: { PlaylistId: 1 } })
  expect(recordKey([], row, null)).toEqual({ why: 'the table has no declared primary key' })
  expect('why' in recordKey(['Missing'], row, null)).toBe(true)
  expect('why' in recordKey(['$key'], row, null)).toBe(true)
  expect('why' in recordKey(['Id'], undefined as never, null)).toBe(true)
  for (const v of [null, true, 1.5, { a: 1 }, '', 'x'.repeat(257)]) expect('why' in recordKey(['Id'], { Id: v }, null)).toBe(true)
  expect(recordKey(['Id'], { Id: "O'Brien (1)" }, null)).toEqual({ key: { Id: "O'Brien (1)" } })
})

test('only the integers JSON.parse rounds are kept, as their digits, and they make the key', () => {
  const line = '{"Id":9007199254740993,"Small":5,"Name":"9007199254740993","N":{"x":9007199254740993}}'
  expect(bigIntegers(line)).toEqual({ Id: '9007199254740993' })
  expect(bigIntegers('{"Id":5,"Name":"x"}')).toBe(null)
  const row = JSON.parse(line)
  expect(recordKey(['Id'], row, bigIntegers(line))).toEqual({ key: { Id: '9007199254740993' } })
  // Without the digits a rounded integer is refused, never sent rounded.
  expect('why' in recordKey(['Id'], row, null)).toBe(true)
})

test('characters encodeURIComponent leaves as they are pass; a percent-encoded dot segment does not', () => {
  const quoted = `${STORE}/table/O'Brien(1)!*/record?schema=#code=${CODE}&pk=%7B%22Name%22%3A%22O'Brien%20(1)!*%22%7D`
  expect(checkHref(quoted, 'record', 8989, null)).toEqual({ status: 'ok', href: quoted })
  for (const seg of ['%2e%2e', '%2E%2e', '.%2e', '%2e']) expect(checkHref(TABLE.replace('/table/Album', `/table/${seg}/x`), 'table', 8989, null).status).not.toBe('ok')
})

test('session state names a request by a fingerprint, not by its key', () => {
  const a = fingerprint('["daemon","url","--record","{\\"Id\\":5}"]')
  expect(a).toMatch(/^[0-9a-f]{8}$/)
  expect(a).not.toBe(fingerprint('["daemon","url","--record","{\\"Id\\":6}"]'))
})

test('a database is added under a plain source id, a SQLite file by its plain path', () => {
  expect(sourceName('sqlite:///home/user/secret-dir/My Chinook.sqlite')).toBe('My-Chinook')
  expect(sourceName('postgres://u:s3cret@db.example/shop')).toBe('shop')
  expect(sourceName('postgres://u:s3cret@db.example/')).not.toContain('s3cret')
  expect(sqlitePath('sqlite:///data/x.sqlite')).toBe('/data/x.sqlite')
  expect(sqlitePath('sqlite://user:s3cret@/tmp/x.db')).toBe(null)
  expect(sqlitePath('sqlite:///tmp/x.db?mode=ro')).toBe(null)
})

test('a daemon that could not start for want of a principal is named, from status or url', () => {
  const status = run({ running: false, port: 0, error: 'could not start', startError: 'policy-principal-required' })
  expect(readLink(status, url(TABLE, 'table-metadata', { running: false }), 'table', null)).toEqual({ status: 'policy-principal' })
  expect(readLink(STATUS, url(TABLE, 'table-metadata', { running: false, startError: 'policy-principal-required' }), 'table', null)).toEqual({ status: 'policy-principal' })
  expect(readLink(status, url(TABLE, 'table-metadata', { running: false, uiSupport: 'pending' }), 'table', null)).toEqual({ status: 'policy-principal' })
  // Another or no reason stays the plain warning; a running daemon is not blamed.
  expect(readLink(run({ running: false, startError: 'other' }), url(TABLE, 'table-metadata', { running: false }), 'table', null)).toEqual({ status: 'down' })
  expect(readLink(run({ running: true, port: 8989, startError: 'policy-principal-required' }), url(TABLE, 'table-metadata'), 'table', null)).toEqual({ status: 'ok', href: TABLE })
  expect(MESSAGES['policy-principal']).toContain('datatug serve --as')
  expect(MESSAGES['policy-principal']).not.toMatch(/\/|policies/)
})
