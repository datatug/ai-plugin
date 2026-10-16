import { expect, test } from 'claude-code/testing'

import { BACKGROUND_TEXT, FAILED_TEXT, PLAIN_TEXT, STORE_TEXT, bashNamesStore, classify, lex, normalizePath, runsQuery } from '../lib/bash.js'

const HOME = '/Users/u'

test('the plain form, ad-hoc or saved, is split right after query run', () => {
  const cases: [string, string, string][] = [
    ['datatug query run --db datatug://demo/chinook --from Album --no-policies', 'datatug query run', ' --db datatug://demo/chinook --from Album --no-policies'],
    ['env X=1 datatug query run --db a --from T', 'env X=1 datatug query run', ' --db a --from T'],
    ['/usr/local/bin/datatug query run --db a --from T', '/usr/local/bin/datatug query run', ' --db a --from T'],
    ["datatug query run --db 'datatug://demo/chinook?env=local' --from Album --no-policies", 'datatug query run', " --db 'datatug://demo/chinook?env=local' --from Album --no-policies"],
    ["datatug query run --db datatug://demo/chinook -f q.yaml --var 'ids=[1,2]' --no-policies", 'datatug query run', " --db datatug://demo/chinook -f q.yaml --var 'ids=[1,2]' --no-policies"],
    ['datatug query run --project demo --query customers/customer-invoices --as u1 --var CustomerId=2', 'datatug query run', ' --project demo --query customers/customer-invoices --as u1 --var CustomerId=2'],
    ['datatug query run --db datatug://demo/chinook --from Album --as', 'datatug query run', ' --db datatug://demo/chinook --from Album --as'],
    ['  time datatug query run --db a --from T  ', 'time datatug query run', ' --db a --from T'],
  ]
  for (const [cmd, head, tail] of cases) {
    const c = classify(cmd, false)
    expect(c).toEqual({ kind: 'plain', head, tail, format: null })
  }
  expect(classify('datatug query run --db a --from T --format csv', false)).toEqual({ kind: 'plain', head: 'datatug query run', tail: ' --db a --from T --format csv', format: 'csv' })
  expect(classify('datatug query run --db a --from T --format=json', false)).toEqual({ kind: 'plain', head: 'datatug query run', tail: ' --db a --from T --format=json', format: 'json' })
})

test('every other form of datatug query run is denied with a reason the model can act on', () => {
  const denied = [
    'cd /x && datatug query run --db a --from T',
    'cd /x\ndatatug query run --db a --from T',
    'for f in a b; do datatug query run --db x --from T; done',
    'if true; then datatug query run --db x --from T; fi',
    'sleep 1 & datatug query run --db a --from T',
    'nohup datatug query run --db a --from T',
    'nice -n 5 datatug query run --db a --from T',
    'timeout 60 datatug query run --db a --from T',
    'env -i datatug query run --db a --from T',
    'sudo -u x datatug query run --db a --from T',
    'stdbuf -o0 datatug query run --db a --from T',
    'command datatug query run --db a --from T',
    'exec datatug query run --db a --from T',
    'echo x | xargs -n1 datatug query run --db a --from',
    'watch -n 2 datatug query run --db a --from T',
    'caffeinate datatug query run --db a --from T',
    '{ datatug query run --db a --from T; }',
    '! datatug query run --db a --from T',
    'x=$(datatug query run --db a --from T)',
    'echo `datatug query run --db a --from T`',
    'echo "$(datatug query run --db a --from T)"',
    '(datatug query run --db a --from T)',
    'cat <<EOF\ndatatug query run --db a --from T\nEOF',
    "git commit -F - <<'EOF'\nIt's done\ndatatug query run --db a --from T\nEOF",
    'datatug query run --db a --from T --as -h',
    'datatug query run --db a --from T --help',
    'datatug query run --from X #',
    'datatug query run --db a --from T \\',
    "datatug query run --db 'a --from T",
    "datatug query run --from a'b'",
    'datatug query run --from "a\'b"',
    "datatug query run --db --='x' --from T",
    'datatug query run --db a --from T -- x',
    'datatug query run --db a --from T --result-id x1',
    'datatug query run --db a --from T --result-id=x1',
    'datatug query run --db a --from T --result-rows 10',
    'datatug query run --db a --from T --client claude-mod',
    'datatug --client x query run --db a --from T',
    'datatug query run --db "$HOME/x.db" --from T',
    'datatug query run --db a --from T > out.json',
    'datatug query run --db a --from T; echo done',
    "datatug 'query' run --db x --from c",
    'datatug query "run" --db x --from c',
    '"datatug" query run --db x --from c',
    '\\datatug query run --db x --from c',
    'time -p datatug query run --db x --from c',
    'find . -name x -exec datatug query run --db x --from c \\;',
    'script -q /dev/null datatug query run --db x --from c',
    'unbuffer datatug query run --db x --from c',
    'npx datatug query run --db x --from c',
    "datatug query $'run' --db x --from c",
    "datatug $'query' run --db x --from c",
    "$'datatug' query run --db x --from c",
    "datatug query $'\\x72un' --db x --from c",
    'datatug query run -f q --{result-id,1}',
    'datatug query run -f q --result-i[d] 1',
    'datatug query run -f q --result-?d 1',
    'datatug query run -f q --cl*nt x',
    'datatug query $"run" --db x --from c',
  ]
  for (const cmd of denied) {
    const c = classify(cmd, false)
    expect({ cmd, kind: c.kind }).toEqual({ cmd, kind: 'deny' })
    expect((c as { reason: string }).reason).toBe(PLAIN_TEXT)
  }
  expect(classify('datatug query run --db a --from T', true)).toEqual({ kind: 'deny', reason: BACKGROUND_TEXT })
  // zsh runs `=datatug` as the datatug on the PATH: it is the plain form, and rewritten.
  expect(classify('=datatug query run --db x --from c', false).kind).toBe('plain')
})

