// How `/datatug` is told apart from `/datatug project`. Pure.

// The argument that asks for the project pane of the folder (the four tabs and the text summary)
// instead of the panel.
export const PROJECT_ARG = 'project'

export function isProjectView(args) {
  return typeof args === 'string' && args.trim().toLowerCase() === PROJECT_ARG
}
