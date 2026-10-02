import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import {
  citableSources, findCitations, insertGroundingMarkers, listableSources, siteLabel, stripCitationMarkers
} from '../src/app/ui/citations/citation-model.js';
import {
  applyCitationPills, copyableAnswerText, refreshSiteNames, replySourcesButtonHTML, sourcesButtonHTML, sourcesOfPill, watchCitations
} from '../src/app/ui/citations/citation-pills.js';
import { knownSiteName, loadSiteNames, onSiteNames, resetSiteNames } from '../src/app/ui/citations/site-names.js';
import { createSourceItem, formatSourceDate } from '../src/app/ui/citations/source-list.js';
import { closeSourceSheet, decideSheetDrag, openSourceSheet } from '../src/app/ui/citations/source-sheet.js';
import { formatSandboxRunBlock, normalizeSandboxRun, summarizeSandboxRunText } from '../src/app/ui/sandbox/sandbox-run-block.js';
import { sandboxText } from '../src/app/runtime/sandbox/sandbox-texts.js';
import { createGeminiCollector } from '../src/app/legacy-runtime/features/tool-call-formats.js';

const sources = [
  { n: 1, title: 'Security - Vercel', url: 'https://vercel.com/security', date: '2026-09-28' },
  { n: 2, title: 'WAF Rate Limiting', url: 'https://vercel.com/docs/waf', snippet: 'Rate limits for requests' },
  { n: 3, title: 'JWT Claims | Supabase Docs', url: 'https://supabase.com/docs/jwt' },
  { title: 'No number', url: 'https://old.example/page' }
];

test('only sources with a number can be cited, and a list has every page once, the numbered ones first', () => {
  assert.deepEqual(citableSources(sources).map((source) => source.n), [1, 2, 3]);
  assert.deepEqual(citableSources([{ n: 2, url: 'https://a.example/' }, { n: 2, url: 'https://b.example/' }, { n: 0, url: 'https://c.example/' }, { n: 1 }]).map((source) => source.url), ['https://a.example/']);
  const merged = listableSources([{ title: 'old', url: 'https://old.example/' }, { n: 2, url: 'https://b.example/' }, { n: 1, url: 'https://a.example/' }, { n: 1, url: 'https://a.example/', read: true }, { url: 'javascript:alert(1)' }]);
  assert.deepEqual(merged.map((source) => source.url), ['https://a.example/', 'https://b.example/', 'https://old.example/']);
  assert.equal(siteLabel(sources[0], new Map([['vercel.com', 'Vercel']])), 'Vercel');
  assert.equal(siteLabel(sources[0], new Map()), 'vercel.com');
});

test('citations are found as written, in a row, and links, references and indexes are not citations', () => {
  assert.deepEqual(findCitations('A [1]. B [2][3] and [1, 4].').map((citation) => citation.numbers), [[1], [2, 3], [1, 4]]);
  assert.deepEqual(findCitations('See [1](https://x.example) and [2]: note and arr[3] and \\[4]'), [], 'a link, a reference, an index and an escaped bracket');
  assert.equal(findCitations('天氣晴朗[2]。').length, 1, 'after a character of a script written without spaces');
  const text = 'Hello [1]. World [1][2] and [9] and arr[2] 天氣[3]。';
  assert.equal(stripCitationMarkers(text, sources), 'Hello. World and [9] and arr[2] 天氣。', 'only the sources the reply has; the space before goes too');
  assert.equal(stripCitationMarkers(text, []), text, 'with no sources nothing is taken out');
});

test('Gemini\'s supports put the markers after the words they support', () => {
  const text = 'Alpha beta. Gamma delta. Plain';
  const supports = [{ text: 'Alpha beta.', urls: ['u1'] }, { text: 'Gamma delta.', urls: ['u2', 'u1'] }, { text: 'not there', urls: ['u1'] }, { text: 'Plain', urls: ['u3'] }];
  const numbers = { u1: 1, u2: 2, u3: 3 };
  assert.equal(insertGroundingMarkers(text, supports, (url) => numbers[url] || 0), 'Alpha beta.[1] Gamma delta.[1][2] Plain [3]');
  assert.equal(insertGroundingMarkers(text, [], () => 0), text);
  assert.equal(insertGroundingMarkers(text, [{ text: 'Alpha beta.', urls: ['unknown'] }], () => 0), text, 'a page without a number is not cited');
  // What it wrote reads back as citations of those numbers.
  assert.deepEqual(findCitations('Plain [3]').map((citation) => citation.numbers), [[3]]);
});