test('a pure help call passes through, and words of the command elsewhere are not matched', () => {
  expect(classify('datatug query run --help', false).kind).toBe('help')
  expect(classify('datatug query run -h', false).kind).toBe('help')
  for (const cmd of [
    'echo datatug query run x',
    'rg "datatug query run" spec/',
    'git commit -m "docs: datatug query run"',
    "grep -rn 'datatug query run' skills",
    'datatug query run-all',
    'datatug queries --format json',
    'datatug query results check --format json',
    'git add spec/features/query-results-card/README.md',
    'specscore feature info query-results-card',
    'ls # datatug query run',
  ]) expect({ cmd, kind: classify(cmd, false).kind }).toEqual({ cmd, kind: 'none' })
  expect(runsQuery("bash -c 'datatug query run --db a --from T'")).toBe(false)
  expect(lex('a "b c" \'d\' \\e').map(x => x.word)).toEqual(['a', 'b c', 'd', 'e'])
})

test('the store and the capture folder are named only by their paths, never by plain words', () => {
  for (const cmd of [
    'cat ~/.datatug/query-results/t1/data.json',
    'ls $TMPDIR/datatug-claude-mod',
    'ls /tmp/datatug-claude-mod/',
    'cat ~/.datatug/*/t1/data.json',
    'ls ~/.datatug*',
    'cat $HOME/.datatug/query-results/x',
    `find ${HOME}/.datatug/query-results`,
    'cd ~/.datatug && ls',
    'cd $HOME/.datatug',
    'pushd ~/.datatug/query-results',
    'datatug query results locate --id t1 --format json',
    'datatug daemon url --result t1 --format json',
    'datatug daemon url --result=t1',
    'echo x; datatug query results locate --id t1',
    'datatug query results "locate" --id t1',
    'grep -r . ~/.datatug',
    'find ~/.datatug -type f -exec cat {} +',
    'tar c ~/.datatug | tar xO',
    'cat ~/.datatug/q*/*/*',
    'cat ~/.datatug/quer?-results/*/*',
    `cat ${HOME}/.datatug/q*/*/*`,
    'cd ~ && cat .datatug/q*/*/*',
    'cat ~/.datatug/"query-results"/*/*',
    'cat ~/.DATATUG/QUERY-RESULTS/*/*',
    'ls "$HOME"/.datatug',
    'ls $TMPDIR/datatug-claude-*',
    "datatug query results $'locate' --id t1",
    'q=query-results; cat ~//.datatug/$q/t1/data.json',
    'cat ~//.datatug/query-{results,x}/t1/data.json',
    `cat ${HOME}/./.datatug/query-{results,x}/t1/data.json`,
    'cat ~/Library/../.datatug/query-{results,x}/t1/data.json',
    'cat ~//.datatug/query-r$(true)esults/t1/data.json',
    'ls ~//.datatug/query-{results,x}',
    'datatug ui --result t1',
    'datatug --client x ui --result=t1',
  ]) expect({ cmd, denied: bashNamesStore(cmd, HOME) }).toEqual({ cmd, denied: true })
  for (const cmd of [
    'rg datatug-claude-mod hooks/',
    'git add spec/features/query-results-card/README.md',
    'git checkout -b query-results-card',
    'specscore feature info query-results-card',
    'rg "datatug query run" spec/',
    'datatug query run --db datatug://demo/chinook --from Album --no-policies',
    'datatug daemon url --db datatug://p/db --table T --format json',
    'datatug query results check --format json',
    'rg "query results locate" spec/',
    'ls ~/.datatug-other',
    'datatug ui',
    'ls a//b/./c/../d',
  ]) expect({ cmd, denied: bashNamesStore(cmd, HOME) }).toEqual({ cmd, denied: false })
})

