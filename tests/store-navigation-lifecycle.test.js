import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createStoreNavigationLifecycle } from '../src/app/legacy-runtime/features/store-navigation-lifecycle.js';

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

  assert.deepEqual(bindings, [
    ['open', 'click', openStore],
    ['back', 'click', closeStore]
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

test('store navigation lifecycle source owns binding only', () => {
  const source = readSource('src/app/legacy-runtime/features/store-navigation-lifecycle.js');

  assert.match(source, /export\s+function\s+createStoreNavigationLifecycle/);
  assert.match(source, /getOpenStoreButton\(\)\.addEventListener\('click',\s*openStore\)/);
  assert.match(source, /getBackToChatButton\(\)\.addEventListener\('click',\s*closeStore\)/);
  assert.doesNotMatch(source, /document\.(?:querySelector|getElementById)/);
  assert.doesNotMatch(source, /\bopenStore\(\)/);
  assert.doesNotMatch(source, /\bcloseStore\(\)/);
  assert.doesNotMatch(source, /requestAnimationFrame|setTimeout|innerHTML|classList/);
});