test('the Gemini collector reports which words each page supports, once', () => {
  const collector = createGeminiCollector();
  const metadata = {
    groundingChunks: [{ web: { uri: 'https://a.example/1', title: 'A' } }, { web: { uri: 'https://b.example/2', title: 'B' } }],
    groundingSupports: [{ segment: { text: 'First claim.' }, groundingChunkIndices: [0] }, { segment: { text: 'Second claim.' }, groundingChunkIndices: [0, 1] }, { segment: { text: 'No page.' }, groundingChunkIndices: [] }]
  };
  collector.add({ candidates: [{ content: { parts: [{ text: 'First claim. Second claim.' }] }, groundingMetadata: metadata }] });
  collector.add({ candidates: [{ content: { parts: [] }, groundingMetadata: metadata }] });
  const { supports, sources: pages } = collector.result();
  assert.deepEqual(supports, [{ text: 'First claim.', urls: ['https://a.example/1'] }, { text: 'Second claim.', urls: ['https://a.example/1', 'https://b.example/2'] }]);
  assert.deepEqual(pages.map((page) => page.url), ['https://a.example/1', 'https://b.example/2']);
});

const dom = (html = '') => {
  const window = new Window({ url: 'https://noureon.test/' });
  window.document.body.innerHTML = html;
  return window;
};

test('citations in an answer become labels with the site and a count, and code, links and unknown numbers are left', () => {
  resetSiteNames();
  const window = dom('<p>Claim [1]. Two together [2][3]. Code <code>[1]</code> link <a href="https://x.example">[1]</a> unknown [9] <span class="katex">[1]</span>.</p>');
  const root = window.document.body;
  assert.equal(applyCitationPills(root, sources, { document: window.document, language: 'en' }), 2);
  const pills = [...root.querySelectorAll('button.cite-pill')];
  assert.deepEqual(pills.map((pill) => pill.dataset.host), ['vercel.com', 'vercel.com']);
  assert.equal(pills[0].querySelector('.cite-pill-name').textContent, 'vercel.com');
  assert.equal(pills[0].querySelector('.cite-pill-more'), null);
  assert.equal(pills[1].querySelector('.cite-pill-more').textContent, '+1', 'two sources: the first one and how many more');
  assert.equal(pills[0].querySelector('img').getAttribute('src'), '/api/site-icon?host=vercel.com');
  assert.deepEqual(sourcesOfPill(pills[1]).map((source) => [source.n, source.url]), [[2, 'https://vercel.com/docs/waf'], [3, 'https://supabase.com/docs/jwt']]);
  assert.deepEqual(sourcesOfPill(pills[0])[0], { n: 1, title: 'Security - Vercel', url: 'https://vercel.com/security', date: '2026-09-28' });
  assert.equal(root.querySelector('code').textContent, '[1]');
  assert.equal(root.querySelector('a').textContent, '[1]');
  assert.match(root.textContent, /unknown \[9\]/);
  assert.equal(root.querySelector('.katex').textContent, '[1]');
  assert.doesNotMatch(root.textContent, /\[[23]\]/, 'the cited ones are gone from the text');
  assert.equal(applyCitationPills(root, sources, { document: window.document }), 0, 'drawing it again makes no more');
  assert.equal(applyCitationPills(root, [], { document: window.document }), 0, 'no sources, no labels');
  assert.equal(sourcesOfPill({ dataset: { cite: 'not json' } }).length, 0);
  assert.equal(sourcesOfPill({ dataset: { cite: JSON.stringify([{ u: 'javascript:alert(1)' }]) } }).length, 0, 'only web addresses');
  window.close();
});

test('while an answer streams its citations are turned into labels as the text changes', async () => {
  const window = dom('<div id="answer"></div>');
  const root = window.document.getElementById('answer');
  const stop = watchCitations(root, () => sources, { document: window.document, language: 'en' });
  root.innerHTML = '<p>First [1]</p>';
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(root.querySelectorAll('.cite-pill').length, 1);
  root.innerHTML = '<p>First [1]. Next [2]</p>';
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(root.querySelectorAll('.cite-pill').length, 2);
  stop();
  root.innerHTML = '<p>Later [3]</p>';
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(root.querySelectorAll('.cite-pill').length, 0, 'stopped');
  window.close();
});

