import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';

import {
  dismissStartupSkeleton,
  mountAppShell,
  showStartupFailure
} from '../src/app/bootstrap/mount-shell.js';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('index provides an accessible static startup status before JavaScript runs', () => {
  const window = new Window({ url: 'https://noureon.com/' });
  window.document.write(indexSource);

  const skeleton = window.document.querySelector('#app > [data-startup-skeleton]');
  const status = skeleton?.querySelector('[role="status"]');

  assert.ok(skeleton);
  assert.equal(skeleton.getAttribute('aria-labelledby'), 'startup-skeleton-title');
  assert.ok(status);
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.equal(status.getAttribute('aria-atomic'), 'true');
  assert.equal(status.getAttribute('aria-busy'), 'true');
  assert.match(status.textContent, /正在準備工作空間/);
  assert.match(status.textContent, /請稍候/);
  assert.equal(status.querySelector('.startup-skeleton__logo')?.getAttribute('src'), '/logo.png');
  assert.equal(status.querySelectorAll('.startup-skeleton__dots span').length, 3);
});

test('mountAppShell keeps the startup overlay until the runtime is interactive', () => {
  const window = new Window({ url: 'https://noureon.com/' });
  window.document.body.innerHTML = `
    <div id="app">
      <main data-startup-skeleton>Loading</main>
    </div>
  `;
  const previousDocument = globalThis.document;

  try {
    globalThis.document = window.document;
    mountAppShell('<section data-mounted-app-shell>Ready</section>');

    assert.ok(window.document.querySelector('[data-startup-skeleton]'));
    assert.equal(window.document.querySelector('[data-mounted-app-shell]')?.textContent, 'Ready');
    assert.equal(dismissStartupSkeleton(window.document), true);
    assert.equal(window.document.querySelector('[data-startup-skeleton]'), null);
  } finally {
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }
});

test('startup failures remain visible and accessible instead of leaving a blank shell', () => {
  const window = new Window({ url: 'https://noureon.com/' });
  window.document.body.innerHTML = `
    <main data-startup-skeleton>
      <div role="status" aria-busy="true">
        <p class="startup-skeleton__message">Loading</p>
        <span class="startup-skeleton__spinner"></span>
      </div>
    </main>
  `;

  assert.equal(showStartupFailure(new Error('workspace unavailable'), window.document), true);
  assert.equal(window.document.querySelector('[role="alert"]')?.getAttribute('aria-busy'), 'false');
  assert.match(window.document.querySelector('.startup-skeleton__message')?.textContent, /workspace unavailable/);
  assert.equal(window.document.querySelector('.startup-skeleton__spinner'), null);
});

const withBrowser = async (languages, run) => {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { languages, language: languages[0] }, configurable: true, writable: true });
  try {
    return await run();
  } finally {
    if (before) Object.defineProperty(globalThis, 'navigator', before);
    else delete globalThis.navigator;
  }
};

test('the page that shows while the app loads follows the language of the browser on a first visit, and the language last used after that', () => {
  const script = readFileSync(new URL('../public/startup-language.js', import.meta.url), 'utf8');
  const lines = (languages, stored = {}) => {
    const window = new Window({ url: 'https://noureon.com/', settings: { navigator: { userAgent: 'test' } } });
    window.document.write(indexSource);
    for (const [key, value] of Object.entries(stored)) window.localStorage.setItem(key, value);
    Object.defineProperty(window.navigator, 'languages', { value: languages, configurable: true });
    Object.defineProperty(window.navigator, 'language', { value: languages[0], configurable: true });
    window.eval(script);
    return window.document.querySelector('[role="status"]').textContent.replace(/\s+/g, ' ').trim();
  };
  assert.match(lines(['fr-FR']), /^Préparation de votre espace de travail/);
  assert.match(lines(['ru']), /^Подготовка/);
  assert.match(lines(['es-MX', 'en']), /^Preparando/);
  assert.match(lines(['en-US']), /^Getting your workspace ready/);
  assert.match(lines(['zh-TW']), /^正在準備工作空間/);
  assert.match(lines(['zh-CN', 'en']), /^正在準備工作空間/, 'any Chinese stays Traditional Chinese');
  assert.match(lines(['ja-JP']), /^正在準備工作空間/, 'a language the app does not have: as before');
  // What the person picked or last used wins over the browser.
  assert.match(lines(['fr-FR'], { noureon_ui_language: 'es' }), /^Preparando/);
  assert.match(lines(['en-US'], { noureon_login_language: 'zh-TW' }), /^正在準備工作空間/);
});

test('a failed start, before anything is stored, is told in the language of the browser', async () => {
  const window = new Window({ url: 'https://noureon.com/' });
  const fail = (languages) => withBrowser(languages, () => {
    window.document.body.innerHTML = '<main data-startup-skeleton><div role="status"><p class="startup-skeleton__message">x</p></div></main>';
    showStartupFailure(null, window.document);
    return window.document.querySelector('.startup-skeleton__message').textContent;
  });
  assert.match(await fail(['fr']), /Échec du chargement/);
  assert.match(await fail(['en-GB']), /Failed to load/);
  assert.match(await fail(['de']), /載入失敗/);
});
