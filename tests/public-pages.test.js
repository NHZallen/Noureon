import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

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
    assert.equal((html.match(/<script/g) || []).length, 1, 'the only script is the outside file (the policy allows none in the page)');
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

test('the update notes are grouped by month, newest first, and the index lists every month and every version, at the side and folded above the notes', () => {
  const months = groupByMonth(updateLogEntries);
  assert.equal(months.reduce((sum, month) => sum + month.logs.length, 0), updateLogEntries.length, 'every version is in a month');
  assert.equal(months[0].key, '2026-10');
  assert.deepEqual(groupByMonth([{ date: '2025-10-8' }, { date: '2025-10-2' }, { date: '2025-9-26' }]).map((month) => [month.key, month.logs.length]), [['2025-10', 2], ['2025-09', 1]], 'a day or month without a zero still groups');
  const html = renderPublicPage('updates');
  for (const month of months) {
    assert.ok(html.includes(`<section class="pg-month" id="m${month.key}">`), `section ${month.key}`);
    assert.ok(html.includes(`<summary><a href="#m${month.key}">${month.key}</a></summary>`), `link ${month.key} at the side`);
    assert.ok(html.includes(`<a class="pg-ix-m" href="#m${month.key}">${month.key}</a>`), `link ${month.key} in the folded index`);
    for (const log of month.logs) {
      assert.ok(html.includes(`<a href="#v${log.version}" data-month="m${month.key}">${log.version}</a>`), `${log.version} at the side`);
      assert.ok(html.includes(`<a href="#v${log.version}">${log.version}</a>`), `${log.version} in the folded index`);
    }
  }
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
  const sitemap = await readFile(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  for (const name of ['terms', 'privacy', 'updates']) assert.match(sitemap, new RegExp(`<loc>https://noureon\\.com/${name}</loc>`));
});

test('the build writes the pages after the application', async () => {
  const { scripts } = await readJson('package.json');
  assert.match(scripts.build, /vite build && .*node scripts\/build-public-pages\.mjs$/);
});

test('the script of the pages chooses the remembered language, then the browser one, and remembers a choice', async () => {
  const source = await readFile(new URL('../public/pages.js', import.meta.url), 'utf8');
  const run = ({ stored = null, languages = ['en-US'], throwing = false } = {}) => {
    const nodes = LANGUAGES.map((lang) => ({ lang, hidden: lang !== 'zh-TW', getAttribute: (name) => (name === 'data-lang' ? lang : null) }));
    const top = { getAttribute: (name) => ({ 'data-title': 'T', 'data-description': 'D' })[name] };
    const meta = { content: '', setAttribute(name, value) { this.content = value; } };
    const select = { value: '', handler: null, addEventListener(type, handler) { this.handler = handler; } };
    const written = [];
    const document = {
      documentElement: { lang: 'zh-TW' },
      title: '',
      querySelectorAll: (selector) => (selector === '[data-lang]' ? nodes : []),
      querySelector: (selector) => (selector.startsWith('.pg-go') ? top : selector.startsWith('meta') ? meta : null),
      getElementById: () => select
    };
    const window = {
      localStorage: {
        getItem: () => { if (throwing) throw new Error('blocked'); return stored; },
        setItem: (key, value) => { if (throwing) throw new Error('blocked'); written.push([key, value]); }
      }
    };
    vm.runInNewContext(source, { window, document, navigator: { languages, language: languages[0] } });
    return { nodes, document, select, written };
  };
  const shown = (world) => world.nodes.filter((node) => !node.hidden).map((node) => node.lang);
  assert.deepEqual(shown(run({ languages: ['fr-CA'] })), ['fr']);
  assert.deepEqual(shown(run({ languages: ['zh-HK'] })), ['zh-TW']);
  assert.deepEqual(shown(run({ languages: ['de-DE'] })), ['zh-TW'], 'a language the pages do not have falls to Traditional Chinese');
  assert.deepEqual(shown(run({ stored: 'ru', languages: ['fr'] })), ['ru'], 'the choice made here comes first');
  assert.deepEqual(shown(run({ stored: 'xx', languages: ['es'] })), ['es'], 'a stored value that is not a language is ignored');
  assert.deepEqual(shown(run({ throwing: true, languages: ['es'] })), ['es'], 'blocked storage does not stop the page');
  const world = run({ languages: ['en'] });
  assert.equal(world.document.documentElement.lang, 'en');
  assert.equal(world.document.title, 'T');
  world.select.value = 'fr';
  world.select.handler();
  assert.deepEqual(shown(world), ['fr']);
  assert.deepEqual(world.written, [['noureon:pages-lang', 'fr']]);
  const blocked = run({ throwing: true });
  blocked.select.value = 'es';
  assert.doesNotThrow(() => blocked.select.handler());
  assert.deepEqual(shown(blocked), ['es']);
});

test('the index at the side lights the version that is being read and opens its month: of those at the top of the window, the last one', async () => {
  const source = await readFile(new URL('../public/pages.js', import.meta.url), 'utf8');
  const folds = [{ open: true }, { open: false }];
  const make = (id, month, fold) => ({ id, className: '', getAttribute: (name) => (name === 'href' ? `#${id}` : name === 'data-month' ? month : null), closest: () => fold });
  const links = [make('m2026-10', null, null), make('v17.13.0', 'm2026-10', folds[0]), make('v17.12.1', 'm2026-10', folds[0]), make('m2026-09', null, null), make('v17.9.2', 'm2026-09', folds[1])];
  const articles = Object.fromEntries(links.filter((link) => link.id.startsWith('v')).map((link) => [link.id, { id: link.id }]));
  let callback = null;
  let options = null;
  const observed = [];
  class FakeObserver { constructor(fn, opts) { callback = fn; options = opts; } observe(node) { observed.push(node.id); } }
  const document = {
    documentElement: {},
    querySelectorAll: (selector) => (selector === '.pg-toc a' ? links : selector === '.pg-toc details' ? folds : []),
    querySelector: () => null,
    getElementById: (id) => articles[id] || null
  };
  vm.runInNewContext(source, { window: { IntersectionObserver: FakeObserver, localStorage: { getItem: () => null } }, IntersectionObserver: FakeObserver, document, navigator: { languages: ['en'] } });
  assert.deepEqual(observed, ['v17.13.0', 'v17.12.1', 'v17.9.2'], 'every version is watched');
  assert.match(options.rootMargin, /-85%/, 'only the top of the window counts');
  const lit = () => links.filter((link) => link.className === 'is-active').map((link) => link.id);
  callback([{ target: { id: 'v17.13.0' }, isIntersecting: true }]);
  assert.deepEqual(lit(), ['m2026-10', 'v17.13.0']);
  callback([{ target: { id: 'v17.12.1' }, isIntersecting: true }]);
  assert.deepEqual(lit(), ['m2026-10', 'v17.12.1'], 'a version that starts while the one before still ends is the one that is lit');
  callback([{ target: { id: 'v17.13.0' }, isIntersecting: false }, { target: { id: 'v17.12.1' }, isIntersecting: false }, { target: { id: 'v17.9.2' }, isIntersecting: true }]);
  assert.deepEqual(lit(), ['m2026-09', 'v17.9.2'], 'the month of the version is lit with it');
  assert.deepEqual(folds.map((fold) => fold.open), [false, true], 'only the month in view is open');
  callback([{ target: { id: 'v17.9.2' }, isIntersecting: false }]);
  assert.deepEqual(lit(), ['m2026-09', 'v17.9.2'], 'with none in the band, what was lit stays');
});

test('the button to the top shows once the page is scrolled, and goes to the top', async () => {
  const source = await readFile(new URL('../public/pages.js', import.meta.url), 'utf8');
  const handlers = {};
  const up = { hidden: true, handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; } };
  const scrolls = [];
  const window = {
    pageYOffset: 0,
    localStorage: { getItem: () => null },
    requestAnimationFrame: (fn) => fn(),
    addEventListener: (type, fn) => { handlers[type] = fn; },
    scrollTo: (options) => scrolls.push(options)
  };
  const document = {
    documentElement: {},
    querySelectorAll: () => [],
    querySelector: (selector) => (selector === '.pg-up' ? up : null),
    getElementById: () => null,
    addEventListener() {}
  };
  vm.runInNewContext(source, { window, document, navigator: { languages: ['en'] } });
  assert.equal(up.hidden, true, 'at the top of the page there is nothing to go back to');
  window.pageYOffset = 900;
  handlers.scroll();
  assert.equal(up.hidden, false, 'a page that has been scrolled shows it');
  up.handlers.click();
  assert.equal(JSON.stringify(scrolls), '[{"top":0}]');
  window.pageYOffset = 10;
  handlers.scroll();
  assert.equal(up.hidden, true);
});