test('paths are folded before they are judged', () => {
  expect(normalizePath('~/.datatug/query-results/../query-results/t1', HOME, '/w')).toBe('/Users/u/.datatug/query-results/t1')
  expect(normalizePath('$HOME/.datatug', HOME, '/w')).toBe('/Users/u/.datatug')
  expect(normalizePath('notes/new.md', HOME, '/w')).toBe('/w/notes/new.md')
  expect(normalizePath('~/x', undefined, '/w')).toBe(null)
})

// The Bash tool as the hook's next: every command that reaches it is recorded.
function bashTool(on: any, answer: (cmd: string) => unknown = () => ({ result: { stdout: '', stderr: '' }, text: '', ref: {} })) {
  const ran: string[] = []
  on('tool.call', { tool: 'Bash' }, (_$: unknown, e: { command: string }) => {
    ran.push(e.command)
    return answer(e.command) as never
  })
  return ran
}

test('a denied command never reaches the shell, and the model reads the reason', async ($, on) => {
  const ran = bashTool(on)
  on('env.get', () => ({ value: undefined }) as never)
  for (const [i, command] of ['cd /x && datatug query run --db a --from T', 'timeout 60 datatug query run --db a --from T', 'datatug query run --db a --from T --result-id x'].entries()) {
    const out = await $.tool.call({ tool: 'Bash', tool_use_id: `d${i}`, command } as never)
    expect(JSON.stringify(out)).toContain('plain `datatug query run')
  }
  const bg = await $.tool.call({ tool: 'Bash', tool_use_id: 'd9', command: 'datatug query run --db a --from T', run_in_background: true } as never)
  expect(JSON.stringify(bg)).toContain(BACKGROUND_TEXT)
  expect(ran).toEqual([])
})

test('help passes through unrewritten', async ($, on) => {
  const ran = bashTool(on, () => ({ result: { stdout: 'Usage: datatug query run', stderr: '' }, text: 'Usage', ref: {} }))
  const out = await $.tool.call({ tool: 'Bash', tool_use_id: 'h1', command: 'datatug query run --help' } as never)
  expect(ran).toEqual(['datatug query run --help'])
  expect(JSON.stringify(out)).toContain('Usage')
})

test('the hook denies when it fails before the command runs', async ($, on) => {
  const ran = bashTool(on)
  // A tool_use_id that is not text: the capture file cannot be named, the hook throws before next.
  const before = await $.tool.call({ tool: 'Bash', tool_use_id: 42, command: 'datatug query run --db a --from T' } as never)
  expect(JSON.stringify(before)).toContain(FAILED_TEXT)
  expect(ran).toEqual([])
})

test('the hook denies when it fails after the command ran', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => {
    throw new Error('interrupted')
  })
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }) as never)
  const after = await $.tool.call({ tool: 'Bash', tool_use_id: 'f2', command: 'datatug query run --db a --from T' } as never)
  expect(JSON.stringify(after)).toContain(FAILED_TEXT)
})

