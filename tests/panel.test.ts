import { expect, test } from 'claude-code/testing'

import { baseType, dataColumns, dbName, tablesCount, inferType, keyMark, metaColumns, orderColumns, parseRows } from '../hooks/register'

test('parseRows reads the CLI JSON array', () => {
  const out = parseRows('[\n{"a":1,"b":"x"},\n{"a":2,"c":{"n":1}}\n]', 'id1', 'datatug query run')
  expect(out?.total).toBe(2)
  expect(out?.columns).toEqual(['a', 'b', 'c'])
})

test('parseRows refuses what is not an array of objects', () => {
  expect(parseRows('no json', 'i', 'c')).toBe(null)
  expect(parseRows('[1,2]', 'i', 'c')).toBe(null)
})

test('the model reads a summary, never the rows', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('fs.read', () => ({ value: '[{"name":"SECRET-ALICE"},{"name":"bob"}]' }) as never)
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'bottom') as never)
  on('tool.call', { tool: 'Bash' }, () => ({
    result: { stdout: '', stderr: '' },
    text: '',
    ref: {},
  }) as never)
  const ran = await $.tool.call({
    tool: 'Bash',
    tool_use_id: 't1',
    command: 'datatug query run --db ingitdb://./x --from people --no-policies',
  } as never)
  const text = JSON.stringify(ran)
  expect(text).toContain('2 rows')
  expect(text.includes('SECRET-ALICE')).toBe(false)
})

test('the chat table lists rows and a link press shows the record card', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('fs.read', () => ({ value: '[{"name":"alice","n":1},{"name":"bob","n":2}]' }) as never)
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'bottom') as never)
  on('tool.call', { tool: 'Bash' }, () => ({
    result: { stdout: '', stderr: '' },
    text: '',
    ref: {},
  }) as never)
  await $.tool.call({
    tool: 'Bash',
    tool_use_id: 't2',
    command: 'datatug query run --db ingitdb://./x --from people --no-policies',
  } as never)
  const tree = await $.ui.mount({
    plugin: 'datatug',
    surface: 'terminal',
    component: 'ToolUse',
    requestId: 't2',
    props: { tool_use_id: 't2', tool: 'Bash', input: {}, isRunning: false, isErrored: false, isInterrupted: false },
  } as never)
  const grid = JSON.stringify(await tree.drawn())
  expect(grid).toContain('| # | name | n |')
  expect(grid).toContain('| ---: | --- | ---: |')
  expect(grid).toContain('| [2](https://datatug.invalid/row/1) | bob | 2 |')
  await tree.press({ key: 'grid', link: { href: 'https://datatug.invalid/row/1' } } as never)
  const pane = await $.ui.mount({
    plugin: 'datatug',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'datatug',
    props: { bodyColumns: 80 },
  } as never)
  const drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('string(≤5)')
  expect(drawn).toContain('integer')
  expect(drawn).toContain('Row ')
  expect(drawn).toContain('◀ Prev')
  expect(drawn).toContain('Next ▶')
  expect(drawn).toContain('⏮')
  expect(drawn).toContain('⏭')
  expect(drawn).toContain('Context bag')
  expect(drawn).toContain('Project')
  expect(drawn.includes('people.name.')).toBe(false)
  expect(drawn).toContain('Add to 🛒')
  expect(drawn).toContain('🛒 Context bag')
  await pane.press({ key: 'first-row' } as never)
  expect(JSON.stringify(await pane.drawn())).toContain('"alice"')
  await pane.press({ key: 'last-row' } as never)
  expect(JSON.stringify(await pane.drawn())).toContain('"bob"')
  await pane.press({ key: 'record-add' } as never)
  const added = JSON.stringify(await pane.drawn())
  expect(added).toContain('In 🛒')
  expect(added).toContain('people.name.')
  await pane.press({ key: 'record-close' } as never)
  const closed = JSON.stringify(await pane.drawn())
  expect(closed.includes('Next ▶')).toBe(false)
  expect(closed).toContain('people.name.')
})

test('data cannot inject Markdown links into the table', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'bottom') as never)
  on('fs.read', () => ({ value: '[{"name":"[x](https://evil.example/a)|<b>"}]' }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '' }, text: '', ref: {} }) as never)
  await $.tool.call({ tool: 'Bash', tool_use_id: 't3', command: 'datatug query run --db x --from y' } as never)
  const tree = await $.ui.mount({
    plugin: 'datatug',
    surface: 'desktop',
    component: 'ToolUse',
    requestId: 't3',
    props: { tool_use_id: 't3', tool: 'Bash', input: {}, isRunning: false, isErrored: false, isInterrupted: false },
  } as never)
  const grid = JSON.stringify(await tree.drawn())
  expect(grid.includes('](https://evil.example')).toBe(false)
  expect(grid.includes('<b>')).toBe(false)
})

test('inferType reads a type and its size off the values', () => {
  const rows = [{ a: 1, b: 'ab', c: 1.25, d: true }, { a: 2, b: 'abcd', c: 10.5, d: null }]
  expect(inferType(rows, 'a')).toBe('integer')
  expect(inferType(rows, 'b')).toBe('string(≤4)')
  expect(inferType(rows, 'c')).toBe('number(4,2)')
  expect(inferType(rows, 'd')).toBe('boolean')
})

test('the two required cards are there with nothing to show', async ($, on) => {
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'bottom') as never)
  const pane = await $.ui.mount({
    plugin: 'datatug',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'datatug',
    props: { bodyColumns: 60 },
  } as never)
  const drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('Project')
  expect(drawn).toContain('Context bag')
  expect(drawn).toContain('Empty.')
  expect(drawn.includes('Record')).toBe(false)
})

