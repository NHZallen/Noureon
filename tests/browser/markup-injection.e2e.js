import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';

import { build } from 'vite';

import { launchBrowser } from '../helpers/browser/launch.js';
import { MALICIOUS_RUN, PAYLOADS, SCANNER } from '../helpers/browser/markup-payloads.js';

// What a model, a file or a search result writes is never trusted. The page's own text-to-HTML path (marked, DOMPurify, KaTeX and the cards made
// after them) is bundled for Chromium and given hostile text; what comes out is put in the page as the app does, and then looked at for anything
// a browser would run (an alert, a handler, a script, a javascript: address). The verdict has to come from a real browser: happy-dom parses
// the HTML differently from DOMPurify's expectations and cannot tell.

const root = new URL('../../', import.meta.url).pathname;
let browser;
let page;
let navigations;

before(async () => {
  const built = await build({
    root, configFile: false, logLevel: 'warn',
    build: { write: false, minify: false, lib: { entry: `${root}tests/helpers/browser/markup-entry.js`, formats: ['iife'], name: 'MarkupEntry' } }
  });
  const output = (Array.isArray(built) ? built : [built]).flatMap((entry) => entry.output);
  const code = output.find((chunk) => chunk.type === 'chunk').code;
  browser = await launchBrowser();
  page = await browser.newPage();
  navigations = [];
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
  await page.setContent('<!doctype html><meta charset="utf-8"><body><div id="out"></div></body>');
  await page.addScriptTag({ content: SCANNER });
  await page.addScriptTag({ content: code });
}, { timeout: 120_000 });

after(async () => { await browser?.close(); });

// Renders every payload (alone, inside a reply, and after a run block) into the page, waits for handlers that need a moment (a broken picture),
// and returns what ran or was found.
const attack = (renderer, payloads) => page.evaluate(async ({ renderer: name, payloads: list, run }) => {
  const pwned = [];
  window.alert = window.prompt = window.confirm = (value) => { pwned.push(`dialog ${value}`); };
  window.addEventListener('error', (event) => pwned.push(`error ${event.message}`));
  window.__pwned = (label) => pwned.push(`called ${label}`);
  const out = document.getElementById('out');
  out.textContent = '';
  // Clicking a link or a button must not leave the page here; where it would go is what the checker reads.
  const keep = (event) => event.preventDefault();
  document.addEventListener('click', keep, true);
  document.addEventListener('submit', keep, true);
  const render = window.markup[name];
  const runBlock = window.markup.formatSandboxRunBlock(run);
  const issues = [];
  const cases = [];
  for (const payload of list) {
    for (const text of [payload, `Here is the answer.\n\n${payload}\n\nAnd more text after it.`, `${runBlock}${payload}`]) cases.push([payload, text]);
  }
  for (const [payload, text] of cases) {
    const html = render(text);
    const found = window.scanMarkup(html);
    if (found.length) issues.push(`${payload.slice(0, 80)} -> ${found.join(', ')}`);
    const holder = document.createElement('div');
    holder.innerHTML = html;
    out.appendChild(holder);
    // The reply is drawn again while it streams: what comes out of the page's tree must be clean once more.
    const again = window.scanMarkup(holder.innerHTML);
    if (again.length) issues.push(`(second pass) ${payload.slice(0, 80)} -> ${again.join(', ')}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  // Clicks and focus on everything that can take them: a handler that survived would run now.
  for (const element of out.querySelectorAll('a, button, input, select, textarea, details, summary, [tabindex]')) {
    try { element.focus?.(); element.click?.(); } catch { /* an element that cannot be clicked */ }
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  document.removeEventListener('click', keep, true);
  document.removeEventListener('submit', keep, true);
  return { issues, pwned, rendered: cases.length };
}, { renderer, payloads, run: MALICIOUS_RUN });

for (const renderer of ['renderMarkdown', 'renderMarkdownWithFormulas']) {
  test(`${renderer}: ${PAYLOADS.length} hostile texts, alone and inside a reply, run nothing and leave nothing a browser would run`, async () => {
    const { issues, pwned, rendered } = await attack(renderer, PAYLOADS);
    assert.equal(rendered, PAYLOADS.length * 3);
    assert.deepEqual(navigations.slice(1), [], 'the page was not sent anywhere');
    assert.deepEqual(pwned, [], 'nothing ran');
    assert.deepEqual(issues, [], 'nothing dangerous is left in the markup');
  });
}

test('the run row, the files, the sources and the council of a reply stay text whatever their names are', async () => {
  const result = await page.evaluate(({ run }) => {
    const block = window.markup.formatSandboxRunBlock(run);
    const out = [];
    for (const trailing of ['', 'See [1] and [2][3] and [4], [5].', '````file report.txt\nhello\n````']) {
      const html = window.markup.renderMarkdownWithFormulas(`${block}${trailing}`);
      out.push(...window.scanMarkup(html));
      const holder = document.createElement('div');
      holder.innerHTML = html;
      if (holder.querySelector('img[onerror], script, [onclick]')) out.push('element with a handler');
    }
    return out;
  }, { run: MALICIOUS_RUN });
  assert.deepEqual(result, []);
});

test('links that are fine are kept as written', async () => {
  const hrefs = await page.evaluate(() => {
    const holder = document.createElement('div');
    holder.innerHTML = window.markup.renderMarkdown('[a](https://example.com/path?x=1) [b](mailto:someone@example.com) [c](#section) [d](/relative)');
    return [...holder.querySelectorAll('a')].map((link) => link.getAttribute('href'));
  });
  assert.deepEqual(hrefs, ['https://example.com/path?x=1', 'mailto:someone@example.com', '#section', '/relative']);
});

test('the parts of an answer the page needs still come through: table alignment, task lists, code, the thinking fold', async () => {
  const html = await page.evaluate(() => window.markup.renderMarkdown('| a | b |\n|:-:|--:|\n| 1 | 2 |\n\n- [x] done\n- [ ] open\n\n```js\nlet a = 1;\n```\n\n<think>why</think>'));
  const holder = await page.evaluate((markup) => { const d = document.createElement('div'); d.innerHTML = markup; return { cells: [...d.querySelectorAll('th')].map((th) => th.getAttribute('align') || th.style.textAlign), boxes: d.querySelectorAll('input[type=checkbox]').length, code: !!d.querySelector('pre code'), fold: !!d.querySelector('details.thinking-collapse summary') }; }, html);
  assert.deepEqual(holder.cells, ['center', 'right']);
  assert.equal(holder.boxes, 2);
  assert.equal(holder.code, true);
  assert.equal(holder.fold, true);
});

test('what a person writes is shown as text, never as markup', async () => {
  const bad = await page.evaluate((list) => {
    const failures = [];
    for (const payload of list) {
      const holder = document.createElement('div');
      holder.innerHTML = window.markup.renderUserText(payload);
      if (holder.querySelector('*:not(br)')) failures.push(`element: ${payload.slice(0, 60)}`);
      holder.querySelectorAll('br').forEach((lineBreak) => lineBreak.replaceWith('\n'));
      if (holder.textContent !== payload.replace(/\r/g, '')) failures.push(`text: ${payload.slice(0, 60)}`);
    }
    return failures;
  }, PAYLOADS);
  assert.deepEqual(bad, []);
});