test('an explicit non-json --format is captured privately and the model is told to leave it out', async ($, on) => {
  on('fs.read', () => ({ value: 'name\nSECRET-ALICE\n' }) as never)
  const removed: string[] = []
  on('process.run', (_$: unknown, e: { argv: string[] }) => {
    removed.push(e.argv.join(' '))
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  const ran = bashTool(on)
  const out = await $.tool.call({ tool: 'Bash', tool_use_id: 'c1', command: 'datatug query run --db a --from T --format csv' } as never)
  expect(ran).toHaveLength(1)
  expect(ran[0]).toContain('(set -C; datatug query run --db a --from T --format csv > ')
  expect(ran[0].includes('--format json')).toBe(false)
  expect(JSON.stringify(out)).toContain('leave out --format')
  expect(JSON.stringify(out).includes('SECRET-ALICE')).toBe(false)
  expect(removed).toEqual(['rm -f /tmp/datatug-claude-mod/c1.json'])
})

test('a query moved to the background is not read, its capture is removed, and no row reaches the model', async ($, on) => {
  const reads: string[] = []
  on('fs.read', (_$: unknown, e: { path: string }) => {
    reads.push(e.path)
    return { value: '[{"name":"SECRET-ALICE"}]' } as never
  })
  const removed: string[] = []
  on('process.run', (_$: unknown, e: { argv: string[] }) => {
    removed.push(e.argv.join(' '))
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  bashTool(on, () => ({ result: { stdout: '', stderr: '', backgroundTaskId: 'bg1', interrupted: false }, text: '', ref: {} }))
  const out = await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'datatug query run --db a --from T' } as never)
  expect(reads).toEqual([])
  expect(removed).toEqual(['rm -f /tmp/datatug-claude-mod/b1.json'])
  expect(JSON.stringify(out)).toContain('background')
  expect(JSON.stringify(out).includes('SECRET-ALICE')).toBe(false)
})

test('the model tools cannot reach the result store or the capture folder', async ($, on) => {
  on('env.get', (_$: unknown, e: { name: string }) => ({ value: e.name === 'HOME' ? HOME : e.name === 'TMPDIR' ? '/var/folders/ab/T/' : undefined }) as never)
  on('session.cwd', () => ({ value: '/w' }) as never)
  on('fs.exists', (_$: unknown, e: { path: string }) => ({ value: e.path === '/w/link-to-store' }) as never)
  on('fs.stat', (_$: unknown, e: { path: string }) => ({ value: { kind: 'directory', size: 0, mtimeMs: 0, isLink: true, realPath: e.path === '/w/link-to-store' ? `${HOME}/.datatug/query-results` : e.path } }) as never)
  const reached: string[] = []
  for (const tool of ['Read', 'Grep', 'Glob', 'Write', 'Edit', 'NotebookEdit', 'Bash'])
    on('tool.call', { tool } as never, (_$: unknown, e: unknown) => {
      reached.push(JSON.stringify(e))
      return { result: { stdout: '', stderr: '' }, text: '', ref: {} } as never
    })
  const denied = [
    { tool: 'Read', file_path: '~/.datatug/query-results/t1/data.json' },
    { tool: 'Read', file_path: `${HOME}/.datatug/query-results/t1/meta.json` },
    { tool: 'Grep', pattern: 'x', path: '~/.datatug' },
    { tool: 'Grep', pattern: 'x', path: '/var/folders/ab/T' },
    { tool: 'Glob', pattern: '~/.datatug/**/*.json' },
    { tool: 'Glob', pattern: '*.json', path: '/var/folders/ab/T/datatug-claude-mod' },
    { tool: 'Read', file_path: 'link-to-store' },
    { tool: 'Edit', file_path: '~/.datatug/query-results/t1/meta.json', old_string: 'a', new_string: 'b' },
    { tool: 'Write', file_path: '/var/folders/ab/T/datatug-claude-mod/x.json', content: '' },
    { tool: 'NotebookEdit', notebook_path: '~/.datatug/query-results/n.ipynb', new_source: '' },
    { tool: 'Bash', command: 'cat ~/.datatug/query-results/t1/data.json' },
    { tool: 'Bash', command: 'ls $TMPDIR/datatug-claude-mod' },
    { tool: 'Bash', command: 'datatug query results locate --id t1 --format json' },
    { tool: 'Bash', command: 'datatug daemon url --result t1' },
    { tool: 'Bash', command: 'cd ~/.datatug && ls' },
  ]
  for (const [i, input] of denied.entries()) {
    const out = await $.tool.call({ ...input, tool_use_id: `g${i}` } as never)
    expect({ input, out: JSON.stringify(out).includes(STORE_TEXT) }).toEqual({ input, out: true })
  }
  expect(reached).toEqual([])
  const allowed = [
    { tool: 'Write', file_path: 'notes/new.md', content: 'x' },
    { tool: 'Read', file_path: 'notes/missing.md' },
    { tool: 'Grep', pattern: 'datatug-claude-mod', path: 'hooks' },
    { tool: 'Bash', command: 'rg datatug-claude-mod hooks/' },
    { tool: 'Bash', command: 'git add spec/features/query-results-card/README.md' },
    { tool: 'Bash', command: 'specscore feature info query-results-card' },
    { tool: 'Bash', command: 'rg "datatug query run" spec/' },
  ]
  for (const [i, input] of allowed.entries()) {
    const out = await $.tool.call({ ...input, tool_use_id: `a${i}` } as never)
    expect({ input, denied: JSON.stringify(out).includes(STORE_TEXT) }).toEqual({ input, denied: false })
  }
  expect(reached).toHaveLength(allowed.length)
})
