import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { Window } from 'happy-dom';

import { installViewportDebug, readViewportState } from '../src/app/ui/motion/viewport-debug.js';

const page = () => {
  const window = new Window({ url: 'https://example.test/?debugViewport' });
  const listeners = {};
  window.visualViewport = {
    height: 450, offsetTop: 120, scale: 1,
    addEventListener: (name, fn) => { listeners[name] = fn; },
    removeEventListener: (name) => { delete listeners[name]; }
  };
  window.requestAnimationFrame = () => 0;
  window.document.body.innerHTML = '<div id="app-container"><div id="chat-container"></div><div id="input-bar-container"><div id="editor" contenteditable="true"></div></div></div>';
  return { window, document: window.document, listeners };
};

test('the panel shows what the phone tells the page and writes down what happens, and changes nothing', () => {
  const t = page();
  const scrolls = [];
  const original = t.window.scrollTo;
  t.window.scrollTo = (...args) => scrolls.push(args);
  const dispose = installViewportDebug(t.document);
  const panel = t.document.getElementById('viewport-debug');
  assert.ok(panel, 'a panel is shown');
  assert.match(panel.textContent, /vv h450 top120/);
  assert.equal(panel.style.pointerEvents, 'none', 'it does not catch touches (only its copy button does)');

  t.listeners.resize();
  t.window.scrollTo({ top: 10 });
  assert.equal(scrolls.length, 1, 'the page\'s own scroll still happens');
  dispose();
  assert.equal(t.document.getElementById('viewport-debug'), null);
  assert.deepEqual(t.listeners, {});
  t.window.scrollTo = original;
});

test('a snapshot holds the seen area, the page, the app, the composer, the list and the focus', () => {
  const t = page();
  const state = readViewportState(t.document);
  assert.deepEqual(Object.keys(state), ['vvH', 'vvTop', 'vvScale', 'innerH', 'scrollY', 'docH', 'vvBottomVar', 'app', 'bar', 'menu', 'chat', 'focus']);
  assert.equal(state.vvH, 450);
  assert.equal(state.menu, 'closed');
});

test('it is only loaded with ?debugViewport in the address', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /if \(\/\[\?&\]debugViewport\\b\/\.test\(window\.location\.search\)\) void import\('\.\/app\/ui\/motion\/viewport-debug\.js'\)/);
});
