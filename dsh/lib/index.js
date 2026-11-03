/**
 * DataTug for DeepSeek Harness — Host half.
 *
 * Three contributions, each owned by this plugin's Cordis effect:
 *  - a `datatug` Host service whose methods the Web panel calls through the
 *    Gateway (the panel reaches them over `/api/datatug/<method>`);
 *  - a `datatug` model tool that runs the CLI for the agent;
 *  - the DataTug agent skills, registered as a bundled skill provider.
 *
 * Everything executes against the locally installed `datatug` CLI; this plugin
 * stores no data of its own and holds no credentials.
 *
 * @module @datatug/dsh-plugin
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ansiFree, CliFailure, createRunner } from './cli.js'

/** Cordis plugin name. */
export const name = 'datatug'

/** The subprocess seam is the only hard requirement. */
export const inject = ['subprocess']

const SERVICE_KEY = 'datatug'
const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
/**
 * Descriptor key written by `@deepseek-ai/dsh-typert-protocol` for methods a
 * Service exposes to Remote callers. It is the package's published marker
 * format (version 1); the plugin writes it directly so the bundle needs no
 * build step and no import of a Harness package.
 */
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'

const SKILL_HOST_NOTE = `> **DeepSeek Harness note.** This skill was written for the DataTug
> Claude Code plugin. Here, call the \`datatug\` tool (or run the same \`datatug …\`
> command with the Bash tool). There is no result card: rows the person loads in
> the DataTug panel stay in the panel, and rows you ask for come back to you, so
> read them and answer from them. Ignore \`/datatug:…\` slash commands and the
> Claude Code panel instructions below.

`

/** @typedef {{command?: string, cwd?: string, timeoutMs?: number, maxRows?: number, skills?: boolean}} Config */

/**
 * Validate the row's config; unknown fields are ignored rather than rejected so
 * a later DSH version can add fields without breaking this plugin.
 * @param {unknown} raw - the profile row's `config`.
 * @returns {Config} the effective config.
 */
function readConfig(raw) {
  const input = raw !== null && typeof raw === 'object' ? raw : {}
  /** @type {Config} */
  const config = {}
  if (typeof input.command === 'string' && input.command.trim() !== '') config.command = input.command.trim()
  if (typeof input.cwd === 'string' && input.cwd.trim() !== '') config.cwd = input.cwd.trim()
  if (Number.isInteger(input.timeoutMs) && input.timeoutMs >= 1000 && input.timeoutMs <= 300000) {
    config.timeoutMs = input.timeoutMs
  }
  if (Number.isInteger(input.maxRows) && input.maxRows >= 1 && input.maxRows <= 2000) config.maxRows = input.maxRows
  if (typeof input.skills === 'boolean') config.skills = input.skills
  return config
}

/**
 * Read one bounded, single-line string argument.
 * @param {unknown} value - caller-supplied value.
 * @param {string} field - field name for the failure message.
 * @param {number} [max] - maximum length.
 * @returns {string} the trimmed value.
 * @throws {CliFailure} `refused` when the value is missing or malformed.
 */
function readString(value, field, max = 256) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CliFailure('refused', `"${field}" is required`)
  }
  const text = value.trim()
  if (text.length > max) throw new CliFailure('refused', `"${field}" is longer than ${max} characters`)
  // A value that starts with a dash would be read as a flag by the CLI.
  if (text.startsWith('-')) throw new CliFailure('refused', `"${field}" must not start with "-"`)
  return text
}

/**
 * Read an optional bounded string argument.
 * @param {unknown} value - caller-supplied value.
 * @param {string} field - field name for the failure message.
 * @param {number} [max] - maximum length.
 * @returns {string | undefined} the trimmed value.
 */
function readOptionalString(value, field, max = 256) {
  if (value === undefined || value === null || value === '') return undefined
  return readString(value, field, max)
}

/**
 * Read an optional integer argument inside a range.
 * @param {unknown} value - caller-supplied value.
 * @param {number} fallback - value used when absent.
 * @param {number} min - smallest accepted value.
 * @param {number} max - largest accepted value.
 * @returns {number} the effective value.
 */
function readInteger(value, fallback, min, max) {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new CliFailure('refused', `expected an integer between ${min} and ${max}, got ${JSON.stringify(value)}`)
  }
  return value
}

