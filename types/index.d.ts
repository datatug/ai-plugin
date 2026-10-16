export type GridResult = {
  id: string
  // One dim line under a plain grid: why the session shows the grid and not the result card.
  note?: string
  collection: string
  db?: string
  // The datatug:// reference of the project database the rows came from (Record links); absent for
  // a chat grid.
  linkRef?: string
  // Which opened database the rows came from (the panel's open counter), for a reference added later.
  openRun?: number
  // Per row, the integer fields JSON.parse rounded (above 2^53 - 1), as their digits; null for none.
  bigInts?: (Record<string, string> | null)[]
  command: string
  columns: string[]
  types: Record<string, string>
  rows: Record<string, unknown>[]
  total: number
  isTruncated: boolean
}

export type GridView = {
  current: string | null
  selected: number | null
  offset: number
  column?: string | null
  showTable?: boolean
  tableName?: string | null
  // The full identity of the table a result card opened (project database, schema, name), so it is
  // never matched by name alone; set only with tableName.
  tableRef?: { env: string; source: string; schema: string; name: string } | null
  trail?: { current: string; selected: number }[]
}

export type ProjectInfo = { id: string; title: string; origin: string }

export type ProjectsState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  items: ProjectInfo[]
  message: string
}

export type BagEntry = {
  id: string
  address: string
  value: string
  source: string
  isOn: boolean
  kind?: 'table' | 'column' | 'value'
  table?: string
  column?: string
  db?: string
}

export type SchemaColumn = { name: string; type: string; pk: number | null; nullable: boolean | null }

export type SchemaFk = {
  name: string
  columns: string[]
  refSchema: string
  refTable: string
  refColumns: string[]
}

export type SchemaTable = {
  env: string
  source: string
  driver: string
  schema: string
  name: string
  columns: SchemaColumn[]
  foreignKeys: SchemaFk[]
}

export type SchemaState = {
  projectId: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  tables: SchemaTable[]
  message: string
}

export type OpenDbState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  provider: string
  note: string
  target: string
  url: string
  items: { name: string; kind: string; rows?: number | null; atLeast?: boolean; counting?: boolean }[]
  tables?: SchemaTable[]
  message: string
  // The project reference of the opened database: the one it was opened by, or the one `db add`
  // returned for it. Empty until the database is in a project.
  ref?: string
  // The environment variable a PostgreSQL source of the project names for its URL.
  sourceEnv?: string
}

export type DatabasesState = {
  projectId: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  items: { env: string; id: string; driver: string; dsnEnv?: string }[]
  message: string
  note: string
}

export type DbTableState = {
  name: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  message: string
  result: GridResult | null
}

export type DbRecordsState = {
  name: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  message: string
  resultId: string | null
  page: number
  // The datatug:// reference the records were read through when a result card opened them.
  ref?: string
}

export type Bag = { isEnabled: boolean; entries: BagEntry[] }

// What a linked card shows: a link (status ok, its href kept in memory only) or one of the messages.
export type LinkState = {
  req: string
  status: 'checking' | 'ok' | 'down' | 'pending' | 'old-cli' | 'dev' | 'unavailable' | 'no-result' | 'policy-principal'
  at: number
  isStale?: boolean
}

export type CardView = 'table' | 'record' | 'columns' | 'sources' | 'related'

// meta.json as a result card keeps it (lib/results.js readMeta): names cleaned and cut.
export type CardMeta = {
  dataBytes: number
  db: { ref: string | null; project: string | null; env: string | null; source: string | null; driver: string }
  kind: string
  // The saved query's id, for a saved query; null otherwise.
  savedId: string | null
  rows: { kept: number; hasMore: boolean }
  columns: {
    name: string
    type: string
    declaredType: string | null
    nullable: boolean | null
    pk: number | null
    source: { instance: string; schema: string; relation: string; column: string } | null
    foreignKeys: { refSchema: string; refRelation: string; refColumn: string }[]
    encoding: string | null
  }[]
  participants: { instance: string; schema: string; relation: string; alias: string; db: string | null; kind: string; role: string; on: { left: string; right: string }[] }[]
  related: { fromInstance: string; schema: string; relation: string; kind: string; direction: 'incoming' | 'outgoing'; cardinality: string; fields: { source: string; target: string }[] }[]
  unavailable: { participants?: string; related?: string; declaredTypes?: string; columns?: string; query?: string }
  counts: { columns: number; participants: number; related: number }
}

// One result card in the chat, keyed by the tool call's id.
export type CardState = {
  status: 'none' | 'ready' | 'load' | 'loading' | 'expired' | 'not-found' | 'incomplete' | 'unreadable' | 'too-large' | 'inconsistent' | 'version' | 'no-locator' | 'fallback'
  // The result id (the tool call's id made safe), '' before the call ran.
  id: string
  view: CardView
  row: number
  shown: number
  page: number
  // Why the call fell back to the grid (a key of LEGACY_TEXT), for status 'fallback'.
  why?: string
  // Whether the CLI that wrote it opens a result elsewhere (the command and the link).
  canOpen?: boolean
  meta?: CardMeta
  data?: { columns: string[]; types: string[]; rows: (string | null)[][] }
  link?: LinkState
  // The Table view's sort: the column name and whether it is descending; absent for the loaded order.
  sort?: { col: string; desc: boolean }
}

declare module 'claude-code' {
  interface PluginState {
    'datatug': { results: Record<string, GridResult>; view: GridView; shownRows: Record<string, number>
    projects: ProjectsState
    project: { selected: string | null; isOpen?: boolean }
    bags: Record<string, Bag>
    schema: SchemaState
    openDb: OpenDbState
    databases: DatabasesState
    dbTable: DbTableState
    columnOrder: 'defined' | 'alpha' | 'type'
    dbRecords: DbRecordsState
    links: Record<string, LinkState>
    cards: StateFamily<CardState>
    cardRows: string[]
    latestClosed: string
    noticeShown: boolean
  }
  }
}
