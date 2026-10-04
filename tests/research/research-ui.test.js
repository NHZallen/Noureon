import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { registerResearchMode } from '../../src/app/runtime/research/research-bridge.js';
import { resetResearchStore, updateResearch } from '../../src/app/runtime/research/research-store.js';
import { setFileMarkdownRenderer } from '../../src/app/ui/files/file-markdown-cards.js';
import { mountResearchCard } from '../../src/app/ui/research/research-card.js';
import { reportMarkdown, reportFileName } from '../../src/app/ui/research/research-export.js';
import { closeResearchReader, openResearchReader, activityLine } from '../../src/app/ui/research/research-reader.js';
import { numbersOf, renderReport } from '../../src/app/ui/research/research-render.js';

const simpleMarkdown = (text) => String(text)
  .split(/\n{2,}/)
  .map((block) => (/^#{1,3} /.test(block) ? `<h${block.match(/^#+/)[0].length}>${block.replace(/^#+ /, '')}</h${block.match(/^#+/)[0].length}>` : `<p>${block}</p>`))
  .join('');
setFileMarkdownRenderer(simpleMarkdown);

const unmounts = [];
const mount = (args) => { const stop = mountResearchCard(args); unmounts.push(stop); return stop; };
test.after(() => unmounts.forEach((stop) => stop()));

const setup = () => {
  resetResearchStore();
  const window = new Window({ url: 'https://app.test/' });
  const { document } = window;
  globalThis.navigator ??= window.navigator;
  const host = document.createElement('div');
  document.body.append(host);
  const notices = [];
  const controls = [];
  const edits = [];
  registerResearchMode({
    control: async (runId, action, payload) => { controls.push([runId, action, payload]); return { ok: action !== 'pause', code: action === 'pause' ? 'wrong_phase' : null }; },
    beginEdit: async (info) => { edits.push(info); return true; }
  });
  return { window, document, host, notices, controls, edits, showNotification: (text, kind) => notices.push([text, kind]) };
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 10));
const click = (window, element) => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const message = (id, parts) => ({ id, role: 'model', parts });

const plan = (overrides = {}) => ({
  title: 'Battery research',
  topic: 'batteries',
  items: [{ id: 'i1', text: 'Chemistry', state: 'pending' }, { id: 'i2', text: 'Makers', state: 'pending' }],
  phase: 'awaiting',
  stats: { searches: 0, sources: 0, activeMs: 0 },
  clock: Date.now(),
  countdownMs: 60000,
  ...overrides
});

// ----- the plan card

test('the plan card counts down on the server\'s clock, and its buttons act on the run', async () => {
  const { window, host, controls, edits } = setup();
  const m = message('m1', [{ text: '' }, { researchPlan: plan({ startAt: Date.now() + 42_000 }) }]);
  host.innerHTML = '<div class="research-card-host"></div>';
  const cardHost = host.firstChild;
  updateResearch('m1', { runId: 'run-1' });
  mount({ host: cardHost, message: m, getLanguage: () => 'en', showNotification: () => {} });
  assert.match(cardHost.textContent, /Battery research/);
  assert.match(cardHost.textContent, /Chemistry/);
  assert.match(cardHost.textContent, /Deep research has started on “batteries”/, 'the fixed line under the card');
  const secs = Number(cardHost.querySelector('.rc-secs').textContent);
  assert.ok(secs >= 41 && secs <= 42, `about forty-two seconds left, got ${secs}`);
  assert.ok(cardHost.querySelector('.rc-ring-fg'));
  click(window, cardHost.querySelector('[data-act="start"]'));
  await flush();
  click(window, cardHost.querySelector('[data-act="cancel"]'));
  await flush();
  click(window, cardHost.querySelector('[data-act="edit"]'));
  await flush();
  assert.deepEqual(controls, [['run-1', 'start', undefined], ['run-1', 'stop', { mode: 'discard' }]]);
  assert.deepEqual(edits, [{ runId: 'run-1', messageId: 'm1', title: 'Battery research' }]);
});

test('while the person edits the countdown is gone and says why; while the plan is changed the card says so', () => {
  const { host } = setup();
  const m = message('m2', [{ text: '' }, { researchPlan: plan({ editing: true }) }]);
  host.innerHTML = '<div class="research-card-host"></div>';
  mount({ host: host.firstChild, message: m, getLanguage: () => 'fr', showNotification: () => {} });
  assert.equal(host.querySelector('.rc-ring'), null);
  assert.match(host.textContent, /Le compte à rebours est en pause/);
  updateResearch('m2', { plan: plan({ revising: true, clock: Date.now() + 1 }) });
  assert.match(host.textContent, /Modification du plan/);
  assert.equal(host.querySelector('[data-act="start"]'), null);
});

test('a card for a research whose run is not known yet has its buttons off', () => {
  const { host } = setup();
  host.innerHTML = '<div class="research-card-host"></div>';
  mount({ host: host.firstChild, message: message('m3', [{ text: '' }, { researchPlan: plan({ startAt: Date.now() + 5000 }) }]), getLanguage: () => 'en' });
  assert.equal(host.querySelector('[data-act="start"]').disabled, true);
});

// ----- the card while it researches

test('the running card shows the items\' states, the searches and the time, pause and resume, and asks before it stops', async () => {
  const { window, host, controls, notices, showNotification } = setup();
  const running = plan({
    phase: 'researching',
    items: [{ id: 'i1', text: 'Chemistry', state: 'done' }, { id: 'i2', text: 'Makers', state: 'active' }, { id: 'i3', text: 'Cost', state: 'pending' }],
    stats: { searches: 12, sources: 9, activeMs: 65_000 },
    pg: 31,
    running: true,
    clock: Date.now()
  });
  host.innerHTML = '<div class="research-card-host"></div>';
  const cardHost = host.firstChild;
  updateResearch('m4', { runId: 'run-4' });
  mount({ host: cardHost, message: message('m4', [{ text: '' }, { researchPlan: running }]), getLanguage: () => 'en', showNotification });
  assert.equal(cardHost.querySelectorAll('.rc-bullet-done').length, 1);
  assert.equal(cardHost.querySelectorAll('.rc-bullet-active').length, 1);
  assert.equal(cardHost.querySelectorAll('.rc-bullet-pending').length, 1);
  assert.match(cardHost.textContent, /Researching…/);
  assert.match(cardHost.textContent, /12 searches/);
  assert.match(cardHost.textContent, /1m 5s so far/);
  assert.equal(cardHost.querySelector('.rc-progress').getAttribute('aria-valuenow'), '31', 'the bar is the server\'s own count');
  assert.equal(cardHost.querySelector('.rc-pct').textContent, '31%');
  click(window, cardHost.querySelector('[data-act="pause"]'));
  await flush();
  assert.match(notices[0][0], /cannot be done right now/, 'a refusal is told');
  updateResearch('m4', { plan: { ...running, paused: true, running: false, clock: Date.now() + 1 } });
  assert.match(cardHost.textContent, /Paused/);
  click(window, cardHost.querySelector('[data-act="resume"]'));
  await flush();
  const edits = [];
  registerResearchMode({ control: async (runId, action, payload) => { controls.push([runId, action, payload]); return { ok: true }; }, beginEdit: async (info) => { edits.push(info); return true; } });
  click(window, cardHost.querySelector('[data-act="steer"]'));
  await flush();
  assert.deepEqual(edits, [{ runId: 'run-4', messageId: 'm4', title: 'Battery research', kind: 'steer' }], 'the card offers to add an instruction');
  updateResearch('m4', { plan: { ...running, steers: 2, clock: Date.now() + 2 } });
  assert.match(cardHost.textContent, /2 instructions added/);
  click(window, cardHost.querySelector('[data-act="stop"]'));
  assert.match(cardHost.textContent, /Write a short report from what has been found/);
  assert.ok(cardHost.querySelector('[data-act="stop-report"]'), 'a report can be asked for when an item is done');
  click(window, cardHost.querySelector('[data-act="stop-back"]'));
  assert.equal(cardHost.querySelector('[data-act="stop-report"]'), null);
  click(window, cardHost.querySelector('[data-act="stop"]'));
  click(window, cardHost.querySelector('[data-act="stop-report"]'));
  await flush();
  assert.deepEqual(controls.map((entry) => entry.slice(0, 3)), [['run-4', 'pause', undefined], ['run-4', 'resume', undefined], ['run-4', 'stop', { mode: 'report' }]]);
});

test('with no item done the stop can only discard; a stopped or failed research says so', () => {
  const { window, host } = setup();
  host.innerHTML = '<div class="research-card-host"></div>';
  const cardHost = host.firstChild;
  updateResearch('m5', { runId: 'run-5' });
  mount({ host: cardHost, message: message('m5', [{ text: '' }, { researchPlan: plan({ phase: 'researching', running: true }) }]), getLanguage: () => 'en' });
  click(window, cardHost.querySelector('[data-act="stop"]'));
  assert.equal(cardHost.querySelector('[data-act="stop-report"]'), null);
  assert.ok(cardHost.querySelector('[data-act="stop-discard"]'));
  updateResearch('m5', { plan: plan({ phase: 'failed', error: { code: 'pause_expired', message: 'x' }, clock: Date.now() + 5 }) });
  assert.match(cardHost.textContent, /paused for too long/);
  updateResearch('m5', { plan: plan({ phase: 'stopped', clock: Date.now() + 9 }) });
  assert.match(cardHost.textContent, /Research stopped/);
});

// ----- the report card

const REPORT = {
  title: 'Solid-state batteries',
  topic: 'solid-state batteries',
  text: '# Solid-state batteries\n\n## Summary\n\nCells are close [1].\n\n## Players\n\nMany makers [1][2].\n\n### Detail\n\nMore.',
  stats: { ms: 798_000, searches: 158, citations: 2 },
  sources: [{ n: 1, url: 'https://a.example/x', title: 'A page', site: 'a.example', snippet: 'About cells.' }, { n: 2, url: 'https://b.example/y', title: 'B page', site: 'b.example' }],
  activity: [{ t: 0, type: 'item', text: 'Chemistry' }, { t: 1000, type: 'searching', text: 'Searching: cells' }, { t: 2000, type: 'narration', text: 'Looking at makers' }]
};

test('the report card has its statistics, its title, the start of the text faded out, and a download menu that copies and exports', async () => {
  const { window, host, notices, showNotification } = setup();
  host.innerHTML = '<div class="research-card-host"></div>';
  const cardHost = host.firstChild;
  const opened = [];
  mount({ host: cardHost, message: message('m6', [{ text: '' }, { researchReport: REPORT }]), getLanguage: () => 'en', showNotification, openReader: async (args) => { opened.push(args); } });
  assert.match(cardHost.textContent, /Research completed in 13m 18s · 2 citations · 158 searches/);
  assert.equal(cardHost.querySelector('.rc-report-title').textContent, 'Solid-state batteries');
  assert.match(cardHost.querySelector('.rc-preview').innerHTML, /<h2>Summary<\/h2>/);
  assert.doesNotMatch(cardHost.querySelector('.rc-preview').innerHTML, /\[1\]/, 'the numbers of the sources are left out of the preview');
  assert.ok(cardHost.querySelector('.rc-fade'));
  assert.match(cardHost.textContent, /Deep research has started on “solid-state batteries”/, 'the fixed line stays under the report');
  click(window, cardHost.querySelector('.rc-report-body'));
  click(window, cardHost.querySelector('.rc-report-actions [data-act="expand"]'));
  await flush();
  assert.deepEqual(opened, [{ messageId: 'm6' }, { messageId: 'm6' }]);
  click(window, cardHost.querySelector('[data-act="download-menu"]'));
  assert.deepEqual([...cardHost.querySelectorAll('.rc-menu button')].map((item) => item.dataset.act), ['copy', 'export-md', 'export-docx', 'export-pdf']);
  assert.deepEqual([...cardHost.querySelectorAll('.rc-menu button')].map((item) => item.textContent), ['Copy content', 'Export Markdown', 'Export Word', 'Export PDF']);
  const copied = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async (text) => { copied.push(text); } } } });
  click(window, cardHost.querySelector('[data-act="copy"]'));
  await flush();
  assert.match(copied[0], /## References\n\n\[1\] A page — https:\/\/a\.example\/x/);
  assert.equal(notices.at(-1)[0], 'Copied');
});