/**
 * Normalize a CLI row listing into the `{columns, rows}` shape the panel draws.
 * @param {unknown} value - parsed JSON.
 * @returns {{columns: string[], rows: Record<string, unknown>[]}} normalized rows.
 */
function toRows(value) {
  const list = Array.isArray(value) ? value : Array.isArray(value?.rows) ? value.rows : []
  const rows = list.filter((row) => row !== null && typeof row === 'object' && !Array.isArray(row))
  /** @type {string[]} */
  const columns = []
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key !== '$key' && !columns.includes(key)) columns.push(key)
    }
  }
  return { columns, rows: rows.map((row) => {
    /** @type {Record<string, unknown>} */
    const kept = {}
    for (const column of columns) kept[column] = row[column] === undefined ? null : row[column]
    return kept
  }) }
}

/**
 * Resolve the project a verb runs against: a registered project id, or a
 * project directory reached as `.` from that directory.
 * @param {{project?: unknown, directory?: unknown}} request - caller arguments.
 * @returns {{project: string, directory?: string, cwd?: string}} the target.
 * @throws {CliFailure} `refused` when neither is given.
 */
function projectTarget(request) {
  const directory = readOptionalString(request.directory, 'directory', 4096)
  if (directory !== undefined) {
    const stat = statOrNull(directory)
    if (stat === null || !stat.isDirectory()) throw new CliFailure('refused', `"directory" is not a directory: ${directory}`)
    return { project: '.', directory, cwd: directory }
  }
  return { project: readString(request.project, 'project') }
}

/**
 * `statSync` without throwing.
 * @param {string} path - filesystem path.
 * @returns {import('node:fs').Stats | null} the stats, or null.
 */
function statOrNull(path) {
  try {
    return statSync(path)
  } catch {
    return null
  }
}

/**
 * The Host service the Web panel calls. Every public method takes one
 * `request` object and answers one JSON-safe result.
 */
class DataTugService {
  /**
   * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
   * @param {ReturnType<typeof createRunner>} runner - CLI runner.
   * @param {Config} config - effective config.
   */
  constructor(ctx, runner, config) {
    this.ctx = ctx
    this.runner = runner
    this.config = config
  }

  /** @returns {Promise<{available: boolean, version: string | null, command: string, error?: object}>} CLI facts. */
  async status(request) {
    void request
    try {
      const version = await this.runner.version()
      return { available: version !== null, version, command: this.config.command ?? 'datatug' }
    } catch (error) {
      return { available: false, version: null, command: this.config.command ?? 'datatug', error: describe(error) }
    }
  }

  /** @returns {Promise<{projects: {id: string, title: string, origin: string}[]}>} registered projects. */
  async projects(request) {
    void request
    const value = await this.runner.runJson(['projects', '--format', 'json'])
    const list = Array.isArray(value) ? value : []
    return {
      projects: list
        .filter((item) => item !== null && typeof item === 'object' && typeof item.id === 'string')
        .map((item) => ({ id: item.id, title: typeof item.title === 'string' ? item.title : '', origin: typeof item.origin === 'string' ? item.origin : '' })),
    }
  }

  /**
   * The project listing: environments, sources, schemas, tables and columns.
   * @param {{project?: unknown, directory?: unknown, depth?: unknown}} request
   * @returns {Promise<{project: string, depth: string, listing: unknown}>}
   */
  async show(request) {
    request = request ?? {}
    const project = readOptionalString(request.project, 'project')
    const directory = readOptionalString(request.directory, 'directory', 4096)
    if (project === undefined && directory === undefined) throw new CliFailure('refused', '"project" or "directory" is required')
    const depth = request.depth === 'sources' || request.depth === 'tables' ? request.depth : 'columns'
    const target = directory !== undefined ? ['--directory', directory] : ['--project', project]
    const listing = await this.runner.runJson(['show', ...target, '--format', 'json', '--depth', depth])
    return { project: project ?? directory ?? '', depth, listing }
  }

  /**
   * Saved queries of one project.
   * @param {{project?: unknown}} request
   * @returns {Promise<{queries: unknown[]}>}
   */
  async queries(request) {
    request = request ?? {}
    const target = projectTarget(request)
    const value = await this.runner.runJson(['queries', '--project', target.project, '--format', 'json'], { cwd: target.cwd })
    return { queries: Array.isArray(value) ? value : [] }
  }

