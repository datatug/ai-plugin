// What the mod asks of the datatug CLI, and how it reads the answers. Pure:
// starting a process is the hooks module's job.
import { cleanText } from './text.js'

// The first datatug release with `board list`, `queries --format json` and
// `show --depth` (datatug-cli spec/features/cli/board, queries, show).
export const MIN_CLI_VERSION = '0.67.0'

// Argument lists, without the leading `datatug`. All four are read-only.
export const VERSION_ARGS = ['--version']
export const LISTINGS = {
  show: ['show', '--format', 'json', '--depth', 'tables'],
  queries: ['queries', '--format', 'json'],
  boards: ['board', 'list', '--format', 'json'],
}

// The CLI's exit code for a folder that is not a project.
export const EXIT_NOT_A_PROJECT = 3

const COMMAND_NAMES = {
  show: 'datatug show',
  queries: 'datatug queries',
  boards: 'datatug board list',
}

const ANSI_STYLE = /\u001b\[[0-9;]*m/g

export function parseVersion(text) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(text ?? '')
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

export function isOlder(version, minimum) {
  for (let i = 0; i < 3; i += 1) {
    if (version[i] !== minimum[i]) return version[i] < minimum[i]
  }
  return false
}

const MAX_ERROR_LENGTH = 300

// The CLI prints a failure as a banner line "ERROR" between blank lines, then
// the message, wrapped over several lines when it is long. A warning row
// carries the message as one line.
export function errorMessage(stderr, exitCode) {
  const text = cleanText(
    String(stderr ?? '')
      .replace(ANSI_STYLE, '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && line !== 'ERROR')
      .join(' '),
    MAX_ERROR_LENGTH,
  )
  return text === '' ? 'exit code ' + exitCode : text
}

// Turns one finished listing command into its parsed JSON, or a warning.
export function readListing(name, result) {
  if (result.exitCode !== 0) {
    return { data: null, warning: COMMAND_NAMES[name] + ': ' + errorMessage(result.stderr, result.exitCode) }
  }
  if (result.isStdoutTruncated === true) {
    return { data: null, warning: COMMAND_NAMES[name] + ': its output is too large to read' }
  }
  try {
    return { data: JSON.parse(result.stdout), warning: null }
  } catch {
    return { data: null, warning: COMMAND_NAMES[name] + ': its output is not JSON' }
  }
}

export function missingCliText() {
  return 'The datatug CLI could not be started, or did not answer in 15 seconds. If it is not installed, use the datatug:datatug-install skill, then run /datatug again.'
}

export function tooOldText(found) {
  return 'datatug ' + found + ' is too old for this pane: it needs ' + MIN_CLI_VERSION + ' or later. Run `datatug self-update`, then /datatug again.'
}

export function notAProjectText(cwd) {
  return cwd + ' is not a DataTug project: run /datatug from a project\'s root folder.'
}
