import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createStoreNavigationLifecycle, NOURAS_STORE_PATH } from '../src/app/legacy-runtime/features/store-navigation-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createButton = (name, bindings) => ({
  addEventListener(type, handler) {
    bindings.push([name, type, handler]);
    this.handler = handler;
  }
});

test('bind attaches store navigation handlers in open then back order', () => {
  const bindings = [];
  const calls = [];
  const openButton = createButton('open', bindings);
  const backButton = createButton('back', bindings);
  const openStore = () => calls.push('open');
  const closeStore = () => calls.push('close');
  const lifecycle = createStoreNavigationLifecycle({
    getOpenStoreButton: () => openButton,
    getBackToChatButton: () => backButton,
    openStore,
    closeStore
  });

  lifecycle.bind();

  assert.deepEqual(bindings.map(([name, type]) => [name, type]), [
    ['open', 'click'],
    ['back', 'click']
  ]);
  openButton.handler();
  backButton.handler();
  assert.deepEqual(calls, ['open', 'close']);
});

test('bind resolves the latest button targets lazily', () => {
  const bindings = [];
  const staleOpenButton = createButton('stale-open', bindings);
  const staleBackButton = createButton('stale-back', bindings);
  const latestOpenButton = createButton('latest-open', bindings);
  const latestBackButton = createButton('latest-back', bindings);
  let openButton = staleOpenButton;
  let backButton = staleBackButton;
  const lifecycle = createStoreNavigationLifecycle({
    getOpenStoreButton: () => openButton,
    getBackToChatButton: () => backButton,
    openStore: () => {},
    closeStore: () => {}
  });

  openButton = latestOpenButton;
  backButton = latestBackButton;
  lifecycle.bind();

  assert.deepEqual(bindings.map(([name, type]) => [name, type]), [
    ['latest-open', 'click'],
    ['latest-back', 'click']
  ]);
});

test('missing buttons preserve the legacy required-element failure boundary', () => {
  const missingOpenLifecycle = createStoreNavigationLifecycle({
    getOpenStoreButton: () => null,
    getBackToChatButton: () => createButton('back', []),
    openStore: () => {},
    closeStore: () => {}
  });
  assert.throws(() => missingOpenLifecycle.bind(), TypeError);

  const bindings = [];
  const missingBackLifecycle = createStoreNavigationLifecycle({
    getOpenStoreButton: () => createButton('open', bindings),
    getBackToChatButton: () => null,
    openStore: () => {},
    closeStore: () => {}
  });
  assert.throws(() => missingBackLifecycle.bind(), TypeError);
  assert.deepEqual(bindings.map(([name, type]) => [name, type]), [['open', 'click']]);
});

test('store navigation lifecycle source owns binding and the address only', () => {
  const source = readSource('src/app/legacy-runtime/features/store-navigation-lifecycle.js');

  assert.match(source, /export\s+function\s+createStoreNavigationLifecycle/);
  assert.match(source, /getOpenStoreButton\(\)\.addEventListener\('click',\s*open\)/);
  assert.match(source, /getBackToChatButton\(\)\.addEventListener\('click',\s*close\)/);
  assert.doesNotMatch(source, /document\.(?:querySelector|getElementById)/);
  assert.doesNotMatch(source, /requestAnimationFrame|setTimeout|innerHTML|classList/);
});

const createWindow = (pathname) => {
  const listeners = {};
  const win = {
    location: { pathname },
    history: {
      state: null,
      calls: [],
      pushState(state, _title, url) { this.state = state; this.calls.push(['push', url]); win.location.pathname = url; },
      replaceState(state, _title, url) { this.state = state; this.calls.push(['replace', url]); win.location.pathname = url; },
      back() { this.calls.push(['back']); this.state = null; win.location.pathname = '/'; win.fire('popstate'); }
    },
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler); },
    fire(type) { (listeners[type] || []).forEach((handler) => handler()); }
  };
  return win;
};

const setup = (pathname) => {
  const win = createWindow(pathname);
  const calls = [];
  const openButton = createButton('open', []);
  const backButton = createButton('back', []);
  const lifecycle = createStoreNavigationLifecycle({
    getOpenStoreButton: () => openButton,
    getBackToChatButton: () => backButton,
    openStore: () => calls.push('open'),
    closeStore: () => calls.push('close'),
    win
  });
  lifecycle.bind();
  return { win, calls, openButton, backButton };
};

test('opening the store puts /nouras in the address and the browser back button closes it', () => {
  assert.equal(NOURAS_STORE_PATH, '/nouras');
  const { win, calls, openButton } = setup('/');
  openButton.handler();
  assert.deepEqual(win.history.calls, [['push', '/nouras']]);
  win.history.back();
  assert.deepEqual(calls, ['open', 'close']);
  assert.equal(win.location.pathname, '/');
});

test('the back-to-chat button takes /nouras out of the history it added', () => {
  const { win, calls, openButton, backButton } = setup('/');
  openButton.handler();
  backButton.handler();
  assert.deepEqual(calls, ['open', 'close']);
  assert.deepEqual(win.history.calls, [['push', '/nouras'], ['back']]);
});

test('the address /nouras opens the store, and closing it puts / in its place', () => {
  const { win, calls, backButton } = setup('/nouras');
  assert.deepEqual(calls, ['open']);
  backButton.handler();
  assert.deepEqual(calls, ['open', 'close']);
  assert.deepEqual(win.history.calls, [['replace', '/']]);
  assert.equal(win.location.pathname, '/');
});

test('the store is not opened or closed twice', () => {
  const { calls, openButton, backButton } = setup('/');
  openButton.handler();
  openButton.handler();
  backButton.handler();
  backButton.handler();
  assert.deepEqual(calls, ['open', 'close']);
});

test('the store follows the address when the browser goes forward again', () => {
  const { win, calls, openButton } = setup('/');
  openButton.handler();
  win.history.back();
  win.location.pathname = '/nouras';
  win.fire('popstate');
  assert.deepEqual(calls, ['open', 'close', 'open']);
});