test('site names are asked for once, kept, shown in the labels already on the page, and a failure leaves the address', async () => {
  resetSiteNames();
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return { ok: true, json: async () => ({ names: { 'vercel.com': 'Vercel', 'supabase.com': ' Supabase ' } }) }; };
  let told = 0;
  const stop = onSiteNames(() => { told += 1; });
  await loadSiteNames(['vercel.com', 'supabase.com', 'vercel.com', 'plain.example'], { fetchImpl });
  assert.deepEqual(calls, ['/api/site-info?hosts=vercel.com%2Csupabase.com%2Cplain.example']);
  assert.equal(knownSiteName('vercel.com'), 'Vercel');
  assert.equal(knownSiteName('supabase.com'), 'Supabase');
  assert.equal(knownSiteName('plain.example'), '', 'a site that gave no name keeps its address');
  assert.equal(told, 1);
  await loadSiteNames(['vercel.com', 'supabase.com'], { fetchImpl });
  assert.equal(calls.length, 1, 'not asked again');
  const window = dom('<span class="cite-pill" data-host="vercel.com"><span class="cite-pill-name">vercel.com</span></span><a class="source-item" data-host="plain.example"><span class="source-item-name">plain.example</span></a>');
  refreshSiteNames(window.document);
  assert.equal(window.document.querySelector('.cite-pill-name').textContent, 'Vercel');
  assert.equal(window.document.querySelector('.source-item-name').textContent, 'plain.example');
  resetSiteNames();
  await loadSiteNames(['broken.example'], { fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(knownSiteName('broken.example'), '');
  await loadSiteNames(['bad.example'], { fetchImpl: async () => ({ ok: false }) });
  stop();
  resetSiteNames();
  window.close();
});

test('a row of the list is a link to the page with its site, title, date and, in the panel, the start of its text', () => {
  resetSiteNames();
  const window = dom();
  const row = createSourceItem(window.document, { n: 1, title: 'Security - Vercel', url: 'https://vercel.com/security', date: '2026-09-28', snippet: 'Rate limits for requests' }, { language: 'en', detailed: true });
  assert.equal(row.tagName, 'A');
  assert.equal(row.getAttribute('href'), 'https://vercel.com/security');
  assert.equal(row.getAttribute('target'), '_blank');
  assert.match(row.getAttribute('rel'), /noopener/);
  assert.equal(row.querySelector('.source-item-name').textContent, 'vercel.com');
  assert.equal(row.querySelector('.source-item-title').textContent, 'Security - Vercel');
  assert.equal(row.querySelector('.source-item-date').textContent, 'September 28, 2026');
  assert.equal(row.querySelector('.source-item-snippet').textContent, 'Rate limits for requests');
  const plain = createSourceItem(window.document, { title: '', url: 'https://x.example/p' }, { language: 'en' });
  assert.equal(plain.querySelector('.source-item-title').textContent, 'x.example', 'no title: the address');
  assert.equal(plain.querySelector('.source-item-date'), null);
  assert.equal(plain.querySelector('.source-item-snippet'), null);
  assert.equal(formatSourceDate('2026-09-28', 'zh-TW'), '2026年9月28日');
  assert.equal(formatSourceDate('soon'), '');
  window.close();
});

test('the sheet says how many sources, lists them as links, and closes by its button, the Escape key or a tap outside', async () => {
  resetSiteNames();
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    const window = dom('<button id="opener">open</button>');
    const { document } = window;
    document.getElementById('opener').focus();
    let closed = 0;
    const sheet = openSourceSheet({ document, sources: sources.slice(0, 2), language, onClose: () => { closed += 1; } });
    const root = document.querySelector('.source-sheet-root');
    assert.ok(root);
    assert.equal(root.querySelector('.source-sheet-title').textContent, sandboxText(language, 'citeSources', { n: 2 }));
    assert.equal(root.querySelectorAll('a.source-item').length, 2);
    assert.ok(root.querySelector('.source-sheet-close'), 'a sheet of one label has a close button');
    assert.equal(document.documentElement.classList.contains('source-sheet-open'), true);
    root.querySelector('.source-sheet-close').click();
    assert.equal(closed, 1);
    assert.equal(document.documentElement.classList.contains('source-sheet-open'), false);

    openSourceSheet({ document, sources: sources.slice(0, 2), language });
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(document.documentElement.classList.contains('source-sheet-open'), false, 'Escape');
    openSourceSheet({ document, sources: sources.slice(0, 2), language });
    [...document.querySelectorAll('.source-sheet-backdrop')].at(-1).click();
    assert.equal(document.documentElement.classList.contains('source-sheet-open'), false, 'a tap outside');
    sheet.close();
    window.close();
  }
});

