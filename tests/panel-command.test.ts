import { expect, test } from 'claude-code/testing'
import { MIN_CLI_VERSION } from '../lib/cli.js'

const PROJECTS = '[{"id":"p1","title":"One","origin":""}]'

// A `datatug` that answers its version and nothing else of the project pane's four commands.
function panelCli(version: string | Error) {
  const calls: string[][] = []
  const stub = (_$: unknown, e: { argv: string[] }) => {
    calls.push(e.argv)
    const tail = e.argv.slice(1).join(' ')
    if (tail === '--version') return version instanceof Error ? { deny: version.message } : { value: { exitCode: 0, stdout: `${version}\n`, stderr: '' } }
    if (tail.startsWith('projects')) return { value: { exitCode: 0, stdout: PROJECTS, stderr: '' } }
    return { value: { exitCode: 0, stdout: '{"environments":[]}', stderr: '' } }
  }
  return { calls, stub }
}

test('plain /datatug checks the version, opens the panel and runs none of the project pane commands', async ($, on) => {
  const cli = panelCli(MIN_CLI_VERSION)
  const opened: string[] = []
  on('session.cwd', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('process.run', cli.stub as never)
  on('ui.open', (_$, e) => {
    opened.push((e as { id: string }).id)
    return { value: { isPlaced: true } } as never
  })
  const answer = await $.command.run({ command: 'datatug', args: '' })
  expect(answer.text).toBe('DataTug panel opened.')
  expect(opened).toEqual(['datatug'])
  expect(cli.calls[0].slice(1)).toEqual(['--version'])
  const joined = cli.calls.map(c => c.slice(1).join(' '))
  expect(joined.some(c => c.startsWith('queries') || c.startsWith('board'))).toBe(false)
})

test('/datatug project opens the project pane, not the panel', async ($, on) => {
  const opened: string[] = []
  on('session.cwd', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('process.run', (_$, e) => {
    const tail = (e as { argv: string[] }).argv.slice(1).join(' ')
    return { value: { exitCode: 0, stdout: tail === '--version' ? `${MIN_CLI_VERSION}\n` : tail.startsWith('queries') || tail.startsWith('board') ? '[]' : '{}', stderr: '' } } as never
  })
  on('ui.open', (_$, e) => {
    opened.push((e as { id: string }).id)
    return { value: { isPlaced: true } } as never
  })
  await $.command.run({ command: 'datatug', args: 'project' })
  expect(opened).toEqual(['datatug-project'])
})

test('the panel says so, and opens nothing, when datatug is too old', async ($, on) => {
  const cli = panelCli('0.80.0')
  let opens = 0
  on('session.cwd', () => ({ value: '/work' }))
  on('process.run', cli.stub as never)
  on('ui.open', () => {
    opens += 1
    return { value: { isPlaced: true } } as never
  })
  const answer = await $.command.run({ command: 'datatug', args: '' })
  expect(answer.text).toContain('0.80.0')
  expect(answer.text).toContain(MIN_CLI_VERSION)
  expect(answer.text).toContain('datatug self-update')
  expect(cli.calls).toHaveLength(1)
  expect(opens).toBe(0)
})

test('the panel names the install skill, and opens nothing, when datatug cannot be started', async ($, on) => {
  let opens = 0
  on('session.cwd', () => ({ value: '/work' }))
  on('process.run', panelCli(new Error('spawn datatug ENOENT')).stub as never)
  on('ui.open', () => {
    opens += 1
    return { value: { isPlaced: true } } as never
  })
  const answer = await $.command.run({ command: 'datatug', args: '' })
  expect(answer.text).toContain('datatug:datatug-install')
  expect(opens).toBe(0)
})

test('where nothing draws panes the panel replies with one line naming /datatug project', async ($, on) => {
  let opens = 0
  on('session.cwd', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: [] }))
  on('process.run', panelCli(MIN_CLI_VERSION).stub as never)
  on('ui.open', () => {
    opens += 1
    return { value: { isPlaced: true } } as never
  })
  const answer = await $.command.run({ command: 'datatug', args: '' })
  expect(answer.text).toContain('/datatug project')
  expect(answer.text.includes('\n')).toBe(false)
  expect(opens).toBe(0)
})

