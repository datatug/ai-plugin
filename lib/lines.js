// Turns the project model into the lines the pane and the text summary show.

export const SECTIONS = [
  { id: 'overview', label: 'Overview', hotkey: '1' },
  { id: 'environments', label: 'Environments', hotkey: '2' },
  { id: 'queries', label: 'Queries', hotkey: '3' },
  { id: 'boards', label: 'Boards', hotkey: '4' },
]

const line = (text, tone = 'normal') => ({ text, tone })
const warnLines = (warnings) => warnings.map((warning) => line('⚠ ' + warning, 'warn'))
const plural = (n, one, many = one + 's') => n + ' ' + (n === 1 ? one : many)

function countsLine(project) {
  return [
    plural(project.environments.items.length, 'environment'),
    plural(project.queries.count, 'query', 'queries'),
    plural(project.boards.items.length, 'board'),
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
  return [...(rows.length ? rows : [line('No environments.', 'dim')]), ...warnLines(warnings)]
}

function queryRows(node, indent, out) {
  for (const query of node.queries) {
    const label = query.title && query.title !== query.id ? query.title + ' (' + query.id + ')' : query.id
    out.push(line(indent + label + (query.type ? ' [' + query.type + ']' : '')))
  }
  for (const child of node.children) {
    out.push(line(indent + child.name + '/', 'dim'))
    queryRows(child, indent + '  ', out)
  }
  return out
}

function queryLines(project) {
  const { tree, count, warnings } = project.queries
  return [...(count ? queryRows(tree, '', []) : [line('No queries.', 'dim')]), ...warnLines(warnings)]
}

function boardLines(project) {
  const { items, warnings } = project.boards
  const rows = items.map((board) => line(board.title ? board.id + ' — ' + board.title : board.id))
  return [...(rows.length ? rows : [line('No boards.', 'dim')]), ...warnLines(warnings)]
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