test('the project card lists the projects the CLI reports', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.cwd', () => ({ value: '/work' }) as never)
  on('process.run', () =>
    ({ value: { exitCode: 0, stdout: '[{"id":"demo-project-1","title":"","origin":""},{"id":"crm","title":"CRM","origin":""}]', stderr: '' } }) as never)
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'bottom') as never)
  await $.command.run({ command: 'datatug', args: '' } as never)
  const pane = await $.ui.mount({
    plugin: 'datatug',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'datatug',
    props: { bodyColumns: 60 },
  } as never)
  const drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('demo-project-1')
  expect(drawn).toContain('prow:crm')
  expect(drawn).toContain('"CRM"')
  expect(drawn).toContain('Databases')
  await pane.press({ key: 'project-arrow' } as never)
  expect(JSON.stringify(await pane.drawn()).includes('prow:crm')).toBe(false)
  await pane.press({ key: 'project-arrow' } as never)
  await pane.press({ key: 'project:crm' } as never)
  const picked = JSON.stringify(await pane.drawn())
  expect(picked).toContain('CRM (crm)')
  expect(picked.includes('prow:')).toBe(false)
})

test('a column name opens its card, and its table opens a profile card', async ($, on) => {
  const SHOW = JSON.stringify({
    environments: [
      { id: 'local', sources: [{ id: 'db', driver: 'sqlite3', schemas: [{ name: 'main', tables: [
        { name: 'people', columns: [{ name: 'name', type: 'NVARCHAR(10)' }, { name: 'n', type: 'INTEGER', primaryKeyPosition: 1 }] },
      ] }] }] },
    ],
  })
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.cwd', () => ({ value: '/work' }) as never)
  on('process.run', (_$, e) =>
    ({ value: { exitCode: 0, stdout: JSON.stringify(e).includes('"show"') ? SHOW : '[{"id":"p1","title":"","origin":""}]', stderr: '' } }) as never)
  on('fs.read', () => ({ value: '[{"name":"alice","n":1},{"name":"bob","n":2},{"name":null,"n":3}]' }) as never)
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'bottom') as never)
  on('ui.scroll', () => ({ value: {} }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '' }, text: '', ref: {} }) as never)
  await $.command.run({ command: 'datatug', args: '' } as never)
  await $.tool.call({ tool: 'Bash', tool_use_id: 't9', command: 'datatug query run --db x --from people' } as never)
  const chat = await $.ui.mount({
    plugin: 'datatug', surface: 'terminal', component: 'ToolUse', requestId: 't9',
    props: { tool_use_id: 't9', tool: 'Bash', input: {}, isRunning: false, isErrored: false, isInterrupted: false },
  } as never)
  await chat.press({ key: 'grid', link: { href: 'https://datatug.invalid/row/0' } } as never)
  const pane = await $.ui.mount({
    plugin: 'datatug', surface: 'terminal', component: 'Pane', requestId: 'datatug', props: { bodyColumns: 80 },
  } as never)
  expect(JSON.stringify(await pane.drawn()).includes('"Column"')).toBe(false)
  let ord = JSON.stringify(await pane.drawn())
  expect(ord.indexOf('"f:name"')).toBeLessThan(ord.indexOf('"f:n"'))
  await pane.press({ key: 'order:record:alpha' } as never)
  ord = JSON.stringify(await pane.drawn())
  expect(ord.indexOf('"f:n"')).toBeLessThan(ord.indexOf('"f:name"'))
  await pane.press({ key: 'order:record:defined' } as never)
  ord = JSON.stringify(await pane.drawn())
  expect(ord.indexOf('"f:name"')).toBeLessThan(ord.indexOf('"f:n"'))
  await pane.press({ key: 'col:name' } as never)
  const col = JSON.stringify(await pane.drawn())
  expect(col).toContain('"Column"')
  expect(col).toContain('NVARCHAR(10)')
  expect(col).toContain('Declared type')
  expect(col).toContain('1 of 3 empty')
  expect(col).toContain('string(≤5)')
  await pane.press({ key: 'cbag-col' } as never)
  expect(JSON.stringify(await pane.drawn())).toContain('people.name')
  await pane.press({ key: 'column-table' } as never)
  await pane.press({ key: 'tbag-table' } as never)
  await pane.press({ key: 'tbag:n' } as never)
  const metaBag = JSON.stringify(await pane.drawn())
  expect(metaBag).toContain('table.')
  expect(metaBag).toContain('people.n')
  const tbl = JSON.stringify(await pane.drawn())
  expect(tbl).toContain('Environment')
  expect(tbl).toContain('sqlite3')
  expect(tbl.includes('"Column"')).toBe(false)
  expect(tbl).toContain('Environment')
  expect(tbl).toContain('"Nullable"')
  expect(tbl).toContain('NOT NULL')
  expect(tbl).toContain('NULLABLE')
  expect(tbl).toContain('NVARCHAR(10)')
  await pane.press({ key: 'tcol:n' } as never)
  const n = JSON.stringify(await pane.drawn())
  expect(n).toContain('"yes"')
  expect(n.includes('Environment')).toBe(false)
  await pane.press({ key: 'column-close' } as never)
  expect(JSON.stringify(await pane.drawn()).includes('"Column"')).toBe(false)
})

