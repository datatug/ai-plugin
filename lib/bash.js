// Which Bash commands run `datatug query run`, which of them the mod may rewrite, and which name
// the private result files. Pure: the hooks module runs the commands and answers the model.

// The reasons the model reads for a refused command.
export const PLAIN_TEXT =
  'Run DataTug queries as a plain `datatug query run ...` command, without shell syntax or unbalanced quotes (quote only whole arguments); put a complex query in a DTQL file and pass it with -f'
export const BACKGROUND_TEXT = 'DataTug queries cannot run in the background'
export const STORE_TEXT = 'DataTug query results are shown in the card, not to Claude'
// The one answer of a hook that failed: constant, so answering it can never fail.
export const FAILED_TEXT = 'The DataTug mod could not show the result of this query, so it did not hand it to Claude'

// Shell syntax a plain command never holds, quoted or not.
const SHELL = /[|;&<>$`()\n\r#\\]/

// Words after which the next word is a command again.
const RESERVED = new Set(['then', 'do', 'else', 'elif', 'while', 'until', 'if', '!', '{', 'time'])
// Words that run the command they are given, with options of their own before it.
const WRAPPERS = new Set(['env', 'time', 'timeout', 'nice', 'nohup', 'stdbuf', 'caffeinate', 'watch', 'command', 'exec', 'sudo', 'doas', 'xargs', 'builtin'])
const ASSIGNMENT = /^[A-Za-z_]\w*=/
const DATATUG = /^(?:.*\/)?datatug$/

// The command with quoted text blanked, so a quoted argument of another command is never taken for
// a command. A double-quoted part that substitutes a command (`$(` or a backtick) is kept as it is:
// the shell runs what is inside it.
export function skeleton(text) {
  const s = String(text ?? '')
  let out = ''
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '\\') {
      out += '  '
      i += 2
      continue
    }
    if (c === "'") {
      const end = s.indexOf("'", i + 1)
      const stop = end < 0 ? s.length : end + 1
      out += ' '.repeat(stop - i)
      i = stop
      continue
    }
    if (c === '"') {
      let j = i + 1
      while (j < s.length && s[j] !== '"') j += s[j] === '\\' ? 2 : 1
      const stop = Math.min(s.length, j + 1)
      const part = s.slice(i + 1, Math.min(j, s.length))
      out += /\$\(|`/.test(part) ? ` ${part} ` : ' '.repeat(stop - i)
      i = stop
      continue
    }
    out += c
    i++
  }
  return out
}

// Splits text into words and separators. `$(` is one separator; `<` and `>` count as separators too,
// so a word after a redirection is looked at as a command (safe in the direction that matters).
function lex(text) {
  const out = []
  let word = ''
  const flush = () => {
    if (word !== '') out.push({ word })
    word = ''
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === ' ' || c === '\t') {
      flush()
    } else if (c === '$' && text[i + 1] === '(') {
      flush()
      out.push({ sep: '$(' })
      i++
    } else if ('\n\r;&|()`{}!<>'.includes(c)) {
      // `{`, `}` and `!` are separators only as words of their own.
      if ('{}!'.includes(c) && (word !== '' || (text[i + 1] !== undefined && !' \t\n'.includes(text[i + 1])))) {
        word += c
        continue
      }
      flush()
      out.push({ sep: c })
    } else {
      word += c
    }
  }
  flush()
  return out
}

// The words after `datatug` of each datatug command in command position: at the start, after a
// separator or a reserved word, after `VAR=` assignments, or as the command a wrapper runs (its
// options and their values skipped). `firstOnly` looks at the first command only.
function datatugCalls(text, firstOnly) {
  const calls = []
  const items = lex(text)
  let atCommand = true
  let wrapped = false
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (it.sep !== undefined) {
      if (firstOnly) break
      atCommand = true
      wrapped = false
      continue
    }
    if (!atCommand) continue
    const w = it.word
    if (DATATUG.test(w)) {
      const words = []
      for (let j = i + 1; j < items.length && items[j].sep === undefined; j++) words.push(items[j].word)
      calls.push(words)
      atCommand = false
      continue
    }
    if (wrapped || RESERVED.has(w) || ASSIGNMENT.test(w)) continue
    if (WRAPPERS.has(w)) {
      wrapped = true
      continue
    }
    atCommand = false
  }
  return calls
}

const has = (words, seq) => words.some((_, i) => seq.every((s, k) => words[i + k] === s))

// Every datatug command the text runs, by both detectors: command position in the text with its
// quoted parts blanked, and the first command of each line as written (a heredoc body).
function allCalls(text) {
  const s = String(text ?? '')
  return [...datatugCalls(skeleton(s), false), ...s.split(/[\n\r]/).flatMap(line => datatugCalls(line, true))]
}

// Whether a command runs `datatug ... query run`.
export function runsQuery(text) {
  return allCalls(text).some(words => has(words, ['query', 'run']))
}

const isFlag = (token, name) => token === name || token.startsWith(`${name}=`)
const HELP = new Set(['--help', '-h'])

