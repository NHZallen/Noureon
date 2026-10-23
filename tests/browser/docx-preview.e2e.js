import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';

import { build } from 'vite';

import { launchBrowser } from '../helpers/browser/launch.js';
import { hostileBody, hostileRelationships, longReportBody, packageParts } from '../helpers/browser/docx-fixtures.js';

// The Word preview with the real docx-preview, real fonts and real layout: a long report is drawn page by page with numbers, a table keeps its
// header row on the next page, a long paragraph is split between lines, an equation is drawn; a hostile file runs nothing and links nowhere unsafe.

const root = new URL('../../', import.meta.url).pathname;
let browser;
let page;
const requests = [];

before(async () => {
  const built = await build({
    root, configFile: false, logLevel: 'warn',
    build: { write: false, minify: false, lib: { entry: `${root}tests/helpers/browser/docx-entry.js`, formats: ['iife'], name: 'DocxEntry' } }
  });
  const code = (Array.isArray(built) ? built : [built]).flatMap((entry) => entry.output).find((chunk) => chunk.type === 'chunk').code;
  browser = await launchBrowser();
  page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  page.on('request', (request) => requests.push(request.url()));
  await page.route('**/*', (route) => (route.request().url().startsWith('data:') || route.request().url().startsWith('blob:') || route.request().url() === 'about:blank' ? route.continue() : route.abort()));
  await page.setContent('<!doctype html><meta charset="utf-8"><body><div id="host" style="width:900px"></div></body>');
  await page.addScriptTag({ content: code });
}, { timeout: 120_000 });

after(async () => { await browser?.close(); });

// Draws a package made from `parts` in the host and returns what the page shows.
const draw = (parts) => page.evaluate(async (files) => {
  const zip = new window.docx.JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  const blob = new Blob([await zip.generateAsync({ type: 'uint8array' })], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const host = document.getElementById('host');
  host.replaceChildren();
  window.__pwned = 0;
  const preview = await window.docx.renderDocxPreview(blob, host, { window, document });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const shadow = host.shadowRoot;
  const pages = [...shadow.querySelectorAll('section')];
  return {
    pageCount: preview.pageCount,
    pages: pages.length,
    footers: pages.map((section) => section.querySelector('footer')?.textContent.trim() || ''),
    pwned: window.__pwned,
    text: shadow.textContent,
    math: shadow.querySelectorAll('math').length,
    tables: [...shadow.querySelectorAll('table')].map((table) => [...table.rows].map((row) => row.cells[0].textContent)),
    dangerous: shadow.querySelectorAll('script, iframe, object, embed, form, [onerror], [onclick]').length,
    links: [...shadow.querySelectorAll('a')].map((link) => ({ text: link.textContent, href: link.getAttribute('href'), target: link.getAttribute('target'), rel: link.getAttribute('rel'), preview: link.dataset.previewTarget || null }))
  };
}, parts);

test('a long report is drawn page by page, with page numbers, a repeated table header and an equation', async () => {
  const drawn = await draw(packageParts({ body: longReportBody() }));
  assert.ok(drawn.pageCount >= 4, `several pages (${drawn.pageCount})`);
  assert.equal(drawn.pages, drawn.pageCount);
  assert.deepEqual(drawn.footers, drawn.footers.map((_, index) => `Page ${index + 1} of ${drawn.pageCount}`), 'every footer has its own number and the total');
  assert.ok(drawn.text.includes('word899'), 'the long paragraph is whole across its pages');
  assert.ok(drawn.text.includes('Paragraph 79') && drawn.text.includes('row 149') && drawn.text.includes('equation at the end'));
  assert.ok(drawn.math >= 1, 'the equation is drawn as MathML');
  assert.ok(drawn.tables.length >= 2, `the table runs over a page (${drawn.tables.length} parts)`);
  for (const rows of drawn.tables) assert.equal(rows[0], 'Header cell', 'every part of the table starts with its header row');
  assert.equal(drawn.text.includes(''), false, 'no placeholder is left');
});

test('a hostile file runs nothing: no script, no handler, no unsafe address, nothing fetched from another site', async () => {
  const before = requests.length;
  const drawn = await draw(packageParts({ body: hostileBody(), relationships: hostileRelationships }));
  assert.equal(drawn.pwned, 0, 'nothing ran');
  assert.equal(drawn.dangerous, 0);
  assert.ok(drawn.text.includes('<script>'), 'the script text is shown as text');
  const byText = Object.fromEntries(drawn.links.map((link) => [link.text, link]));
  assert.equal(byText['run code'].href, null, 'a javascript address is not a link');
  assert.equal(byText['example link'].href, 'https://example.com/page');
  assert.equal(byText['example link'].target, '_blank');
  assert.match(byText['example link'].rel, /noopener/);
  assert.equal(byText['go to target'].href, null, 'a link inside the file does not move the page');
  assert.ok(byText['go to target'].preview, 'it jumps within the preview instead');
  assert.deepEqual(requests.slice(before).filter((url) => /example\.com|evil/.test(url)), [], 'nothing was fetched from another site');
});

test('a link inside the file scrolls to its place', async () => {
  await draw(packageParts({ body: hostileBody(), relationships: hostileRelationships }));
  const jumped = await page.evaluate(() => {
    const shadow = document.getElementById('host').shadowRoot;
    const link = [...shadow.querySelectorAll('a')].find((anchor) => anchor.textContent === 'go to target');
    const target = shadow.getElementById(link.dataset.previewTarget) || shadow.querySelector(`[name="${link.dataset.previewTarget}"]`);
    let scrolled = false;
    target.scrollIntoView = () => { scrolled = true; };
    link.click();
    return { found: Boolean(target), scrolled };
  });
  assert.deepEqual(jumped, { found: true, scrolled: true });
});

test('a short file is one page and a damaged one is refused with a reason', async () => {
  const short = await draw(packageParts({ body: '<w:p><w:r><w:t>Just one line</w:t></w:r></w:p>' }));
  assert.equal(short.pageCount, 1);
  assert.deepEqual(short.footers, ['Page 1 of 1']);
  const failure = await page.evaluate(async () => {
    try {
      await window.docx.renderDocxPreview(new Blob([new Uint8Array([1, 2, 3])]), document.getElementById('host'), { window, document });
      return 'drawn';
    } catch (error) {
      return String(error.message || error);
    }
  });
  assert.notEqual(failure, 'drawn');
});
