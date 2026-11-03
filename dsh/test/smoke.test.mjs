/**
 * Smoke tests for the DataTug DSH bundle, run with `node --test dsh/test`.
 *
 * They load the real plugin modules against a fake Cordis context, so a broken
 * registration, marker, manifest field or slot wiring fails here instead of in
 * a running Harness.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseJsonText, CliFailure } from '../lib/cli.js'
import * as host from '../lib/index.js'

/** @returns a fake Cordis context that records every registration. */
function fakeCtx() {
  /** @type {any[]} */
  const provided = []
  /** @type {any[]} */
  const tools = []
  /** @type {any[]} */
  const providers = []
  const ctx = {
    provided,
    tools: undefined,
    toolsRegistry: tools,
    providers,
    effect(fn) {
      return fn()
    },
    provide(name, value) {
      provided.push({ name, value })
      return () => {}
    },
    inject(_deps, callback) {
      callback(ctx)
      return () => {}
    },
    subprocess: {
      async resolveExecutable() {
        return '/usr/local/bin/datatug'
      },
      spawn() {
        throw new Error('the smoke test never spawns a process')
      },
    },
    toolsRegistry: tools,
    skills: {
      registerProvider(factory) {
        providers.push(factory())
        return () => {}
      },
    },
  }
  ctx.tools = {
    register(definition) {
      tools.push(definition)
      return () => {}
    },
  }
  return ctx
}

test('parseJsonText reads a plain document', () => {
  assert.deepEqual(parseJsonText('[{"a":1}]'), [{ a: 1 }])
})

test('parseJsonText skips a leading CLI notice', () => {
  assert.deepEqual(parseJsonText('access: running without access policies\n[{"a":1}]'), [{ a: 1 }])
})

test('parseJsonText refuses non-JSON output', () => {
  assert.throws(() => parseJsonText('not json at all'), (error) => error instanceof CliFailure && error.code === 'bad-json')
})

test('the host half provides the datatug service, tool and skills', () => {
  const ctx = fakeCtx()
  host.apply(ctx, {})
  const service = ctx.provided.find((entry) => entry.name === 'datatug')?.value
  assert.ok(service, 'the datatug service is provided')
  for (const method of ['status', 'projects', 'show', 'queries', 'datasets', 'rows', 'query']) {
    assert.equal(typeof service[method], 'function', `${method} is a method`)
  }
  assert.equal(service.typertRemote.namespace, 'datatug')
  assert.equal(service.typertRemote.serviceKey, 'datatug')
  assert.equal(service.typertRemote.service, service)

  const marker = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(service), '@deepseek-ai/dsh-typert-protocol/remote-methods')
  assert.ok(marker, 'the Remote marker descriptor is written')
  assert.equal(marker.value.version, 1)
  assert.deepEqual(marker.value.methods.map((method) => method.method).sort(), ['datasets', 'projects', 'queries', 'query', 'rows', 'show', 'status'])

  assert.equal(ctx.toolsRegistry.length, 1)
  const tool = ctx.toolsRegistry[0]
  assert.equal(tool.name, 'datatug')
  assert.equal(tool.output.schema.type, 'string')
  assert.equal(typeof tool.execute, 'function')
  assert.ok(tool.parameters.properties.action.enum.includes('rows'))

  assert.equal(ctx.providers.length, 1)
  const provider = ctx.providers[0]
  assert.equal(provider.name, 'datatug')
  return provider.list().then((candidates) => {
    assert.ok(candidates.length >= 1, 'the repository skills are discovered')
    for (const candidate of candidates) {
      assert.match(candidate.name, /^[a-z0-9]+(-[a-z0-9]+)*$/)
      assert.ok(candidate.description.length > 0)
      assert.equal(candidate.rank, 600)
    }
    const definition = provider.get(candidates[0])
    return Promise.resolve(definition).then((skill) => {
      assert.match(skill.content, /DeepSeek Harness note/)
    })
  })
})

