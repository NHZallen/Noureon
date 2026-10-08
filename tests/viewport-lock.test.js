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

// A finger moving on the page: the start, then one move, as a phone sends them.
const drag = (t, target, { fromY = 300, toY = 200, fromX = 100, toX = 100, fingers = 1 } = {}) => {
  const send = (type, x, y) => {
    const event = new t.window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'touches', { value: Array.from({ length: fingers }, () => ({ clientX: x, clientY: y })) });
    target.dispatchEvent(event);
    return event;
  };
  send('touchstart', fromX, fromY);
  return send('touchmove', toX, toY).defaultPrevented;
};
// With the keyboard up the page is taller than what is seen (measured on an iPhone: 685 against 331).
const keyboardUp = (t) => {
  Object.defineProperty(t.root, 'scrollHeight', { configurable: true, value: 685 });
  t.viewport.height = 331;
};

test('with the keyboard up, a finger on something that does not scroll does not drag the whole page (the composer jumped with it)', () => {
  const t = page();
  installViewportLock(t.window, t.document);
  const text = t.document.getElementById('text');
  Object.defineProperty(t.root, 'scrollHeight', { configurable: true, value: 800 });
  assert.equal(drag(t, text), false, 'no keyboard: the page cannot be dragged anyway, nothing is held');
  keyboardUp(t);
  assert.equal(drag(t, text), true, 'up');
  assert.equal(drag(t, text, { fromY: 200, toY: 300 }), true, 'and down');
  assert.equal(drag(t, text, { fromX: 100, toX: 200, fromY: 300, toY: 290 }), false, 'a sideways move is left alone');
  assert.equal(drag(t, text, { fingers: 2 }), false, 'two fingers still zoom');
  t.viewport.scale = 2;
  assert.equal(drag(t, text), false, 'a zoomed page can still be moved around');
});

test('with the keyboard up, a box that can still scroll the way the finger goes still scrolls', () => {
  const t = page();
  installViewportLock(t.window, t.document);
  keyboardUp(t);
  t.document.body.insertAdjacentHTML('beforeend', '<div id="list" style="overflow-y: auto"><p id="row">row</p></div>');
  const list = t.document.getElementById('list');
  const row = t.document.getElementById('row');
  Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 500 });
  Object.defineProperty(list, 'clientHeight', { configurable: true, value: 200 });
  list.scrollTop = 0;
  assert.equal(drag(t, row), false, 'at its top, the finger moving up scrolls the box on');
  assert.equal(drag(t, row, { fromY: 200, toY: 300 }), true, 'but moving down there is nothing left to scroll: the page would be dragged');
  list.scrollTop = 150;
  assert.equal(drag(t, row, { fromY: 200, toY: 300 }), false, 'off its top, both ways scroll the box');
});
