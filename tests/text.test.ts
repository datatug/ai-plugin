import { expect, test } from 'claude-code/testing'
import { cleanText } from '../lib/text.js'

test('every C0 control, including tab, newline and carriage return, becomes a space', async () => {
  for (let code = 0; code <= 0x1f; code += 1) {
    expect(cleanText('a' + String.fromCharCode(code) + 'b')).toBe('a b')
  }
})

test('DEL and every C1 control become a space', async () => {
  expect(cleanText('a\u007fb')).toBe('a b')
  for (let code = 0x80; code <= 0x9f; code += 1) {
    expect(cleanText('a' + String.fromCharCode(code) + 'b')).toBe('a b')
  }
})

test('bidirectional controls and line or paragraph separators become a space', async () => {
  const marks = ['‎', '‏', '‪', '‫', '‬', '‭', '‮', '⁦', '⁧', '⁨', '⁩', ' ', ' ']
  for (const mark of marks) expect(cleanText('a' + mark + 'b')).toBe('a b')
})

test('an escape sequence cannot survive as a control', async () => {
  expect(cleanText('x\u001b[2Jy\u0007z')).toBe('x [2Jy z')
})

test('runs of whitespace fold to one space and the result is trimmed', async () => {
  expect(cleanText('  a \t\n  b   ')).toBe('a b')
  expect(cleanText('\n\n')).toBe('')
})

test('a value longer than the cap is cut to the cap with an ellipsis', async () => {
  const text = cleanText('x'.repeat(500))
  expect(text.length).toBe(200)
  expect(text.endsWith('…')).toBe(true)
  expect(cleanText('x'.repeat(200))).toBe('x'.repeat(200))
  expect(cleanText('abcdefghij', 5)).toBe('abcd…')
})

test('anything that is not a string gives an empty string', async () => {
  for (const value of [undefined, null, 7, {}, ['a']]) expect(cleanText(value)).toBe('')
})

test('ordinary text, non-ASCII letters and the dash and dot characters are unchanged', async () => {
  expect(cleanText('Café 日本 — a · b')).toBe('Café 日本 — a · b')
})