test('every Remote method takes one plain `request` parameter', () => {
  const ctx = fakeCtx()
  host.apply(ctx, { skills: false })
  const service = ctx.provided.find((entry) => entry.name === 'datatug').value
  const marker = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(service), '@deepseek-ai/dsh-typert-protocol/remote-methods')
  for (const { method } of marker.value.methods) {
    const source = Function.prototype.toString.call(Object.getPrototypeOf(service)[method])
    const open = source.indexOf('(')
    const close = source.indexOf(')', open + 1)
    // The Gateway's source-mode dispatch parses this text: defaults, rest or
    // destructured parameters, and zero-parameter methods, all fail there.
    assert.equal(source.slice(open + 1, close).trim(), 'request', `${method} keeps a single plain parameter`)
  }
})

test('a table read asks the CLI for a datatug reference, not a connection string', async () => {
  const ctx = fakeCtx()
  host.apply(ctx, { skills: false })
  const service = ctx.provided.find((entry) => entry.name === 'datatug').value
  /** @type {string[][]} */
  const calls = []
  service.runner = {
    async runJson(argv) {
      calls.push(argv)
      return [{ $key: '1', AlbumId: 1, Title: 'For Those About To Rock' }]
    },
  }
  const result = await service.rows({ project: 'shop', source: 'crm', table: 'Album', limit: 2, env: 'local' })
  assert.deepEqual(calls[0], [
    'query', 'run',
    '--db', 'datatug://shop/crm?env=local',
    '--from', 'Album',
    '--limit', '2',
    '--no-policies',
    '--format', 'json',
  ])
  assert.deepEqual(result.columns, ['AlbumId', 'Title'])
  assert.equal(result.count, 1)
})

test('a directory project uses the CLI current-project reference', async () => {
  const ctx = fakeCtx()
  host.apply(ctx, { skills: false })
  const service = ctx.provided.find((entry) => entry.name === 'datatug').value
  /** @type {{argv: string[], options: any}[]} */
  const calls = []
  service.runner = {
    async runJson(argv, options) {
      calls.push({ argv, options })
      return []
    },
  }
  await service.rows({ directory: process.cwd(), source: 'crm', table: 'Album' })
  assert.equal(calls[0].argv[3], 'datatug:///crm?env=local')
  assert.equal(calls[0].options.cwd, process.cwd())
})

test('the host half refuses a flag-shaped value as a value, not a throw', async () => {
  const ctx = fakeCtx()
  host.apply(ctx, { skills: false })
  const service = ctx.provided.find((entry) => entry.name === 'datatug').value
  const result = await service.rows({ project: '--help', source: 'crm', table: 'Album' })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'refused')
})

test('the host half can disable the skills provider', () => {
  const ctx = fakeCtx()
  host.apply(ctx, { skills: false })
  assert.equal(ctx.providers.length, 0)
})

test('the client half registers the DataTug page type and panel', async () => {
  /** @type {any} */
  let registration
  globalThis.window = {
    __ModuleLoader__: {
      load(spec) {
        registration = spec
      },
    },
  }
  await import('../lib/client.js')
  assert.ok(registration, 'the module registers itself with the loader')
  assert.equal(registration.id, '@datatug/dsh-plugin')

  const React = {
    createElement: () => null,
    useState: () => [undefined, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    Fragment: 'fragment',
  }
  const module = registration.factory((specifier) => {
    assert.equal(specifier, 'react')
    return React
  })
  assert.ok(module.inject.includes('connection'))

  /** @type {any[]} */
  const tabs = []
  /** @type {any[]} */
  const slots = []
  const ctx = {
    effect: (fn) => fn(),
    connection: { rpc: { call: async () => ({ ok: true, value: {} }) } },
    sidebarRightTabs: {
      register(definition) {
        tabs.push(definition)
        return () => {}
      },
    },
    slots: {
      inject(_name, callback) {
        return callback()
      },
      register(options, component) {
        slots.push({ options, component })
        return () => {}
      },
    },
  }
  module.apply(ctx)

  assert.equal(tabs.length, 1)
  assert.equal(tabs[0].kind, 'datatug')
  assert.equal(tabs[0].id, 'datatug')
  assert.equal(tabs[0].title(), 'DataTug')
  assert.equal(tabs[0].guide[0].title(), 'DataTug')

  assert.equal(slots.length, 1)
  assert.equal(slots[0].options.name, 'sidebar.right.pane.tab')
  assert.equal(slots[0].options.key, 'datatug')
  assert.equal(typeof slots[0].component, 'function')
})
