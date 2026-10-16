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
const RESERVED = new Set(['then', 'do', 'else', 'elif', 'while', 'until', 'if', '!', '{'])
// Words that run the command they are given, with options of their own before it.
// Compared by the word's basename, ignoring case (`/usr/bin/env` is env). zsh's precommand
// modifiers (`noglob`, `nocorrect`, `-`) and `repeat N` are among them.
const WRAPPERS = new Set(['env', 'time', 'timeout', 'gtimeout', 'nice', 'nohup', 'stdbuf', 'caffeinate', 'watch', 'command', 'exec', 'sudo', 'doas', 'xargs', 'builtin', 'script', 'unbuffer', 'npx', 'chronic', 'ionice', 'taskset', 'flock', 'setsid', 'noglob', 'nocorrect', '-', 'repeat', 'arch', 'coproc', 'ltrace', 'strace', 'sandbox-exec'])
// Commands whose words are never run: a `datatug ... query run` among their arguments is text.
const READERS = new Set(['echo', 'printf', 'rg', 'grep', 'egrep', 'fgrep', 'git', 'gh', 'specscore', 'man', 'which', 'type', 'whatis', 'apropos'])
const base = w => String(w).toLowerCase().replace(/^.*\//, '')
// Options of another command after which the next word is a command (`find ... -exec`).
const EXEC_OPTIONS = new Set(['-exec', '-execdir', '-ok', '-okdir'])
const ASSIGNMENT = /^[A-Za-z_]\w*=/
// The datatug command: a path ending in it, zsh's `=datatug`, in any case (macOS disks ignore case).
const DATATUG = /^=?(?:.*\/)?datatug$/i

// A double-quoted part that substitutes a command (`$(` or a backtick) is made plain text: the shell
// runs what is inside it, so it is looked at as commands.
export function unsubstitute(text) {
  const s = String(text ?? '')
  let out = ''
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '\\') {
      out += s.slice(i, i + 2)
      i += 2
      continue
    }
    if (c === "'") {
      const end = s.indexOf("'", i + 1)
      const stop = end < 0 ? s.length : end + 1
      out += s.slice(i, stop)
      i = stop
      continue
    }
    if (c === '"') {
      let j = i + 1
      while (j < s.length && s[j] !== '"') j += s[j] === '\\' ? 2 : 1
      const stop = Math.min(s.length, j + 1)
      const part = s.slice(i + 1, Math.min(j, s.length))
      out += /\$\(|`/.test(part) ? ` ${part} ` : s.slice(i, stop)
      i = stop
      continue
    }
    out += c
    i++
  }
  return out
}

// Splits text into words and separators as the shell reads them: quotes and backslashes are removed
// from a word (`'query'`, `"run"` and `\datatug` are the words query, run and datatug), and a quoted
// space does not end one. `$(` is one separator; `<` and `>` count as separators too, so a word after
// a redirection is looked at as a command (safe in the direction that matters).
export function lex(text) {
  const out = []
  let word = ''
  let started = false
  const flush = () => {
    if (started) out.push({ word })
    word = ''
    started = false
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '$' && (text[i + 1] === "'" || text[i + 1] === '"')) {
      // `$'...'` (ANSI-C quoting, escapes decoded) and `$"..."` (a locale string) are quotes too.
      if (text[i + 1] === '"') continue
      let j = i + 2
      while (j < text.length && text[j] !== "'") {
        if (text[j] === '\\' && j + 1 < text.length) {
          const m = /^(?:x([0-9a-fA-F]{1,2})|u([0-9a-fA-F]{1,4})|U([0-9a-fA-F]{1,8})|([0-7]{1,3})|(.))/s.exec(text.slice(j + 1))
          const code = m[1] ?? m[2] ?? m[3]
          const named = { n: '\n', t: '\t', r: '\r', a: '\u0007', b: '\b', e: '\u001b', E: '\u001b', f: '\f', v: '\v' }
          word += code !== undefined ? String.fromCodePoint(parseInt(code, 16) || 0) : m[4] !== undefined ? String.fromCharCode(parseInt(m[4], 8)) : (named[m[5]] ?? m[5])
          j += 1 + m[0].length
        } else word += text[j++]
      }
      started = true
      i = j
    } else if (c === '\\') {
      if (text[i + 1] === '\n') {
        i++
        continue
      }
      if (i + 1 < text.length) word += text[++i]
      started = true
    } else if (c === "'") {
      const end = text.indexOf("'", i + 1)
      const stop = end < 0 ? text.length : end
      word += text.slice(i + 1, stop)
      started = true
      i = stop
    } else if (c === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\' && j + 1 < text.length) {
          word += text[j + 1]
          j += 2
        } else word += text[j++]
      }
      started = true
      i = j
    } else if (c === ' ' || c === '\t') {
      flush()
    } else if (c === '$' && text[i + 1] === '(') {
      flush()
      out.push({ sep: '$(' })
      i++
    } else if ('\n\r;&|()`{}!<>'.includes(c)) {
      // `{`, `}` and `!` are separators only as words of their own.
      if ('{}!'.includes(c) && (started || (text[i + 1] !== undefined && !' \t\n'.includes(text[i + 1])))) {
        word += c
        started = true
        continue
      }
      flush()
      out.push({ sep: c })
    } else {
      word += c
      started = true
    }
  }
  flush()
  return out
}

// The words after `datatug` of each datatug command in command position: at the start, after a
// separator or a reserved word, after `VAR=` assignments, as the command a wrapper runs (its
// options and their values skipped), or after `-exec`. `firstOnly` looks at the first command only.
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
    const w = it.word
    if (EXEC_OPTIONS.has(w)) {
      atCommand = true
      wrapped = true
      continue
    }
    if (!atCommand) continue
    if (DATATUG.test(w)) {
      const words = []
      for (let j = i + 1; j < items.length && items[j].sep === undefined; j++) words.push(items[j].word)
      calls.push(words)
      atCommand = false
      continue
    }
    if (wrapped || RESERVED.has(w) || ASSIGNMENT.test(w)) continue
    if (WRAPPERS.has(base(w))) {
      wrapped = true
      continue
    }
    atCommand = false
  }
  return calls
}