test('the sheet of a whole reply is headed "Sources" without a close button, and only one is open at a time', () => {
  const window = dom();
  const { document } = window;
  openSourceSheet({ document, sources, all: true, language: 'en' });
  const root = document.querySelector('.source-sheet-root');
  assert.equal(root.querySelector('.source-sheet-title').textContent, 'Sources');
  assert.equal(root.querySelector('.source-sheet-close'), null);
  assert.ok(root.querySelector('.source-sheet').classList.contains('is-all'));
  openSourceSheet({ document, sources, language: 'en' });
  assert.equal(document.documentElement.classList.contains('source-sheet-open'), true);
  closeSourceSheet();
  assert.equal(document.documentElement.classList.contains('source-sheet-open'), false);
  window.close();
});

test('what a pull on the sheet ends in', () => {
  assert.equal(decideSheetDrag({ dy: 200 }), 'close');
  assert.equal(decideSheetDrag({ dy: 30, speed: 1 }), 'close', 'a quick flick down');
  assert.equal(decideSheetDrag({ dy: 40 }), 'medium', 'a short pull settles back');
  assert.equal(decideSheetDrag({ state: 'large', dy: 200, expandable: true }), 'medium', 'from full height down to the middle first');
  assert.equal(decideSheetDrag({ state: 'medium', dy: -90, expandable: true }), 'large');
  assert.equal(decideSheetDrag({ state: 'medium', dy: -90, expandable: false }), 'medium', 'a sheet that cannot be pulled up');
});

test('the Sources button shows three of the sites, in every language, and only when there are pages', () => {
  assert.equal(sourcesButtonHTML([], 'en'), '');
  assert.equal(sourcesButtonHTML(undefined, 'en'), '');
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    const html = sourcesButtonHTML([...sources, { n: 5, url: 'https://github.com/a/b' }], language);
    assert.match(html, new RegExp(`class="sources-button-label">${sandboxText(language, 'sourcesTab')}<`));
    assert.equal((html.match(/<img /g) || []).length, 3, 'three sites at most');
    assert.match(html, /\/api\/site-icon\?host=vercel\.com/);
    assert.match(html, /data-sources-button/);
  }
  const message = { parts: [{ text: `${formatSandboxRunBlock({ status: 'done', steps: [], sources })}Answer [1].` }] };
  assert.match(replySourcesButtonHTML(message, 'en'), /sources-button/);
  assert.equal(replySourcesButtonHTML({ parts: [{ text: 'No search.' }] }, 'en'), '');
});

test('a reply is copied without the record of what the model did and without its citation markers', () => {
  const message = { parts: [{ text: `${formatSandboxRunBlock({ status: 'done', steps: [], sources })}Vercel has limits [1]. More [2][3].\n\nEnd [9].` }] };
  assert.equal(copyableAnswerText(message), 'Vercel has limits. More.\n\nEnd [9].');
  assert.equal(copyableAnswerText({ parts: [{ text: 'Plain [1] text' }] }), 'Plain [1] text', 'with no sources a bracket is only a bracket');
});

test('the saved sources keep their number, date and the start of their text, and a later reply is not shown the markers', () => {
  const run = normalizeSandboxRun({ status: 'done', steps: [], sources: [{ title: 'A', url: 'https://a.example/', n: 2, date: '2026-09-28', snippet: '  Some   text  ', read: true }, { title: 'B', url: 'https://b.example/', n: 0 }] });
  assert.deepEqual(run.sources, [
    { title: 'A', url: 'https://a.example/', n: 2, date: '2026-09-28', snippet: 'Some text', read: true },
    { title: 'B', url: 'https://b.example/' }
  ]);
  const text = `${formatSandboxRunBlock({ status: 'done', steps: [], sources: [{ title: 'A', url: 'https://a.example/', n: 1 }] })}It rains [1]. Maybe [4].`;
  assert.match(summarizeSandboxRunText(text), /It rains\. Maybe \[4\]\.$/);
});

test('plainMarkdown takes the marks off a few words and leaves tables alone', async () => {
  const { plainMarkdown } = await import('../src/app/ui/citations/plain-text.js');
  assert.equal(plainMarkdown('## 重點提醒\n- **明天**多雲，*不需*帶傘\n1. 看 [氣象署](https://cwa.gov.tw)\n> 引用 `code` ~~舊~~'), '重點提醒 明天多雲，不需帶傘 看 氣象署 引用 code 舊');
  assert.equal(plainMarkdown('| 日期 | **高溫** |\n|---|---|\n| 週日 | 30 |'), '| 日期 | 高溫 | | 週日 | 30 |');
  assert.equal(plainMarkdown('a_b_c and snake_case_name, 2 * 3 * 4'), 'a_b_c and snake_case_name, 2 * 3 * 4');
  assert.equal(plainMarkdown('---\n***\n'), '');
  assert.equal(plainMarkdown(null), '');
});
