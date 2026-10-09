import { isPlainPath } from './draft.js'
import { SECTIONS, findQuery, queryHeadLines, queryParamLines, sectionLines } from './lines.js'

// Only the terminal and the Desktop app show a mod's panes. `surfaces` is the
// list `$.session.surfaces()` returns.
export function canDrawPane(surfaces) {
  return Array.isArray(surfaces) && (surfaces.includes('terminal') || surfaces.includes('desktop'))
}

const textOf = (Text, row) =>
  Text({
    wrap: 'truncate-end',
    ...(row.tone === 'warn' ? { color: 'yellow' } : {}),
    ...(row.tone === 'dim' ? { dimColor: true } : {}),
    children: [row.text],
  })

// `elements` is `{ Box, Text, Button }` from `$.ui.resolve(e)`. `selected` is
// the path of the chosen query, or null; `on` has the callbacks `onTab(id)`,
// `onSelect(path)`, `onBack()` and `onAsk()`. `focusPath` is the query row
// that takes the focus on the Queries tab (the first row when null or absent).
export function buildPane({ Box, Text, Button }, project, tab, selected, on, focusPath = null) {
  const tabs = SECTIONS.map((section) =>
    Button({
      key: 'tab-' + section.id,
      label: section.label,
      hotkey: section.hotkey,
      plain: true,
      dimColor: tab !== section.id,
      onPress: () => on.onTab(section.id),
    }),
  )

  const query = selected === null ? null : findQuery(project, selected)
  let body
  if (query !== null) {
    const canAsk = isPlainPath(query.path)
    body = [
      ...queryHeadLines(query).map((row) => textOf(Text, row)),
      Text({ children: [' '] }),
      Box({
        flexDirection: 'row',
        columnGap: 2,
        children: [
          ...(canAsk
            ? [Button({ key: 'ask-claude', label: 'Ask Claude', hotkey: 'a', plain: true, autoFocus: true, onPress: () => on.onAsk() })]
            : [textOf(Text, { text: "This query's ID cannot be named in a request.", tone: 'dim' })]),
          Button({
            key: 'query-back',
            label: 'Back',
            hotkey: 'b',
            plain: true,
            ...(canAsk ? {} : { autoFocus: true }),
            onPress: () => on.onBack(),
          }),
        ],
      }),
      Text({ children: [' '] }),
      ...queryParamLines(query).map((row) => textOf(Text, row)),
    ]
  } else {
    const rows = sectionLines(project, tab)
    const paths = rows.filter((row) => row.path !== undefined).map((row) => row.path)
    const focus = focusPath !== null && paths.includes(focusPath) ? focusPath : paths[0]
    body = rows.map((row) =>
      row.path === undefined
        ? textOf(Text, row)
        : Button({
            key: 'query-' + row.path,
            label: row.text,
            plain: true,
            ...(row.path === focus ? { autoFocus: true } : {}),
            onPress: () => on.onSelect(row.path),
          }),
    )
  }

  return Box({
    flexDirection: 'column',
    children: [Box({ flexDirection: 'row', columnGap: 2, children: tabs }), Text({ children: [' '] }), ...body],
  })
}