const has = (words, seq) => words.some((_, i) => seq.every((s, k) => words[i + k] === s))

// Every datatug command the text runs, by both detectors: command position in the text as the shell
// reads it, and the first command of each line as written (a heredoc body).
function allCalls(text) {
  const s = String(text ?? '')
  return [...datatugCalls(unsubstitute(s), false), ...s.split(/[\n\r]/).flatMap(line => datatugCalls(line, true))]
}

// The command's words as the shell reads them, joined by spaces: quotes and backslashes removed.
const flat = text => lex(unsubstitute(String(text ?? ''))).map(x => x.word ?? ` ${x.sep} `).join(' ')

// Whether a command runs `datatug ... query run`.
export function runsQuery(text) {
  return allCalls(text).some(words => has(words, ['query', 'run']))
}

// The default that keeps unknown forms out: whether any simple command (split at separators and
// lines) holds the word datatug, in any case or as a path, followed later by the words of `seq`
// (`query` then `run`, ...), unless that command is one that never runs its words (`echo`, `rg`,
// `git`, ...). Used when the detectors above did not find the command, so a wrapper they do not know
// is denied rather than run.
export function mentions(text, seq) {
  const items = lex(unsubstitute(String(text ?? '')))
  const commands = [[]]
  for (const it of items) {
    if (it.sep !== undefined) commands.push([])
    else commands[commands.length - 1].push(it.word.toLowerCase())
  }
  return commands.some(words0 => {
    // A comment ends the command.
    const hash = words0.findIndex(w => w.startsWith('#'))
    const words = hash < 0 ? words0 : words0.slice(0, hash)
    if (words.length > 0 && READERS.has(base(words[0]))) return false
    const at = words.findIndex(w => DATATUG.test(w))
    if (at < 0) return false
    let k = 0
    for (const w of words.slice(at + 1)) if ((w === seq[k] || (seq[k].startsWith('--') && w.startsWith(`${seq[k]}=`))) && ++k === seq.length) return true
    return false
  })
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
  const deny = { kind: 'deny', reason: PLAIN_TEXT }
  if (!runsQuery(text)) return mentions(text, ['query', 'run']) ? deny : { kind: 'none' }
  const t = text.trim()
  const toks = SHELL.test(t) ? null : tokens(t)
  // A word the shell would expand (a brace, a wildcard) could become a flag after the check.
  if (toks === null || toks.some(x => !x.quoted && /[{}*?[\]]/.test(x.value))) return deny
  let at = 0
  while (at < toks.length && !toks[at].quoted && (toks[at].value === 'env' || toks[at].value === 'time' || ASSIGNMENT.test(toks[at].value))) at++
  // $DATATUG_CLIENT is the CLI's fallback for --client.
  if (toks.slice(0, at).some(x => /^DATATUG_CLIENT=/i.test(x.value))) return deny
  if (at >= toks.length || toks[at].quoted || !DATATUG.test(toks[at].value)) return deny
  let q = at + 1
  while (q + 1 < toks.length && !(toks[q].value === 'query' && toks[q + 1].value === 'run' && !toks[q].quoted && !toks[q + 1].quoted)) q++
  if (q + 1 >= toks.length) return deny
  const global = toks.slice(at + 1, q)
  if (global.some(x => x.quoted || isFlag(x.value, '--client'))) return deny
  const rest = toks.slice(q + 2)
  if (rest.length > 0 && rest.every(x => !x.quoted && HELP.has(x.value))) return { kind: 'help' }
  if (isBackground) return { kind: 'deny', reason: BACKGROUND_TEXT }
  // Quoted or not: the shell removes the quotes, and the CLI gets the flag.
  for (const x of rest) {
    if (HELP.has(x.value) || x.value === '--') return deny
    if (['--result-id', '--result-rows', '--client'].some(name => isFlag(x.value, name))) return deny
  }
  let format = null
  for (let i = 0; i < rest.length; i++) {
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
  const raw = String(command ?? '')
  const homes = ['~[A-Za-z0-9._-]*', '\\$HOME', '\\$\\{HOME\\}']
  if (typeof home === 'string' && home.startsWith('/') && home.length > 1) homes.push(home.replace(/\/+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const base = `(?:${homes.join('|')})\\/\\.datatug`
  // Any path into the home folder's .datatug (the folder above the store, which a recursive command
  // walks into), the store or the capture folder by name, or a wildcard after `.datatug/`. Judged on
  // the command as written and as the shell reads it, ignoring case (macOS folders ignore it).
  const patterns = [
    /\.datatug\/query-results/i,
    /\/datatug-claude-mod/i,
    /\/datatug-claude[^\s/;&|()<>]*[*?[]/i,
    /\.datatug\/[^\s;&|()<>]*[*?[]/i,
    new RegExp(`${base}(?=$|[\\/\\s;&|()<>'"*?[{])`, 'i'),
    new RegExp(`(?:^|[\\s;&|(])(?:cd|pushd)\\s+['"]?${base}`, 'i'),
  ]
  for (const s of [raw, flat(raw)]) if (patterns.some(p => p.test(s) || p.test(foldPaths(s)))) return true
  if (mentions(raw, ['query', 'results', 'locate']) || mentions(raw, ['daemon', 'url', '--result']) || mentions(raw, ['ui', '--result'])) return true
  return allCalls(raw).some(
    words =>
      has(words, ['query', 'results', 'locate']) ||
      ((has(words, ['daemon', 'url']) || words[0] === 'ui' || has(words, ['ui'])) && words.some(w => isFlag(w, '--result'))),
  )
}

// The text with every path folded as the file system reads it: `//` made `/`, `/./` removed and
// `/name/../` taken back, so `~//.datatug` or `/Users/u/./.datatug` reads as `~/.datatug`.
export function foldPaths(text) {
  let s = String(text ?? '').replace(/\/{2,}/g, '/')
  let prev
  do {
    prev = s
    s = s.replace(/\/\.(?=\/|$|[\s;&|()<>'"])/g, '').replace(/\/(?!\.\.(?:\/|$))[^/\s;&|()<>'"]+\/\.\.(?=\/|$|[\s;&|()<>'"])/g, '')
  } while (s !== prev)
  return s
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
  // Case is ignored: the folders of a macOS disk ignore it.
  const p = path.toLowerCase()
  return roots.some(({ dir, parent }) => {
    const d = dir.toLowerCase()
    return p === d || p.startsWith(`${d}/`) || p === parent.toLowerCase()
  })
}
