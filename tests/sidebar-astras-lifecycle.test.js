import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import { createSidebarAstrasLifecycle } from '../src/app/legacy-runtime/features/sidebar-astras-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createHarness = (overrides = {}) => {
  const { document, cleanup, window } = createDom('<div id="astras-list"></div>');
  const calls = [];
  const lifecycle = createSidebarAstrasLifecycle({
    astras: overrides.astras ?? [
      { id: 'a-1', name: 'Alpha', avatarUrl: 'https://example.test/a.png' },
      { id: 'a-2', name: 'Beta' }
    ],
    createAstrasMenu: (id, anchor) => calls.push(['menu', id, anchor.className]),
    document,
    elements: { astrasList: document.querySelector('#astras-list') },
    getActiveAstrasId: () => overrides.activeAstrasId ?? 'a-1',
    isSelectionMode: () => overrides.isSelectionMode ?? false,
    setAstrasForConversation: (id) => calls.push(['assign', id]),
    setTimeoutFn: (callback) => {
      calls.push(['setTimeout']);
      callback();
      return 7;
    },
    clearTimeoutFn: (id) => calls.push(['clearTimeout', id]),
    showMobileContextMenuForAstras: (id) => calls.push(['mobileMenu', id]),
    toggleSidebar: (open) => calls.push(['toggleSidebar', open]),
    window
  });

  return { calls, cleanup, document, lifecycle, window };
};

test('renders sidebar Astras with active state, dataset, labels, and avatar markup', () => {
  const { cleanup, document, lifecycle } = createHarness();
  try {
    lifecycle.renderAstras();

    const items = [...document.querySelectorAll('.sidebar-item')];
    assert.equal(items.length, 2);
    assert.equal(items[0].dataset.id, 'a-1');
    assert.equal(items[0].classList.contains('active'), true);
    assert.equal(items[0].querySelector('span').textContent, 'Alpha');
    assert.equal(items[0].querySelector('img').getAttribute('src'), 'https://example.test/a.png');
    assert.equal(items[1].dataset.id, 'a-2');
    assert.equal(items[1].classList.contains('active'), false);
    assert.equal(items[1].querySelector('.astras-sidebar-avatar').textContent.trim(), 'B');
  } finally {
    cleanup();
  }
});

test('renders imported Astra names and avatar URLs as inert content', () => {
  const maliciousName = '<img class="injected" src=x onerror="stealKeys()">安全名稱';
  const maliciousAvatarUrl = 'https://example.test/avatar.png" onerror="stealKeys()';
  const { cleanup, document, lifecycle } = createHarness({
    astras: [{ id: 'unsafe-astra', name: maliciousName, avatarUrl: maliciousAvatarUrl }]
  });

  try {
    lifecycle.renderAstras();

    const item = document.querySelector('[data-id="unsafe-astra"]');
    const avatar = item.querySelector('img');
    assert.equal(item.querySelector('.injected'), null);
    assert.equal(item.querySelector('span').textContent, maliciousName);
    assert.equal(avatar.getAttribute('src'), maliciousAvatarUrl);
    assert.equal(avatar.getAttribute('onerror'), null);
  } finally {
    cleanup();
  }
});

test('click and options events preserve assignment, sidebar, and menu handoffs', () => {
  const { calls, cleanup, document, lifecycle } = createHarness();
  try {
    lifecycle.renderAstras();
    const firstItem = document.querySelector('[data-id="a-1"]');

    firstItem.click();
    firstItem.querySelector('.astras-options-btn').click();

    assert.deepEqual(calls.slice(0, 3), [
      ['clearTimeout', null],
      ['assign', 'a-1'],
      ['toggleSidebar', false]
    ]);
    assert.equal(calls[3][0], 'menu');
    assert.equal(calls[3][1], 'a-1');
  } finally {
    cleanup();
  }
});

test('empty and missing Astras containers remain safe boundaries', () => {
  const empty = createHarness({ astras: [] });
  try {
    empty.document.querySelector('#astras-list').innerHTML = '<span>stale</span>';
    empty.lifecycle.renderAstras();
    assert.equal(empty.document.querySelector('#astras-list').innerHTML, '');
  } finally {
    empty.cleanup();
  }

  const lifecycle = createSidebarAstrasLifecycle({
    astras: [{ id: 'a-1', name: 'Alpha' }],
    elements: { astrasList: null }
  });

  assert.doesNotThrow(() => lifecycle.renderAstras());
});

test('mobile long press delegates to the Astras context menu without assigning', () => {
  const { calls, cleanup, document, lifecycle, window } = createHarness();
  try {
    window.innerWidth = 360;
    lifecycle.renderAstras();

    const firstItem = document.querySelector('[data-id="a-1"]');
    firstItem.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));

    assert.deepEqual(calls, [
      ['setTimeout'],
      ['mobileMenu', 'a-1']
    ]);
  } finally {
    cleanup();
  }
});

test('sidebar Astras lifecycle source avoids unrelated runtime systems', () => {
  const source = readSource('src/app/legacy-runtime/features/sidebar-astras-lifecycle.js');

  for (const forbidden of [
    'TextDecoder',
    'streamApiCall',
    'fetch(',
    'indexedDB',
    'localStorage',
    'sessionStorage',
    'DOMPurify',
    'marked',
    'katex',
    'virtual:legacy-app-runtime',
    'vite.config',
    'package.json',
    'REFACTOR_PLAN'
  ]) {
    assert.equal(source.includes(forbidden), false, `source should not include ${forbidden}`);
  }
});
