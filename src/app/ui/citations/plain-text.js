// A few words of a reply or of a page, with Markdown's marks taken off, for a list that shows only the start of a text (the
// timeline, the sources). Tables are left as they are: their bars are not worth making sense of in a line or two.

const TABLE_LINE = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const unmark = (line) => line
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/<\/?[A-Za-z][^>]*>/g, '')
  .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
  .replace(/(?<![A-Za-z0-9*_])(\*|_)(?=\S)([^*_\n]*?\S)\1(?![A-Za-z0-9*_])/g, '$2')
  .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1')
  .replace(/`+([^`]*)`+/g, '$1')
  .replace(/\*\*|~~/g, '');

/** `text` without headings' hashes, list bullets, quote bars, emphasis, code ticks, link syntax or HTML tags, on one line. */
export function plainMarkdown(text) {
  const lines = String(text ?? '').split('\n');
  const kept = [];
  let fenced = false;
  for (const raw of lines) {
    if (/^\s*(`{3,}|~{3,})/.test(raw)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) {
      kept.push(raw.trim());
      continue;
    }
    if (TABLE_LINE.test(raw)) {
      if (!TABLE_RULE.test(raw)) kept.push(unmark(raw).trim());
      continue;
    }
    if (/^\s*([-*_]\s*){3,}$/.test(raw)) continue;
    kept.push(unmark(raw
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s*>+\s?/, '')
      .replace(/^\s*(?:[-*+]|\d{1,3}[.)])\s+(?:\[[ xX]\]\s+)?/, '')).trim());
  }
  return kept.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