test('a pane that is not placed gets the same one line', async ($, on) => {
  on('session.cwd', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('process.run', panelCli(MIN_CLI_VERSION).stub as never)
  on('ui.open', () => ({ value: { isPlaced: false } }) as never)
  const answer = await $.command.run({ command: 'datatug', args: '' })
  expect(answer.text).toContain('/datatug project')
})

test('the panel is not opened by a session start', async ($, on) => {
  let opens = 0
  let runs = 0
  const registered: string[] = []
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', (_$, e) => {
    registered.push((e as { name: string }).name)
    return { value: undefined } as never
  })
  on('ui.open', () => {
    opens += 1
    return { value: { isPlaced: true } } as never
  })
  on('process.run', () => {
    runs += 1
    return { value: { exitCode: 0, stdout: '[]', stderr: '' } } as never
  })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(registered).toEqual(['datatug'])
  expect(opens).toBe(0)
  expect(runs).toBe(0)
})

// The rows of a `datatug query run` go to a file the model never reads, in an owner-only folder.
async function runQuery($: any, on: any, tmp: string | null) {
  const commands: string[] = []
  const writes: [string, string][] = []
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('env.get', () => ({ value: tmp ?? undefined }))
  on('fs.read', () => ({ value: '[{"name":"SECRET-ALICE"}]' }))
  on('fs.write', (_$: unknown, e: { path: string; text: string }) => {
    writes.push([e.path, e.text])
    return { value: undefined }
  })
  on('tool.call', { tool: 'Bash' }, (_$: unknown, e: { command: string }) => {
    commands.push(e.command)
    return { result: { stdout: '', stderr: '' }, text: '', ref: {} }
  })
  const ran = await $.tool.call({ tool: 'Bash', tool_use_id: 'q/1', command: 'datatug query run --db datatug://p/x --from people' } as never)
  return { commands, writes, ran }
}

test('query rows go to an owner-only folder under the temporary folder and the file is emptied once read', async ($, on) => {
  const { commands, writes, ran } = await runQuery($, on, '/var/folders/ab/T/')
  expect(commands).toHaveLength(1)
  expect(commands[0]).toContain("mkdir -p -m 700 '/var/folders/ab/T/datatug-claude-mod'")
  expect(commands[0]).toContain("> '/var/folders/ab/T/datatug-claude-mod/q_1.json'")
  expect(commands[0]).toContain('--format json')
  expect(writes).toEqual([['/var/folders/ab/T/datatug-claude-mod/q_1.json', '']])
  expect(JSON.stringify(ran).includes('SECRET-ALICE')).toBe(false)
})

test('a temporary folder with a quote or a space in it is not used', async ($, on) => {
  const { commands } = await runQuery($, on, "/tmp/x'; rm -rf ~; '")
  expect(commands[0]).toContain("mkdir -p -m 700 '/tmp/datatug-claude-mod'")
})

test('a temporary folder that is not absolute is not used', async ($, on) => {
  const { commands } = await runQuery($, on, 'relative/tmp')
  expect(commands[0]).toContain("mkdir -p -m 700 '/tmp/datatug-claude-mod'")
})

test('a command with shell syntax of its own is left alone', async ($, on) => {
  const commands: string[] = []
  on('tool.call', { tool: 'Bash' }, (_$: unknown, e: { command: string }) => {
    commands.push(e.command)
    return { result: { stdout: 'x', stderr: '' }, text: '', ref: {} } as never
  })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'q2', command: 'datatug query run --db x --from y | head' } as never)
  expect(commands).toEqual(['datatug query run --db x --from y | head'])
})

test('a database opened with a password reaches no argument list, prompt, drawing or state, only DATATUG_OPEN_DB', async ($, on) => {
  const argvs: string[] = []
  const envs: string[] = []
  const fills: string[] = []
  const SECRET = 'pw-s3cret-9'
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.cwd', () => ({ value: '/work' }) as never)
  on('session.surfaces', () => ({ value: ['terminal'] }) as never)
  on('prompt.fill', (_$, e) => {
    fills.push(JSON.stringify(e))
    return { isFilled: true } as never
  })
  on('process.run', (_$, e) => {
    const call = e as { argv: string[]; init?: { env?: Record<string, string> } }
    argvs.push(JSON.stringify(call.argv))
    envs.push(JSON.stringify(call.init?.env ?? {}))
    const tail = call.argv.slice(1).join(' ')
    let stdout = '[{"id":"p1","title":"","origin":""}]'
    if (tail === '--version') stdout = '0.84.1\n'
    else if (tail.startsWith('db schema')) stdout = JSON.stringify({ provider: 'postgres', tables: [{ schema: 'public', name: 'Album', kind: 'table', columns: [{ name: 'AlbumId', type: 'integer', primaryKeyPosition: 1 }] }] })
    else if (tail.startsWith('db add')) stdout = JSON.stringify({ added: true, id: 'db1', env: 'local', driver: 'postgres', dbRef: 'datatug://p1/db1?env=local' })
    else if (tail.startsWith('show')) stdout = JSON.stringify({ environments: [{ id: 'local', sources: [{ id: 'db1', driver: 'postgres' }] }] })
    return { value: { exitCode: 0, stdout, stderr: '' } } as never
  })
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'bottom') as never)
  await $.command.run({ command: 'datatug', args: '' } as never)
  const pane = await $.ui.mount({
    plugin: 'datatug', surface: 'terminal', component: 'Pane', requestId: 'datatug', props: { bodyColumns: 80 },
  } as never)
  await pane.input({ key: 'opendb-input', text: `postgres://app:${SECRET}@db.example/shop`, kind: 'submit' } as never)
  await pane.press({ key: 'odbt:table:Album' } as never)
  await pane.press({ key: 'dbtable-ask' } as never)
  const drawn = JSON.stringify(await pane.drawn())
  // Every command that took the database named it env:DATATUG_OPEN_DB, with the URL only in the environment.
  expect(argvs.some(a => a.includes(SECRET))).toBe(false)
  expect(argvs.filter(a => a.includes('db')).some(a => a.includes('env:DATATUG_OPEN_DB'))).toBe(true)
  expect(envs.some(e => e.includes(SECRET))).toBe(true)
  expect(drawn.includes(SECRET)).toBe(false)
  expect(fills).toHaveLength(1)
  expect(fills[0].includes(SECRET)).toBe(false)
  expect(fills[0]).toContain('--db datatug://p1/db1?env=local')
  expect(fills[0].includes('postgres://')).toBe(false)
})

