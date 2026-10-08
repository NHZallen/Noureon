import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Window } from 'happy-dom';

import i18n from '../src/data/i18n/index.js';
import updateLogEntries from '../src/data/update-logs/entries.js';
import { PRODUCT_VERSION } from '../src/data/version.js';
import { LANGUAGES, PUBLIC_PAGES, buildPublicPages, groupByMonth, renderPublicPage, sentences } from '../scripts/build-public-pages.mjs';

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));

test('each public page holds every language, shows only the first, and writes no script in the page', () => {
  for (const name of Object.keys(PUBLIC_PAGES)) {
    const html = renderPublicPage(name);
    assert.match(html, /^<!doctype html>\n<html lang="zh-TW">/);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://noureon.com/${name}">`));
    assert.match(html, /<link rel="stylesheet" href="\/pages\.css">/);
    assert.match(html, /<script src="\/pages\.js" defer><\/script>/);
    assert.match(html, /<script src="\/theme-init\.js"><\/script>/, 'the colour theme the person chose in the application is set before the first paint');
    assert.equal((html.match(/<script/g) || []).length, 2, 'the only scripts are the two outside files (the policy allows none in the page)');
    assert.doesNotMatch(html, /<style|\sstyle=|\sonclick=/, 'no style or event written in the page');
    for (const lang of LANGUAGES) assert.match(html, new RegExp(`<h1[^>]* data-lang="${lang}" lang="${lang}"`), `${name} has ${lang}`);
    assert.equal((html.match(/<h1 hidden /g) || []).length, LANGUAGES.length - 1, 'every language but the first is hidden');
    assert.match(html, /<a class="pg-brand" href="\/"><img class="pg-mark" src="\/icon-192\.png" width="26" height="26" alt=""><span class="pg-name">Noureon<\/span><\/a>/);
    assert.match(html, /<a class="pg-go" href="\/" data-lang="zh-TW" lang="zh-TW" data-title="[^"]+" data-description="[^"]*">前往 Noureon<\/a>/);
    assert.match(html, /Go to Noureon/);
    assert.match(html, /Aller sur Noureon/);
    assert.match(html, /Перейти в Noureon/);
    assert.match(html, /Ir a Noureon/);
    assert.match(html, /support@noureon\.com/);
  }
});

test('the terms and the privacy policy are the words of the settings, in every language', () => {
  for (const [name, key] of [['terms', 'termsOfUseDesc'], ['privacy', 'privacyPolicyDesc']]) {
    const html = renderPublicPage(name);
    for (const lang of LANGUAGES) {
      const text = sentences(i18n[lang][key]).map((part) => `<p>${part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')}</p>`).join('');
      assert.ok(html.includes(text), `${name} ${lang} carries the settings text, a sentence to a paragraph`);
      assert.equal(sentences(i18n[lang][key]).join(' ').replace(/\s+/g, ''), i18n[lang][key].replace(/\s+/g, ''), 'no word is lost in the split');
    }
  }
  assert.match(renderPublicPage('privacy'), />Политика конфиденциальности</, 'a title starts with a capital');
});

test('the update page has every version once, with a link target for each', () => {
  const html = renderPublicPage('updates');
  assert.equal((html.match(/<article class="pg-ver"/g) || []).length, updateLogEntries.length);
  for (const entry of updateLogEntries) assert.ok(html.includes(`id="v${entry.version}"`), `version ${entry.version}`);
  assert.ok(html.indexOf(`id="v${updateLogEntries[0].version}"`) < html.indexOf(`id="v${updateLogEntries[1].version}"`), 'the newest is first');
  assert.doesNotMatch(html, new RegExp(`<h4 class="pg-sec">Noureon ${PRODUCT_VERSION.replace(/\./g, '\\.')} 發布說明</h4>`), 'a first line that only repeats the version is left out');
  assert.match(html, /<h4 class="pg-sec">主要變更<\/h4>/, 'a bold line alone is a heading, as in the app');
  assert.match(html, />Historique des mises à jour</);
  assert.ok(html.includes(`目前版本 <b>${PRODUCT_VERSION}</b>`), 'the current version is told under the title');
});