test('the reader\'s download menu has the three files, and shows that one is being made', async () => {
  const { window, document } = setup();
  updateResearch('m9', { report: REPORT });
  openResearchReader({ messageId: 'm9', getLanguage: () => 'fr', document });
  const root = document.querySelector('.rr');
  assert.deepEqual([...root.querySelectorAll('.rr-menu-item')].map((item) => item.textContent), ['Copier le contenu', 'Exporter en Markdown', 'Exporter en Word', 'Exporter en PDF']);
  closeResearchReader();
  assert.equal(window.document.querySelector('.rr'), null);
});

test('the Markdown of a report ends with its sources, and its file name is safe', () => {
  assert.equal(reportMarkdown({ text: '# T\n', sources: [] }, 'en'), '# T\n');
  assert.match(reportMarkdown(REPORT, 'zh-TW'), /\n## 參考資料\n\n\[1\] A page — https:\/\/a\.example\/x\n\n\[2\] B page — https:\/\/b\.example\/y\n$/);
  assert.equal(reportFileName({ title: 'A/B: "C"?' }, 'md'), 'A B C.md');
  assert.equal(reportFileName({}, 'md'), 'report.md');
});

// ----- the rendering of a report

test('a report is drawn with ids on its headings and its citations as marks that carry their sources, except in code', () => {
  const { document } = setup();
  const markdown = '# T\n\n## One\n\nA claim [1] and two [1][2] and a stranger [9].\n\n### Sub\n\n<pre>[1]</pre>';
  const { element, headings } = renderReport({ markdown, renderer: (text) => `${simpleMarkdown(text.replace('<pre>[1]</pre>', ''))}<pre>[1]</pre>`, sources: REPORT.sources, document });
  assert.deepEqual(headings.map((heading) => [heading.level, heading.text]), [[1, 'T'], [2, 'One'], [3, 'Sub']]);
  assert.deepEqual(headings.map((heading) => heading.id), ['rr-h-0', 'rr-h-1', 'rr-h-2']);
  const marks = [...element.querySelectorAll('.rr-cite')];
  assert.deepEqual(marks.map((mark) => mark.dataset.cite), ['1', '1,2'], 'a run of marks is one circle for all its sources, a stranger is left as it is');
  assert.match(element.textContent, /stranger \[9\]/);
  assert.equal(element.querySelector('pre').textContent, '[1]', 'code is left alone');
  assert.deepEqual(numbersOf('[1][22], [3]'), [1, 22, 3]);
});

// ----- the reader

test('the reader shows the article with ticks for its sections, the contents on hover, a card for a citation, and closes with Escape', async () => {
  const { window, document, notices, showNotification } = setup();
  updateResearch('m7', { report: REPORT, activityAll: REPORT.activity });
  const reader = openResearchReader({ messageId: 'm7', getLanguage: () => 'en', showNotification, document });
  assert.ok(reader);
  const root = document.querySelector('.rr');
  assert.equal(root.querySelector('.rr-article h1').textContent, 'Solid-state batteries');
  assert.equal(root.querySelectorAll('.rr-tick').length, 3, 'a tick for each section (not the title)');
  assert.deepEqual([...root.querySelectorAll('.rr-ticks .rr-toc-link')].map((link) => link.textContent), ['Summary', 'Players', 'Detail']);
  assert.ok(root.querySelector('.rr-ticks .rr-toc-3'), 'a sub-section is set in');
  assert.equal(openResearchReader({ messageId: 'm7', getLanguage: () => 'en', document }), reader, 'opening it again does not make a second one');
  assert.equal(document.querySelectorAll('.rr').length, 1);

  const mark = [...root.querySelectorAll('.rr-cite')].find((node) => node.dataset.cite === '1,2');
  mark.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
  const pop = root.querySelector('.rr-pop');
  assert.equal(pop.hidden, false);
  assert.match(pop.textContent, /A page/);
  assert.match(pop.textContent, /About cells\./);
  assert.match(pop.textContent, /1\/2/);
  click(window, pop.querySelectorAll('.rr-pop-arrow')[1]);
  assert.match(pop.textContent, /B page/);
  assert.match(pop.textContent, /2\/2/);
  assert.equal(pop.querySelector('a').href, 'https://b.example/y');

  // the panel: the sources, and what the research did
  click(window, root.querySelector('.rr-panel-toggle'));
  assert.ok(root.classList.contains('rr-panel-open'));
  assert.match(root.querySelector('.rr-panel-body').textContent, /Sources · 2/, 'the chat\'s own words for the count');
  assert.ok(root.querySelector('.history-sidebar-head .history-tabs'), 'the chat\'s own header and tabs');
  assert.equal(root.querySelectorAll('.rr-source-list .source-item').length, 2);
  click(window, [...root.querySelectorAll('.history-tab')][1]);
  assert.match(root.querySelector('.rr-panel-body').textContent, /Processed for 13m 18s/, 'the chat\'s own line for the time');
  const rows = [...root.querySelectorAll('.rr-run .ledger-row')];
  assert.deepEqual(rows.map((row) => row.querySelector('.ledger-label').textContent), ['Chemistry'], 'a folding row for each thing looked into');
  assert.equal(rows[0].querySelector('.run-source-chip').textContent, 'Searching: cells', 'its searches as chips');
  assert.equal(rows[0].querySelector('.sandbox-run-narration').textContent, 'Looking at makers', 'and what was said as lines');
  assert.deepEqual([...root.querySelectorAll('.rr-run > .sandbox-run-narration')].map((line) => line.textContent), ['Done', 'Report created']);
  click(window, root.querySelector('.rr-download'));
  assert.equal(root.querySelector('.rr-menu').hidden, false);

  // Escape closes what is open first (a citation's card, the menu, the panel) and the reader last
  const escape = () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(pop.hidden, true, 'a click elsewhere had put the citation\'s card away');
  mark.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
  assert.equal(pop.hidden, false);
  escape();
  assert.equal(pop.hidden, true);
  escape();
  assert.equal(root.querySelector('.rr-menu').hidden, true);
  escape();
  assert.equal(root.classList.contains('rr-panel-open'), false);
  assert.ok(document.querySelector('.rr'));
  escape();
  assert.equal(document.querySelector('.rr'), null);
  assert.equal(document.documentElement.classList.contains('rr-reading'), false);
  assert.deepEqual(notices, []);
});

test('on a phone the contents use the expandable bottom sheet, jump to sections and close with the reader', () => {
  const { window, document } = setup();
  updateResearch('m8', { report: REPORT });
  openResearchReader({ messageId: 'm8', getLanguage: () => 'ru', document });
  const root = document.querySelector('.rr');
  assert.equal(root.querySelectorAll('.rr-fab-btn').length, 3, 'the contents, the download and the sources');
  click(window, root.querySelector('.rr-fab-btn'));
  const sheet = document.querySelector('.source-sheet');
  assert.equal(sheet.querySelector('.source-sheet-title').textContent, 'Оглавление');
  assert.ok(sheet.classList.contains('is-all'), 'the contents can be pulled up to full height');
  assert.deepEqual([...sheet.querySelectorAll('.rr-toc-link')].map((link) => link.textContent), ['Summary', 'Players', 'Detail']);
  const handle = sheet.querySelector('.source-sheet-grip');
  const drag = (from, to) => {
    handle.dispatchEvent(new window.PointerEvent('pointerdown', { pointerId: 1, clientY: from }));
    handle.dispatchEvent(new window.PointerEvent('pointermove', { pointerId: 1, clientY: to }));
    handle.dispatchEvent(new window.PointerEvent('pointerup', { pointerId: 1, clientY: to }));
  };
  drag(400, 200);
  assert.ok(sheet.classList.contains('is-large'), 'pulling up expands the contents');
  drag(200, 400);
  assert.equal(sheet.classList.contains('is-large'), false, 'pulling down returns to medium height');
  const scrolled = [];
  root.querySelector('.rr-scroll').scrollTo = (options) => scrolled.push(options);
  Object.defineProperty(root.querySelectorAll('.rr-body h2')[1], 'offsetTop', { value: 420 });
  click(window, sheet.querySelectorAll('.rr-toc-link')[1]);
  assert.deepEqual(scrolled, [{ top: 396, behavior: 'smooth' }]);
  assert.equal(document.documentElement.classList.contains('source-sheet-open'), false, 'choosing a section closes the contents');
  click(window, root.querySelectorAll('.rr-fab-btn')[1]);
  const menu = root.querySelector('.rr-menu');
  assert.equal(menu.hidden, false, 'the mobile download button opens the menu');
  assert.equal(menu.closest('.rr-top'), null, 'the menu is outside the toolbar hidden on phones');
  click(window, root.querySelectorAll('.rr-fab-btn')[1]);
  assert.equal(menu.hidden, true, 'a second tap closes the menu');
  click(window, root.querySelector('.rr-fab-btn'));
  click(window, root.querySelector('.rr-close'));
  assert.equal(document.querySelector('.rr'), null);
  assert.equal(document.documentElement.classList.contains('source-sheet-open'), false, 'closing the reader also closes its sheet');
  assert.equal(openResearchReader({ messageId: 'nothing', getLanguage: () => 'en', document }), null, 'there is nothing to read before a report is there');
  closeResearchReader();
});

test('the activity list says what the research did, and leaves out what is not worth a line', () => {
  assert.deepEqual(activityLine({ type: 'item', text: 'Makers' }, 'en'), { kind: 'title', text: 'Makers' });
  assert.deepEqual(activityLine({ type: 'searching', text: 'Searching: x' }, 'en'), { kind: 'chip', text: 'Searching: x' });
  assert.deepEqual(activityLine({ type: 'steer', text: 'cost' }, 'en'), { kind: 'title', text: 'Add instructions: cost' });
  assert.deepEqual(activityLine({ type: 'paused' }, 'fr'), { kind: 'text', text: 'En pause' });
  assert.equal(activityLine({ type: 'phase', text: 'writing' }, 'en'), null);
  assert.equal(activityLine({ type: 'done' }, 'en'), null);
});

test('the card shows the last thing the research did as one line that opens to the last ones, and the section being written with the percent', async () => {
  const { window, host, showNotification } = setup();
  const running = plan({
    phase: 'researching',
    items: [{ id: 'i1', text: 'Chemistry', state: 'done' }, { id: 'i2', text: 'Makers', state: 'active' }],
    running: true,
    clock: Date.now()
  });
  host.innerHTML = '<div class="research-card-host"></div>';
  const cardHost = host.firstChild;
  updateResearch('m6', { runId: 'run-6' });
  mount({ host: cardHost, message: message('m6', [{ text: '' }, { researchPlan: running }]), getLanguage: () => 'en', showNotification });
  assert.equal(cardHost.querySelector('.rc-act'), null, 'nothing is shown before something was done');
  assert.equal(cardHost.querySelector('.rc-progress').getAttribute('aria-valuenow'), '35', 'a plan from before the count is counted from its items');
  updateResearch('m6', { activityAll: [{ t: 1, type: 'item', text: 'Makers' }, { t: 2, type: 'searching', text: 'Searching: solid state makers' }, { t: 3, type: 'phase', text: 'x' }] });
  assert.equal(cardHost.querySelector('.rc-act-text').textContent, 'Searching: solid state makers');
  assert.equal(cardHost.querySelector('.rc-act-list'), null);
  click(window, cardHost.querySelector('[data-act="activity"]'));
  assert.equal(cardHost.querySelectorAll('.rc-act-line').length, 2, 'the lines that are shown, not the ones that are not');
  click(window, cardHost.querySelector('[data-act="activity"]'));
  assert.equal(cardHost.querySelector('.rc-act-list'), null);
  updateResearch('m6', { plan: { ...running, phase: 'writing', pg: 80, clock: Date.now() + 1 }, writing: { n: 4, of: 7, heading: 'Costs' } });
  assert.match(cardHost.textContent, /Writing the report…/);
  assert.match(cardHost.textContent, /Section 4 of 7/);
  assert.equal(cardHost.querySelector('.rc-pct').textContent, '80%');
  assert.ok(cardHost.querySelector('.rc-act'), 'the activity stays while the report is written');
});

test('a citation and its sources light up together, the panel turns to the sources when a citation is clicked, and what scrolls fades at the edges it leaves', async () => {
  const { window, document } = setup();
  updateResearch('m10', { report: REPORT, activityAll: REPORT.activity });
  openResearchReader({ messageId: 'm10', getLanguage: () => 'en', document });
  const root = document.querySelector('.rr');
  click(window, root.querySelector('.rr-panel-toggle'));
  const items = [...root.querySelectorAll('.rr-source-list .source-item')];
  const mark = [...root.querySelectorAll('.rr-cite')].find((node) => node.dataset.cite === '1,2');
  mark.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
  assert.deepEqual(items.map((item) => item.classList.contains('is-cited')), [true, true], 'both sources of the citation');
  mark.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true }));
  assert.deepEqual(items.map((item) => item.classList.contains('is-cited')), [false, false]);
  const single = [...root.querySelectorAll('.rr-cite')].find((node) => node.dataset.cite === '1');
  assert.ok(single, 'a citation of one source');
  items[0].dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
  const lit = [...root.querySelectorAll('.rr-cite')].filter((node) => node.classList.contains('is-hot'));
  assert.ok(lit.length >= 2 && lit.every((node) => node.dataset.cite.split(',').includes('1')), 'every citation of the source');
  items[0].dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true }));
  assert.equal(root.querySelectorAll('.rr-cite.is-hot').length, 0);

  click(window, [...root.querySelectorAll('.history-tab')][1]);
  assert.equal(root.querySelectorAll('.rr-source-list').length, 0, 'the panel shows the activity');
  click(window, single);
  assert.equal(root.querySelectorAll('.rr-source-list .source-item').length, 2, 'a click on a citation turns it to the sources');
  assert.equal(root.querySelectorAll('.rr-source-list .source-item.is-cited').length, 1);
});

