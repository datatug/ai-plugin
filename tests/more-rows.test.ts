import { expect, test } from 'claude-code/testing'

import { REF, fakeWorld as world, result, toolUse } from './card-fixtures'
import { MORE_TEXT, ROW_COUNTS, failureReason, moreArgs, moreErrorText, moreGate, moreId } from '../lib/more.js'
import { readMeta } from '../lib/results.js'

const CMD = 'datatug query run --db datatug://demo/chinook --from Album --no-policies'
const run = ($: any, id: string, command = CMD) => $.tool.call({ tool: 'Bash', tool_use_id: id, command } as never)
const text = async (tree: any) => JSON.stringify(await tree.drawn())
const fp = (s: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
const key = (id: string, ...parts: (string | number)[]) => `qr:${fp(id)}:${parts.join(':')}`
const PANE_ARGS = { plugin: 'datatug', surface: 'terminal', component: 'Pane', requestId: 'datatug', props: { bodyColumns: 100 } }
const PROMPT = 'show me the SECRET-PROMPT-WORDS albums by Alice'
const say = ($: any, t = PROMPT) => $.prompt.submit({ text: t, origin: { kind: 'composer' } } as never)

const FROM = { kind: 'from', from: 'Album', policy: 'none', dbRef: REF, text: 'from: {name: Album}\nlimit: 3\n' }
// A table read of `n` rows, as the CLI writes it.
const read = (id: string, n: number, query: Record<string, unknown> = FROM) => result(id, { query, kept: n })
const base = (id: string, query: Record<string, unknown> = FROM, kept = 3) => result(id, { query, kept })

type Reply = { exitCode: number; stdout: string; stderr: string }
const IN_USE: Reply = { exitCode: 2, stdout: '{"resultFiles":null,"reason":"result-id-in-use"}\n', stderr: 'query results: result-id-in-use\n' }
const OK: Reply = { exitCode: 0, stdout: '{"resultFiles":{"version":1}}\n', stderr: '' }

// A CLI that writes the result of the id it is given (as many rows as --limit) unless it exists.
function world2(on: any, files: Record<string, string>, over: Record<string, unknown> = {}) {
  const writes: string[][] = []
  const cli = world(on, files, {
    version: '0.101.0',
    queryRun: argv => {
      writes.push(argv)
      const id = argv[argv.indexOf('--result-id') + 1]
      if (Object.keys(files).some(f => f.includes(`/${id}/`))) return IN_USE
      const n = Number(argv.find(a => a.startsWith('--limit='))?.slice(8))
      Object.assign(files, read(id, n))
      return OK
    },
    ...over,
  } as never)
  return { cli, writes }
}

const buttons = (drawn: string, id: string) => ROW_COUNTS.map(n => drawn.includes(key(id, 'more', n)))

test('the row counts and the id of each result', () => {
  expect(ROW_COUNTS).toEqual([10, 50, 100, 500])
  expect(moreId('m1', 50)).toBe('m1-r50')
  expect(moreId('m1', 7)).toBe(null)
  expect(moreId('x'.repeat(123), 500)).toBe('x'.repeat(123) + '-r500')
  expect(moreId('x'.repeat(124), 500)).toBe(null)
  expect(moreId('x'.repeat(125), 10)).toBe(null)
  expect(moreId('bad id', 10)).toBe(null)
})

const meta = (query: Record<string, unknown>, kind = 'from') => ({ kind, query })

test('the gate: only a table read without policies, from the first row, of a plain table in a project database', () => {
  expect(moreGate(meta(FROM), 'm1')).toEqual({ ok: true, table: 'Album', dbRef: REF })
  const no = (m: unknown, reason: string, id = 'm1') => expect(moreGate(m, id)).toEqual({ ok: false, reason })
  no(meta({ ...FROM }, 'saved'), 'saved')
  no(meta({ ...FROM }, 'dtql'), 'kind')
  no(meta({ ...FROM }, ''), 'kind')
  for (const policy of ['discovered', 'dir', 'explicit', 'project']) no(meta({ ...FROM, policy }), 'policy')
  for (const dbRef of [null, '', 'sqlite:///tmp/x.db', 'datatug:///chinook', 'datatug://demo/chinook?env=local&x=1', 'datatug://demo/chinook?env=a b', 'datatug://us%40er/db', 'https://evil.example/']) no(meta({ ...FROM, dbRef }), 'ref')
  for (const text of ['from: {name: Album}\noffset: 5\nlimit: 3\n', '{"from":{"name":"Album"},"offset": 2}', 'OFFSET : 1']) no(meta({ ...FROM, text }), 'offset')
  for (const from of ['-x', '--help', 'a b', 'a\nb', 'a;b', 'a|b', '$(x)', '`x`', "a'b", 'a"b', 'a/b', '..', '.x', '', 'x'.repeat(129), 'é']) no(meta({ ...FROM, from }), 'table')
  no(meta(FROM), 'id', 'x'.repeat(124))
  for (const missing of ['policy', 'text', 'from']) no(meta({ ...FROM, [missing]: null }), 'old')
  no({ kind: 'from' }, 'old')
  for (const from of ['Album', 'main.Album', 'Playlist_Track', 'a$b', 'a-b', 'T1.2', '_t']) expect(moreGate(meta({ ...FROM, from }), 'm1')).toEqual({ ok: true, table: from, dbRef: REF })
  // Every reason has its line, and none holds a value.
  for (const reason of ['saved', 'kind', 'policy', 'ref', 'offset', 'table', 'id', 'old']) expect(MORE_TEXT[reason as keyof typeof MORE_TEXT]).toMatch(/^Rows buttons need /)
  expect(MORE_TEXT.policy).toBe('Rows buttons need a table read without policies')
})

test('readMeta keeps the query as written, and null for what is not a bounded plain string', () => {
  const doc = JSON.parse(read('m1', 3)['/home/u/.datatug/query-results/m1/meta.json'])
  const keep = (q: unknown) => readMeta(JSON.stringify({ ...doc, query: q }), 'm1').meta?.query
  expect(keep(FROM)).toEqual({ from: 'Album', policy: 'none', dbRef: REF, text: FROM.text })
  expect(keep({ kind: 'from', from: 'a\nb', policy: 'none', dbRef: 5, text: 'x'.repeat(5000) })).toEqual({ from: null, policy: 'none', dbRef: null, text: null })
  expect(keep(undefined)).toEqual({ from: null, policy: null, dbRef: null, text: null })
})

test('the arguments are fixed: one value each, no shell, the table after --from= and never a flag', () => {
  expect(moreArgs(REF, 'Album', 50, 'm1-r50')).toEqual(['query', 'run', `--db=${REF}`, '--from=Album', '--limit=50', '--no-policies', '--result-id', 'm1-r50', '--format', 'json'])
  expect(moreArgs(REF, 'Album', 7, 'm1-r7')).toBe(null)
  expect(moreArgs(REF, 'Album', 50, 'm1-r10')).toBe(null)
  expect(moreArgs(REF, 'Album', 50, 'bad id-r50')).toBe(null)
  expect(moreArgs('sqlite:///x.db', 'Album', 50, 'm1-r50')).toBe(null)
  for (const t of ['-x', 'a b', 'a;b', '$x', '']) expect(moreArgs(REF, t, 50, 'm1-r50')).toBe(null)
  expect(moreArgs(REF, 'x'.repeat(129), 50, 'm1-r50')).toBe(null)
})

test('a store failure is read from the failure line, or the message; nothing else is trusted', () => {
  expect(failureReason(IN_USE.stdout, '')).toBe('result-id-in-use')
  expect(failureReason('', 'query results: results-store-unwritable\n')).toBe('results-store-unwritable')
  expect(failureReason('{"resultFiles":null,"reason":"/etc/passwd"}', '')).toBe(null)
  expect(failureReason('{"resultFiles":{"x":1}}', 'boom /home/u/x')).toBe(null)
  expect(failureReason('{"resultFiles"', '')).toBe(null)
  expect(moreErrorText('results-store-unwritable')).toContain('~/.datatug/query-results')
  expect(moreErrorText('/etc/passwd')).toBe('DataTug could not read those rows. Try again')
  expect(moreErrorText('toString')).toBe('DataTug could not read those rows. Try again')
})

test('a table read shows the row counts under the views, next to Copy; nothing is highlighted before a press', async ($, on) => {
  world2(on, base('m1'))
  await run($, 'm1')
  const drawn = await text(await $.ui.mount(toolUse('m1', CMD) as never))
  expect(buttons(drawn, 'm1')).toEqual([true, true, true, true])
  expect(drawn).toContain('○ 10')
  expect(drawn).toContain('○ 500')
  expect(drawn.includes('●  ') || /● (10|50|100|500)/.test(drawn)).toBe(false)
  expect(drawn.includes(key('m1', 'more', 'original'))).toBe(false)
  expect(drawn.indexOf(key('m1', 'rows-csv'))).toBeLessThan(drawn.indexOf(key('m1', 'more', 10)))
  expect(drawn.indexOf(key('m1', 'view', 'related'))).toBeLessThan(drawn.indexOf(key('m1', 'rows-csv')))
})

test('pressing a count reads the same table again through a fixed argument list and swaps the card in place', async ($, on) => {
  const { cli, writes } = world2(on, base('m1'))
  const told = JSON.stringify(await run($, 'm1'))
  const tree = await $.ui.mount(toolUse('m1', CMD) as never)
  const before = cli.runs.length
  await tree.press({ key: key('m1', 'more', 50) } as never)
  expect(writes).toEqual([['datatug', 'query', 'run', `--db=${REF}`, '--from=Album', '--limit=50', '--no-policies', '--result-id', 'm1-r50', '--format', 'json']])
  const call = cli.runs.slice(before).find(a => a.includes('query') && a.includes('run')) as string[]
  // No shell syntax in any argument; only the reference holds a `?`, `=` and `%`.
  for (const a of call.slice(1)) expect(a).not.toMatch(/[\s'"`;|&$<>(){}*\\!#~\n]/)
  const drawn = await text(tree)
  expect(drawn).toContain('50 rows x 4 columns')
  expect(drawn.includes('3 rows x 4 columns')).toBe(false)
  expect(drawn).toContain('● 50')
  expect(drawn).toContain('○ 100')
  expect(drawn).toContain(key('m1', 'more', 'original'))
  // The card is the same call's card; the model was not told and no line, toast or Bash command was made.
  expect(told).toContain('3 rows')
  expect(cli.bash).toHaveLength(1)
  expect(cli.toasts).toEqual([])
  expect(cli.logs.filter(l => !l.startsWith('DataTug: result card above'))).toEqual([])
  expect(cli.runs.some(a => a.includes('--no-policies') && a !== call)).toBe(false)
})

test('the env of the re-run is the mod\'s caller name only', async ($, on) => {
  const seen: unknown[] = []
  const { cli } = world2(on, base('m1'), {
    queryRun: (argv: string[], init: any) => {
      seen.push(init?.env, init?.stdin)
      return IN_USE
    },
  })
  await run($, 'm1')
  const tree = await $.ui.mount(toolUse('m1', CMD) as never)
  await tree.press({ key: key('m1', 'more', 10) } as never)
  expect(seen[0]).toEqual({ DATATUG_CLIENT: 'claude-mod' })
  expect(seen[1]).toBeUndefined()
  expect(cli.runs.length).toBeGreaterThan(0)
})

test('the panel card and the transcript card are one state', async ($, on) => {
  world2(on, base('m1'))
  await run($, 'm1')
  const row = await $.ui.mount(toolUse('m1', CMD) as never)
  const pane = await $.ui.mount(PANE_ARGS as never)
  await pane.press({ key: key('m1', 'more', 100) } as never)
  expect(await text(row)).toContain('● 100')
  expect(await text(pane)).toContain('100 rows x 4 columns')
  expect(await text(row)).toContain('100 rows x 4 columns')
})

test('while a read runs the counts are not buttons, the card says so, and a second press does not start a second run', async ($, on) => {
  let release: () => void = () => {}
  const gate = new Promise<void>(r => (release = r))
  const files = base('m1')
  const { cli, writes } = world2(on, files, {
    queryRun: async (argv: string[]) => {
      writes.push(argv)
      await gate
      Object.assign(files, read('m1-r50', 50))
      return OK
    },
  })
  const tree0 = await run($, 'm1')
  expect(tree0).toBeDefined()
  const tree = await $.ui.mount(toolUse('m1', CMD) as never)
  const first = tree.press({ key: key('m1', 'more', 50) } as never)
  await new Promise(r => setTimeout(r, 20))
  const busy = await text(tree)
  expect(buttons(busy, 'm1')).toEqual([false, false, false, false])
  expect(busy).toContain('Reading 50 rows…')
  expect(busy.includes(key('m1', 'more', 'original'))).toBe(false)
  // A press that gets through anyway (the old tree, a race) is ignored.
  await tree.press({ key: key('m1', 'more', 100) } as never).catch(() => undefined)
  await tree.press({ key: key('m1', 'more', 50) } as never).catch(() => undefined)
  release()
  await first
  expect(writes).toHaveLength(1)
  const done = await text(tree)
  expect(done).toContain('50 rows x 4 columns')
  expect(done.includes('Reading')).toBe(false)
  expect(buttons(done, 'm1')).toEqual([true, true, true, true])
  expect(cli.runs.filter(a => a.includes('--limit=50'))).toHaveLength(1)
})

test('pressing the count shown does nothing; Original returns to the first result; a size read before is loaded, not run again', async ($, on) => {
  const { cli, writes } = world2(on, base('m1'))
  await run($, 'm1')
  const tree = await $.ui.mount(toolUse('m1', CMD) as never)
  await tree.press({ key: key('m1', 'more', 50) } as never)
  await tree.press({ key: key('m1', 'more', 50) } as never)
  expect(writes).toHaveLength(1)
  await tree.press({ key: key('m1', 'more', 'original') } as never)
  let drawn = await text(tree)
  expect(drawn).toContain('3 rows x 4 columns')
  expect(drawn.includes(key('m1', 'more', 'original'))).toBe(false)
  expect(drawn.includes('● 50')).toBe(false)
  expect(writes).toHaveLength(1)
  // 50 again: the CLI says the id is in use (the size exists), and that result is shown.
  await tree.press({ key: key('m1', 'more', 50) } as never)
  expect(writes).toHaveLength(2)
  drawn = await text(tree)
  expect(drawn).toContain('50 rows x 4 columns')
  expect(drawn).toContain('● 50')
  expect(drawn.includes('could not')).toBe(false)
  // A result is only ever annotated once (this card never had a prompt, so none at all).
  expect(cli.runs.filter(a => a.includes('annotate'))).toHaveLength(0)
  // Another size from the new result still names the first call's id.
  await tree.press({ key: key('m1', 'more', 500) } as never)
  expect(writes[2]).toContain('m1-r500')
  expect(await text(tree)).toContain('500 rows x 4 columns')
})

test('a new result is stored with the first result\'s prompt, on standard input; not the latest prompt, not an argument', async ($, on) => {
  const { cli } = world2(on, base('m1'))
  await say($)
  await run($, 'm1')
  await say($, 'a different question entirely')
  const tree = await $.ui.mount(toolUse('m1', CMD) as never)
  await tree.press({ key: key('m1', 'more', 50) } as never)
  await new Promise(r => setTimeout(r, 20))
  expect(cli.stdins.map(s => [s.argv[5], s.stdin])).toEqual([
    ['m1', PROMPT],
    ['m1-r50', PROMPT],
  ])
  expect(cli.stdins[1].argv).toEqual(['datatug', 'query', 'results', 'annotate', '--id', 'm1-r50', '--prompt-stdin'])
  expect(cli.stdins[1].env).toEqual({ DATATUG_CLIENT: 'claude-mod' })
  const seen = [JSON.stringify(cli.runs.map(a => a.filter(x => x !== PROMPT))), JSON.stringify(cli.logs), JSON.stringify(cli.toasts), JSON.stringify(cli.bash), await text(tree)].join('\n')
  expect(seen).not.toContain('SECRET-PROMPT-WORDS')
  expect(seen).not.toContain('different question')
  for (const argv of cli.runs) expect(argv.join(' ')).not.toContain('SECRET-PROMPT-WORDS')
})

test('a first result with no prompt leaves the next one with none, whatever was said since', async ($, on) => {
  const { cli } = world2(on, base('m1'))
  await run($, 'm1')
  await say($, 'said later')
  const tree = await $.ui.mount(toolUse('m1', CMD) as never)
  await tree.press({ key: key('m1', 'more', 50) } as never)
  await new Promise(r => setTimeout(r, 20))
  expect(cli.stdins).toHaveLength(0)
})

test('a failed read shows a named line without a path and keeps the shown result; the buttons come back', async ($, on) => {
  let answer: Reply = { exitCode: 2, stdout: '{"resultFiles":null,"reason":"results-store-unwritable"}\n', stderr: 'query results: results-store-unwritable\n/home/u/.datatug/secret-path\n' }
  const { cli } = world2(on, base('m1'), { queryRun: () => answer })
  await run($, 'm1')
  const tree = await $.ui.mount(toolUse('m1', CMD) as never)
  await tree.press({ key: key('m1', 'more', 50) } as never)
  let drawn = await text(tree)
  expect(drawn).toContain('~/.datatug/query-results cannot be written')
  expect(drawn).toContain('3 rows x 4 columns')
  expect(drawn.includes('secret-path')).toBe(false)
  expect(buttons(drawn, 'm1')).toEqual([true, true, true, true])
  expect(drawn.includes(key('m1', 'more', 'original'))).toBe(false)
  answer = { exitCode: 1, stdout: '', stderr: 'database is locked: /home/u/private.db' }
  await tree.press({ key: key('m1', 'more', 50) } as never)
  drawn = await text(tree)
  expect(drawn).toContain('DataTug could not read those rows. Try again')
  expect(drawn.includes('private.db')).toBe(false)
  expect(cli.toasts).toEqual([])
})

test('a CLI that cannot start is a named line too', async ($, on) => {
  world2(on, base('m1'), {
    queryRun: () => {
      throw new Error('spawn datatug ENOENT /usr/bin/datatug')
    },
  })
  await run($, 'm1')
  const tree = await $.ui.mount(toolUse('m1', CMD) as never)
  await tree.press({ key: key('m1', 'more', 50) } as never)
  const drawn = await text(tree)
  expect(drawn).toContain('The DataTug CLI did not answer')
  expect(drawn.includes('ENOENT')).toBe(false)
  expect(drawn).toContain('3 rows x 4 columns')
})

test('a stored result of that id that is another table is refused, and the shown result stays', async ($, on) => {
  const files = { ...base('m1'), ...read('m1-r50', 50, { ...FROM, from: 'Artist' }) }
  world2(on, files)
  await run($, 'm1')
  const tree = await $.ui.mount(toolUse('m1', CMD) as never)
  await tree.press({ key: key('m1', 'more', 50) } as never)
  const drawn = await text(tree)
  expect(drawn).toContain('The new rows could not be shown')
  expect(drawn).toContain('3 rows x 4 columns')
  expect(drawn.includes('50 rows')).toBe(false)
})

const hidden = async ($: any, on: any, id: string, query: Record<string, unknown>, reason: string, kind?: string) => {
  const { cli, writes } = world2(on, base(id, query))
  await run($, id)
  const drawn = await text(await $.ui.mount(toolUse(id, CMD) as never))
  expect(buttons(drawn, id)).toEqual([false, false, false, false])
  expect(drawn).toContain(MORE_TEXT[reason as keyof typeof MORE_TEXT])
  expect(writes).toHaveLength(0)
  expect(cli.runs.some(a => a.includes('--limit') || a.some(x => x.startsWith('--limit=')))).toBe(false)
  expect(kind).toBeUndefined()
}

test('a saved query, a DTQL query, other policies, a database in no project, an offset and a hostile table have no buttons, only the named line', async ($, on) => {
  await hidden($, on, 's1', { kind: 'saved', savedQueryId: 'customers/customer-invoices', policy: 'project', text: 'from: {name: Customer}' }, 'saved')
})
test('a DTQL query has no buttons', async ($, on) => {
  await hidden($, on, 's2', { kind: 'dtql', dtql: 'from: Invoice', policy: 'none', text: 'from: Invoice' }, 'kind')
})
test('a table read under a policy has no buttons: a replay with --no-policies would widen access', async ($, on) => {
  await hidden($, on, 's3', { ...FROM, policy: 'discovered' }, 'policy')
})
test('a table read of a database in no project has no buttons', async ($, on) => {
  await hidden($, on, 's4', { ...FROM, dbRef: undefined }, 'ref')
})
test('a table read from an offset has no buttons', async ($, on) => {
  await hidden($, on, 's5', { ...FROM, text: 'from: {name: Album}\noffset: 10\nlimit: 3\n' }, 'offset')
})
for (const [i, from] of ['-x', 'a b', 'a;b', 'Play list'].entries()) {
  test(`a table named ${JSON.stringify(from)} has no buttons`, async ($, on) => {
    await hidden($, on, `h${i}`, { ...FROM, from }, 'table')
  })
}
test('a result id too long for a derived id has no buttons', async ($, on) => {
  const id = 'L'.repeat(126)
  await hidden($, on, id, FROM, 'id')
})
test('a result from an older CLI (no query fields) has no buttons', async ($, on) => {
  await hidden($, on, 'o1', { kind: 'from', policy: 'none' }, 'old')
})

test('the state stays bounded: a swap on the newest of ten cards evicts none, and a card never grows past its one member', async ($, on) => {
  const files: Record<string, string> = {}
  for (let i = 0; i < 10; i++) Object.assign(files, base(`c${i}`))
  const { writes } = world2(on, files)
  for (let i = 0; i < 10; i++) await run($, `c${i}`)
  const last = await $.ui.mount(toolUse('c9', CMD) as never)
  await last.press({ key: key('c9', 'more', 50) } as never)
  await last.press({ key: key('c9', 'more', 'original') } as never)
  await last.press({ key: key('c9', 'more', 100) } as never)
  expect(writes).toHaveLength(2)
  // The oldest is still loaded (an evicted card says "Press Load").
  const c0 = await $.ui.mount(toolUse('c0', CMD) as never)
  const first = await text(c0)
  expect(first.includes('Press Load')).toBe(false)
  expect(first).toContain('3 rows x 4 columns')
  // An eleventh result evicts the oldest as before, and the card at the bound still reloads the shown id.
  Object.assign(files, base('c10'))
  await run($, 'c10')
  expect(await text(c0)).toContain('Press Load')
})

test('the model-facing summary and tool result are as without the buttons, and a press adds no model-facing text', async ($, on) => {
  const { cli } = world2(on, base('m1'))
  const told = JSON.stringify(await run($, 'm1'))
  expect(told).toContain('DataTug query returned 3 rows x 4 columns')
  expect(told).toContain('withheld from you')
  const tree = await $.ui.mount(toolUse('m1', CMD) as never)
  const bashBefore = cli.bash.length
  await tree.press({ key: key('m1', 'more', 50) } as never)
  await tree.press({ key: key('m1', 'more', 'original') } as never)
  expect(cli.bash).toHaveLength(bashBefore)
  expect(JSON.stringify(cli.outputs)).not.toContain('50 rows')
  expect(JSON.stringify(cli.resultOutputs)).not.toContain('50 rows')
  expect(cli.logs.filter(l => !l.startsWith('DataTug: result card above'))).toEqual([])
  expect(cli.toasts).toEqual([])
})

test('a card evicted from the cache is reloaded at the result it showed', async ($, on) => {
  const files: Record<string, string> = {}
  for (let i = 0; i < 11; i++) Object.assign(files, base(`e${i}`))
  const { cli } = world2(on, files)
  await run($, 'e0')
  const tree = await $.ui.mount(toolUse('e0', CMD) as never)
  await tree.press({ key: key('e0', 'more', 50) } as never)
  for (let i = 1; i < 11; i++) await run($, `e${i}`)
  const evicted = await text(tree)
  expect(evicted).toContain('Press Load')
  await tree.press({ key: key('e0', 'load') } as never)
  const drawn = await text(tree)
  expect(drawn).toContain('50 rows x 4 columns')
  expect(drawn).toContain('● 50')
  expect(cli.runs.filter(a => a.includes('locate') && a.includes('e0-r50'))).toHaveLength(2)
})
