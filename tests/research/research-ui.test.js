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
  assert.equal(cardHost.querySelector('.rc-progress').getAttribute('aria-valuenow'), '1');
  click(window, cardHost.querySelector('[data-act="pause"]'));
  await flush();
  assert.match(notices[0][0], /cannot be done right now/, 'a refusal is told');
  updateResearch('m4', { plan: { ...running, paused: true, running: false, clock: Date.now() + 1 } });
  assert.match(cardHost.textContent, /Paused/);
  click(window, cardHost.querySelector('[data-act="resume"]'));
  await flush();
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
  assert.deepEqual([...cardHost.querySelectorAll('.rc-menu button')].map((item) => item.dataset.act), ['copy', 'export-md']);
  const copied = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async (text) => { copied.push(text); } } } });
  click(window, cardHost.querySelector('[data-act="copy"]'));
  await flush();
  assert.match(copied[0], /## References\n\n\[1\] A page — https:\/\/a\.example\/x/);
  assert.equal(notices.at(-1)[0], 'Copied');
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
  assert.match(root.querySelector('.rr-panel-body').textContent, /2 citations/);
  assert.equal(root.querySelectorAll('.rr-source-list .source-item').length, 2);
  click(window, [...root.querySelectorAll('.rr-tab')][1]);
  const lines = [...root.querySelectorAll('.rr-act')].map((line) => line.textContent);
  assert.deepEqual(lines, ['Chemistry', 'Searching: cells', 'Looking at makers', 'Worked for 13m 18s', 'Done', 'Report created']);
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

test('on a phone the contents are a list behind a button, and the close button closes', () => {
  const { window, document } = setup();
  updateResearch('m8', { report: REPORT });
  openResearchReader({ messageId: 'm8', getLanguage: () => 'ru', document });
  const root = document.querySelector('.rr');
  assert.equal(root.querySelectorAll('.rr-fab-btn').length, 3);
  click(window, root.querySelector('.rr-fab-btn'));
  assert.ok(root.classList.contains('rr-toc-open'));
  assert.equal(root.querySelector('.rr-toc-sheet-title').textContent, 'Оглавление');
  click(window, root.querySelector('.rr-close'));
  assert.equal(document.querySelector('.rr'), null);
  assert.equal(openResearchReader({ messageId: 'nothing', getLanguage: () => 'en', document }), null, 'there is nothing to read before a report is there');
  closeResearchReader();
});

test('the activity list says what the research did, and leaves out what is not worth a line', () => {
  assert.deepEqual(activityLine({ type: 'item', text: 'Makers' }, 'en'), { kind: 'title', text: 'Makers' });
  assert.deepEqual(activityLine({ type: 'searching', text: 'Searching: x' }, 'en'), { kind: 'chip', text: 'Searching: x' });
  assert.deepEqual(activityLine({ type: 'paused' }, 'fr'), { kind: 'text', text: 'En pause' });
  assert.equal(activityLine({ type: 'phase', text: 'writing' }, 'en'), null);
  assert.equal(activityLine({ type: 'done' }, 'en'), null);
});
