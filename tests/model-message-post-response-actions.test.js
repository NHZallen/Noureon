import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import { applyModelMessagePostResponseActions } from '../src/app/legacy-runtime/features/model-message-post-response-actions.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createModelMessageFixture = () => createDom(`
  <div id="message" class="message-item model-message">
    <div class="message-bubble">
      <div class="message-content">Hello</div>
    </div>
  </div>
`);

const applyActions = (lastMessageElement, overrides = {}) => applyModelMessagePostResponseActions({
  lastMessageElement,
  conversation: {
    messages: [
      { role: 'user', parts: [{ text: 'Hi' }] },
      { role: 'model', parts: [{ text: 'Hello' }], createdAt: '2026-06-24T10:30:00.000Z' }
    ]
  },
  i18n: { en: { copyContent: 'Copy content' } },
  uiLanguage: 'en',
  formatTimestamp: () => '2026-06-24 10:30',
  ...overrides
});

test('inserts post-response action buttons for the last model message', () => {
  const { document, cleanup } = createModelMessageFixture();
  try {
    const message = document.querySelector('#message');

    const didInsert = applyActions(message);

    const bubble = message.querySelector('.message-bubble');
    const content = message.querySelector('.message-content');
    const actionBar = bubble.querySelector('.absolute.bottom-2.left-2.right-2');
    const button = actionBar.querySelector('.copy-content-btn');

    assert.equal(didInsert, true);
    assert.equal(content.classList.contains('pb-8'), true);
    assert.equal(button.getAttribute('title'), 'Copy content');
    assert.match(button.outerHTML, /width="16"/);
    assert.match(button.outerHTML, /class="pointer-events-none"/);
    assert.equal(actionBar.querySelector('span').textContent, '2026-06-24 10:30');
  } finally {
    cleanup();
  }
});

test('does not insert actions without a matching last model message element', () => {
  const { document, cleanup } = createDom(`
    <div id="user-message" class="message-item user-message">
      <div class="message-bubble"><div class="message-content">Hello</div></div>
    </div>
  `);
  try {
    assert.equal(applyActions(null), false);
    assert.equal(applyActions(document.querySelector('#user-message')), false);
    assert.equal(document.querySelector('.copy-content-btn'), null);
  } finally {
    cleanup();
  }
});

test('does not insert actions when required message children or data are missing', () => {
  const { document, cleanup } = createDom(`
    <div id="missing-content" class="message-item model-message">
      <div class="message-bubble"></div>
    </div>
  `);
  try {
    assert.equal(applyActions(document.querySelector('#missing-content')), false);
    assert.equal(
      applyActions(document.querySelector('#missing-content'), { conversation: { messages: [] } }),
      false
    );
    assert.equal(document.querySelector('.copy-content-btn'), null);
  } finally {
    cleanup();
  }
});

test('does not duplicate action buttons when called twice', () => {
  const { document, cleanup } = createModelMessageFixture();
  try {
    const message = document.querySelector('#message');

    assert.equal(applyActions(message), true);
    assert.equal(applyActions(message), false);

    assert.equal(message.querySelectorAll('.copy-content-btn').length, 1);
    assert.equal(message.querySelectorAll('.absolute.bottom-2.left-2.right-2').length, 1);
  } finally {
    cleanup();
  }
});

test('model message post-response actions source avoids provider, storage, package, and Vite coupling', () => {
  const source = readSource('src/app/legacy-runtime/features/model-message-post-response-actions.js');

  for (const token of [
    'fetch',
    'TextDecoder',
    'streamApiCall',
    'indexedDB',
    'localStorage',
    'sessionStorage',
    'package.json',
    'vite.config',
    'virtual:legacy-app-runtime'
  ]) {
    assert.equal(source.includes(token), false, token);
  }
});