import { redact, scrub } from '../hooks/register'
import { stripUnsafe } from '../lib/text.js'

test('redact hides a password that holds an @, a / or a ?, and a url with no credentials is unchanged', () => {
  expect(redact('postgres://u:p@ss@host/db')).toBe('postgres://***@host/db')
  expect(redact('postgres://u:p/ss@host/db')).toBe('postgres://***@host/db')
  expect(redact('postgres://u:p?w@host/db?sslmode=x')).toBe('postgres://***@host/db')
  expect(redact('sqlite://user:s3cret@/tmp/x.db?mode=ro')).toBe('sqlite://***@/tmp/x.db')
  expect(redact('sqlite:///tmp/x.db')).toBe('sqlite:///tmp/x.db')
  expect(redact('datatug://p1/db?env=local')).toBe('datatug://p1/db?env=local')
  for (const u of ['postgres://u:p@ss@host/db', 'postgres://u:p/ss@host/db']) expect(redact(u) === u).toBe(false)
})

test('scrub blanks a connection string inside text', () => {
  expect(scrub('connect postgres://u:p/ss@host/db failed')).toBe('connect *** failed')
  expect(scrub('plain message')).toBe('plain message')
})

test('stripUnsafe covers the characters the project pane covers', () => {
  expect(stripUnsafe('a b⁠c﻿d\u{e0041}e\u0007f')).toBe('a b c d e f')
})

test('the rows file is emptied when the command failed, and the folder is checked before the redirect', async ($, on) => {
  const writes: string[] = []
  let command = ''
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('fs.read', () => ({ value: '[{"name":"SECRET"}]' }) as never)
  on('fs.write', (_$: unknown, e: { path: string }) => {
    writes.push(e.path)
    return { value: undefined } as never
  })
  on('tool.call', { tool: 'Bash' }, (_$: unknown, e: { command: string }) => {
    command = e.command
    return { isError: true, result: { stdout: '', stderr: 'boom' }, text: '', ref: {} } as never
  })
  const ran = await $.tool.call({ tool: 'Bash', tool_use_id: 'q9', command: 'datatug query run --db x --from y' } as never)
  expect(writes).toHaveLength(1)
  expect(command).toContain("umask 077 && mkdir -p -m 700 '/tmp/datatug-claude-mod' && [ ! -L '/tmp/datatug-claude-mod' ] && [ -O '/tmp/datatug-claude-mod' ] && chmod 700 '/tmp/datatug-claude-mod'")
  expect(JSON.stringify(ran).includes('SECRET')).toBe(false)
})

import { dbName, isDbRef } from '../hooks/register'

test('redact shows only a known harmless shape and hides every other connection string', () => {
  for (const u of [
    'jdbc:sqlserver://h;password=S3cret',
    'sqlserver://h:1433;password=S3cret',
    'postgres://h/db;password=S3cret',
    'postgres:host=h password=S3cret',
    'postgres://u:S3cret',
    'mysql://u:pa ss@h/db',
    'postgres://h/db?password=S3cret',
  ]) {
    const shown = redact(u)
    expect(shown.includes('S3cret') || shown.includes('pa ss')).toBe(false)
    expect(redact(u) === u).toBe(false)
    expect(dbName(shown).includes('S3cret')).toBe(false)
  }
  expect(redact('postgres://db.example:5432/shop')).toBe('postgres://db.example:5432/shop')
  expect(dbName('sqlserver://h:1433;password=S3cret')).toBe('database')
})

