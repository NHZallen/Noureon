import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getMessageTypeIcon } from '../src/app/legacy-runtime/features/message-type-icon.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

test('message type icon returns empty text when parts are missing or empty', () => {
  assert.equal(getMessageTypeIcon({}), '');
  assert.equal(getMessageTypeIcon({ parts: [] }), '');
});

test('message type icon returns empty text for text-only parts', () => {
  assert.equal(getMessageTypeIcon({ parts: [{ text: 'hello' }] }), '');
});

test('message type icon returns the image icon for image inline data', () => {
  assert.equal(
    getMessageTypeIcon({ parts: [{ inlineData: { mimeType: 'image/png' } }] }),
    '📷 '
  );
});

test('message type icon returns the attachment icon for non-image inline data', () => {
  assert.equal(
    getMessageTypeIcon({ parts: [{ inlineData: { mimeType: 'application/pdf' } }] }),
    '📎 '
  );
});

test('message type icon gives image inline data precedence over file inline data', () => {
  assert.equal(
    getMessageTypeIcon({
      parts: [
        { inlineData: { mimeType: 'application/pdf' } },
        { inlineData: { mimeType: 'image/jpeg' } }
      ]
    }),
    '📷 '
  );
});

test('message type icon helper remains isolated from runtime side effects', () => {
  const helperSource = readSource('src/app/legacy-runtime/features/message-type-icon.js');

  for (const forbidden of [
    'document',
    'window',
    'globalThis',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'fetch',
    'addEventListener',
    'removeEventListener',
    'querySelector',
    'getElementById',
    'innerHTML',
    'classList'
  ]) {
    assert.doesNotMatch(helperSource, new RegExp(`\\b${forbidden}\\b`));
  }
});
