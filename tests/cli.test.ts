import { expect, test } from 'claude-code/testing'
import {
  EXIT_NOT_A_PROJECT,
  LISTINGS,
  MIN_CLI_VERSION,
  VERSION_ARGS,
  errorMessage,
  isOlder,
  missingCliText,
  notAProjectText,
  parseVersion,
  readListing,
  tooOldText,
} from '../lib/cli.js'

test('the mod runs exactly four read-only commands', async () => {
  expect(VERSION_ARGS).toEqual(['--version'])
  expect(LISTINGS).toEqual({
    show: ['show', '--format', 'json', '--depth', 'tables'],
    queries: ['queries', '--format', 'json'],
    boards: ['board', 'list', '--format', 'json'],
  })
  expect(EXIT_NOT_A_PROJECT).toBe(3)
})

test('parseVersion finds the version in what datatug --version prints', async () => {
  expect(parseVersion('0.51.0\n')).toEqual([0, 51, 0])
  expect(parseVersion('datatug version 1.2.3 (abc) 2026-10-09')).toEqual([1, 2, 3])
  expect(parseVersion('dev')).toBe(null)
  expect(parseVersion(undefined)).toBe(null)
  expect(parseVersion(MIN_CLI_VERSION)).toBeDefined()
})

test('isOlder compares major, then minor, then patch', async () => {
  expect(isOlder([0, 51, 0], [0, 67, 0])).toBe(true)
  expect(isOlder([0, 67, 0], [0, 67, 0])).toBe(false)
  expect(isOlder([0, 67, 1], [0, 67, 0])).toBe(false)
  expect(isOlder([1, 0, 0], [0, 99, 9])).toBe(false)
  expect(isOlder([0, 66, 9], [0, 67, 0])).toBe(true)
})

test('errorMessage drops the blank lines and the ERROR banner the CLI prints', async () => {
  expect(errorMessage('\n   ERROR  \n\n  board "b1" cannot be loaded.  \n\n', 1)).toBe('board "b1" cannot be loaded.')
  expect(errorMessage('', 7)).toBe('exit code 7')
  expect(errorMessage(undefined, 2)).toBe('exit code 2')
})

test('errorMessage joins a message the CLI wrapped over several lines, without styling', async () => {
  const wrapped = '\n   ERROR  \n\n  failed to load board[b1] from /work/p/boards/b1.board.json: invalid   \n  character looking for beginning of object key string.   \n\n'
  expect(errorMessage(wrapped, 1)).toBe(
    'failed to load board[b1] from /work/p/boards/b1.board.json: invalid character looking for beginning of object key string.',
  )
  expect(errorMessage('\u001b[31mplain failure\u001b[0m\nsecond line', 1)).toBe('plain failure second line')
})

test('errorMessage cuts a very long message short', async () => {
  const text = errorMessage('x'.repeat(500), 1)
  expect(text.length).toBe(300)
  expect(text.endsWith('…')).toBe(true)
})

test('readListing returns the parsed JSON of a command that succeeded', async () => {
  const read = readListing('queries', { exitCode: 0, stdout: '[{"id":"a"}]', stderr: '' })
  expect(read).toEqual({ data: [{ id: 'a' }], warning: null })
})

test('readListing turns a failed command into a warning naming the command', async () => {
  expect(readListing('boards', { exitCode: 1, stdout: '', stderr: 'ERROR\nboard "b1" cannot be loaded' })).toEqual({
    data: null,
    warning: 'datatug board list: board "b1" cannot be loaded',
  })
  expect(readListing('show', { exitCode: 1, stdout: '', stderr: '' }).warning).toBe('datatug show: exit code 1')
})

test('readListing warns when a command prints something that is not JSON', async () => {
  expect(readListing('queries', { exitCode: 0, stdout: 'not json', stderr: '' })).toEqual({
    data: null,
    warning: 'datatug queries: its output is not JSON',
  })
})

test('the one-line replies name the problem and the remedy', async () => {
  expect(missingCliText()).toContain('datatug:datatug-install')
  expect(missingCliText().includes('\n')).toBe(false)
  expect(tooOldText('0.51.0')).toContain('0.51.0')
  expect(tooOldText('0.51.0')).toContain(MIN_CLI_VERSION)
  expect(tooOldText('0.51.0')).toContain('datatug self-update')
  expect(tooOldText('0.51.0').includes('\n')).toBe(false)
  expect(notAProjectText('/work/x')).toContain('/work/x')
  expect(notAProjectText('/work/x')).toContain('not a DataTug project')
  expect(notAProjectText('/work/x').includes('\n')).toBe(false)
})
