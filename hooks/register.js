import {
  EXIT_NOT_A_PROJECT,
  LISTINGS,
  MIN_CLI_VERSION,
  VERSION_ARGS,
  isOlder,
  missingCliText,
  notAProjectText,
  parseVersion,
  tooOldText,
} from '../lib/cli.js'
import { summaryText } from '../lib/lines.js'
import { buildProject } from '../lib/project.js'
import { buildPane, canDrawPane } from '../lib/view.js'

const PANE = 'datatug-project'
const TIMEOUT_MS = 15000

// What the pane shows: the loaded project and the open tab.
let project = null
let tab = 'overview'

// Runs one read-only datatug command, with no shell. A command that cannot be
// started, or runs past the timeout, resolves with isStarted false.
async function runDatatug($, args, cwd) {
  try {
    const result = await $.process.run(['datatug', ...args], { cwd, timeoutMs: TIMEOUT_MS })
    return {
      isStarted: true,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      isStdoutTruncated: result.isStdoutTruncated === true,
    }
  } catch (err) {
    return { isStarted: false, exitCode: -1, stdout: '', stderr: err instanceof Error ? err.message : String(err) }
  }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'datatug',
      description: 'Show the DataTug project in this directory',
    })
    return next(e)
  })

  on('command.run', { command: 'datatug' }, async ($) => {
    const cwd = await $.session.cwd()

    const version = await runDatatug($, VERSION_ARGS, cwd)
    if (!version.isStarted) return { text: missingCliText() }
    // A version that cannot be read is a development build: let it through.
    const found = parseVersion(version.stdout)
    if (found !== null && isOlder(found, parseVersion(MIN_CLI_VERSION))) {
      return { text: tooOldText(found.join('.')) }
    }

    const [show, queries, boards] = await Promise.all([
      runDatatug($, LISTINGS.show, cwd),
      runDatatug($, LISTINGS.queries, cwd),
      runDatatug($, LISTINGS.boards, cwd),
    ])
    if (show.exitCode === EXIT_NOT_A_PROJECT) return { text: notAProjectText(cwd) }

    project = buildProject({ show, queries, boards })
    tab = 'overview'
    // An open pane is redrawn only when asked: re-opening its id just retitles it.
    $.ui.invalidate('ui.render')

    // Where no surface shows panes (a `-p` run names none), reply with a
    // plain-text summary: `$.ui.open` would report a pane placed that nothing draws.
    const surfaces = await $.session.surfaces()
    if (!canDrawPane(surfaces)) return { text: summaryText(project) }

    try {
      const opened = await $.ui.open({ id: PANE, title: 'DataTug', focus: true, closeOnEscape: true })
      if (opened.isPlaced) return {}
    } catch {
      // fall through to the text summary
    }
    return { text: summaryText(project) }
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const elements = $.ui.resolve(e)
    if (project === null) {
      return elements.Text({ dimColor: true, children: ['Run /datatug to load the project.'] })
    }
    return buildPane(elements, project, tab, (id) => {
      tab = id
      $.ui.invalidate('ui.render')
    })
  })
}
