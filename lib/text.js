// Makes text that comes from a project file or from the CLI safe to show:
// pure, and the one place that decides what "safe" means.

// C0 controls (with tab, newline and carriage return), DEL, C1 controls, the
// soft hyphen, bidirectional controls, the line and paragraph separators,
// zero-width and invisible formatting characters, the byte order mark and the
// tag block. Built with `new RegExp` and the `u` flag so the astral range
// works.
const UNSAFE = new RegExp(
  '[\u0000-\u001f\u007f-\u009f­؜᠎​-‏‪-‮⁠-⁤⁦-⁩  ﻿\u{e0000}-\u{e007f}]',
  'gu',
)

// Cuts text to `maxLength` code points, with an ellipsis as the last one when
// it was cut. Never splits a surrogate pair.
export function truncate(text, maxLength) {
  const points = Array.from(text)
  return points.length > maxLength ? points.slice(0, maxLength - 1).join('') + '…' : text
}

export function cleanText(value, maxLength = 200) {
  if (typeof value !== 'string') return ''
  return truncate(value.replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim(), maxLength)
}