test('only a bare project reference is a reference', () => {
  expect(isDbRef('datatug://p1/db?env=local')).toBe(true)
  expect(isDbRef('datatug:///db')).toBe(true)
  expect(isDbRef('datatug://u:pw@h/db')).toBe(false)
  expect(isDbRef('datatug://p1/db?env=a b')).toBe(false)
})

test('scrub blanks passwords written as key=value, with spaces, or in a jdbc string', () => {
  for (const t of ['mysql://u:pa ss@h/db', 'jdbc:sqlserver://h;password=S3cret', 'bad password=S3cret here', 'x postgres:host=h;pwd=S3cret']) {
    const out = scrub(t)
    expect(out.includes('S3cret') || out.includes('pa ss')).toBe(false)
  }
})

test('a command with a trailing shell comment is left alone, so no redirect can be swallowed', async ($, on) => {
  const commands: string[] = []
  on('tool.call', { tool: 'Bash' }, (_$: unknown, e: { command: string }) => {
    commands.push(e.command)
    return { result: { stdout: 'x', stderr: '' }, text: '', ref: {} } as never
  })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'q5', command: 'datatug query run --db x --from t # note' } as never)
  expect(commands).toEqual(['datatug query run --db x --from t # note'])
})

test('a datatug reference with anything but env in its query is not a reference', () => {
  expect(isDbRef('datatug://p/db?password=abc')).toBe(false)
  expect(isDbRef('datatug://p/db?env=x&pw=hunter2')).toBe(false)
  expect(isDbRef('datatug://p%40x/db')).toBe(false)
  expect(isDbRef('datatug://p/db?env=local')).toBe(true)
  expect(redact('datatug://p/db?password=abc').includes('abc')).toBe(false)
})

test('scrub blanks a scheme-less user:password@host and the provider is not the user name', () => {
  expect(scrub('dial failed for user:pw@tcp(h:3306)/db').includes('pw')).toBe(false)
  expect(scrub('root:s3cr3t@h').includes('s3cr3t')).toBe(false)
})

test('words of a datatug command inside another command are not intercepted', async ($, on) => {
  const commands: string[] = []
  on('tool.call', { tool: 'Bash' }, (_$: unknown, e: { command: string }) => {
    commands.push(e.command)
    return { result: { stdout: 'x', stderr: '' }, text: '', ref: {} } as never
  })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'a1', command: 'git commit -m "docs: datatug query run"' } as never)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'a2', command: 'grep -rn "datatug query run" skills' } as never)
  expect(commands).toEqual(['git commit -m "docs: datatug query run"', 'grep -rn "datatug query run" skills'])
})

test('a datatug command with a flag first, an env prefix or a path is intercepted', async ($, on) => {
  const commands: string[] = []
  on('tool.call', { tool: 'Bash' }, (_$: unknown, e: { command: string }) => {
    commands.push(e.command)
    return { result: { stdout: '', stderr: '' }, text: '', ref: {} } as never
  })
  for (const [i, c] of ['datatug --client x query run --db y --from t', 'FOO=1 datatug query run --db y --from t', '/usr/local/bin/datatug query run --db y --from t'].entries())
    await $.tool.call({ tool: 'Bash', tool_use_id: `b${i}`, command: c } as never)
  expect(commands.every(c => c.includes("> '/tmp/datatug-claude-mod/b"))).toBe(true)
})

test('the rows file is emptied even when it could not be read', async ($, on) => {
  const writes: string[] = []
  on('fs.read', () => {
    throw new Error('too large')
  })
  on('fs.exists', () => ({ value: true }) as never)
  on('fs.write', (_$: unknown, e: { path: string }) => {
    writes.push(e.path)
    return { value: undefined } as never
  })
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '' }, text: '', ref: {} }) as never)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'c1', command: 'datatug query run --db x --from y' } as never)
  expect(writes).toEqual(['/tmp/datatug-claude-mod/c1.json'])
})

test('a command that throws still has its rows file emptied', async ($, on) => {
  const writes: string[] = []
  on('fs.exists', () => ({ value: true }) as never)
  on('fs.write', (_$: unknown, e: { path: string }) => {
    writes.push(e.path)
    return { value: undefined } as never
  })
  on('tool.call', { tool: 'Bash' }, () => {
    throw new Error('interrupted')
  })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'c2', command: 'datatug query run --db x --from y' } as never).catch(() => undefined)
  expect(writes).toEqual(['/tmp/datatug-claude-mod/c2.json'])
})
