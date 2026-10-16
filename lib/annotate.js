// The person's prompt, handed to the datatug CLI so it is stored with the result it led to. Pure:
// the hooks module runs the CLI.

// PLACEHOLDER. The first datatug release with `query results annotate` (datatug-cli#431, merged at
// 1423e765, after v0.100.1). No release holds it yet; any release after v0.100.1 does, so this is the
// lowest version it can have. Replace it with the real tag once the release is out. A CLI without the
// verb is not an error either way: the call is best effort and silent.
export const ANNOTATE_MIN_CLI_VERSION = '0.100.2'

// The CLI cuts the prompt to 8 KiB itself; the mod only keeps a pasted novel from becoming a huge stdin.
// Characters are at least one byte each, so this is always above the CLI's own cut.
export const MAX_PROMPT_CHARS = 16384

// The origins that are the person's own words: Enter at the prompt, a Remote Control client, an SDK or
// `claude -p` turn, or a plugin's prompt submitted as the person's (`asUser`). A notification, a peer
// session, a schedule or a plugin speaking for itself is not a prompt the person wrote.
export function isPersonPrompt(origin) {
  const kind = origin?.kind
  if (kind === 'composer' || kind === 'bridge' || kind === 'sdk') return true
  return kind === 'plugin' && origin.asUser === true
}

// What the mod keeps of a submitted prompt, or null for text that is not a prompt of the person's.
export function keptPrompt(text, origin) {
  if (!isPersonPrompt(origin) || typeof text !== 'string') return null
  const t = text.trim()
  return t === '' ? null : t.slice(0, MAX_PROMPT_CHARS)
}

// The arguments after `datatug`. The prompt is never among them: it goes to the process's standard input.
export function annotateArgs(id) {
  return ['query', 'results', 'annotate', '--id', id, '--prompt-stdin']
}
