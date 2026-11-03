/**
 * Runs the installed `datatug` CLI through the Harness subprocess service.
 *
 * No shell is involved: every call is an argv array, so a project id, a table
 * name or a saved-query id can never turn into shell syntax. Output is
 * bounded, and a call that outlives its budget is terminated.
 *
 * @module dsh/lib/cli
 */

/** Failure facts the panel and the tool both understand. */
export class CliFailure extends Error {
  /**
   * @param {string} code - stable machine code (`missing-cli`, `timeout`, `exit`, `bad-json`, `refused`).
   * @param {string} message - human-readable, already scrubbed of absolute paths.
   * @param {Record<string, unknown>} [detail] - extra JSON-safe facts.
   */
  constructor(code, message, detail = {}) {
    super(message)
    this.name = 'CliFailure'
    this.code = code
    this.detail = detail
  }
  /** @returns {{ok: false, error: {code: string, message: string, detail: Record<string, unknown>}}} */
  toResult() {
    return { ok: false, error: { code: this.code, message: this.message, detail: this.detail } }
  }
}

const STDOUT_MAX_BYTES = 8 * 1024 * 1024
const STDERR_MAX_BYTES = 64 * 1024
const GRACE_MS = 3000

/**
 * Parse the JSON document a CLI verb printed, tolerating a leading notice line
 * or trailing whitespace that `--format json` consumers sometimes emit.
 * @param {string} text - stdout of the run.
 * @returns {unknown} the parsed document.
 * @throws {CliFailure} `bad-json` when no JSON value can be recovered.
 */
export function parseJsonText(text) {
  const trimmed = text.trim()
  if (trimmed === '') throw new CliFailure('bad-json', 'datatug printed no JSON output')
  try {
    return JSON.parse(trimmed)
  } catch {
    // Fall through to locating the first JSON value in the text.
  }
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index]
    if (char !== '[' && char !== '{') continue
    const end = matchingClose(trimmed, index)
    if (end < 0) continue
    try {
      return JSON.parse(trimmed.slice(index, end + 1))
    } catch {
      // Keep scanning.
    }
  }
  throw new CliFailure('bad-json', `datatug printed output that is not JSON: ${firstLine(trimmed)}`)
}

/**
 * Find the index of the bracket that closes the one at `start`, honoring JSON
 * strings and escapes. Returns -1 when the input is unbalanced.
 * @param {string} text - source text.
 * @param {number} start - index of `[` or `{`.
 * @returns {number} index of the matching close, or -1.
 */
