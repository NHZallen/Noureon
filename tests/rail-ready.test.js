import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { Window } from 'happy-dom';
import { waitForRail } from '../src/app/ui/rail/rail-ready.js';

// The cover of the app waits for the rail of icons on a computer that has one, so the old buttons of the left menu and of the top bar are never seen while the rail starts.

const page = ({ width = 1440, early = true } = {}) => {
  const window = new Window({ url: 'https://noureon.test/', width, height: 900 });
  window.innerWidth = width;
  if (early) window.document.documentElement.setAttribute('data-rail-early', '');
  return window;
};

test('a phone, a browser with the rail turned off and a page that has the rail already do not wait', async () => {
  assert.equal(await waitForRail(page({ width: 400 }).document), false);
  assert.equal(await waitForRail(page({ early: false }).document), false);
  const up = page();
  up.document.documentElement.setAttribute('data-rail-layout', 'pinned');
  assert.equal(await waitForRail(up.document), true);
});

test('on a computer the cover waits until the rail says its layout, and no longer than the time given', async () => {
  const window = page();
  const waiting = waitForRail(window.document);
  let settled = false;
  waiting.then(() => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(settled, false, 'the rail is not up yet');
  window.document.documentElement.setAttribute('data-rail-layout', 'hover');
  assert.equal(await waiting, true);

  const late = page();
  const timers = [];
  const result = waitForRail(late.document, { setTimeout: (fn) => timers.push(fn) });
  timers[0]();
  assert.equal(await result, false, 'a rail that does not come lets the cover go');
});

test('the old buttons are hidden from the first paint by the sheet the page loads at start, not only by the one of the rail', () => {
  const layout = readFileSync(new URL('../src/styles/layout.css', import.meta.url), 'utf8');
  const rail = readFileSync(new URL('../src/styles/rail.css', import.meta.url), 'utf8');
  const theme = readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8');
  assert.match(theme, /noureon\.rail/);
  assert.match(theme, /data-rail-early/);
  const block = layout.slice(layout.indexOf('html[data-rail-early] #new-chat-btn'));
  for (const id of ['#new-chat-btn', '#new-chat-btn-header', '#menu-toggle-btn', '#open-cli-store-btn', '#user-controls']) assert.ok(block.includes(`html[data-rail-early] ${id}`), `${id} is hidden from the first paint`);
  assert.match(layout, /@media \(min-width: 768px\) \{\s+html\[data-rail-early\]/, 'only from 768 px: a phone has the old buttons');
  assert.ok(!/html\[data-rail-layout\] #menu-toggle-btn/.test(rail), 'one place for the rule');
});

test('the arrow that goes back is in one place in the three views of the projects on a computer', () => {
  const wide = readFileSync(new URL('../src/styles/projects-wide.css', import.meta.url), 'utf8');
  assert.match(wide, /\.pj\.is-wide \{ --pj-back-inset: 0\.625rem; \}/);
  // the list, the side column and the other columns of a project take their top from the same inset
  for (const rule of ['.pj.is-wide.is-list .pj-head {', '.pj-side {', '.pj-main {', '.pj-panel {']) {
    const at = wide.indexOf(rule);
    assert.ok(at >= 0, rule);
    assert.ok(wide.slice(at, wide.indexOf('}', at)).includes('var(--pj-back-inset)'), `${rule} uses the inset`);
  }
  assert.match(wide, /\.pj-side-head \.pj-round \{ width: 2\.25rem; height: 2\.25rem; \}/);
});
