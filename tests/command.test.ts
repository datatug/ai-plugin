import { expect, test } from 'claude-code/testing'
import { PROJECT_ARG, isProjectView } from '../lib/command.js'

test('only the argument project asks for the project pane', () => {
  expect(PROJECT_ARG).toBe('project')
  expect(isProjectView('project')).toBe(true)
  expect(isProjectView(' Project ')).toBe(true)
})

test('plain /datatug and anything else is the panel', () => {
  expect(isProjectView('')).toBe(false)
  expect(isProjectView('projects')).toBe(false)
  expect(isProjectView('project x')).toBe(false)
  expect(isProjectView(undefined)).toBe(false)
  expect(isProjectView(null)).toBe(false)
})
