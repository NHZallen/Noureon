import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import i18n from '../src/data/i18n/index.js';
import updateLogEntries from '../src/data/update-logs/entries.js';
import { LANGUAGES, PUBLIC_PAGES, buildPublicPages, renderPublicPage } from '../scripts/build-public-pages.mjs';

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
    for (const lang of LANGUAGES) assert.match(html, new RegExp(`<h1 data-lang="${lang}" lang="${lang}"`), `${name} has ${lang}`);
    assert.equal((html.match(/<h1 [^>]*data-lang="[^"]+"[^>]*hidden>/g) || []).length, LANGUAGES.length - 1, 'every language but the first is hidden');
    assert.match(html, /<a class="pg-home" href="\/">前往 Noureon<\/a>/);
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
      const text = i18n[lang][key].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      assert.ok(html.includes(`>${text}</p>`), `${name} ${lang} carries the settings text`);
    }
  }
  assert.match(renderPublicPage('privacy'), />Политика конфиденциальности</, 'a title starts with a capital');
});

test('the update page has every version once, with a link target for each', () => {
  const html = renderPublicPage('updates');
  assert.equal((html.match(/<section class="pg-ver"/g) || []).length, updateLogEntries.length);
  for (const entry of updateLogEntries) assert.ok(html.includes(`id="v${entry.version}"`), `version ${entry.version}`);
  assert.ok(html.indexOf(`id="v${updateLogEntries[0].version}"`) < html.indexOf(`id="v${updateLogEntries[1].version}"`), 'the newest is first');
  assert.match(html, /<h3 class="pg-sec">Noureon 17\.12\.1 發布說明<\/h3>/, 'a bold line alone is a heading, as in the app');
  assert.match(html, />Historique des mises à jour</);
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
      querySelectorAll: () => nodes,
      querySelector: (selector) => (selector.startsWith('.pg-top') ? top : meta),
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