test('Clear empties the bag and the master switch toggles', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'bottom') as never)
  on('fs.read', () => ({ value: '[{"name":"alice","n":1},{"name":"bob","n":2}]' }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '' }, text: '', ref: {} }) as never)
  await $.tool.call({ tool: 'Bash', tool_use_id: 't7', command: 'datatug query run --db x --from people' } as never)
  const chat = await $.ui.mount({
    plugin: 'datatug', surface: 'terminal', component: 'ToolUse', requestId: 't7',
    props: { tool_use_id: 't7', tool: 'Bash', input: {}, isRunning: false, isErrored: false, isInterrupted: false },
  } as never)
  await chat.press({ key: 'grid', link: { href: 'https://datatug.invalid/row/0' } } as never)
  const pane = await $.ui.mount({
    plugin: 'datatug', surface: 'terminal', component: 'Pane', requestId: 'datatug', props: { bodyColumns: 80 },
  } as never)
  await pane.press({ key: 'record-add' } as never)
  await pane.press({ key: 'add:n' } as never)
  const full = JSON.stringify(await pane.drawn())
  expect(full).toContain('people.n.')
  expect(full).toContain('Clear')
  await pane.press({ key: 'bag-enabled' } as never)
  expect(JSON.stringify(await pane.drawn())).toContain('☐ Off')
  await pane.press({ key: 'bag-clear' } as never)
  const empty = JSON.stringify(await pane.drawn())
  expect(empty.includes('people.n.')).toBe(false)
  expect(empty).toContain('Empty.')
})

test('Context bag Ask Claude puts the checked items into the prompt', async ($, on) => {
  const fills: string[] = []
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'bottom') as never)
  on('prompt.fill', (_$, e) => {
    fills.push(JSON.stringify(e))
    return { isFilled: true } as never
  })
  on('fs.read', () => ({ value: '[{"name":"alice","n":1},{"name":"bob","n":2}]' }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '' }, text: '', ref: {} }) as never)
  await $.tool.call({ tool: 'Bash', tool_use_id: 't8', command: 'datatug query run --db x --from people' } as never)
  const chat = await $.ui.mount({
    plugin: 'datatug', surface: 'terminal', component: 'ToolUse', requestId: 't8',
    props: { tool_use_id: 't8', tool: 'Bash', input: {}, isRunning: false, isErrored: false, isInterrupted: false },
  } as never)
  await chat.press({ key: 'grid', link: { href: 'https://datatug.invalid/row/0' } } as never)
  const pane = await $.ui.mount({
    plugin: 'datatug', surface: 'terminal', component: 'Pane', requestId: 'datatug', props: { bodyColumns: 80 },
  } as never)
  expect(JSON.stringify(await pane.drawn()).includes('Ask Claude…')).toBe(false)
  await pane.press({ key: 'record-add' } as never)
  await pane.press({ key: 'add:n' } as never)
  expect(JSON.stringify(await pane.drawn())).toContain('Ask Claude…')
  await pane.press({ key: 'bag-ask' } as never)
  expect(fills).toHaveLength(1)
  expect(fills[0]).toContain('About these items from my context bag')
  expect(fills[0]).toContain('people.n = ')
  expect(fills[0]).toContain('My question: ')
  expect(fills[0]).toContain('append')
})

test('foreign keys link columns and tables both ways', async ($, on) => {
  const SHOW = JSON.stringify({
    environments: [
      { id: 'local', sources: [{ id: 'db', driver: 'sqlite3', schemas: [{ name: 'main', tables: [
        { name: 'people', columns: [{ name: 'name', type: 'TEXT' }, { name: 'n', type: 'INTEGER', primaryKeyPosition: 1 }] },
        { name: 'pets', columns: [{ name: 'id', type: 'INTEGER', primaryKeyPosition: 1 }, { name: 'owner', type: 'INTEGER' }],
          foreignKeys: [{ name: 'fk_pets_owner', columns: ['owner'], refTable: { schema: 'main', name: 'people' }, refColumns: ['n'] }] },
      ] }] }] },
    ],
  })
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.cwd', () => ({ value: '/work' }) as never)
  on('process.run', (_$, e) =>
    ({ value: { exitCode: 0, stdout: JSON.stringify(e).includes('"show"') ? SHOW : '[{"id":"p1","title":"","origin":""}]', stderr: '' } }) as never)
  on('fs.read', () => ({ value: '[{"name":"alice","n":1},{"name":"bob","n":2}]' }) as never)
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'bottom') as never)
  on('ui.scroll', () => ({ value: {} }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '' }, text: '', ref: {} }) as never)
  await $.command.run({ command: 'datatug', args: '' } as never)
  await $.tool.call({ tool: 'Bash', tool_use_id: 't8', command: 'datatug query run --db x --from people' } as never)
  const chat = await $.ui.mount({
    plugin: 'datatug', surface: 'terminal', component: 'ToolUse', requestId: 't8',
    props: { tool_use_id: 't8', tool: 'Bash', input: {}, isRunning: false, isErrored: false, isInterrupted: false },
  } as never)
  await chat.press({ key: 'grid', link: { href: 'https://datatug.invalid/row/0' } } as never)
  const pane = await $.ui.mount({
    plugin: 'datatug', surface: 'terminal', component: 'Pane', requestId: 'datatug', props: { bodyColumns: 80 },
  } as never)
  const text = async () => JSON.stringify(await pane.drawn())
  await pane.press({ key: 'col:n' } as never)
  let d = await text()
  expect(d).toContain('Referenced by')
  expect(d).toContain('pets.owner')
  await pane.press({ key: 'rb:pets.owner' } as never)
  d = await text()
  expect(d).toContain('References')
  expect(d).toContain('people.n')
  expect(d).toContain('not loaded')
  await pane.press({ key: 'fk:people.n' } as never)
  d = await text()
  expect(d).toContain('Observed type')
  await pane.press({ key: 'column-table' } as never)
  d = await text()
  expect(d).toContain('Environment')
  expect(d).toContain('Referenced by')
  await pane.press({ key: 'reft:pets:fk_pets_owner:owner' } as never)
  d = await text()
  expect(d).toContain('"pets"')
  expect(d).toContain('FK')
  await pane.press({ key: 'tcol:owner' } as never)
  d = await text()
  expect(d).toContain('"Column"')
  expect(d).toContain('people.n')
})

