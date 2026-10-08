import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { Window } from 'happy-dom';

import { installViewportLock } from '../src/app/runtime/features/viewport-lock.js';

const page = ({ userAgent = 'Safari', innerHeight = 800 } = {}) => {
  const window = new Window({ url: 'https://example.test/', settings: { navigator: { userAgent } } });
  const listeners = {};
  const viewport = {
    height: 800, offsetTop: 0, scale: 1,
    addEventListener: (name, fn) => { listeners[name] = fn; },
    removeEventListener: (name) => { delete listeners[name]; }
  };
  window.visualViewport = viewport;
  window.innerHeight = innerHeight;
  window.requestAnimationFrame = (fn) => { fn(); return 1; };
  window.document.body.innerHTML = '<div id="editor" contenteditable="true"></div><p id="text"></p>';
  return { window, document: window.document, viewport, listeners, root: window.document.documentElement };
};
const value = (t, name) => t.root.style.getPropertyValue(name);

test('the app is told where the seen area ends, and that stays the same whether or not the phone has slid the page', () => {
  const t = page();
  installViewportLock(t.window, t.document);
  assert.equal(value(t, '--vv-bottom'), '800px');

  t.viewport.height = 450;
  t.viewport.offsetTop = 0;
  t.listeners.resize();
  assert.equal(value(t, '--vv-bottom'), '450px');

  // The phone slides the page up by 120: the seen area starts lower, but the keyboard's top is where it was.
  t.viewport.height = 330;
  t.viewport.offsetTop = 120;
  t.listeners.scroll();
  assert.equal(value(t, '--vv-bottom'), '450px', 'so the app does not move with the slide');
});

test('Chrome on iPhone keeps its own bar over the foot of the page while a box is typed in: that much is left free, and only then', () => {
  const chrome = page({ userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605 CriOS/130 Mobile Safari/604' });
  installViewportLock(chrome.window, chrome.document);
  chrome.viewport.height = 450;
  chrome.document.getElementById('editor').focus();
  chrome.listeners.resize();
  assert.equal(value(chrome, '--vv-bottom'), '402px');

  const safari = page();
  installViewportLock(safari.window, safari.document);
  safari.viewport.height = 450;
  safari.document.getElementById('editor').focus();
  safari.listeners.resize();
  assert.equal(value(safari, '--vv-bottom'), '450px', 'other browsers have no such bar');

  chrome.document.getElementById('editor').blur();
  chrome.viewport.height = 760;
  chrome.listeners.resize();
  assert.equal(value(chrome, '--vv-bottom'), '760px', 'a small change of height, or nothing typed in, is not a keyboard');
});

test('a page the person has zoomed is left as it is, and the lock lets go when it is taken off', () => {
  const t = page();
  const dispose = installViewportLock(t.window, t.document);
  t.viewport.scale = 2;
  t.listeners.resize();
  assert.equal(value(t, '--vv-bottom'), '');
  t.viewport.scale = 1;
  t.listeners.resize();
  assert.equal(value(t, '--vv-bottom'), '800px');
  dispose();
  assert.equal(value(t, '--vv-bottom'), '');
  assert.deepEqual(t.listeners, {});
});

test('the app and the start-up screen lie over what is seen on a phone, and the page does not bounce', () => {
  const css = readFileSync(new URL('../src/styles/layout.css', import.meta.url), 'utf8');
  assert.match(css, /html, body \{ overscroll-behavior: none; \}/);
  assert.match(css, /@media \(pointer: coarse\) \{\s*#app-container, html \[data-startup-skeleton\] \{\s*bottom: auto;\s*height: var\(--vv-bottom, 100%\);/);
  assert.doesNotMatch(css, /--vv-top/, 'the app is not moved with the seen area');
  assert.match(css, /\[data-startup-skeleton\] \{ touch-action: none; overscroll-behavior: none; \}/);
});

test('a chat with nothing in it does not scroll, and one with messages keeps its few pixels of range', () => {
  const css = readFileSync(new URL('../src/styles/chat-edge-fade.css', import.meta.url), 'utf8');
  assert.match(css, /#message-list \{\s*min-height: calc\(100% \+ 6px\);\s*\}/);
  assert.match(css, /#message-list:has\(> \.chat-greeting-message:only-child\) \{\s*min-height: 0;\s*\}/);
});