test('on a narrow window the bar of the index takes the place of the folded index once it has scrolled away, and its button opens the sheet', async () => {
  const source = await readFile(new URL('../public/pages.js', import.meta.url), 'utf8');
  const listeners = { window: {}, document: {}, sheet: {}, button: {} };
  let bottom = 120;
  const folded = { getBoundingClientRect: () => ({ bottom }), querySelectorAll: () => [{ cloneNode: () => ({ cloned: true }) }, { cloneNode: () => ({ cloned: true }) }] };
  const stick = { className: 'pg-stick' };
  const sheet = { hidden: true, children: [], appendChild(node) { this.children.push(node); }, addEventListener: (type, fn) => { listeners.sheet[type] = fn; } };
  const attributes = {};
  const button = { setAttribute: (name, value) => { attributes[name] = value; }, addEventListener: (type, fn) => { listeners.button[type] = fn; } };
  const window = { pageYOffset: 0, localStorage: { getItem: () => null }, requestAnimationFrame: (fn) => fn(), addEventListener: (type, fn) => { listeners.window[type] = fn; }, scrollTo() {} };
  const document = {
    documentElement: {},
    querySelectorAll: () => [],
    querySelector: (selector) => ({ '.pg-stick': stick, '.pg-index': folded, '.pg-ix-btn': button })[selector] || null,
    getElementById: (id) => (id === 'pg-sheet' ? sheet : null),
    addEventListener: (type, fn) => { listeners.document[type] = fn; }
  };
  vm.runInNewContext(source, { window, document, navigator: { languages: ['en'] } });
  assert.equal(sheet.children.length, 2, 'the sheet gets a copy of the folded index');
  assert.equal(stick.className, 'pg-stick', 'while the folded index is in sight the bar stays away');
  bottom = -5;
  listeners.window.scroll();
  assert.equal(stick.className, 'pg-stick is-on', 'once it has scrolled away the bar comes');
  listeners.button.click();
  assert.equal(sheet.hidden, false);
  assert.equal(attributes['aria-expanded'], 'true');
  listeners.button.click();
  assert.equal(sheet.hidden, true);
  listeners.button.click();
  listeners.document.keydown({ key: 'Escape' });
  assert.equal(sheet.hidden, true, 'Escape closes it');
  listeners.button.click();
  listeners.document.click({ target: { closest: (selector) => (selector === '#pg-sheet' ? null : null) } });
  assert.equal(sheet.hidden, true, 'a tap elsewhere closes it');
  listeners.button.click();
  listeners.sheet.click({ target: { closest: (selector) => (selector === 'a' ? {} : null) } });
  assert.equal(sheet.hidden, true, 'a link of the sheet closes it (the page goes to the version)');
  listeners.button.click();
  bottom = 50;
  listeners.window.scroll();
  assert.equal(stick.className, 'pg-stick', 'back at the top the bar goes and the sheet closes');
  assert.equal(sheet.hidden, true);
});

test('the page has the bar of the index, its sheet and the button to the top, in every language', () => {
  const html = renderPublicPage('updates');
  assert.match(html, /<div class="pg-stick"><span class="pg-cur" id="pg-cur">2026-10<\/span><button type="button" class="pg-ix-btn" aria-expanded="false" aria-controls="pg-sheet">/);
  assert.match(html, /<div class="pg-sheet" id="pg-sheet" hidden><\/div>/);
  for (const name of Object.keys(PUBLIC_PAGES)) {
    const page = renderPublicPage(name);
    assert.match(page, /<button type="button" class="pg-up" hidden>/, `${name} has the button to the top`);
    for (const label of ['移至最上方', 'Back to top', 'Haut de page', 'Наверх', 'Ir arriba']) assert.ok(page.includes(`>${label}</span>`), `${name}: ${label}`);
  }
});