test('Open DB lists a SQLite database and keeps the password out of sight', async ($, on) => {
  const seen: string[] = []
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.cwd', () => ({ value: '/work' }) as never)
  on('process.run', (_$, e) => {
    seen.push(JSON.stringify(e))
    const rows = '[{"name":"Album","type":"table"},{"name":"v_sales","type":"view"},{"name":"sqlite_sequence","type":"table"},{"name":"idx","type":"index"}]'
    return { value: { exitCode: 0, stdout: JSON.stringify(e).includes('sqlite_master') ? rows : '[{"id":"p1","title":"","origin":""}]', stderr: '' } } as never
  })
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'bottom') as never)
  await $.command.run({ command: 'datatug', args: '' } as never)
  const pane = await $.ui.mount({
    plugin: 'datatug', surface: 'terminal', component: 'Pane', requestId: 'datatug', props: { bodyColumns: 80 },
  } as never)
  await pane.input({ key: 'opendb-input', text: 'sqlite://user:s3cret@/tmp/x.db?mode=ro', kind: 'submit' } as never)
  const d = JSON.stringify(await pane.drawn())
  expect(d).toContain('Album')
  expect(d).toContain('v_sales')
  expect(d.includes('sqlite_sequence')).toBe(false)
  expect(d.includes('idx')).toBe(false)
  expect(d).toContain('sqlite://***@/tmp/x.db')
  expect(d.includes('s3cret')).toBe(false)
  const call = seen.find(x => x.includes('sqlite_master')) ?? ''
  expect(call).toContain('DATATUG_OPEN_DB')
  expect(call).toContain('env:DATATUG_OPEN_DB')
})

test('Open DB says an older CLI cannot list a provider, without the password', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.cwd', () => ({ value: '/work' }) as never)
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'unknown command "schema"' } }) as never)
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'bottom') as never)
  const pane = await $.ui.mount({
    plugin: 'datatug', surface: 'terminal', component: 'Pane', requestId: 'datatug', props: { bodyColumns: 80 },
  } as never)
  await pane.input({ key: 'opendb-input', text: 'postgres://u:p@h/db', kind: 'submit' } as never)
  const d = JSON.stringify(await pane.drawn())
  expect(d).toContain('postgres')
  expect(d).toContain('update it')
  expect(d.includes('u:p@')).toBe(false)
})

test('Open DB takes a file path and detects SQLite by name or by content', async ($, on) => {
  const seen: string[] = []
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.cwd', () => ({ value: '/work' }) as never)
  on('env.get', () => ({ value: '/home/me' }) as never)
  on('fs.exists', (_$, e) => ({ value: !JSON.stringify(e).includes('missing') }) as never)
  on('process.run', (_$, e) => {
    const j = JSON.stringify(e)
    seen.push(j)
    const stdout = j.includes('"head"')
      ? (j.includes('plain') ? 'SQLite format 3\u0000' : 'not a database')
      : j.includes('sqlite_master')
        ? '[{"name":"Album","type":"table"}]'
        : '[{"id":"p1","title":"","origin":""}]'
    return { value: { exitCode: 0, stdout, stderr: '' } } as never
  })
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'bottom') as never)
  await $.command.run({ command: 'datatug', args: '' } as never)
  const pane = await $.ui.mount({
    plugin: 'datatug', surface: 'terminal', component: 'Pane', requestId: 'datatug', props: { bodyColumns: 80 },
  } as never)
  const open = async (text: string) => {
    await pane.input({ key: 'opendb-input', text, kind: 'submit' } as never)
    return JSON.stringify(await pane.drawn())
  }
  let d = await open('/data/chinook-local.sqlite')
  expect(d).toContain('detected from the file name')
  expect(d).toContain('Album')
  expect(seen.some(x => x.includes('sqlite:///data/chinook-local.sqlite'))).toBe(true)
  await pane.press({ key: 'database-close' } as never)
  d = await open('~/dbs/plain.bin')
  expect(d).toContain('detected from the file content')
  expect(seen.some(x => x.includes('sqlite:///home/me/dbs/plain.bin'))).toBe(true)
  await pane.press({ key: 'database-close' } as never)
  d = await open('data/other.bin')
  expect(d).toContain('Could not tell what kind of database /work/data/other.bin is')
  d = await open('/data/missing.db')
  expect(d).toContain('No file at /data/missing.db')
})

