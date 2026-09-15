import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import appShell from '../src/templates/app-shell.js';
import i18n from '../src/data/i18n.js';
import { PRODUCT_VERSION } from '../src/data/version.js';

// The shell fragments hold their markup inside a JS string and their Chinese fallback text is
// mojibake from an old Big5 mis-decode. That corruption ate the "<" off nine tags in
// 04-shell.fragment.js. One broke an opening tag, so an element never existed at all; the others
// broke closing tags, so the unclosed element swallowed everything after it as children.
//
// applyLanguage assigns el.textContent on every [data-lang-key], which deletes children. The
// combination silently removed the whole auth-import modal body and the privacy policy text.
// These tests pin both halves of that bug class.

const renderShell = () => {
  const window = new Window();
  window.document.body.innerHTML = appShell;
  return window.document;
};

// Mirrors the [data-lang-key] loop in core-tail-lifecycle.js applyLanguage().
const applyLanguage = (document, locale) => {
  const translations = i18n[locale];
  document.querySelectorAll('[data-lang-key]').forEach((element) => {
    const key = element.dataset.langKey;
    if (translations[key]) {
      element.textContent = translations[key];
    }
  });
};

const shellIds = () => [...new Set(
  [...appShell.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])
)];

test('every id in the assembled shell parses into a real element', () => {
  const document = renderShell();
  const declaredIds = shellIds();

  assert.ok(declaredIds.length > 200, `expected the shell to declare many ids, found ${declaredIds.length}`);

  const missing = declaredIds.filter((id) => !document.getElementById(id)).sort();
  assert.deepEqual(missing, [], 'every id in the shell markup should resolve to a parsed element');
});

test('applying a translation never removes an element from the shell', () => {
  // The id-resolution test above does not catch a swallowed closing tag: the ids still resolve,
  // they are just parented under the wrong element. Only applying translations reveals it.
  for (const locale of Object.keys(i18n)) {
    const document = renderShell();
    const before = shellIds().filter((id) => document.getElementById(id));

    applyLanguage(document, locale);

    const destroyed = before.filter((id) => !document.getElementById(id)).sort();
    assert.deepEqual(destroyed, [], `applying ${locale} must not delete elements from the shell`);
  }
});

test('no translated element wraps another element that a translation would destroy', () => {
  const document = renderShell();

  const wrappers = [...document.querySelectorAll('[data-lang-key]')]
    .filter((element) => element.children.length > 0)
    .map((element) => `${element.tagName.toLowerCase()}[data-lang-key="${element.dataset.langKey}"]`)
    .sort();

  assert.deepEqual(wrappers, [], 'a [data-lang-key] element must not contain child elements');
});

test('the version row keeps the number outside the translated label', () => {
  const document = renderShell();

  const label = document.querySelector('[data-lang-key="versionNumber"]');
  assert.ok(label, 'the version label should exist');
  assert.ok(document.getElementById('version-number-display'), 'the version number element should exist');
  assert.equal(label.contains(document.getElementById('version-number-display')), false);

  applyLanguage(document, 'en');

  // Mirrors updateDisplayedVersion() in core-tail-lifecycle.js: the number comes from the single
  // product version source, and must survive the translation pass that runs alongside it.
  const display = document.getElementById('version-number-display');
  assert.ok(display, 'the number element must survive translation');
  display.textContent = PRODUCT_VERSION;

  assert.equal(display.parentElement.textContent, `${i18n.en.versionNumber}${PRODUCT_VERSION}`);
  assert.match(display.parentElement.textContent, /^Version: \d+\.\d+\.\d+$/);
});

test('desktop composer shell exposes a stable layout root and descriptive tools menu', () => {
  const document = renderShell();
  const workspace = document.getElementById('chat-workspace');
  const trigger = document.getElementById('add-file-btn');
  const menu = document.getElementById('file-options-popover');

  assert.ok(workspace);
  assert.equal(workspace.dataset.composerLayout, 'docked');
  assert.equal(trigger.getAttribute('aria-controls'), 'file-options-popover');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(menu.getAttribute('role'), 'menu');
  assert.equal(menu.querySelectorAll('.composer-menu-description').length, 5);
  assert.equal(menu.querySelectorAll(':scope > button > img.composer-menu-icon').length, 5);
  assert.equal(document.querySelector('#camera-btn > img')?.getAttribute('src'), '/assets/composer-tools/camera.png');
  assert.equal(document.querySelector('#upload-image-btn > img')?.getAttribute('src'), '/assets/composer-tools/media.png');
  assert.equal(document.querySelector('#upload-file-btn > img')?.getAttribute('src'), '/assets/composer-tools/file.png');
  assert.equal(document.querySelector('#web-search-popover-btn > img')?.getAttribute('src'), '/assets/composer-tools/web-search.png');
  assert.equal(document.querySelector('#learning-mode-btn > img')?.getAttribute('src'), '/assets/composer-tools/learning.png');

  applyLanguage(document, 'en');
  assert.equal(
    document.querySelector('#upload-file-btn .composer-menu-description').textContent,
    i18n.en.fileDescription
  );
});

test('desktop message directory hover strip starts below the header actions', () => {
  const document = renderShell();
  const triggerZone = document.getElementById('history-sidebar-trigger-zone');

  assert.ok(triggerZone);
  assert.equal(triggerZone.style.top, '3.5rem');
  assert.equal(triggerZone.classList.contains('bottom-0'), true);
  assert.equal(triggerZone.classList.contains('top-0'), false);
  assert.equal(triggerZone.classList.contains('h-full'), false);
});
