import { readListing } from './cli.js'

// Builds the project the pane shows from what the three datatug listing
// commands printed. Pure, and tolerant: a command that failed, or printed
// something of an unexpected shape, leaves its own sections empty.

const asString = (value) => (typeof value === 'string' ? value : null)

// The entries of a list that carry an id; anything else is dropped.
const withIds = (value) => (Array.isArray(value) ? value.filter((item) => item && typeof item.id === 'string') : [])

const warningsOf = (read) => (read.warning ? [read.warning] : [])

function toSource(source) {
  const schemas = Array.isArray(source.schemas) ? source.schemas : []
  const count = (key) => schemas.reduce((n, schema) => n + (Array.isArray(schema?.[key]) ? schema[key].length : 0), 0)
  return {
    id: source.id,
    driver: asString(source.driver),
    tables: count('tables'),
    views: count('views'),
    notScanned: source.notScanned === true,
    empty: source.empty === true,
  }
}

// A query's ID is its folders and its name joined by "/".
function buildQueryTree(items) {
  const root = { name: 'queries', queries: [], children: [] }
  for (const item of items) {
    const parts = item.id.split('/')
    let node = root
    for (const folder of parts.slice(0, -1)) {
      let child = node.children.find((candidate) => candidate.name === folder)
      if (!child) {
        child = { name: folder, queries: [], children: [] }
        node.children.push(child)
      }
      node = child
    }
    node.queries.push({ id: parts.at(-1), title: asString(item.title), type: asString(item.type) })
  }
  return root
}

export function buildProject(results) {
  const show = readListing('show', results.show)
  const queries = readListing('queries', results.queries)
  const boards = readListing('boards', results.boards)

  const doc = show.data && typeof show.data === 'object' ? show.data : {}
  const queryItems = withIds(queries.data)

  return {
    overview: {
      id: asString(doc.project),
      title: asString(doc.title),
      access: asString(doc.access),
      warnings: warningsOf(show),
    },
    environments: {
      items: withIds(doc.environments).map((env) => ({ id: env.id, sources: withIds(env.sources).map(toSource) })),
      warnings: warningsOf(show),
    },
    queries: { tree: buildQueryTree(queryItems), count: queryItems.length, warnings: warningsOf(queries) },
    boards: {
      items: withIds(boards.data).map((board) => ({ id: board.id, title: asString(board.title) })),
      warnings: warningsOf(boards),
    },
  }
}