test('the context bag is the second card, and a table of an opened database can be pressed', async ($, on) => {
  const fills: string[] = []
  const calls: string[] = []
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.cwd', () => ({ value: '/work' }) as never)
  on('fs.exists', () => ({ value: true }) as never)
  on('process.spawn', async function* () {
    yield { stream: 'stdout', text: '{"AlbumId":1,"Title":"For Those"}\n{"AlbumId":2,"Ti' }
    yield { stream: 'stdout', text: 'tle":"Balls"}\n' }
    return { value: { code: 0, signal: null } }
  } as never)
  on('prompt.fill', (_$, e) => {
    fills.push(JSON.stringify(e))
    return { isFilled: true } as never
  })
  on('process.run', (_$, e) => {
    const j = JSON.stringify(e)
    calls.push(j)
    const stdout = j.includes('"add"')
      ? '{"added":true,"id":"x","env":"local","driver":"sqlite3","dbRef":"datatug://p1/x?env=local"}'
      : j.includes('jsonl')
      ? '{"a":1}\n{"a":2}\n{"a":3}\n{"a":4}\n{"a":5}\n'
      : j.includes('sqlite_master')
      ? '[{"name":"Album","type":"table"},{"name":"Artist","type":"table"},{"name":"v_x","type":"view"}]'
      : j.includes('"show"')
        ? '{"environments":[{"id":"local","sources":[{"id":"chinook-local","driver":"sqlite3","schemas":[{"name":"main","tables":[{"name":"Album","columns":[{"name":"AlbumId","type":"INTEGER","primaryKeyPosition":1},{"name":"Title","type":"NVARCHAR(160)","nullable":false},{"name":"Note","type":"TEXT","nullable":true},{"name":"ArtistId","type":"INTEGER"}],"foreignKeys":[{"name":"fk_album_artist","columns":["ArtistId"],"refTable":{"schema":"main","name":"Artist"},"refColumns":["ArtistId"]}]},{"name":"Artist","columns":[{"name":"ArtistId","type":"INTEGER","primaryKeyPosition":1}]}]}]}]}]}'
      : j.includes('"Album"')
        ? '[{"$key":"__dalgo_record_id","AlbumId":1,"Title":"For Those","Note":null},{"$key":"__dalgo_record_id","AlbumId":2,"Title":"Balls","Note":"x"}]'
        : '[{"id":"p1","title":"","origin":""}]'
    return { value: { exitCode: 0, stdout, stderr: '' } } as never
  })
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'bottom') as never)
  await $.command.run({ command: 'datatug', args: '' } as never)
  const pane = await $.ui.mount({
    plugin: 'datatug', surface: 'terminal', component: 'Pane', requestId: 'datatug', props: { bodyColumns: 80 },
  } as never)
  let d = JSON.stringify(await pane.drawn())
  expect(d.indexOf('card-project')).toBeLessThan(d.indexOf('card-bag'))
  expect(d.indexOf('card-bag')).toBeLessThan(d.indexOf('card-opendb'))
  await pane.input({ key: 'opendb-input', text: '/db/x.sqlite', kind: 'submit' } as never)
  const listed = JSON.stringify(await pane.drawn())
  expect(listed).toContain('card-database')
  expect(listed).toContain('card-opendb"')
  expect(listed).toContain('"Rows"')
  expect(listed).toContain('odbc:Album')
  expect(listed.includes('odbc:v_x')).toBe(false)
  expect(listed.includes('odbr:Album')).toBe(false)
  expect(listed.includes('"5"')).toBe(false)
  expect(calls.some(c => c.includes('jsonl'))).toBe(false)
  await pane.press({ key: 'odbt:table:Album' } as never)
  d = JSON.stringify(await pane.drawn())
  expect(calls.some(c => c.includes('"Album"') && !c.includes('jsonl'))).toBe(false)
  expect(d).toContain('card-opendb-table')
  expect(d.indexOf('card-bag')).toBeLessThan(d.indexOf('card-opendb-table'))
  expect(d).toContain('dbtable-count')
  expect(d).toContain('"Type"')
  expect(d).toContain('INTEGER')
  expect(d).toContain('NVARCHAR(160)')
  expect(d).toContain('🔑')
  expect(d.includes('🔑 1')).toBe(false)
  expect(d).toContain('NOT NULL')
  expect(d).toContain('NULLABLE')
  expect(d.includes('"$key"')).toBe(false)
  expect(d.includes('"Nulls"')).toBe(false)
  expect(d).toContain('No data was read')
  await pane.press({ key: 'dbtable-bag' } as never)
  await pane.press({ key: 'dbbag:Title' } as never)
  d = JSON.stringify(await pane.drawn())
  expect(d).toContain('table.')
  expect(d).toContain('column.')
  expect(d).toContain('Album.Title')
  expect(d).toContain('In 🛒')
  // a column of the table card opens its Column card in place of the table card
  await pane.press({ key: 'dbcol:AlbumId' } as never)
  d = JSON.stringify(await pane.drawn())
  expect(d).toContain('"Column"')
  expect(d.includes('card-opendb-table')).toBe(false)
  // bagged items open their cards
  await pane.press({ key: 'bag-open:meta:contextBag.table:Album' } as never)
  d = JSON.stringify(await pane.drawn())
  expect(d).toContain('Environment')
  expect(d.includes('"Column"')).toBe(false)
  await pane.press({ key: 'bag-open:meta:contextBag.column:Album.Title' } as never)
  d = JSON.stringify(await pane.drawn())
  expect(d).toContain('"Column"')
  expect(d).toContain('NVARCHAR(160)')
  await pane.press({ key: 'column-close' } as never)
  await pane.press({ key: 'odbt:table:Album' } as never)
  // a foreign-key column links to the referenced table
  d = JSON.stringify(await pane.drawn())
  expect(d).toContain('dbfkb:ArtistId:Artist')
  await pane.press({ key: 'dbfkb:ArtistId:Artist' } as never)
  d = JSON.stringify(await pane.drawn())
  expect(d).toContain('Environment')
  expect(d.includes('card-opendb-table')).toBe(false)
  expect(d).toContain('"Artist"')
  await pane.press({ key: 'table-close' } as never)
  await pane.press({ key: 'odbt:table:Album' } as never)
  // the referenced table lists the tables that point at it
  await pane.press({ key: 'odbt:table:Artist' } as never)
  d = JSON.stringify(await pane.drawn())
  expect(d).toContain('Referenced by')
  expect(d).toContain('dbreft:Album:fk_album_artist:ArtistId')
  expect(d).toContain('dbrefn:Album:fk_album_artist:ArtistId')
  await pane.press({ key: 'dbreft:Album:fk_album_artist:ArtistId' } as never)
  d = JSON.stringify(await pane.drawn())
  expect(d).toContain('dbfkb:ArtistId:Artist')
  await pane.press({ key: 'odbt:table:Album' } as never)
  await pane.press({ key: 'odbc:Album' } as never)
  d = JSON.stringify(await pane.drawn())
  expect(d).toContain('odbr:Album')
  expect(d.includes('odbc:Album')).toBe(false)
  expect(d.includes('dbtable-count')).toBe(false)
  expect(d).toContain('"5"')
  await pane.press({ key: 'dbtable-close' } as never)
  await pane.press({ key: 'odbr:Album' } as never)
  d = JSON.stringify(await pane.drawn())
  expect(d).toContain('card-dbrecords')
  expect(d).toContain('(top ')
  expect(d).toContain('"italic":true')
  expect(d).toContain('Balls')
  expect(d).toContain('recrow:1')
  expect(d).toContain('table has 5')
  await pane.press({ key: 'recrow:1' } as never)
  d = JSON.stringify(await pane.drawn())
  expect(d).toContain('card-record')
  await pane.press({ key: 'odbt:table:Album' } as never)
  d = JSON.stringify(await pane.drawn())
  expect(d.includes('card-dbrecords')).toBe(false)
  expect(d).toContain('card-opendb-table')
  await pane.press({ key: 'dbtable-records' } as never)
  d = JSON.stringify(await pane.drawn())
  expect(d).toContain('card-dbrecords')
  expect(d.includes('card-opendb-table')).toBe(false)
  await pane.press({ key: 'dbrecords-meta' } as never)
  d = JSON.stringify(await pane.drawn())
  expect(d.includes('card-dbrecords')).toBe(false)
  expect(d).toContain('card-opendb-table')
  await pane.press({ key: 'dbtable-records' } as never)
  await pane.press({ key: 'dbrecords-close' } as never)
  d = JSON.stringify(await pane.drawn())
  expect(d.includes('card-dbrecords')).toBe(false)
  expect(d).toContain('card-opendb-table')
  await pane.press({ key: 'dbtable-ask' } as never)
  expect(fills.join('')).toContain('--from Album')
  expect(fills.join('')).toContain('--db datatug://p1/x?env=local')
  expect(fills.join('').includes('sqlite:///db/x.sqlite')).toBe(false)
  await pane.press({ key: 'dbtable-close' } as never)
  expect(JSON.stringify(await pane.drawn()).includes('card-opendb-table')).toBe(false)
  await pane.press({ key: 'database-close' } as never)
  const back = JSON.stringify(await pane.drawn())
  expect(back.includes('card-database')).toBe(false)
  expect(back).toContain('opendb-input')
})

