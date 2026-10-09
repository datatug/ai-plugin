import { SECTIONS, sectionLines } from './lines.js'

// Only the terminal and the Desktop app show a mod's panes. `surfaces` is the
// list `$.session.surfaces()` returns.
export function canDrawPane(surfaces) {
  return Array.isArray(surfaces) && (surfaces.includes('terminal') || surfaces.includes('desktop'))
}

// `elements` is `{ Box, Text, Button }` from `$.ui.resolve(e)`.
export function buildPane({ Box, Text, Button }, project, tab, onTab) {
  const tabs = SECTIONS.map((section) =>
    Button({
      key: 'tab-' + section.id,
      label: section.label,
      hotkey: section.hotkey,
      plain: true,
      dimColor: tab !== section.id,
      onPress: () => onTab(section.id),
    }),
  )

  const body = sectionLines(project, tab).map((row) =>
    Text({
      wrap: 'truncate-end',
      ...(row.tone === 'warn' ? { color: 'yellow' } : {}),
      ...(row.tone === 'dim' ? { dimColor: true } : {}),
      children: [row.text],
    }),
  )

  return Box({
    flexDirection: 'column',
    children: [
      Box({ flexDirection: 'row', columnGap: 2, children: tabs }),
      Text({ children: [' '] }),
      ...body,
    ],
  })
}
