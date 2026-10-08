import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { COLOR_SCHEME_STORAGE_KEY, createColorScheme, normalizeColorScheme, resolveTheme } from '../src/app/runtime/features/color-scheme.js';

const page = ({ dark = false } = {}) => {
  const window = new Window({ url: 'https://example.test/' });
  window.document.head.innerHTML = '<meta name="theme-color" content="#3b82f6">';
  const listeners = new Set();
  const query = { matches: dark, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  window.matchMedia = () => query;
  return { window, document: window.document, query, listeners, flip: (value) => { query.matches = value; [...listeners].forEach((fn) => fn()); } };
};

test('a choice is "light", "dark" or "system"; anything else is light', () => {
  assert.deepEqual(['light', 'dark', 'system', 'x', undefined, null, 3].map(normalizeColorScheme), ['light', 'dark', 'system', 'light', 'light', 'light', 'light']);
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
});

test('applying a choice sets the theme of the page, the colour of the browser bar and the copy for the next start', () => {
  const t = page();
  const scheme = createColorScheme({ window: t.window, document: t.document });
  assert.equal(scheme.apply('dark'), 'dark');
  assert.equal(t.document.documentElement.getAttribute('data-theme'), 'dark');
  assert.equal(t.document.querySelector('meta[name="theme-color"]').getAttribute('content'), '#212121');
  assert.equal(t.window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY), 'dark');
  assert.equal(scheme.apply('light'), 'light');
  assert.equal(t.document.documentElement.getAttribute('data-theme'), 'light');
  assert.equal(t.document.querySelector('meta[name="theme-color"]').getAttribute('content'), '#3b82f6');
});

test('"system" follows the device while it is the choice, and only then', () => {
  const t = page({ dark: false });
  const scheme = createColorScheme({ window: t.window, document: t.document });
  scheme.apply('system');
  assert.equal(t.document.documentElement.getAttribute('data-theme'), 'light');
  t.flip(true);
  assert.equal(t.document.documentElement.getAttribute('data-theme'), 'dark');
  scheme.apply('light');
  t.flip(true);
  assert.equal(t.document.documentElement.getAttribute('data-theme'), 'light', 'a fixed choice ignores the device');
  scheme.dispose();
  assert.equal(t.listeners.size, 0);
});

test('without storage or matchMedia it still works', () => {
  const t = page();
  delete t.window.matchMedia;
  Object.defineProperty(t.window, 'localStorage', { get() { throw new Error('blocked'); } });
  const scheme = createColorScheme({ window: t.window, document: t.document });
  assert.equal(scheme.apply('dark'), 'dark');
  assert.equal(scheme.apply('system'), 'light');
});

test('a change of the device while the choice is "system" tells the page, so what depends on the theme (the accent, the bubble) is shown again', () => {
  const t = page({ dark: false });
  let told = 0;
  const scheme = createColorScheme({ window: t.window, document: t.document, onThemeChange: () => { told += 1; } });
  scheme.apply('system');
  t.flip(true);
  assert.equal(told, 1);
  scheme.apply('light');
  t.flip(false);
  assert.equal(told, 1, 'a fixed choice does not follow the device');
});
