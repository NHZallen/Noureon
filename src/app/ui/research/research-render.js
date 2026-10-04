// A report's Markdown drawn the way the chat draws a message (its own renderer, with formulas and tables), then given what only a report
// has: ids on its headings (the contents and the jumps come from them) and its [n] citations as small grey circles that carry the sources
// they stand for.

const SKIP = new Set(['CODE', 'PRE', 'A', 'BUTTON', 'SCRIPT', 'STYLE', 'TEXTAREA', 'SVG']);
const GROUP = /(?:\[\d{1,4}\](?:\s*,?\s*)?)+/g;

const textNodesIn = (root) => {
  const found = [];
  const visit = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) found.push(child);
      else if (child.nodeType === 1 && !SKIP.has(child.tagName.toUpperCase()) && !child.classList?.contains('katex') && !child.classList?.contains('katex-display')) visit(child);
    }
  };
  visit(root);
  return found;
};

/** The numbers in a run of citations: "[1][3]" is [1, 3]. */
export const numbersOf = (text) => [...String(text).matchAll(/\[(\d{1,4})\]/g)].map((match) => Number(match[1]));

/**
 * Draws the report. `sources` are the report's ({ n, url, title, site, snippet }); a citation of a number nobody gave is left as it is.
 * Resolves { element, headings } where `element` holds the report and `headings` is [{ id, level, text }] in order.
 */
export function renderReport({ markdown, renderer, sources = [], document = globalThis.document, idPrefix = 'rr-h' }) {
  const element = document.createElement('div');
  element.className = 'rr-body prose prose-sm max-w-none';
  element.innerHTML = renderer ? renderer(markdown) : '';
  const known = new Set(sources.map((source) => Number(source.n)));
  for (const node of textNodesIn(element)) {
    const text = node.nodeValue;
    if (!text.includes('[')) continue;
    GROUP.lastIndex = 0;
    let cursor = 0;
    let match;
    const pieces = [];
    while ((match = GROUP.exec(text))) {
      const numbers = numbersOf(match[0]).filter((n) => known.has(n));
      if (!numbers.length) continue;
      if (match.index > cursor) pieces.push(document.createTextNode(text.slice(cursor, match.index)));
      const mark = document.createElement('sup');
      mark.className = 'rr-cite';
      mark.dataset.cite = numbers.join(',');
      mark.tabIndex = 0;
      mark.textContent = String(numbers[0]);
      pieces.push(mark);
      cursor = match.index + match[0].length;
    }
    if (!pieces.length) continue;
    if (cursor < text.length) pieces.push(document.createTextNode(text.slice(cursor)));
    node.replaceWith(...pieces);
  }
  const headings = [];
  element.querySelectorAll('h1, h2, h3').forEach((heading, index) => {
    heading.id = `${idPrefix}-${index}`;
    headings.push({ id: heading.id, level: Number(heading.tagName[1]), text: heading.textContent.trim() });
  });
  return { element, headings };
}
