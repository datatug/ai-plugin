// Makes text that comes from a project file or from the CLI safe to show:
// pure, and the one place that decides what "safe" means.

// C0 controls (with tab, newline and carriage return), DEL, C1 controls,
// bidirectional controls, and the line and paragraph separators.
const UNSAFE = new RegExp('[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029]', 'g')

export function cleanText(value, maxLength = 200) {
  if (typeof value !== 'string') return ''
  const text = value.replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim()
  return text.length > maxLength ? text.slice(0, maxLength - 1) + '…' : text
}