test('the update notes are grouped by month, newest first, and the index has a year, a month and a version level that all lead to the notes', () => {
  const months = groupByMonth(updateLogEntries);
  assert.equal(months.reduce((sum, month) => sum + month.logs.length, 0), updateLogEntries.length, 'every version is in a month');
  assert.equal(months[0].key, '2026-10');
  assert.deepEqual(groupByMonth([{ date: '2025-10-8' }, { date: '2025-10-2' }, { date: '2025-9-26' }]).map((month) => [month.key, month.logs.length]), [['2025-10', 2], ['2025-09', 1]], 'a day or month without a zero still groups');
  const html = renderPublicPage('updates');
  for (const month of months) {
    assert.ok(html.includes(`<section class="pg-month" id="m${month.key}">`), `section ${month.key}`);
    assert.ok(html.includes(`<a class="pg-im-a" href="#m${month.key}">${month.key}</a><span class="pg-im-n">${month.logs.length}</span>`), `index: ${month.key} with the number of its versions`);
    for (const log of month.logs) assert.ok(html.includes(`<a href="#v${log.version}" data-month="m${month.key}">${log.version}</a>`), `index: ${log.version}`);
  }
  assert.equal((html.match(/<section class="pg-iy/g) || []).length, new Set(months.map((month) => month.key.slice(0, 4))).size, 'a fold for each year');
  assert.match(html, /<section class="pg-iy is-open"><button type="button" class="pg-iy-h" aria-expanded="true"><span>2026<\/span>/, 'the newest year is open');
  assert.equal((html.match(/<section class="pg-iy is-open"/g) || []).length, 1, 'and only that one');
  assert.equal((html.match(/<div class="pg-im is-open"/g) || []).length, 1, 'with one month open');
  assert.doesNotMatch(html, /style=/, 'no style written in an old note stays');
});

test('a text is split into sentences without losing a word, and the terms and the privacy policy have as many in every language', () => {
  assert.deepEqual(sentences('第一句。第二句。'), ['第一句。', '第二句。']);
  assert.deepEqual(sentences('One. Two! Three? four stays.'), ['One.', 'Two!', 'Three? four stays.']);
  assert.deepEqual(sentences('Contact support@noureon.com for help.'), ['Contact support@noureon.com for help.']);
  for (const key of ['termsOfUseDesc', 'privacyPolicyDesc']) {
    const counts = new Set(LANGUAGES.map((lang) => sentences(i18n[lang][key]).length));
    assert.equal(counts.size, 1, `${key} splits the same way in every language`);
  }
});

test('the pages are written into the folder they are given', async () => {
  const { mkdtemp, readFile: read, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { pathToFileURL } = await import('node:url');
  const dir = await mkdtemp(`${tmpdir()}/noureon-pages-`);
  try {
    const names = await buildPublicPages(pathToFileURL(`${dir}/`));
    assert.deepEqual(names, ['terms', 'privacy', 'updates']);
    for (const name of names) assert.equal(await read(`${dir}/${name}.html`, 'utf8'), renderPublicPage(name));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the three addresses are rewritten to their files and are in the site map', async () => {
  const { rewrites } = await readJson('vercel.json');
  for (const name of ['terms', 'privacy', 'updates']) {
    assert.ok(rewrites.some((rule) => rule.source === `/${name}` && rule.destination === `/${name}.html`), `/${name}`);
  }
  assert.ok(rewrites.some((rule) => rule.source === '/cli' && rule.destination === '/index.html'), 'the application routes stay');
  for (const route of ['/store', '/store/skills', '/store/cli']) assert.ok(rewrites.some((rule) => rule.source === route && rule.destination === '/index.html'), `${route}: the Extensions page's addresses are the application`);
  const sitemap = await readFile(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  for (const name of ['terms', 'privacy', 'updates']) assert.match(sitemap, new RegExp(`<loc>https://noureon\\.com/${name}</loc>`));
});

test('the build writes the pages after the application', async () => {
  const { scripts } = await readJson('package.json');
  assert.match(scripts.build, /vite build && .*node scripts\/build-public-pages\.mjs$/);
});


// ---- the script of the pages, run on the page itself ----
const SCRIPT = await readFile(new URL('../public/pages.js', import.meta.url), 'utf8');

function openPage(name, { languages = ['en-US'], stored = null, top = 0 } = {}) {
  const window = new Window({ url: `https://example.test/${name}` });
  window.document.write(renderPublicPage(name));
  Object.defineProperty(window.navigator, 'languages', { value: languages, configurable: true });
  Object.defineProperty(window.navigator, 'language', { value: languages[0], configurable: true });
  if (stored) window.localStorage.setItem('noureon:pages-lang', stored);
  const world = { window, document: window.document, observe: null, scrolls: [], top, y: 0 };
  Object.defineProperty(window, 'pageYOffset', { get: () => world.y, configurable: true });
  window.IntersectionObserver = class { constructor(fn) { world.observe = fn; } observe() {} };
  window.scrollTo = (options) => world.scrolls.push(options);
  window.requestAnimationFrame = (fn) => { fn(); return 0; };
  const stick = window.document.querySelector('.pg-stick');
  if (stick) stick.getBoundingClientRect = () => ({ top: world.top });
  window.eval(SCRIPT);
  return world;
}
const shown = (world) => [...world.document.querySelectorAll('h1')].filter((node) => !node.hidden).map((node) => node.getAttribute('lang'));
const click = (world, node) => node.dispatchEvent(new world.window.MouseEvent('click', { bubbles: true, cancelable: true }));
const lit = (world) => [...new Set([...world.document.querySelectorAll('.pg-toc a.is-active')].map((node) => node.getAttribute('href')))];

test('the script chooses the remembered language, then the browser one, and remembers a choice', () => {
  assert.deepEqual(shown(openPage('terms', { languages: ['fr-CA'] })), ['fr']);
  assert.deepEqual(shown(openPage('terms', { languages: ['zh-HK'] })), ['zh-TW']);
  assert.deepEqual(shown(openPage('terms', { languages: ['de-DE'] })), ['zh-TW'], 'a language the pages do not have falls to Traditional Chinese');
  assert.deepEqual(shown(openPage('terms', { stored: 'ru', languages: ['fr'] })), ['ru'], 'the choice made here comes first');
  assert.deepEqual(shown(openPage('terms', { stored: 'xx', languages: ['es'] })), ['es'], 'a stored value that is not a language is ignored');
  const world = openPage('terms', { languages: ['en'] });
  assert.equal(world.document.documentElement.lang, 'en');
  assert.match(world.document.title, /^Terms of Use/);
  assert.match(world.document.querySelector('meta[name="description"]').getAttribute('content'), /^By using Noureon/);
  const select = world.document.getElementById('pg-lang');
  select.value = 'fr';
  select.dispatchEvent(new world.window.Event('change', { bubbles: true }));
  assert.deepEqual(shown(world), ['fr']);
  assert.equal(world.window.localStorage.getItem('noureon:pages-lang'), 'fr');
  assert.equal(world.document.querySelectorAll('.pg-go:not([hidden])').length, 1, 'one way into the application is shown');
});

test('the index lights the version being read and its month, opens only that month and its year, and writes the month in the bar', () => {
  const world = openPage('updates', { languages: ['zh-TW'] });
  const open = (root = world.document) => [...root.querySelectorAll('.pg-toc .pg-im.is-open')].map((node) => node.querySelector('.pg-im-a').getAttribute('href'));
  assert.deepEqual(open(), ['#m2026-10'], 'at first the month of the newest version is open');
  world.observe([{ target: { id: 'v17.13.0' }, isIntersecting: true }]);
  assert.deepEqual(lit(world), ['#m2026-10', '#v17.13.0']);
  world.observe([{ target: { id: 'v17.12.1' }, isIntersecting: true }]);
  assert.deepEqual(lit(world), ['#m2026-10', '#v17.12.1'], 'a version that starts while the one before still ends is the one that is lit');
  world.observe([{ target: { id: 'v17.13.0' }, isIntersecting: false }, { target: { id: 'v17.12.1' }, isIntersecting: false }, { target: { id: 'v16.7.0' }, isIntersecting: true }]);
  assert.deepEqual(lit(world), ['#m2026-08', '#v16.7.0']);
  assert.deepEqual(open(), ['#m2026-08'], 'only the month in view is open');
  assert.equal(world.document.querySelector('.pg-toc .pg-iy.is-open .pg-im.is-open'), world.document.querySelector('.pg-toc .pg-im.is-open'), 'in the year that holds it');
  assert.equal(world.document.getElementById('pg-cur').textContent, '2026-08');
  const sheetLit = [...world.document.querySelectorAll('#pg-sheet a.is-active')].map((node) => node.getAttribute('href'));
  assert.deepEqual([...new Set(sheetLit)].sort(), ['#m2026-08', '#v16.7.0'], 'the copy in the sheet follows too');
  world.observe([{ target: { id: 'v16.7.0' }, isIntersecting: false }]);
  assert.deepEqual(lit(world), ['#m2026-08', '#v16.7.0'], 'with none in the band, what was lit stays');
});

test('a fold of the index opens and shuts with its button, and says so', () => {
  const world = openPage('updates');
  const year = world.document.querySelectorAll('.pg-toc .pg-iy')[1];
  assert.equal(year.className.includes('is-open'), false, 'an older year is shut');
  const button = year.querySelector('.pg-iy-h');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  click(world, button);
  assert.ok(year.className.includes('is-open'));
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  const month = year.querySelector('.pg-im');
  click(world, month.querySelector('.pg-im-t'));
  assert.ok(month.className.includes('is-open'));
  assert.equal(month.querySelector('.pg-im-t').getAttribute('aria-expanded'), 'true');
  click(world, month.querySelector('.pg-im-t'));
  assert.equal(month.className.includes('is-open'), false);
  click(world, button);
  assert.equal(year.className.includes('is-open'), false);
});

test('the bar of the index: its button opens the sheet at the month being read, and a link, Escape or a tap elsewhere shuts it', () => {
  const world = openPage('updates');
  const sheet = world.document.getElementById('pg-sheet');
  const button = world.document.querySelector('.pg-ix-btn');
  assert.ok(sheet.querySelector('.pg-idx'), 'the sheet holds a copy of the index');
  assert.equal(sheet.querySelectorAll('.pg-iv a').length, updateLogEntries.length);
  world.observe([{ target: { id: 'v16.7.0' }, isIntersecting: true }]);
  click(world, button);
  assert.ok(sheet.className.includes('is-open'));
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.deepEqual([...sheet.querySelectorAll('.pg-im.is-open .pg-im-a')].map((node) => node.getAttribute('href')), ['#m2026-08'], 'it opens at the month being read');
  click(world, button);
  assert.equal(sheet.className.includes('is-open'), false, 'the button shuts it again');
  click(world, button);
  click(world, sheet.querySelector('.pg-iv a'));
  assert.equal(sheet.className.includes('is-open'), false, 'a link shuts it (the page goes to the version)');
  click(world, button);
  world.document.dispatchEvent(new world.window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(sheet.className.includes('is-open'), false, 'Escape shuts it');
  click(world, button);
  click(world, world.document.querySelector('.pg-main h1'));
  assert.equal(sheet.className.includes('is-open'), false, 'a tap elsewhere shuts it');
  click(world, button);
  click(world, sheet.querySelector('.pg-im-t'));
  assert.ok(sheet.className.includes('is-open'), 'a tap on a fold of the sheet keeps it open');
});

test('the bar gets a shadow once it sticks to the top, and shows the first month again when it is back in place; the button to the top follows the scroll', () => {
  const world = openPage('updates', { top: 300 });
  const stick = world.document.querySelector('.pg-stick');
  const up = world.document.querySelector('.pg-up');
  assert.equal(stick.className.includes('is-stuck'), false, 'under the title it is in its place');
  assert.equal(up.className.includes('is-on'), false, 'at the top of the page there is nothing to go back to');
  world.observe([{ target: { id: 'v16.7.0' }, isIntersecting: true }]);
  world.y = 900;
  world.top = 0;
  world.window.dispatchEvent(new world.window.Event('scroll'));
  assert.ok(stick.className.includes('is-stuck'));
  assert.ok(up.className.includes('is-on'), 'a page that has been scrolled shows it');
  assert.equal(world.document.getElementById('pg-cur').textContent, '2026-08');
  click(world, up);
  assert.equal(JSON.stringify(world.scrolls), '[{"top":0}]', 'it goes to the top');
  world.y = 0;
  world.top = 300;
  world.window.dispatchEvent(new world.window.Event('scroll'));
  assert.equal(stick.className.includes('is-stuck'), false);
  assert.equal(up.className.includes('is-on'), false);
  assert.equal(world.document.getElementById('pg-cur').textContent, '2026-10', 'back in place it tells the first month again');
});

test('the terms and the privacy pages have the button to the top and no index', () => {
  for (const name of ['terms', 'privacy']) {
    const world = openPage(name);
    assert.ok(world.document.querySelector('.pg-up'));
    assert.equal(world.document.querySelector('.pg-stick'), null);
    assert.equal(world.document.querySelector('.pg-idx'), null);
  }
});

test('the page has the bar of the index, its sheet and the button to the top, in every language', () => {
  const html = renderPublicPage('updates');
  assert.match(html, /<div class="pg-stick"><span class="pg-cur" id="pg-cur">2026-10<\/span><button type="button" class="pg-ix-btn" aria-expanded="false" aria-controls="pg-sheet">/);
  assert.match(html, /<div class="pg-sheet" id="pg-sheet"><\/div>/);
  for (const name of Object.keys(PUBLIC_PAGES)) {
    const page = renderPublicPage(name);
    assert.match(page, /<button type="button" class="pg-up">/, `${name} has the button to the top`);
    for (const label of ['移至最上方', 'Back to top', 'Haut de page', 'Наверх', 'Ir arriba']) assert.ok(page.includes(`>${label}</span>`), `${name}: ${label}`);
  }
});

test('the look of the index: the folds move, the bar sticks, nothing moves for those who ask for less motion, and a reader without script sees every fold open', async () => {
  const css = await readFile(new URL('../public/pages.css', import.meta.url), 'utf8');
  assert.match(css, /\.pg-fold \{[^}]*grid-template-rows: 0fr; transition: grid-template-rows/);
  assert.match(css, /\.is-open > \.pg-fold \{ grid-template-rows: 1fr; \}/);
  assert.match(css, /\.pg-stick \{ position: sticky; top: 0;/);
  assert.match(css, /\.pg-sheet \{[^}]*transition: opacity[^}]*\}/);
  assert.match(css, /\.pg-up \{[^}]*transition: opacity/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.pg-fold[^}]*transition: none/);
  assert.match(css, /@media \(scripting: none\) \{ \.pg-fold \{ grid-template-rows: 1fr; \}/);
});
