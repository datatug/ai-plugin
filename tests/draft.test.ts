import { expect, test } from 'claude-code/testing'
import { appendPrefix, queryDraft } from '../lib/draft.js'

const q = (over: Record<string, unknown> = {}) => ({
  id: 'invoice-lines',
  path: 'invoices/invoice-lines',
  title: 'Invoice lines',
  type: 'SQL',
  parameters: [],
  ...over,
})
const param = (id: string, required = false) => ({ id, type: null, required })

test('the draft names the path and the title', async () => {
  expect(queryDraft(q())).toBe('Run the saved DataTug query invoices/invoice-lines ("Invoice lines")')
})

test('the draft leaves out the title part when there is no title', async () => {
  expect(queryDraft(q({ title: null }))).toBe('Run the saved DataTug query invoices/invoice-lines')
})

test('required parameters follow as "with P=" joined by commas', async () => {
  const draft = queryDraft(q({ parameters: [param('InvoiceId', true), param('From', true)] }))
  expect(draft).toBe('Run the saved DataTug query invoices/invoice-lines ("Invoice lines") with InvoiceId=, From=')
})

test('optional parameters follow in "(optional: ...)"', async () => {
  const draft = queryDraft(q({ parameters: [param('A'), param('B')] }))
  expect(draft).toBe('Run the saved DataTug query invoices/invoice-lines ("Invoice lines") (optional: A, B)')
})

test('required and optional parameters together', async () => {
  const draft = queryDraft(q({ parameters: [param('A'), param('InvoiceId', true), param('B')] }))
  expect(draft).toBe(
    'Run the saved DataTug query invoices/invoice-lines ("Invoice lines") with InvoiceId= (optional: A, B)',
  )
})

test('appendPrefix is a space after text that does not end in whitespace', async () => {
  expect(appendPrefix('hello')).toBe(' ')
})

test('appendPrefix is empty for an empty box and for text ending in whitespace', async () => {
  expect(appendPrefix('')).toBe('')
  expect(appendPrefix('hello ')).toBe('')
  expect(appendPrefix('hello\n')).toBe('')
})
