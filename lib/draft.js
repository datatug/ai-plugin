// The request Ask Claude drafts for a query. Pure. It carries the query's ID
// and parameter names only, and only when they are plain names: free text from
// the project (a title, an odd parameter id) never reaches the prompt box.

export const MAX_DRAFT = 500
const MAX_NAMES = 10
const MAX_SEGMENTS = 16
const MAX_PATH = 200

const PLAIN_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/

export const isPlainName = (name) => typeof name === 'string' && PLAIN_NAME.test(name)

// A query path is plain when every "/" segment is plain, there are at most 16
// segments, and the whole path is at most 200 characters (what keeps the draft
// within MAX_DRAFT).
export function isPlainPath(path) {
  if (typeof path !== 'string' || path.length > MAX_PATH) return false
  const segments = path.split('/')
  return segments.length <= MAX_SEGMENTS && segments.every(isPlainName)
}

function build(path, required, optional, nReq, nOpt) {
  const shownReq = required.slice(0, nReq)
  const moreReq = required.length - shownReq.length
  const shownOpt = optional.slice(0, nOpt)
  const moreOpt = optional.length - shownOpt.length
  const optItems = [...shownOpt, ...(moreOpt ? ['+' + moreOpt + ' more'] : [])]
  return (
    'Run the saved DataTug query ' +
    path +
    (shownReq.length ? ' with ' + shownReq.map((id) => id + '=').join(', ') : '') +
    (moreReq ? ' (+' + moreReq + ' more required)' : '') +
    (optItems.length ? ' (optional: ' + optItems.join(', ') + ')' : '')
  )
}

// The draft for a query, or null when its ID is not made of plain names.
export function queryDraft(query) {
  if (!isPlainPath(query.path)) return null
  const plain = query.parameters.filter((param) => isPlainName(param.id))
  const required = plain.filter((param) => param.required).map((param) => param.id)
  const optional = plain.filter((param) => !param.required).map((param) => param.id)
  let nReq = Math.min(MAX_NAMES, required.length)
  let nOpt = Math.min(MAX_NAMES, optional.length)
  let draft = build(query.path, required, optional, nReq, nOpt)
  // Long names: drop shown names, optional first, until it fits.
  while (draft.length > MAX_DRAFT && (nReq > 0 || nOpt > 0)) {
    if (nOpt > 0) nOpt -= 1
    else nReq -= 1
    draft = build(query.path, required, optional, nReq, nOpt)
  }
  return draft
}

// What goes before the draft so it does not run into the text already typed.
export function appendPrefix(existingText) {
  return existingText !== '' && !/\s$/.test(existingText) ? ' ' : ''
}