  /**
   * Datasets of one project.
   * @param {{project?: unknown}} request
   * @returns {Promise<{datasets: unknown[]}>}
   */
  async datasets(request) {
    request = request ?? {}
    const target = projectTarget(request)
    const value = await this.runner.runJson(['datasets', '--project', target.project, '--format', 'json'], { cwd: target.cwd })
    return { datasets: Array.isArray(value) ? value : [] }
  }

  /**
   * First rows of one table, read through the CLI so access policies and the
   * `datatug://` reference resolution stay the CLI's job.
   * @param {{project?: unknown, env?: unknown, source?: unknown, table?: unknown, limit?: unknown}} request
   * @returns {Promise<{columns: string[], rows: Record<string, unknown>[], count: number, source: string, table: string, env: string}>}
   */
  async rows(request) {
    request = request ?? {}
    const target = projectTarget(request)
    const source = readString(request.source, 'source', 128)
    const table = readString(request.table, 'table', 256)
    const env = readOptionalString(request.env, 'env', 64) ?? 'local'
    const limit = readInteger(request.limit, 50, 1, this.config.maxRows ?? 200)
    const reference = target.directory === undefined
      ? `datatug://${target.project}/${source}?env=${env}`
      : `datatug:///${source}?env=${env}`
    const value = await this.runner.runJson([
      'query', 'run',
      '--db', reference,
      '--from', table,
      '--limit', String(limit),
      '--no-policies',
      '--format', 'json',
    ], { cwd: target.cwd })
    const { columns, rows } = toRows(value)
    return { columns, rows, count: rows.length, source, table, env }
  }

  /**
   * Run one saved query.
   * @param {{project?: unknown, query?: unknown, env?: unknown, vars?: unknown}} request
   * @returns {Promise<{columns: string[], rows: Record<string, unknown>[], count: number}>}
   */
  async query(request) {
    request = request ?? {}
    const target = projectTarget(request)
    const query = readString(request.query, 'query', 256)
    const env = readOptionalString(request.env, 'env', 64)
    const argv = ['query', 'run', '--project', target.project, '--query', query, '--format', 'json']
    if (env !== undefined) argv.push('--env', env)
    if (request.vars !== undefined && request.vars !== null) {
      if (typeof request.vars !== 'object' || Array.isArray(request.vars)) {
        throw new CliFailure('refused', '"vars" must be an object of parameter name to value')
      }
      for (const [key, value] of Object.entries(request.vars)) {
        if (typeof key !== 'string' || key === '' || key.startsWith('-')) throw new CliFailure('refused', 'invalid parameter name')
        argv.push('--var', `${key}=${typeof value === 'string' ? value : String(value)}`)
      }
    }
    const { columns, rows } = toRows(await this.runner.runJson(argv, { cwd: target.cwd }))
    return { columns, rows, count: rows.length }
  }
}

/**
 * Mark public methods for the Gateway's source-mode discovery.
 * @param {object} prototype - the Service prototype.
 * @param {string[]} methods - method names to export.
 */
function markRemoteMethods(prototype, methods) {
  const marker = Object.freeze({
    version: 1,
    methods: Object.freeze(methods.map((method) => Object.freeze({
      method,
      invocation: Object.freeze({ kind: 'direct' }),
    }))),
  })
  Object.defineProperty(prototype, REMOTE_METHOD_DESCRIPTOR, { configurable: true, value: marker })
}

/**
 * Turn any thrown value into the plugin's JSON-safe failure shape.
 * @param {unknown} error - thrown value.
 * @returns {{code: string, message: string, detail: Record<string, unknown>}} failure facts.
 */
function describe(error) {
  if (error instanceof CliFailure) return { code: error.code, message: error.message, detail: error.detail }
  return {
    code: 'error',
    message: ansiFree(error instanceof Error ? error.message : String(error)) || 'unexpected failure',
    detail: {},
  }
}

/**
 * Build the `datatug` tool: the agent's read path into the same CLI, plus the
 * two project-maintenance verbs the skills document.
 * @param {DataTugService} service - the Host service.
 * @param {ReturnType<typeof createRunner>} runner - CLI runner.
 * @param {Config} config - effective config.
 * @returns {object} a ToolDefinition.
 */
