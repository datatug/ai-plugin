import { expect, test } from 'claude-code/testing'
import { canDrawPane } from '../lib/view.js'

test('canDrawPane is true for the terminal', () => {
  expect(canDrawPane(['terminal'])).toBe(true)
})

test('canDrawPane is true for the Desktop app', () => {
  expect(canDrawPane(['desktop'])).toBe(true)
})

test('canDrawPane is true for the terminal plus mobile', () => {
  expect(canDrawPane(['terminal', 'mobile'])).toBe(true)
})

test('canDrawPane is false for no surface', () => {
  expect(canDrawPane([])).toBe(false)
})

test('canDrawPane is false for only vscode', () => {
  expect(canDrawPane(['vscode'])).toBe(false)
})

test('canDrawPane is false for only mobile', () => {
  expect(canDrawPane(['mobile'])).toBe(false)
})

test('canDrawPane is false for anything that is not an array', () => {
  expect(canDrawPane(undefined)).toBe(false)
})
