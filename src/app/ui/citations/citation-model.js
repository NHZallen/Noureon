// The sources a reply cites and the markers that cite them, as plain functions. A source is `{ n, title, url, date?,
// snippet?, read? }`: `n` is the number the model was told it by (the results it was shown were numbered), and the
// model cites with `[n]` right after the sentence a source supports. The markers are in the saved text; what shows is a
// small label with the site's icon and name (citation-pills.js).

import { displayHost, mergeSources } from '../sandbox/run-sources.js';

// `[3]`, `[3][5]` and `[3, 5]` in a row, as one citation.
const CLUSTER = /(?:\[\d{1,3}(?:\s*[,，、]\s*\d{1,3})*\])+/g;

/** The sources that can be cited: those with a number, once each, in order of number. */
export function citableSources(sources) {
  const byNumber = new Map();
  for (const source of Array.isArray(sources) ? sources : []) {
    const n = Number(source?.n);
    if (Number.isInteger(n) && n > 0 && source?.url && !byNumber.has(n)) byNumber.set(n, source);
  }
  return [...byNumber.entries()].sort((a, b) => a[0] - b[0]).map(([, source]) => source);
}

/**
 * Every page a reply looked at, once each, for the list (the "Sources" button, the panel, the sheet): the ones with a
 * number in order of number, then any without one (replies saved before pages were numbered) in the order found.
 */
export function listableSources(sources) {
  const merged = mergeSources(Array.isArray(sources) ? sources : []).filter((source) => /^https?:\/\//i.test(String(source?.url || '')));
  const numbered = merged.filter((source) => Number(source.n) > 0).sort((a, b) => Number(a.n) - Number(b.n));
  return [...numbered, ...merged.filter((source) => !(Number(source.n) > 0))];
}

/** The numbers of a matched citation, once each, in the order written. */
export const numbersOf = (cluster) => [...new Set([...String(cluster).matchAll(/\d{1,3}/g)].map((match) => Number(match[0])))];

/** Where each citation is in `text`: [{ start, end, numbers }]. A link (`[1](…)`) or a reference (`[1]: …`) is not one. */
export function findCitations(text) {
  const found = [];
  const value = String(text || '');
  for (const match of value.matchAll(CLUSTER)) {
    const start = match.index;
    const end = start + match[0].length;
    // `arr[2]` and `x[1]` are not citations: a citation follows a space, a stop or a character of a script written without spaces.
    if (value[start - 1] === '\\' || /[A-Za-z0-9_]/.test(value[start - 1] || '') || value[end] === '(' || value[end] === ':') continue;
    found.push({ start, end, numbers: numbersOf(match[0]) });
  }
  return found;
}

/** The text with the citations of `sources` taken out (and the space before each), as it reads without them. */
export function stripCitationMarkers(text, sources) {
  const valid = new Set(citableSources(sources).map((source) => Number(source.n)));
  const value = String(text || '');
  if (valid.size === 0) return value;
  let out = '';
  let cursor = 0;
  for (const citation of findCitations(value)) {
    if (!citation.numbers.every((n) => valid.has(n))) continue;
    let from = citation.start;
    if (value[from - 1] === ' ') from -= 1;
    out += value.slice(cursor, from);
    cursor = citation.end;
  }
  return out + value.slice(cursor);
}

/** The name shown for a source: the one its site gave itself when it is known, else its address. */
export const siteHost = (source) => displayHost(source) || '';
export const siteLabel = (source, names) => (names?.get?.(siteHost(source)) || '') || siteHost(source);

/**
 * Gemini says which words of its answer a source supports (`groundingSupports`), not where in the text: the words are
 * found in the text and the markers go after them. `supports`: [{ text, urls: [url, …] }]; `numberOf(url)` is the
 * number of a source (or 0). Each marker group goes after the first place its words are found past the last one.
 */
export function insertGroundingMarkers(text, supports, numberOf) {
  const value = String(text || '');
  const inserts = [];
  let cursor = 0;
  for (const support of Array.isArray(supports) ? supports : []) {
    const words = String(support?.text || '').trim();
    if (!words) continue;
    const at = value.indexOf(words, cursor);
    if (at < 0) continue;
    const numbers = [...new Set((support.urls || []).map((url) => numberOf(url)).filter((n) => n > 0))].sort((a, b) => a - b);
    cursor = at + words.length;
    if (numbers.length) inserts.push({ at: cursor, marker: `${/[A-Za-z0-9_]$/.test(words) ? ' ' : ''}${numbers.map((n) => `[${n}]`).join('')}` });
  }
  let out = '';
  let last = 0;
  for (const { at, marker } of inserts) {
    out += value.slice(last, at) + marker;
    last = at;
  }
  return out + value.slice(last);
}
