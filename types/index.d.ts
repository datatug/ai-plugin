export type GridResult = {
  id: string
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
}

export type Bag = { isEnabled: boolean; entries: BagEntry[] }

// What a linked card shows: a link (status ok, its href kept in memory only) or one of the messages.
export type LinkState = {
  req: string
  status: 'checking' | 'ok' | 'down' | 'pending' | 'old-cli' | 'dev' | 'unavailable'
  at: number
  isStale?: boolean
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
  }
  }
}