function matchingClose(text, start) {
  const open = text[start]
  const close = open === '[' ? ']' : '}'
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === open) depth += 1
    else if (char === close) {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

/** @param {string} text @returns {string} the first non-empty line, cut to 200 characters. */
function firstLine(text) {
  const line = text.split('\n').map((part) => part.trim()).find((part) => part !== '') ?? ''
  return line.length > 200 ? `${line.slice(0, 200)}…` : line
}

/**
 * Create the runner bound to one Harness context and plugin config.
 * @param {object} deps
 * @param {import('@deepseek-ai/cordis').Context} deps.ctx - plugin context carrying `subprocess`.
 * @param {{command?: string, cwd?: string, timeoutMs?: number}} deps.config - resolved config.
 * @returns {{run: (argv: string[], options?: object) => Promise<RunResult>, version: (signal?: AbortSignal) => Promise<string|null>}}
 * @typedef {{stdout: string, stderr: string, exitCode: number|null, truncated: boolean}} RunResult
 */
export function createRunner({ ctx, config }) {
  /** @type {string | undefined} */
  let executable
  /** @type {{value: string|null, at: number} | undefined} */
  let cachedVersion
  let versionPromise

  /**
   * Resolve the CLI once; a missing binary is reported as `missing-cli`.
   * @returns {Promise<string>} absolute executable path.
   */
  async function resolveExecutable() {
    if (executable !== undefined) return executable
    const command = config.command ?? 'datatug'
    try {
      executable = await ctx.subprocess.resolveExecutable(command)
      return executable
    } catch {
      throw new CliFailure(
        'missing-cli',
        `The datatug CLI (${command}) was not found. Install it from https://datatug.io/en/docs/install/ and make sure it is on the PATH of the process that runs DeepSeek Harness.`,
      )
    }
  }

  /**
   * Run one datatug command.
   * @param {string[]} argv - arguments after the executable.
   * @param {{cwd?: string, stdin?: string, timeoutMs?: number, signal?: AbortSignal}} [options]
   * @returns {Promise<RunResult>}
   */
  async function run(argv, options = {}) {
    const exe = await resolveExecutable()
    const timeoutMs = options.timeoutMs ?? config.timeoutMs ?? 20000
    const timeout = new AbortController()
    const timer = setTimeout(() => {
      timeout.abort(new CliFailure('timeout', `datatug ${argv[0] ?? ''} did not finish within ${timeoutMs} ms`))
    }, timeoutMs)
    const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal
    try {
      const handle = ctx.subprocess.spawn({
        argv: [exe, ...argv],
        cwd: options.cwd ?? config.cwd ?? process.cwd(),
        graceMs: GRACE_MS,
        signal,
        env: {
          // The CLI keeps its local agent running for links when a client id
          // names the host it is embedded in.
          DATATUG_CLIENT: 'dsh-plugin',
          // The workspace may be a Git repository, which the CLI refuses to use
          // as its result store; the private store is never read by this plugin.
          DO_NOT_TRACK: process.env.DO_NOT_TRACK,
        },
        stdio: {
          stdin: options.stdin === undefined ? 'ignore' : { data: options.stdin },
          stdout: { maxBytes: STDOUT_MAX_BYTES, spill: { maxBytes: 32 * 1024 * 1024 } },
          stderr: { maxBytes: STDERR_MAX_BYTES },
        },
      })
      const outcome = await handle.done
      const stdout = handle.collected.stdout?.readFrom(0)
      const stderr = handle.collected.stderr?.readFrom(0)
      if (signal.aborted) {
        throw new CliFailure('timeout', `datatug ${argv[0] ?? ''} did not finish within ${timeoutMs} ms`)
      }
      return {
        stdout: stdout?.text ?? '',
        stderr: stderr?.text ?? '',
        exitCode: outcome.exitCode,
        truncated: stdout?.truncated ?? false,
      }
    } catch (error) {
      if (error instanceof CliFailure) throw error
      if (signal.aborted) {
        throw new CliFailure('timeout', `datatug ${argv[0] ?? ''} did not finish within ${timeoutMs} ms`)
      }
      throw new CliFailure('exit', `datatug could not start: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Run a command that must succeed and print one JSON document.
   * @param {string[]} argv - arguments after the executable.
   * @param {{cwd?: string, timeoutMs?: number, signal?: AbortSignal}} [options]
   * @returns {Promise<unknown>}
   */
  async function runJson(argv, options = {}) {
    const result = await run(argv, options)
    if (result.exitCode !== 0 && result.exitCode !== null) {
      const reason = ansiFree(result.stderr) || ansiFree(result.stdout) || `exit code ${result.exitCode}`
      throw new CliFailure('exit', reason, { command: argv[0] ?? 'datatug', exitCode: result.exitCode })
    }
    return parseJsonText(result.stdout)
  }

  /**
   * Read the CLI version, cached for a minute; `null` when it cannot be read.
   * @param {AbortSignal} [signal]
   * @returns {Promise<string|null>}
   */
  async function version(signal) {
    const now = Date.now()
    if (cachedVersion !== undefined && now - cachedVersion.at < 60000) return cachedVersion.value
    if (versionPromise !== undefined) return versionPromise
    versionPromise = (async () => {
      try {
        const result = await run(['--version'], { timeoutMs: 10000, signal })
        const match = /(\d+)\.(\d+)\.(\d+)/.exec(result.stdout) ?? /(\d+)\.(\d+)\.(\d+)/.exec(result.stderr)
        cachedVersion = { value: match === null ? null : `${match[1]}.${match[2]}.${match[3]}`, at: Date.now() }
        return cachedVersion.value
      } catch {
        cachedVersion = { value: null, at: Date.now() }
        return null
      } finally {
        versionPromise = undefined
      }
    })()
    return versionPromise
  }

  return { run, runJson, version }
}

/**
 * Strip ANSI escape sequences from CLI diagnostics before they reach a panel
 * or a tool result.
 * @param {string} text - raw text.
 * @returns {string} cleaned and trimmed text.
 */
export function ansiFree(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001B\[[0-9;]*[A-Za-z]/g, '').trim()
}