function createTool(service, runner, config) {
  const text = (value) => [{ type: 'text', text: value }]
  const json = (value) => JSON.stringify(value, null, 2)
  const maxRows = config.maxRows ?? 200
  return {
    name: 'datatug',
    description:
      'Explore DataTug projects with the locally installed datatug CLI: list registered projects, read a project\'s environments, sources, schemas, tables and columns, list saved queries and datasets, run one table read or one saved query, and scan or validate a project. '
      + 'Use it instead of Bash for DataTug work. Read-only except `scan` and `validate`. Table rows are returned as JSON.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['projects', 'show', 'queries', 'datasets', 'rows', 'query', 'scan', 'validate'],
          description: 'What to do. `show` lists a project; `rows` reads a table; `query` runs a saved query.',
        },
        project: { type: 'string', description: 'Registered DataTug project id (from `projects`).' },
        directory: { type: 'string', description: 'Absolute path of a DataTug project directory, instead of a registered `project`.' },
        env: { type: 'string', description: 'Environment id, for example `local` (default) or `dev`.' },
        source: { type: 'string', description: 'Database source id inside the project, for `rows`.' },
        table: { type: 'string', description: 'Table or view name, for `rows`.' },
        limit: { type: 'integer', description: `Maximum rows for \`rows\` (1-${maxRows}, default 50).` },
        depth: { type: 'string', enum: ['sources', 'tables', 'columns'], description: 'How deep `show` lists (default `columns`).' },
        query: { type: 'string', description: 'Saved query id, for `query`.' },
        vars: { type: 'object', description: 'Saved-query parameter values, keyed by parameter id.' },
        driver: { type: 'string', description: 'Database driver for `scan`: sqlite3, postgres, mysql, oracle, sqlserver, couchdb, postgrest or libsql.' },
        path: { type: 'string', description: 'SQLite database file path, for `scan` with driver sqlite3.' },
        db: { type: 'string', description: 'Database id to record, for `scan`.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => text(typeof value === 'string' ? value : json(value)),
    },
    /** @param {Record<string, unknown>} args - validated arguments. */
    async execute(args) {
      const action = args.action
      const fail = (error) => {
        const facts = describe(error)
        return `${facts.code}: ${facts.message}`
      }
      try {
        switch (action) {
          case 'projects':
            return json(await service.projects())
          case 'show': {
            const listing = await service.show({ project: args.project, directory: args.directory, depth: args.depth })
            return json({ project: listing.project, depth: listing.depth, listing: listing.listing })
          }
          case 'queries':
            return json(await service.queries({ project: args.project, directory: args.directory }))
          case 'datasets':
            return json(await service.datasets({ project: args.project, directory: args.directory }))
          case 'rows': {
            const rows = await service.rows({ project: args.project, directory: args.directory, env: args.env, source: args.source, table: args.table, limit: args.limit })
            return `${rows.count} rows from ${rows.source}.${rows.table} (env ${rows.env})\n${json({ columns: rows.columns, rows: rows.rows })}`
          }
          case 'query': {
            const result = await service.query({ project: args.project, directory: args.directory, query: args.query, env: args.env, vars: args.vars })
            return `${result.count} rows\n${json({ columns: result.columns, rows: result.rows })}`
          }
          case 'validate': {
            const project = readString(args.project, 'project')
            const result = await runner.run(['validate', '--project', project])
            return `exit ${result.exitCode}\n${ansiFree(result.stdout)}\n${ansiFree(result.stderr)}`.trim()
          }
          case 'scan': {
            const directory = readString(args.directory, 'directory', 4096)
            const driver = readOptionalString(args.driver, 'driver', 32) ?? 'sqlite3'
            const db = readString(args.db, 'db', 128)
            const env = readOptionalString(args.env, 'env', 64) ?? 'local'
            const argv = ['scan', '--directory', directory, '--driver', driver, '--db', db, '--env', env]
            const path = readOptionalString(args.path, 'path', 4096)
            if (path !== undefined) argv.push('--path', path)
            const result = await runner.run(argv, { timeoutMs: 120000 })
            return `exit ${result.exitCode}\n${ansiFree(result.stdout)}\n${ansiFree(result.stderr)}`.trim()
          }
          default:
            return fail(new CliFailure('refused', `unknown action ${JSON.stringify(action)}`))
        }
      } catch (error) {
        return fail(error)
      }
    },
  }
}

/**
 * Discover the skills shipped in this repository next to the package.
 * @returns {{name: string, description: string, dir: string, file: string, content: string}[]} skills.
 */
