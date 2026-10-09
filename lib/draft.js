// The request Ask Claude drafts for a query. Pure; built only from the cleaned
// values of the project model, so it is one line.

export function queryDraft(query) {
  const required = query.parameters.filter((param) => param.required).map((param) => param.id)
  const optional = query.parameters.filter((param) => !param.required).map((param) => param.id)
  return (
    'Run the saved DataTug query ' +
    query.path +
    (query.title ? ' ("' + query.title + '")' : '') +
    (required.length ? ' with ' + required.map((id) => id + '=').join(', ') : '') +
    (optional.length ? ' (optional: ' + optional.join(', ') + ')' : '')
  )
}

// What goes before the draft so it does not run into the text already typed.
export function appendPrefix(existingText) {
  return existingText !== '' && !/\s$/.test(existingText) ? ' ' : ''
}
