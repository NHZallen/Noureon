// The small labels that cite a source inside an answer (a round grey label with the site's icon and name, "Vercel +1"
// for several), and the "Sources" button under a reply. The markers `[n]` are in the saved text; here they become labels.
// A label carries the sources it cites, so one listener on the message list (app-bootstrap-lifecycle.js) opens them.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { liftSandboxRunBlock } from '../sandbox/sandbox-run-block.js';
import { siteIconUrl } from '../links/site-icon.js';
import { siteIcon } from '../sandbox/run-sources.js';
import { citableSources, findCitations, listableSources, siteHost, siteLabel, stripCitationMarkers } from './citation-model.js';
import { knownSiteName, loadSiteNames, onSiteNames } from './site-names.js';

const SKIP = new Set(['CODE', 'PRE', 'A', 'BUTTON', 'SCRIPT', 'STYLE', 'TEXTAREA', 'SVG']);
const knownNames = { get: (host) => knownSiteName(host) };

const make = (document, tag, className, text) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** What a label carries about a source (enough to open it and to list it). */
export const citedForm = (source) => ({
  n: Number(source.n),
  t: String(source.title || ''),
  u: String(source.url || ''),
  ...(source.date ? { d: String(source.date) } : {})
});

/** The sources a label carries, back from its attribute ([] when it is damaged). */
export function sourcesOfPill(pill) {
  try {
    const list = JSON.parse(pill?.dataset?.cite || '[]');
    return (Array.isArray(list) ? list : [])
      .filter((item) => /^https?:\/\//i.test(String(item?.u || '')))
      .map((item) => ({ n: Number(item.n), title: String(item.t || ''), url: String(item.u), ...(item.d ? { date: String(item.d) } : {}) }));
  } catch {
    return [];
  }
}

/** One label for a group of sources cited together: the first one's icon and name, and how many more. */
export function createCitePill(document, group, language = 'zh-TW') {
  const first = group[0];
  const host = siteHost(first);
  const button = make(document, 'button', 'cite-pill');
  button.type = 'button';
  button.dataset.cite = JSON.stringify(group.map(citedForm));
  button.dataset.host = host;
  button.title = first.title || host;
  button.setAttribute('aria-label', `${sandboxText(language, 'sourcesTab')}: ${first.title || host}`);
  const icon = siteIcon(document, host, 'cite-pill-icon run-source-icon');
  button.append(icon, make(document, 'span', 'cite-pill-name', siteLabel(first, knownNames)));
  if (group.length > 1) button.append(make(document, 'span', 'cite-pill-more', `+${group.length - 1}`));
  return button;
}

const textNodesIn = (root) => {
  const found = [];
  const visit = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) found.push(child);
      else if (child.nodeType === 1 && !SKIP.has(String(child.tagName).toUpperCase()) && !child.classList?.contains('katex') && !child.classList?.contains('cite-pill') && !child.classList?.contains('ac-chart')) visit(child);
    }
  };
  visit(root);
  return found;
};

/**
 * Turns the citations in the text under `root` into labels, for the sources that can be cited. A citation of numbers none
 * of the sources has stays as written. Returns how many labels were made.
 */
export function applyCitationPills(root, sources, { document = root?.ownerDocument, language = 'zh-TW' } = {}) {
  const byNumber = new Map(citableSources(sources).map((source) => [Number(source.n), source]));
  if (!root || byNumber.size === 0) return 0;
  const hosts = new Set();
  let made = 0;
  for (const node of textNodesIn(root)) {
    const value = node.data;
    if (!value.includes('[')) continue;
    const citations = findCitations(value).map((citation) => ({ ...citation, group: citation.numbers.filter((n) => byNumber.has(n)).map((n) => byNumber.get(n)) })).filter((citation) => citation.group.length > 0);
    if (citations.length === 0) continue;
    const parent = node.parentNode;
    let cursor = 0;
    for (const citation of citations) {
      let from = citation.start;
      if (value[from - 1] === ' ') from -= 1;
      if (from > cursor) parent.insertBefore(document.createTextNode(value.slice(cursor, from)), node);
      parent.insertBefore(createCitePill(document, citation.group, language), node);
      citation.group.forEach((source) => hosts.add(siteHost(source)));
      cursor = citation.end;
      made += 1;
    }
    if (cursor < value.length) parent.insertBefore(document.createTextNode(value.slice(cursor)), node);
    node.remove();
  }
  if (hosts.size) {
    keepSiteNamesFresh(document);
    void loadSiteNames([...hosts]);
  }
  return made;
}

/** Shows the names that arrived in the labels and rows already on the page. */
export function refreshSiteNames(document) {
  document.querySelectorAll('[data-host] .cite-pill-name, [data-host] .source-item-name').forEach((node) => {
    const host = node.closest('[data-host]')?.dataset.host;
    const name = host ? knownSiteName(host) : '';
    if (name && node.textContent !== name) node.textContent = name;
  });
}

let stopNames = null;
/** Keeps the names on the page up to date as they arrive (once for the page). */
export function keepSiteNamesFresh(document) {
  stopNames ||= onSiteNames(() => refreshSiteNames(document));
}

/**
 * While an answer streams its text is drawn again and again; the citations in it are turned into labels each time,
 * before the browser paints, so no `[3]` is ever seen. `getSources()` is read each time. Returns the way to stop.
 */
export function watchCitations(root, getSources, { document = root?.ownerDocument, language = 'zh-TW' } = {}) {
  const View = document?.defaultView;
  if (!root || !View?.MutationObserver) return () => {};
  keepSiteNamesFresh(document);
  const run = () => applyCitationPills(root, getSources(), { document, language });
  const observer = new View.MutationObserver(() => {
    observer.disconnect();
    try {
      run();
    } finally {
      observer.observe(root, { childList: true, subtree: true, characterData: true });
    }
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  run();
  return () => observer.disconnect();
}

/** The "Sources" button under a reply: three of its sites' icons, overlapped, and the word. As markup, for the reply's footer. */
export function sourcesButtonHTML(sources, language = 'zh-TW') {
  const list = listableSources(sources);
  if (list.length === 0) return '';
  const hosts = [...new Set(list.map(siteHost))].filter(Boolean).slice(0, 3);
  const escape = (value) => String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  const icons = hosts.map((host) => `<span class="run-source-icon sources-button-icon"><img src="${escape(siteIconUrl(host))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>`).join('');
  const label = escape(sandboxText(language, 'sourcesTab'));
  return `<button type="button" class="sources-button" data-sources-button title="${label}" aria-label="${label}"><span class="sources-button-icons">${icons}</span><span class="sources-button-label">${label}</span></button>`;
}

/** The "Sources" button for a reply (from the record kept in its text), or '' when it looked at no pages. */
export function replySourcesButtonHTML(message, language = 'zh-TW') {
  const { run } = liftSandboxRunBlock((message?.parts || []).map((part) => part?.text || '').join('\n'));
  return sourcesButtonHTML(run?.sources, language);
}

/** What a reply says, as it is copied: without the record of what the model did and without the citation markers. */
export function copyableAnswerText(message) {
  const { run, text } = liftSandboxRunBlock((message?.parts || []).map((part) => part?.text || '').join('\n'));
  return stripCitationMarkers(text, run?.sources).trim();
}