test('a foreign-key value opens the record it points to, and back returns', async ($, on) => {
  const SHOW = JSON.stringify({
    environments: [
      { id: 'local', sources: [{ id: 'db', driver: 'sqlite3', schemas: [{ name: 'main', tables: [
        { name: 'people', columns: [{ name: 'name', type: 'TEXT' }, { name: 'n', type: 'INTEGER', primaryKeyPosition: 1 }] },
        { name: 'pets', columns: [{ name: 'id', type: 'INTEGER', primaryKeyPosition: 1 }, { name: 'owner', type: 'INTEGER' }],
          foreignKeys: [{ name: 'fk_pets_owner', columns: ['owner'], refTable: { schema: 'main', name: 'people' }, refColumns: ['n'] }] },
      ] }] }] },
    ],
  })
  const toasts: string[] = []
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.cwd', () => ({ value: '/work' }) as never)
  on('process.run', (_$, e) =>
    ({ value: { exitCode: 0, stdout: JSON.stringify(e).includes('"show"') ? SHOW : '[{"id":"p1","title":"","origin":""}]', stderr: '' } }) as never)
  on('process.spawn', async function* (_$, e) {
    if (JSON.stringify(e).includes('people')) yield { stream: 'stdout', text: '{"name":"alice","n":1}\n{"name":"bob","n":2}\n' }
    return { value: { code: 0, signal: null } }
  } as never)
  on('fs.read', () => ({ value: '[{"id":1,"owner":2},{"id":2,"owner":9}]' }) as never)
  on('ui.toast', (_$, e) => {
    toasts.push(JSON.stringify(e))
    return { value: {} } as never
  })
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'bottom') as never)
  on('ui.scroll', () => ({ value: {} }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '' }, text: '', ref: {} }) as never)
  await $.command.run({ command: 'datatug', args: '' } as never)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'tf', command: 'datatug query run --db sqlite:///x.db --from pets' } as never)
  const chat = await $.ui.mount({
    plugin: 'datatug', surface: 'terminal', component: 'ToolUse', requestId: 'tf',
    props: { tool_use_id: 'tf', tool: 'Bash', input: {}, isRunning: false, isErrored: false, isInterrupted: false },
  } as never)
  await chat.press({ key: 'grid', link: { href: 'https://datatug.invalid/row/0' } } as never)
  const pane = await $.ui.mount({
    plugin: 'datatug', surface: 'terminal', component: 'Pane', requestId: 'datatug', props: { bodyColumns: 80 },
  } as never)
  let d = JSON.stringify(await pane.drawn())
  expect(d).toContain('fkv:owner')
  expect(d.includes('record-back')).toBe(false)
  await pane.press({ key: 'fkv:owner' } as never)
  d = JSON.stringify(await pane.drawn())
  expect(d).toContain('bob')
  expect(d).toContain('record-back')
  await pane.press({ key: 'record-back' } as never)
  d = JSON.stringify(await pane.drawn())
  expect(d).toContain('fkv:owner')
  expect(d.includes('record-back')).toBe(false)
  await pane.press({ key: 'next-row' } as never)
  await pane.press({ key: 'fkv:owner' } as never)
  expect(toasts.join('')).toContain('No people record with n = 9')
  // a bagged value opens the record it came from, or the column card when that record is not found
  await pane.press({ key: 'add:owner' } as never)
  await pane.press({ key: 'bag-open:tf:1:owner' } as never)
  const fromBag = JSON.stringify(await pane.drawn())
  expect(fromBag).toContain('"Column"')
  expect(fromBag).toContain('pets')

})