// Splits a command into its tokens, each a whole word or a whole quoted argument: null when a quote
// is unbalanced, sits inside a word, or a quoted argument holds the other kind of quote.
export function tokens(text) {
  const out = []
  const re = /[^ \t]+/g
  let m
  while ((m = re.exec(text)) !== null) {
    const raw = m[0]
    let value = raw
    let quoted = false
    if (/['"]/.test(raw)) {
      const q = raw[0]
      if ((q !== "'" && q !== '"') || raw.length < 2 || raw[raw.length - 1] !== q) return null
      value = raw.slice(1, -1)
      if (/['"]/.test(value)) return null
      quoted = true
    }
    out.push({ raw, value, quoted, end: m.index + raw.length })
  }
  return out
}

// What to do with a command:
// - { kind: 'none' }: it does not run `datatug query run`; it runs as it is.
// - { kind: 'help' }: `datatug query run --help` (or -h) and nothing else; it runs as it is.
// - { kind: 'deny', reason }: it runs `datatug query run` in a form the mod does not rewrite.
// - { kind: 'plain', head, tail, format }: the plain form. `head` is the command up to and
//   including `query run`, `tail` the rest, `format` the model's own --format value or null.
export function classify(command, isBackground) {
  const text = String(command ?? '')
  if (!runsQuery(text)) return { kind: 'none' }
  const t = text.trim()
  const toks = SHELL.test(t) ? null : tokens(t)
  const deny = { kind: 'deny', reason: PLAIN_TEXT }
  if (toks === null) return deny
  let at = 0
  while (at < toks.length && !toks[at].quoted && (toks[at].value === 'env' || toks[at].value === 'time' || ASSIGNMENT.test(toks[at].value))) at++
  if (at >= toks.length || toks[at].quoted || !DATATUG.test(toks[at].value)) return deny
  let q = at + 1
  while (q + 1 < toks.length && !(toks[q].value === 'query' && toks[q + 1].value === 'run' && !toks[q].quoted && !toks[q + 1].quoted)) q++
  if (q + 1 >= toks.length) return deny
  const global = toks.slice(at + 1, q)
  if (global.some(x => x.quoted || isFlag(x.value, '--client'))) return deny
  const rest = toks.slice(q + 2)
  if (rest.length > 0 && rest.every(x => !x.quoted && HELP.has(x.value))) return { kind: 'help' }
  if (isBackground) return { kind: 'deny', reason: BACKGROUND_TEXT }
  for (const x of rest) {
    if (x.quoted) continue
    if (HELP.has(x.value) || x.value === '--') return deny
    if (['--result-id', '--result-rows', '--client'].some(name => isFlag(x.value, name))) return deny
  }
  let format = null
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].quoted) continue
    if (rest[i].value === '--format') format = rest[i + 1]?.value ?? ''
    else if (rest[i].value.startsWith('--format=')) format = rest[i].value.slice('--format='.length)
  }
  const cut = toks[q + 1].end
  return { kind: 'plain', head: t.slice(0, cut), tail: t.slice(cut), format }
}

// Whether a Bash command names the result store or the capture folder by path, runs the commands
// that print where results are, or changes into DataTug's folder. `home` is the literal home path
// when known.
export function bashNamesStore(command, home) {
  const s = String(command ?? '')
  if (/\.datatug\/query-results|\/datatug-claude-mod|\.datatug\/[*?[]/.test(s)) return true
  const homes = ['~', '\\$HOME', '\\$\\{HOME\\}']
  if (typeof home === 'string' && home.startsWith('/') && home.length > 1) homes.push(home.replace(/\/+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const base = `(?:${homes.join('|')})\\/\\.datatug`
  if (new RegExp(`${base}(?:\\/?[*?[]|\\/query-results)`).test(s)) return true
  if (new RegExp(`(?:^|[\\s;&|(])(?:cd|pushd)\\s+['"]?${base}(?:\\/|['"]?(?:\\s|$|[;&|)]))`).test(s)) return true
  return allCalls(s).some(words => has(words, ['query', 'results', 'locate']) || (has(words, ['daemon', 'url']) && words.some(w => isFlag(w, '--result'))))
}

// A path as written, made absolute and folded: `~`, `$HOME` and `${HOME}` expanded, relative paths
// taken from `cwd`, `.` and `..` removed, no trailing slash. Null when it cannot be placed.
export function normalizePath(path, home, cwd) {
  let p = String(path ?? '').trim()
  if (p === '') return null
  const h = typeof home === 'string' && home.startsWith('/') ? home.replace(/\/+$/, '') : null
  const m = /^(~|\$HOME|\$\{HOME\})(?=\/|$)/.exec(p)
  if (m !== null) {
    if (h === null) return null
    p = h + p.slice(m[0].length)
  }
  if (!p.startsWith('/')) {
    if (typeof cwd !== 'string' || !cwd.startsWith('/')) return null
    p = `${cwd.replace(/\/+$/, '')}/${p}`
  }
  const parts = []
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `/${parts.join('/')}`
}

// Whether a folded path is one of the protected folders, inside one, or the folder directly above
// one (a recursive search there walks into it). `roots`: [{ dir, parent }].
export function pathInStore(path, roots) {
  if (typeof path !== 'string') return false
  return roots.some(({ dir, parent }) => path === dir || path.startsWith(`${dir}/`) || path === parent)
}
