/**
 * DataTug for DeepSeek Harness — Client half.
 *
 * Registers a `DataTug` page type in the right Sidebar and draws the browser:
 * a project picker, the project's environments → sources → schemas → tables,
 * one table's columns, and its first rows. Every read goes to the Host half of
 * this package through the Harness Gateway (`/api/datatug/<method>`), which
 * runs the locally installed `datatug` CLI.
 *
 * Plain JavaScript, no build step: the module registers a lazy factory with the
 * Harness module loader, and React comes from the platform module table.
 */

window.__ModuleLoader__.load({
  id: '@datatug/dsh-plugin',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useState } = React

    const KIND = 'datatug'
    const NS = 'datatug'

    /** Service keys this plugin waits for on the Client context. */
    const inject = ['slots', 'connection', 'sidebarRightTabs']

    const CSS = `
.dtg-root{display:flex;flex-direction:column;height:100%;min-height:0;font:inherit;color:var(--dsw-alias-label-primary)}
.dtg-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
.dtg-bar-title{font-weight:600;font-size:13px}
.dtg-bar-meta{color:var(--dsw-alias-label-tertiary);font-size:11px;margin-left:auto}
.dtg-body{flex:1;min-height:0;overflow:auto;padding:10px 12px}
.dtg-btn{border:1px solid var(--dsw-alias-border-l1);background:transparent;color:inherit;border-radius:6px;padding:3px 8px;font:inherit;font-size:12px;cursor:pointer}
.dtg-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dtg-btn[disabled]{opacity:.5;cursor:default}
.dtg-select{max-width:100%;font:inherit;font-size:12px;padding:3px 6px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:inherit}
.dtg-input{width:100%;box-sizing:border-box;font:inherit;font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:inherit}
.dtg-note{color:var(--dsw-alias-label-tertiary);font-size:12px;padding:8px 0}
.dtg-error{color:var(--dsw-alias-state-danger,inherit);font-size:12px;white-space:pre-wrap;padding:8px 0}
.dtg-heading{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--dsw-alias-label-tertiary);margin:12px 0 4px}
.dtg-row{display:flex;align-items:center;gap:8px;padding:3px 4px;border-radius:6px;cursor:pointer}
.dtg-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dtg-row-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
.dtg-tag{color:var(--dsw-alias-label-tertiary);font-size:10px;flex:none}
.dtg-cols{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 0}
.dtg-col{border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:3px 6px;font-size:11px}
.dtg-col b{font-weight:600}
.dtg-col span{color:var(--dsw-alias-label-tertiary)}
.dtg-grid-wrap{overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;margin-top:8px;max-height:46vh}
.dtg-grid{border-collapse:collapse;font-size:11px;white-space:nowrap}
.dtg-grid th,.dtg-grid td{border-bottom:1px solid var(--dsw-alias-border-l1);padding:3px 8px;text-align:left;max-width:260px;overflow:hidden;text-overflow:ellipsis}
.dtg-grid th{position:sticky;top:0;background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base));font-weight:600}
.dtg-grid tr:last-child td{border-bottom:0}
.dtg-crumbs{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-tertiary);margin-bottom:6px}
.dtg-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0}
`

    const STYLE_ID = 'dtg-style'

    /**
     * Call one Host method of this bundle through the Harness Gateway.
     * @param {{call: Function}} host - the bridge installed by `apply`.
     * @param {string} method - Host method name.
     * @param {object} request - the method's single argument.
     * @param {AbortSignal} [signal] - optional cancellation.
     * @returns {Promise<any>} the method's JSON result.
     */
    async function invoke(host, method, request, signal) {
      const result = await host.call(`datatug/${method}`, { args: { request: request ?? {} } }, signal)
      if (result === undefined || result === null || typeof result !== 'object') {
        throw new Error(`DataTug Host method ${method} returned no result`)
      }
      if (result.ok === false) {
        const error = result.error ?? {}
        throw new Error(error.message ?? error.code ?? `${method} failed`)
      }
      const value = result.ok === true ? result.value : result
      if (value !== null && typeof value === 'object' && value.ok === false) {
        throw new Error(value.error?.message ?? `${method} failed`)
      }
      return value
    }

    /**
     * Flatten a `show --depth columns` listing into one table index.
     * @param {any} listing - the CLI listing document.
     * @returns {{env: string, source: string, driver: string, schema: string, table: string, columns: any[]}[]} tables.
     */
    function flatten(listing) {
      const tables = []
      const environments = Array.isArray(listing?.environments) ? listing.environments : []
      for (const env of environments) {
        for (const source of Array.isArray(env?.sources) ? env.sources : []) {
          for (const schema of Array.isArray(source?.schemas) ? source.schemas : []) {
            for (const table of Array.isArray(schema?.tables) ? schema.tables : []) {
              tables.push({
                env: String(env.id ?? ''),
                source: String(source.id ?? ''),
                driver: String(source.driver ?? ''),
                schema: String(schema.name ?? ''),
                table: String(table.name ?? ''),
                columns: Array.isArray(table.columns) ? table.columns : [],
              })
            }
          }
        }
      }
      return tables
    }

    /** @param {unknown} value @returns {string} a display string for one cell. */
    function cell(value) {
      if (value === null || value === undefined) return ''
      return typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value)
    }

    /**
     * Serialize the loaded rows as CSV, quoting per RFC 4180.
     * @param {string[]} columns - column names.
     * @param {Record<string, unknown>[]} rows - row values.
     * @returns {string} CSV text.
     */
    function toCsv(columns, rows) {
      const quote = (value) => {
        const text = cell(value)
        return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
      }
      return [columns.map(quote).join(','), ...rows.map((row) => columns.map((column) => quote(row[column])).join(','))].join('\n')
    }

    /** A small database glyph for the Sidebar guide card. */
    function DataTugIcon() {
      return h('svg', { viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 },
        h('ellipse', { cx: 12, cy: 6, rx: 7, ry: 2.6 }),
        h('path', { d: 'M5 6v6c0 1.5 3.1 2.6 7 2.6s7-1.1 7-2.6V6' }),
        h('path', { d: 'M5 12v6c0 1.5 3.1 2.6 7 2.6s7-1.1 7-2.6v-6' }))
    }

    /** @param {{children?: any, onClick?: Function, disabled?: boolean, title?: string}} props */
    function Button({ children, onClick, disabled, title }) {
      return h('button', {
        type: 'button',
        className: 'dtg-btn',
        onClick,
        disabled: disabled === true,
        title,
      }, children)
    }

    /** The DataTug browser. */
    /** @param {{host: {call: Function}}} props */
    function Panel({ host }) {
      const [boot, setBoot] = useState({ phase: 'loading' })
      const [projects, setProjects] = useState({ phase: 'idle' })
      const [project, setProject] = useState('')
      const [listing, setListing] = useState({ phase: 'idle' })
      const [filter, setFilter] = useState('')
      const [picked, setPicked] = useState(null)
      const [rows, setRows] = useState({ phase: 'idle', limit: 50 })
      const [copied, setCopied] = useState('')

      useEffect(() => {
        let live = true
        invoke(host, 'status', {}).then(
          (value) => { if (live) setBoot({ phase: 'ready', ...value }) },
          (error) => { if (live) setBoot({ phase: 'error', message: String(error?.message ?? error) }) },
        )
        return () => { live = false }
      }, [host])

      useEffect(() => {
        if (boot.phase !== 'ready' || boot.available !== true) return undefined
        let live = true
        setProjects({ phase: 'loading' })
        invoke(host, 'projects', {}).then(
          (value) => {
            if (!live) return
            const list = Array.isArray(value?.projects) ? value.projects : []
            setProjects({ phase: 'ready', list })
            if (list.length > 0) setProject((current) => current || list[0].id)
          },
          (error) => { if (live) setProjects({ phase: 'error', message: String(error?.message ?? error) }) },
        )
        return () => { live = false }
      }, [boot.phase, boot.available, host])

      const loadProject = useCallback((id) => {
        if (!id) return
        setListing({ phase: 'loading' })
        setPicked(null)
        setRows({ phase: 'idle', limit: 50 })
        invoke(host, 'show', { project: id, depth: 'columns' }).then(
          (value) => setListing({ phase: 'ready', value: value?.listing, id }),
          (error) => setListing({ phase: 'error', message: String(error?.message ?? error) }),
        )
      }, [host])

      useEffect(() => { if (project) loadProject(project) }, [project, loadProject])

      const index = useMemo(() => flatten(listing.value), [listing.value])

      const visible = useMemo(() => {
        const needle = filter.trim().toLowerCase()
        if (needle === '') return index
        return index.filter((item) => `${item.env} ${item.source} ${item.schema} ${item.table}`.toLowerCase().includes(needle))
      }, [index, filter])

      const groups = useMemo(() => {
        /** @type {Map<string, typeof visible>} */
        const map = new Map()
        for (const item of visible) {
          const key = `${item.env}\u0000${item.source}\u0000${item.schema}`
          const bucket = map.get(key)
          if (bucket === undefined) map.set(key, [item])
          else bucket.push(item)
        }
        return [...map.entries()].map(([key, tables]) => {
          const [env, source, schema] = key.split('\u0000')
          return { env, source, schema, tables }
        })
      }, [visible])

      const loadRows = useCallback((limit) => {
        if (picked === null) return
        setRows({ phase: 'loading', limit })
        invoke(host, 'rows', {
          project: picked.project,
          env: picked.env,
          source: picked.source,
          table: picked.table,
          limit,
        }).then(
          (value) => setRows({ phase: 'ready', limit, value }),
          (error) => setRows({ phase: 'error', limit, message: String(error?.message ?? error) }),
        )
      }, [picked, host])

      const copyCsv = useCallback(() => {
        const value = rows.value
        if (!value) return
        const text = toCsv(value.columns ?? [], value.rows ?? [])
        const done = () => setCopied('Copied CSV')
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(text).then(done, () => setCopied('Copy failed'))
        } else {
          setCopied('Clipboard unavailable')
        }
      }, [rows.value])

      useEffect(() => {
        if (copied === '') return undefined
        const timer = setTimeout(() => setCopied(''), 2000)
        return () => clearTimeout(timer)
      }, [copied])

      const header = h('div', { className: 'dtg-bar' },
        h('span', { className: 'dtg-bar-title' }, 'DataTug'),
        boot.phase === 'ready' && boot.available
          ? h(Button, { onClick: () => { if (project) loadProject(project) }, title: 'Reload this project' }, 'Refresh')
          : null,
        h('span', { className: 'dtg-bar-meta' }, boot.phase === 'ready' && boot.version ? `CLI ${boot.version}` : ''),
      )

      if (boot.phase === 'loading') {
        return h('div', { className: 'dtg-root' }, h('style', null, CSS), header, h('div', { className: 'dtg-body' }, h('div', { className: 'dtg-note' }, 'Checking the datatug CLI…')))
      }
      if (boot.phase === 'error' || boot.available !== true) {
        return h('div', { className: 'dtg-root' }, h('style', null, CSS), header, h('div', { className: 'dtg-body' },
          h('div', { className: 'dtg-error' }, boot.phase === 'error' ? boot.message : 'The datatug CLI is not available.'),
          h('div', { className: 'dtg-note' }, 'Install it from https://datatug.io/en/docs/install/ and make sure it is on the PATH of the DeepSeek Harness process.'),
          h('div', { className: 'dtg-note' }, 'If DataTug was just installed or updated, restart DeepSeek Harness so its process loads the current plugin code, then reload this page.'),
        ))
      }

      return h('div', { className: 'dtg-root' },
        h('style', null, CSS),
        header,
        h('div', { className: 'dtg-body' },
          projects.phase === 'error'
            ? h('div', { className: 'dtg-error' }, projects.message)
            : h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
              h('select', {
                className: 'dtg-select',
                value: project,
                onChange: (event) => setProject(event.target.value),
                'aria-label': 'DataTug project',
              },
              projects.phase === 'ready' && projects.list.length === 0
                ? h('option', { value: '' }, 'No projects registered')
                : (projects.list ?? []).map((item) => h('option', { key: item.id, value: item.id }, item.title ? `${item.title} (${item.id})` : item.id))),
              project ? h(Button, { onClick: () => loadProject(project) }, 'Reload') : null,
            ),

          picked === null ? null : h('div', { className: 'dtg-crumbs' },
            h(Button, { onClick: () => { setPicked(null); setRows({ phase: 'idle', limit: 50 }) } }, '‹ Tables'),
            h('span', null, `${picked.env} · ${picked.source} · ${picked.schema} · ${picked.table}`),
          ),

          picked === null
            ? h('div', null,
              h('input', {
                className: 'dtg-input',
                style: { marginTop: 8 },
                placeholder: 'Filter tables…',
                value: filter,
                onChange: (event) => setFilter(event.target.value),
                'aria-label': 'Filter tables',
              }),
              listing.phase === 'loading' ? h('div', { className: 'dtg-note' }, 'Reading the project…') : null,
              listing.phase === 'error' ? h('div', { className: 'dtg-error' }, listing.message) : null,
              listing.phase === 'ready' && groups.length === 0 ? h('div', { className: 'dtg-note' }, 'No tables match. A source that is not scanned has no tables: run `datatug scan` for it.') : null,
              groups.map((group) => h('div', { key: `${group.env}/${group.source}/${group.schema}` },
                h('div', { className: 'dtg-heading' }, `${group.env} · ${group.source}${group.schema ? ` · ${group.schema}` : ''}`),
                group.tables.map((item) => h('div', {
                  key: `${item.source}/${item.schema}/${item.table}`,
                  className: 'dtg-row',
                  role: 'button',
                  tabIndex: 0,
                  onClick: () => { setPicked({ ...item, project }); setRows({ phase: 'idle', limit: 50 }) },
                  onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setPicked({ ...item, project }); setRows({ phase: 'idle', limit: 50 }) } },
                },
                h('span', { className: 'dtg-row-name' }, item.table),
                h('span', { className: 'dtg-tag' }, String(item.columns.length)),
                )),
              )),
            )
            : h('div', null,
              h('div', { className: 'dtg-cols' }, picked.columns.map((column) => h('div', {
                key: column.name,
                className: 'dtg-col',
                title: [column.type, column.nullable === false ? 'not null' : 'nullable', column.primaryKeyPosition ? `key ${column.primaryKeyPosition}` : ''].filter(Boolean).join(' · '),
              },
              h('b', null, column.name),
              h('span', null, ` ${column.type ?? ''}`),
              ))),
              h('div', { className: 'dtg-actions' },
                h(Button, { onClick: () => loadRows(50), disabled: rows.phase === 'loading' }, rows.phase === 'loading' ? 'Reading…' : 'Load 50 rows'),
                [10, 100].map((limit) => h(Button, { key: limit, onClick: () => loadRows(limit), disabled: rows.phase === 'loading' }, `Load ${limit}`)),
                rows.phase === 'ready' ? h(Button, { onClick: copyCsv }, 'Copy CSV') : null,
                copied !== '' ? h('span', { className: 'dtg-tag' }, copied) : null,
              ),
              rows.phase === 'error' ? h('div', { className: 'dtg-error' }, rows.message) : null,
              rows.phase === 'ready' && rows.value
                ? h('div', null,
                  h('div', { className: 'dtg-tag' }, `${rows.value.count} rows · ${(rows.value.columns ?? []).length} columns`),
                  h('div', { className: 'dtg-grid-wrap' },
                    h('table', { className: 'dtg-grid' },
                      h('thead', null, h('tr', null, (rows.value.columns ?? []).map((column) => h('th', { key: column, title: column }, column)))),
                      h('tbody', null, (rows.value.rows ?? []).map((row, rowIndex) => h('tr', { key: rowIndex },
                        (rows.value.columns ?? []).map((column) => h('td', { key: column, title: cell(row[column]) }, cell(row[column])))),
                      )),
                    ),
                  ),
                )
                : null,
            ),
        ),
      )
    }

    /** @param {import('@deepseek-ai/cordis').Context} ctx */
    function apply(ctx) {
      if (typeof document !== 'undefined' && document.getElementById(STYLE_ID) === null) {
        const style = document.createElement('style')
        style.id = STYLE_ID
        style.textContent = CSS
        document.head.appendChild(style)
        ctx.effect(() => () => { style.remove() }, 'datatug: stylesheet')
      }

      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: KIND,
        kind: KIND,
        priority: 'extension',
        title: () => 'DataTug',
        guide: [{
          id: 'browse',
          order: 40,
          title: () => 'DataTug',
          description: () => 'Browse DataTug projects, tables and rows',
          icon: DataTugIcon,
        }],
      }), 'datatug: tab type')

      // The bridge the panel's props carry: one Gateway call per Host method.
    const host = {
      call: (endpoint, payload, signal) => ctx.connection.rpc.call('/api', endpoint, payload, signal),
    }
    ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab',
      key: KIND,
      locale: NS,
    }, (props) => h(Panel, { ...props, host })))
    }

    return { inject, apply }
  },
})