test('$key is never metadata, and a data view drops it once the primary key is known', () => {
  const cols = ['$key', 'InvoiceId', 'Total']
  const withPk = { env: 'e', source: 's', driver: 'd', schema: 'main', name: 'Invoice', foreignKeys: [], columns: [{ name: 'InvoiceId', type: 'INTEGER', pk: 1, nullable: null }] }
  const noPk = { ...withPk, columns: [{ name: 'InvoiceId', type: 'INTEGER', pk: null, nullable: null }] }
  expect(metaColumns(cols)).toEqual(['InvoiceId', 'Total'])
  expect(dataColumns(cols, withPk)).toEqual(['InvoiceId', 'Total'])
  expect(dataColumns(cols, noPk)).toEqual(cols)
  expect(dataColumns(cols, undefined)).toEqual(cols)
})

test('columns can be ordered as defined, alphabetically or grouped by base type', () => {
  const declared = ['id', 'title', 'created', 'price', 'active']
  const types: Record<string, string> = { id: 'INTEGER', title: 'VARCHAR(40)', created: 'DATETIME', price: 'NUMERIC(5,2)', active: 'BOOLEAN', extra: 'string(≤3)' }
  const typeOf = (n: string) => types[n] ?? ''
  const given = ['$key', 'active', 'created', 'extra', 'id', 'price', 'title']
  expect(orderColumns(given, 'defined', declared, typeOf)).toEqual(['$key', 'id', 'title', 'created', 'price', 'active', 'extra'])
  expect(orderColumns(given, 'defined', undefined, typeOf)).toEqual(given)
  expect(orderColumns(['title', 'id', 'Active'], 'alpha', declared, typeOf)).toEqual(['Active', 'id', 'title'])
  expect(orderColumns(given, 'type', declared, typeOf)).toEqual(['$key', 'active', 'created', 'id', 'price', 'extra', 'title'])
  expect(['INTEGER', 'NUMERIC(5,2)', 'bigint', 'VARCHAR(10)', 'text', 'DATETIME', 'timestamp', 'date', 'boolean', 'BLOB', 'jsonb', 'object', 'point'].map(baseType)).toEqual([
    'numeric', 'numeric', 'numeric', 'text', 'text', 'date', 'date', 'date', 'boolean', 'binary', 'json', 'json', 'other',
  ])
})

test('the key mark shows a position only for a composite primary key', () => {
  const col = (name: string, pk: number | null) => ({ name, type: 'INTEGER', pk, nullable: null })
  const one = { env: 'e', source: 's', driver: 'd', schema: 'main', name: 'T', foreignKeys: [], columns: [col('a', 1), col('b', null)] }
  const two = { ...one, columns: [col('a', 1), col('b', 2), col('c', null)] }
  expect(keyMark(one, 1)).toBe('🔑')
  expect(keyMark(two, 2)).toBe('🔑 2')
  expect(keyMark(one, null)).toBe('')
  expect(keyMark(undefined, 1)).toBe('🔑')
})

test('Databases lists the project databases and an opened one is added to the project', async ($, on) => {
  const seen: string[] = []
  let added = false
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.cwd', () => ({ value: '/work' }) as never)
  on('process.run', (_$, e) => {
    const j = JSON.stringify(e)
    seen.push(j)
    let stdout = '[{"id":"p1","title":"","origin":""}]'
    if (j.includes('sqlite_master')) stdout = '[{"name":"Album","type":"table"}]'
    else if (j.includes('"show"'))
      stdout = JSON.stringify({ environments: [{ id: 'local', sources: [{ id: 'chinook-local', driver: 'sqlite3' }, ...(added ? [{ id: 'x', driver: 'sqlite3' }] : [])] }] })
    else if (j.includes('"add"')) {
      added = true
      stdout = '{"added":true,"id":"x","env":"local","driver":"sqlite3"}'
    }
    return { value: { exitCode: 0, stdout, stderr: '' } } as never
  })
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'bottom') as never)
  await $.command.run({ command: 'datatug', args: '' } as never)
  const pane = await $.ui.mount({
    plugin: 'datatug', surface: 'terminal', component: 'Pane', requestId: 'datatug', props: { bodyColumns: 80 },
  } as never)
  let d = JSON.stringify(await pane.drawn())
  expect(d).toContain('chinook-local')
  expect(d.includes('dbs:local:x')).toBe(false)
  await pane.input({ key: 'opendb-input', text: 'sqlite://user:s3cret@/tmp/x.db', kind: 'submit' } as never)
  d = JSON.stringify(await pane.drawn())
  expect(d).toContain('dbs:local:x')
  expect(d).toContain('Added to the project.')
  const call = seen.find(x => x.includes('"add"')) ?? ''
  expect(call).toContain('env:DATATUG_OPEN_DB')
  expect(call.includes('s3cret') && !call.includes('"env"')).toBe(false)
})