test('on a phone the sources and the activity are the chat\'s sheet from the bottom, which Escape closes before the reader', () => {
  const { window, document } = setup();
  window.innerWidth = 400;
  updateResearch('m11', { report: REPORT, activityAll: REPORT.activity });
  openResearchReader({ messageId: 'm11', getLanguage: () => 'en', document });
  const root = document.querySelector('.rr');
  const buttons = [...root.querySelectorAll('.rr-fab-btn')];
  click(window, buttons[2]);
  const sheet = document.querySelector('.source-sheet');
  assert.ok(sheet, 'the sources open in the sheet');
  const tabsOf = (node) => [...node.querySelectorAll('.history-tab')].map((tab) => `${tab.textContent}:${tab.getAttribute('aria-selected')}`);
  assert.deepEqual(tabsOf(sheet), ['Sources:true', 'Activity:false'], 'the toolbar button opens sources by default');
  assert.equal(buttons[2].getAttribute('aria-label'), 'Sources');
  assert.equal(sheet.querySelectorAll('.source-item').length, 2);
  click(window, sheet.querySelectorAll('.history-tab')[1]);
  assert.deepEqual(tabsOf(sheet), ['Sources:false', 'Activity:true'], 'the activity stays available through its tab');
  assert.ok(sheet.querySelector('.ledger-row'), 'the activity is drawn as the chat process rows');
  click(window, sheet.querySelectorAll('.history-tab')[0]);
  assert.equal(sheet.querySelectorAll('.source-item').length, 2, 'and back to sources');
  assert.equal(root.classList.contains('rr-panel-open'), false, 'the panel at the side is not used');
  const escape = () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  escape();
  assert.ok(document.querySelector('.rr'), 'the reader stays under it');
  assert.equal(document.documentElement.classList.contains('source-sheet-open'), false);
  click(window, buttons[2]);
  const reopened = [...document.querySelectorAll('.source-sheet')].at(-1);
  assert.deepEqual(tabsOf(reopened), ['Sources:true', 'Activity:false'], 'reopening starts on sources');
  closeResearchReader();
  document.querySelector('.source-sheet-root')?.remove();
});