function readSkills() {
  /** @type {{name: string, description: string, dir: string, file: string, content: string}[]} */
  const skills = []
  for (const root of [join(PACKAGE_ROOT, 'skills'), join(PACKAGE_ROOT, '..', 'skills')]) {
    let entries
    try {
      if (!statSync(root).isDirectory()) continue
      entries = readdirSync(root)
    } catch {
      continue
    }
    if (entries.length === 0) continue
    for (const entry of entries.sort()) {
      const file = join(root, entry, 'SKILL.md')
      let raw
      try {
        raw = readFileSync(file, 'utf8')
      } catch {
        continue
      }
      const parsed = parseSkill(raw)
      if (parsed === undefined) continue
      skills.push({
        name: parsed.name ?? entry,
        description: parsed.description,
        dir: join(root, entry),
        file,
        content: `${SKILL_HOST_NOTE}${parsed.body}`,
      })
    }
    if (skills.length > 0) break
  }
  return skills
}

/**
 * Parse the YAML frontmatter of one SKILL.md. Only `name` and `description`
 * are read; every other key stays in the body's metadata domain.
 * @param {string} raw - file text.
 * @returns {{name?: string, description: string, body: string} | undefined} parsed skill.
 */
function parseSkill(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  if (match === null) return undefined
  /** @type {Record<string, string>} */
  const fields = {}
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (field === null) continue
    fields[field[1]] = field[2].trim().replace(/^['"]|['"]$/g, '')
  }
  if (fields.description === undefined || fields.description === '') return undefined
  return { name: fields.name, description: fields.description, body: match[2] }
}

/**
 * Register the DataTug skills as one bundled provider.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context carrying `skills`.
 * @param {Config} config - effective config.
 */
function registerSkills(ctx, config) {
  if (config.skills === false) return
  const skills = readSkills()
  if (skills.length === 0) return
  const providerName = 'datatug'
  const candidates = skills.map((skill) => ({
    name: skill.name,
    description: skill.description.slice(0, 1024),
    invocation: { modelInvocable: true, userInvocable: true },
    provider: providerName,
    source: 'bundled',
    resourceBase: { kind: 'directory', path: skill.dir },
    rank: 600,
    locator: skill.file,
  }))
  const byName = new Map(skills.map((skill) => [skill.name, skill]))
  const provider = {
    name: providerName,
    list: () => Promise.resolve(candidates),
    /** @param {{name: string}} candidate - one listed candidate. */
    get(candidate) {
      const skill = byName.get(candidate.name)
      if (skill === undefined) throw new Error(`DataTug skill ${JSON.stringify(candidate.name)} is no longer shipped`)
      return Promise.resolve({
        name: skill.name,
        description: skill.description.slice(0, 1024),
        invocation: { modelInvocable: true, userInvocable: true },
        provider: providerName,
        source: 'bundled',
        resourceBase: { kind: 'directory', path: skill.dir },
        content: skill.content,
      })
    },
  }
  ctx.inject(['skills'], (scoped) => {
    scoped.effect(() => scoped.skills.registerProvider(() => provider), 'datatug: skills')
  })
}

/**
 * Cordis plugin body.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {unknown} rawConfig - the profile row's `config`.
 */
export function apply(ctx, rawConfig) {
  const config = readConfig(rawConfig)
  const runner = createRunner({ ctx, config })
  const service = new DataTugService(ctx, runner, config)
  // A thrown failure would reach the panel as a Gateway fault; settle every
  // public method into a JSON value instead, so the panel renders the reason.
  for (const method of ['status', 'projects', 'show', 'queries', 'datasets', 'rows', 'query']) {
    const call = service[method].bind(service)
    service[method] = async (request) => {
      try {
        return await call(request)
      } catch (error) {
        return { ok: false, error: describe(error) }
      }
    }
  }
  markRemoteMethods(DataTugService.prototype, ['status', 'projects', 'show', 'queries', 'datasets', 'rows', 'query'])
  Object.defineProperty(service, 'typertRemote', {
    configurable: true,
    value: Object.freeze({ service, serviceKey: SERVICE_KEY, namespace: SERVICE_KEY }),
  })
  ctx.effect(() => ctx.provide(SERVICE_KEY, service), 'datatug: service')
  ctx.inject(['tools'], (scoped) => {
    scoped.effect(() => scoped.tools.register(createTool(service, runner, config)), 'datatug: tool')
  })
  registerSkills(ctx, config)
}
