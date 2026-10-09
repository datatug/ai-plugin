import { SECTIONS, findQuery, queryDetailLines, sectionLines } from './lines.js'

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
// `onSelect(path)`, `onBack()` and `onAsk()`.
export function buildPane({ Box, Text, Button }, project, tab, selected, on) {
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
    body = [
      ...queryDetailLines(query).map((row) => textOf(Text, row)),
      Text({ children: [' '] }),
      Box({
        flexDirection: 'row',
        columnGap: 2,
        children: [
          Button({ key: 'ask-claude', label: 'Ask Claude', hotkey: 'a', onPress: () => on.onAsk() }),
          Button({ key: 'query-back', label: 'Back', hotkey: 'b', onPress: () => on.onBack() }),
        ],
      }),
    ]
  } else {
    body = sectionLines(project, tab).map((row) =>
      row.path === undefined
        ? textOf(Text, row)
        : Button({ key: 'query-' + row.path, label: row.text, plain: true, onPress: () => on.onSelect(row.path) }),
    )
  }

  return Box({
    flexDirection: 'column',
    children: [Box({ flexDirection: 'row', columnGap: 2, children: tabs }), Text({ children: [' '] }), ...body],
  })
}