test('a database listed in Databases opens by its project reference and shows the Database card', async ($, on) => {
  const seen: string[] = []
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.cwd', () => ({ value: '/work' }) as never)
  on('process.run', (_$, e) => {
    const j = JSON.stringify(e)
    seen.push(j)
    let stdout = '[{"id":"p1","title":"","origin":""}]'
    if (j.includes('"show"')) stdout = JSON.stringify({ environments: [{ id: 'local', sources: [{ id: 'chinook-local', driver: 'sqlite3' }] }] })
    else if (j.includes('"schema"'))
      stdout = JSON.stringify({ provider: 'sqlite', tables: [{ schema: 'main', name: 'Album', kind: 'table', columns: [{ name: 'AlbumId', type: 'INTEGER', nullable: false, primaryKeyPosition: 1 }] }] })
    return { value: { exitCode: 0, stdout, stderr: '' } } as never
  })
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'bottom') as never)
  await $.command.run({ command: 'datatug', args: '' } as never)
  const pane = await $.ui.mount({
    plugin: 'datatug', surface: 'terminal', component: 'Pane', requestId: 'datatug', props: { bodyColumns: 80 },
  } as never)
  expect(JSON.stringify(await pane.drawn())).toContain('dbs-open:local:chinook-local')
  await pane.press({ key: 'dbs-open:local:chinook-local' } as never)
  const d = JSON.stringify(await pane.drawn())
  expect(d).toContain('Album')
  expect(d).toContain('datatug://p1/chinook-local?env=local')
  const schema = seen.find(x => x.includes('"schema"')) ?? ''
  expect(schema).toContain('datatug://p1/chinook-local?env=local')
  expect(schema.includes('env:DATATUG_OPEN_DB')).toBe(false)
  expect(seen.some(x => x.includes('"add"'))).toBe(false)
  await pane.press({ key: 'odbbag:table:Album' } as never)
  const bagged = JSON.stringify(await pane.drawn())
  expect(bagged).toContain('bag-rm:meta:contextBag.table:Album')
})

test('Open DB reads declared columns and foreign keys from datatug db schema', async ($, on) => {
  const seen: string[] = []
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.cwd', () => ({ value: '/work' }) as never)
  on('process.run', (_$, e) => {
    const j = JSON.stringify(e)
    seen.push(j)
    const doc = {
      provider: 'sqlite',
      tables: [
        { schema: 'main', name: 'Customer', kind: 'table', columns: [{ name: 'CustomerId', type: 'INTEGER', nullable: false, primaryKeyPosition: 1 }] },
        {
          schema: 'main', name: 'Invoice', kind: 'table',
          columns: [{ name: 'InvoiceId', type: 'INTEGER', nullable: false, primaryKeyPosition: 1 }, { name: 'CustomerId', type: 'INTEGER', nullable: false }],
          foreignKeys: [{ name: 'fk0', columns: ['CustomerId'], refTable: { schema: 'main', name: 'Customer' }, refColumns: ['CustomerId'] }],
        },
      ],
    }
    return { value: { exitCode: 0, stdout: j.includes('"schema"') ? JSON.stringify(doc) : '[{"id":"p1","title":"","origin":""}]', stderr: '' } } as never
  })
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'bottom') as never)
  await $.command.run({ command: 'datatug', args: '' } as never)
  const pane = await $.ui.mount({
    plugin: 'datatug', surface: 'terminal', component: 'Pane', requestId: 'datatug', props: { bodyColumns: 80 },
  } as never)
  await pane.input({ key: 'opendb-input', text: 'sqlite:///db/chinook.sqlite', kind: 'submit' } as never)
  await pane.press({ key: 'odbt:table:Invoice' } as never)
  const d = JSON.stringify(await pane.drawn())
  expect(d).toContain('FK')
  expect(d).toContain('Customer')
  expect(seen.some(x => x.includes('sqlite_master'))).toBe(false)
})

test('a database is named by its project id, file name or database name', () => {
  expect(dbName('datatug://p1/chinook-local?env=local')).toBe('chinook-local')
  expect(dbName('datatug://p1/my%20db')).toBe('my db')
  expect(dbName('sqlite:///Users/me/data/chinook.sqlite')).toBe('chinook.sqlite')
  expect(dbName('postgres://***@host:5432/shop')).toBe('shop')
})

test('Referenced by counts distinct tables', () => {
  const t = (name: string) => ({ table: { schema: 'main', name } as never })
  expect(tablesCount([])).toBe('0 tables')
  expect(tablesCount([t('Invoice')])).toBe('1 table')
  expect(tablesCount([t('Invoice'), t('invoice'), t('Track')])).toBe('2 tables')
})
