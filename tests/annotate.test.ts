import { expect, test } from 'claude-code/testing'

import { ANNOTATE_MIN_CLI_VERSION, annotateArgs, isPersonPrompt, keptPrompt } from '../lib/annotate.js'
import { fakeWorld as world, result } from './card-fixtures'

// The default fake CLI is older than the verb; these tests run against one that may have it.
const fakeWorld = (on: any, files: Record<string, string>, over: Record<string, unknown> = {}) => world(on, files, { version: '0.100.2', ...over })

const CMD = 'datatug query run --db datatug://demo/chinook --from Album --no-policies'
const run = ($: any, id: string, command = CMD) => $.tool.call({ tool: 'Bash', tool_use_id: id, command } as never)
const PROMPT = 'show me the SECRET-PROMPT-WORDS albums by Alice'
// A prompt as the person's Enter raises it.
const say = ($: any, text = PROMPT, origin: unknown = { kind: 'composer' }) => $.prompt.submit({ text, origin } as never)

test('the person-origin rules', () => {
  expect(isPersonPrompt({ kind: 'composer' })).toBe(true)
  expect(isPersonPrompt({ kind: 'bridge' })).toBe(true)
  expect(isPersonPrompt({ kind: 'sdk' })).toBe(true)
  expect(isPersonPrompt({ kind: 'plugin', name: 'x', asUser: true })).toBe(true)
  for (const origin of [{ kind: 'plugin', name: 'x' }, { kind: 'peer' }, { kind: 'scheduled-trigger' }, { kind: 'task-notification' }, { kind: 'unclassified' }, undefined, null]) expect(isPersonPrompt(origin)).toBe(false)
  expect(keptPrompt('  hi \n', { kind: 'composer' })).toBe('hi')
  expect(keptPrompt('   ', { kind: 'composer' })).toBe(null)
  expect(keptPrompt('x'.repeat(40000), { kind: 'composer' })?.length).toBe(16384)
  expect(keptPrompt('hi', { kind: 'peer' })).toBe(null)
})

test('the arguments never hold a prompt', () => {
  expect(annotateArgs('t1')).toEqual(['query', 'results', 'annotate', '--id', 't1', '--prompt-stdin'])
  expect(ANNOTATE_MIN_CLI_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
})

test('the prompt reaches the CLI on standard input, never in an argument or the environment', async ($, on) => {
  const cli = fakeWorld(on, result('t1'))
  await say($)
  await run($, 't1')
  expect(cli.stdins).toHaveLength(1)
  expect(cli.stdins[0].argv).toEqual(['datatug', 'query', 'results', 'annotate', '--id', 't1', '--prompt-stdin'])
  expect(cli.stdins[0].stdin).toBe(PROMPT)
  expect(cli.stdins[0].env).toEqual({ DATATUG_CLIENT: 'claude-mod' })
  for (const argv of cli.runs) expect(argv.join(' ')).not.toContain('SECRET-PROMPT-WORDS')
  expect(cli.bash.join(' ')).not.toContain('SECRET-PROMPT-WORDS')
})

test('it waits for the card: the annotation is asked after the files are read', async ($, on) => {
  const cli = fakeWorld(on, result('t1'))
  await say($)
  await run($, 't1')
  const at = cli.runs.findIndex(a => a.includes('annotate'))
  const locate = cli.runs.findIndex(a => a.includes('locate'))
  expect(locate).toBeGreaterThan(-1)
  expect(at).toBeGreaterThan(locate)
  expect(cli.reads).toHaveLength(2)
})

test('once per result, and the latest prompt wins for the next one', async ($, on) => {
  const cli = fakeWorld(on, { ...result('t1'), ...result('t2'), ...result('t3') })
  await say($, 'first question')
  await run($, 't1')
  await say($, 'second question')
  await run($, 't2')
  // A later model turn with no new prompt keeps the last one.
  await run($, 't3')
  expect(cli.stdins.map(s => [s.argv[5], s.stdin])).toEqual([
    ['t1', 'first question'],
    ['t2', 'second question'],
    ['t3', 'second question'],
  ])
})

test('only the person is a prompt: a peer, a notification or an unmarked plugin message is not kept', async ($, on) => {
  const cli = fakeWorld(on, result('t1'))
  for (const origin of [{ kind: 'peer' }, { kind: 'task-notification' }, { kind: 'scheduled-trigger' }, { kind: 'plugin', name: 'other' }]) await say($, 'not the person', origin)
  await run($, 't1')
  expect(cli.stdins).toHaveLength(0)
})

test('with no prompt seen, nothing is sent', async ($, on) => {
  const cli = fakeWorld(on, result('t1'))
  await run($, 't1')
  expect(cli.runs.some(a => a.includes('annotate'))).toBe(false)
})

test('a CLI older than the verb is not asked', async ($, on) => {
  const cli = fakeWorld(on, result('t1'), { version: '0.100.1' })
  await say($)
  await run($, 't1')
  expect(cli.runs.some(a => a.includes('annotate'))).toBe(false)
})

test('the first CLI that may have the verb is asked, and so is a development build', async ($, on) => {
  const cli = fakeWorld(on, result('t1'), { version: '0.100.2' })
  await say($)
  await run($, 't1')
  expect(cli.stdins).toHaveLength(1)
})

test('a development build (no readable version) is asked', async ($, on) => {
  const cli = fakeWorld(on, result('t1'), { version: 'dev' })
  await say($)
  await run($, 't1')
  expect(cli.stdins).toHaveLength(1)
})

for (const how of ['unknown-command', 'fail', 'throw'] as const) {
  test(`a failing annotate (${how}) is silent: the card and the model's summary are as without it`, async ($, on) => {
    const cli = fakeWorld(on, result('t1'), { annotate: how })
    await say($)
    const out = JSON.stringify(await run($, 't1'))
    expect(cli.stdins).toHaveLength(1)
    expect(out).toContain('3 rows')
    expect(cli.logs.filter(l => !l.startsWith('DataTug: result card above'))).toEqual([])
    expect(cli.toasts).toEqual([])
    expect(out).not.toContain('annotate')
    expect(out).not.toContain('no such result')
    // No retry loop.
    expect(cli.runs.filter(a => a.includes('annotate'))).toHaveLength(1)
  })
}

test('the prompt is in no argument list, log, toast, summary or rendered card', async ($, on) => {
  const cli = fakeWorld(on, result('t1'))
  await say($)
  const summary = JSON.stringify(await run($, 't1'))
  const seen = [summary, JSON.stringify(cli.runs), JSON.stringify(cli.bash), JSON.stringify(cli.logs), JSON.stringify(cli.toasts), JSON.stringify(cli.spawns), JSON.stringify(cli.outputs)].join('\n')
  expect(seen).not.toContain('SECRET-PROMPT-WORDS')
  expect(cli.stdins[0].stdin).toContain('SECRET-PROMPT-WORDS')
})

test('a legacy-mode call has no result and no annotation', async ($, on) => {
  const cli = fakeWorld(on, {}, { version: '0.80.0' })
  await say($)
  await run($, 't1')
  expect(cli.runs.some(a => a.includes('annotate'))).toBe(false)
})

test('a prompt passes through the hook unchanged', async ($, on) => {
  fakeWorld(on, {})
  const r = await say($, 'hello there')
  expect(JSON.stringify(r)).not.toContain('"drop"')
})
