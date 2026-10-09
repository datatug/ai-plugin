// Turns the project model into the lines the pane and the text summary show.

export const SECTIONS = [
  { id: 'overview', label: 'Overview', hotkey: '1' },
  { id: 'environments', label: 'Environments', hotkey: '2' },
  { id: 'queries', label: 'Queries', hotkey: '3' },
  { id: 'boards', label: 'Boards', hotkey: '4' },
]

const line = (text, tone = 'normal', path) => (path === undefined ? { text, tone } : { text, tone, path })
const warnLines = (warnings) => warnings.map((warning) => line('⚠ ' + warning, 'warn'))
const plural = (n, one, many = one + 's') => n + ' ' + (n === 1 ? one : many)

// The most rows one section shows; the rest are counted, not listed.
export const MAX_ROWS = 200

// Cuts the rows of a section to MAX_ROWS, says how many were left out, and
// puts the warnings after them.
function capped(rows, warnings) {
  const shown = rows.slice(0, MAX_ROWS)
  if (rows.length > MAX_ROWS) shown.push(line('… ' + (rows.length - MAX_ROWS) + ' more', 'dim'))
  return [...shown, ...warnLines(warnings)]
}

// A count of a section whose command failed is unknown, not zero.
function countText(section, count, one, many) {
  return section.warnings.length ? '? ' + (many ?? one + 's') : plural(count, one, many)
}

function countsLine(project) {
  return [
    countText(project.environments, project.environments.items.length, 'environment'),
    countText(project.queries, project.queries.count, 'query', 'queries'),
    countText(project.boards, project.boards.items.length, 'board'),
  ].join(' · ')
}

function overviewLines(project) {
  const o = project.overview
  const known = o.id !== null || o.title !== null || o.access !== null
  const head = known
    ? [line(o.title ?? '(untitled project)'), line('id: ' + (o.id ?? '—'), 'dim'), line('access: ' + (o.access ?? '—'), 'dim')]
    : [line('(project details unavailable)', 'dim')]
  return [...head, line(countsLine(project)), ...warnLines(o.warnings)]
}

function sourceLine(source) {
  let scanned = plural(source.tables, 'table') + (source.views ? ', ' + plural(source.views, 'view') : '')
  if (source.notScanned) scanned = 'not scanned'
  else if (source.empty) scanned = 'no tables or views'
  const detail = [source.driver, scanned].filter(Boolean).join(' · ')
  return line('  ' + source.id + '  ' + detail)
}

function environmentLines(project) {
  const { items, warnings } = project.environments
  const rows = items.flatMap((env) => [
    line(env.id),
    ...(env.sources.length ? env.sources.map(sourceLine) : [line('  no sources', 'dim')]),
  ])
  return capped(rows.length ? rows : [line('No environments.', 'dim')], warnings)
}

function queryRows(node, indent, out) {
  for (const query of node.queries) {
    const label = query.title && query.title !== query.id ? query.title + ' (' + query.id + ')' : query.id
    out.push(line(indent + label + (query.type ? ' [' + query.type + ']' : ''), 'normal', query.path))
  }
  for (const child of node.children) {
    out.push(line(indent + child.name + '/', 'dim'))
    queryRows(child, indent + '  ', out)
  }
  return out
}

function queryLines(project) {
  const { tree, count, warnings } = project.queries
  return capped(count ? queryRows(tree, '', []) : [line('No queries.', 'dim')], warnings)
}

function boardLines(project) {
  const { items, warnings } = project.boards
  const rows = items.map((board) => line(board.title ? board.id + ' — ' + board.title : board.id))
  return capped(rows.length ? rows : [line('No boards.', 'dim')], warnings)
}

// The query at a path in the tree, or null.
export function findQuery(project, path) {
  const walk = (node) => {
    const own = node.queries.find((query) => query.path === path)
    if (own) return own
    for (const child of node.children) {
      const found = walk(child)
      if (found) return found
    }
    return null
  }
  return walk(project.queries.tree)
}

// The detail view of one query: its title (or id), id, type and parameters.
export function queryDetailLines(query) {
  const params = query.parameters.length
    ? query.parameters.map((param) =>
        line(param.id + (param.type ? ': ' + param.type : '') + (param.required ? ' (required)' : '')),
      )
    : [line('No parameters.', 'dim')]
  return [
    line(query.title ?? query.id),
    line('id: ' + query.path, 'dim'),
    ...(query.type ? [line('type: ' + query.type, 'dim')] : []),
    line('Parameters'),
    ...params,
  ]
}

export function sectionLines(project, id) {
  switch (id) {
    case 'overview':
      return overviewLines(project)
    case 'environments':
      return environmentLines(project)
    case 'queries':
      return queryLines(project)
    case 'boards':
      return boardLines(project)
    default:
      return []
  }
}

export function summaryText(project) {
  return SECTIONS.map((section) =>
    [section.label, ...sectionLines(project, section.id).map((row) => '  ' + row.text)].join('\n'),
  ).join('\n\n')
}
