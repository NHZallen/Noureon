import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';

import { HOME_FACTS, HOME_TEXTS } from '../src/data/home-texts.js';
import { HOME_EXTENSIONS_IMAGE, HOME_STORIES, homeImagePath } from '../src/app/ui/home/home-frames.js';
import { applyHomeTexts, mountHomePage, setHomeText } from '../src/app/ui/home/home-page.js';
import shell from '../src/templates/fragments/00-shell.fragment.js';

const LANGUAGES = ['zh-TW', 'en', 'fr', 'ru', 'es'];
const THEMES = ['light', 'dark'];
const root = new URL('../', import.meta.url);

const shapeOf = (value) => {
  if (typeof value === 'string') return 'string';
  if (Array.isArray(value)) return `[${value.length}:${value.map(shapeOf).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${key}:${shapeOf(value[key])}`).join(',')}}`;
};
const strings = (value) => (typeof value === 'string' ? [value] : Object.values(value).flatMap(strings));

test('the home page words exist in the five languages with the same shape and no empty text', () => {
  assert.deepEqual(Object.keys(HOME_TEXTS).sort(), [...LANGUAGES].sort());
  const reference = shapeOf(HOME_TEXTS['zh-TW']);
  for (const language of LANGUAGES) {
    assert.equal(shapeOf(HOME_TEXTS[language]), reference, `${language} must have the same structure as zh-TW`);
    for (const text of strings(HOME_TEXTS[language])) assert.ok(text.trim().length > 0, `${language} has an empty text`);
  }
});

test('the numbers written in the home page words are the ones of the application', async () => {
  const registry = await import('../src/app/runtime/legacy-core/model-registry.js');
  const groups = await import('../src/app/ui/model-picker/model-picker-groups.js');
  const modelRegistry = registry.createLegacyModelRegistry({ getConfig: () => ({}) });
  const vendors = new Set(registry.MODELS.map((model) => groups.getCompanyLabel(groups.getModelCompany(model, modelRegistry.getModelApiId(model)))));
  const { DESIGN_PRESET_IDS } = await import('../src/app/ui/files/design/design-presets.js');
  const { DOCUMENT_PRESET_IDS } = await import('../src/app/ui/files/design/document-presets.js');
  const { OFFICIAL_CLI_CATALOG } = await import('../src/data/cli-catalog.js');
  const { OFFICIAL_SKILL_CATALOG } = await import('../src/data/skill-catalog.js');

  assert.deepEqual(HOME_FACTS, {
    models: registry.MODELS.length,
    vendors: vendors.size,
    councilMin: registry.COUNCIL_MIN_MODELS,
    councilMax: registry.COUNCIL_MAX_MODELS,
    deckDesigns: DESIGN_PRESET_IDS.length,
    documentStyles: DOCUMENT_PRESET_IDS.length,
    skills: OFFICIAL_SKILL_CATALOG.length,
    cliTools: OFFICIAL_CLI_CATALOG.length
  });
  for (const language of LANGUAGES) {
    const text = JSON.stringify(HOME_TEXTS[language]);
    for (const number of [HOME_FACTS.models, HOME_FACTS.vendors, HOME_FACTS.deckDesigns, HOME_FACTS.documentStyles, HOME_FACTS.skills, HOME_FACTS.cliTools]) {
      assert.ok(text.includes(String(number)), `${language} should mention ${number}`);
    }
    assert.ok(text.includes(`${HOME_FACTS.councilMin}–${HOME_FACTS.councilMax}`), `${language} should mention the council size`);
  }
});

test('every picture of the home page exists in every language and theme', () => {
  for (const language of LANGUAGES) {
    for (const theme of THEMES) {
      const names = [...HOME_STORIES.flatMap((story) => story.frames.map(([name]) => `${story.id}-${name}`)), HOME_EXTENSIONS_IMAGE.name];
      for (const name of names) {
        assert.ok(existsSync(new URL(`public${homeImagePath(language, theme, name)}`, root)), `${language} ${theme} ${name} is missing`);
      }
    }
  }
  for (const story of HOME_STORIES) {
    const times = story.frames.map(([, at]) => at);
    assert.deepEqual([...times].sort((a, b) => a - b), times, `${story.id} frames must be in scroll order`);
    assert.equal(story.captions.length, HOME_TEXTS['zh-TW'].stories[story.id].caps.length, `${story.id} needs one caption for each text`);
  }
});

test('the sign-in form keeps the ids the application binds to, and the page links its style sheet', () => {
  for (const id of ['auth-container', 'login-language-switcher', 'login-lang-btn', 'login-lang-label', 'login-lang-menu', 'login-section', 'auth-form', 'username-input', 'password-input', 'register-btn', 'import-btn-auth', 'hm-dynamic']) {
    assert.ok(shell.includes(`id="${id}"`), `${id} must stay in the shell`);
  }
  assert.match(readFileSync(new URL('index.html', root), 'utf8'), /<link rel="stylesheet" href="\/home\.css" \/>/);
  const css = readFileSync(new URL('public/home.css', root), 'utf8');
  assert.equal(css.replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-fA-F]{3,8}(?![\w-])|rgba?\(/g), null, 'home.css must use the names of tokens.css, not colours');
});

test('a line break in the words is shown as a break, with a space kept where the break may be hidden', () => {
  const document = new Window().document;
  const node = document.createElement('h2');
  setHomeText(node, 'Think with more\nthan one model.');
  assert.equal(node.querySelectorAll('br').length, 1);
  assert.equal(node.textContent, 'Think with more than one model.');
  setHomeText(node, '思考，\n不止一個模型。');
  assert.equal(node.textContent, '思考，不止一個模型。');
  setHomeText(node, '<img src=x onerror=alert(1)>');
  assert.equal(node.querySelectorAll('img').length, 0, 'words are text, never markup');
});

const mountedPage = () => {
  const window = new Window({ url: 'https://noureon.com/' });
  const { document } = window;
  document.body.innerHTML = shell;
  window.matchMedia = () => ({ matches: false });
  window.requestAnimationFrame = (callback) => callback();
  return { window, document };
};

test('the page builds its stories and sections, follows the language, and loads pictures of the chosen language and theme', () => {
  const { window, document } = mountedPage();
  const stop = mountHomePage({ document, window });
  assert.equal(typeof stop, 'function');
  assert.equal(document.querySelectorAll('.hm-story').length, HOME_STORIES.length);
  for (const story of HOME_STORIES) {
    assert.equal(document.querySelectorAll(`#hm-${story.id} .hm-fr`).length, story.frames.length);
    assert.equal(document.querySelectorAll(`#hm-${story.id} .hm-cap`).length, story.captions.length);
  }
  assert.equal(document.querySelector('#hm-council h2').textContent, HOME_TEXTS['zh-TW'].stories.council.caps[0].h.replace('\n', ''));
  assert.equal(document.querySelectorAll('.hm-tile').length, HOME_TEXTS['zh-TW'].more.tiles.length);
  assert.equal(document.querySelector('#hm-privacy h2').textContent, HOME_TEXTS['zh-TW'].trust.title);

  applyHomeTexts({ document, container: document.getElementById('auth-container'), language: 'ru' });
  assert.equal(document.querySelector('.hm-hero .hm-lead').textContent, HOME_TEXTS.ru.hero.lead);
  assert.equal(document.querySelector('.hm-social').getAttribute('aria-label'), HOME_TEXTS.ru.footer.xLabel);
  assert.equal(document.querySelectorAll('.hm-tile').length, HOME_TEXTS.ru.more.tiles.length);
  assert.equal(mountHomePage({ document, window }), null, 'mounting twice builds nothing twice');
  stop();
});

test('the news and policy links of the footer point where they should', () => {
  const { document } = mountedPage();
  const hrefs = [...document.querySelectorAll('.hm-footer a')].map((a) => a.getAttribute('href'));
  for (const href of ['/terms', '/privacy', '/updates', 'https://x.com/NoureonAi', 'https://github.com/NHZallen/Noureon', 'mailto:support@noureon.com']) {
    assert.ok(hrefs.includes(href), `${href} should be in the footer`);
  }
});
