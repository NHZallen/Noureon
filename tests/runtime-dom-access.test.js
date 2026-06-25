import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRuntimeDomAccess } from '../src/app/legacy-runtime/runtime/runtime-dom-access.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('getOptionalElement reads from the injected elements getter', () => {
  const button = { id: 'settings-btn' };
  const access = createRuntimeDomAccess({
    getElements: () => ({ settingsBtn: button })
  });

  assert.equal(access.getOptionalElement('settingsBtn'), button);
});

test('element lookups read latest backing elements without stale snapshots', () => {
  let elements = { first: { id: 'one' } };
  const access = createRuntimeDomAccess({
    getElements: () => elements
  });

  assert.equal(access.getOptionalElement('first').id, 'one');
  elements = { first: { id: 'two' } };
  assert.equal(access.getOptionalElement('first').id, 'two');
});

test('optional and required missing elements return null with explicit warning', () => {
  const warnings = [];
  const access = createRuntimeDomAccess({
    getElements: () => ({}),
    logger: {
      warn: (message) => warnings.push(message)
    }
  });

  assert.equal(access.getOptionalElement('missing'), null);
  assert.equal(access.getRequiredElement('missing'), null);
  assert.deepEqual(warnings, ['[runtime-dom-access] Missing required element: missing']);
});

test('runtime DOM access does not mutate the backing element registry', () => {
  const elements = { messageInput: { value: '' } };
  const access = createRuntimeDomAccess({
    getElements: () => elements
  });

  access.getOptionalElement('messageInput');
  access.getRequiredElement('messageInput');

  assert.deepEqual(Object.keys(elements), ['messageInput']);
  assert.deepEqual(elements.messageInput, { value: '' });
});

test('runtime DOM access source is read-only and avoids unrelated systems', () => {
  const source = readSource('src/app/legacy-runtime/runtime/runtime-dom-access.js');

  assert.match(source, /export\s+function\s+createRuntimeDomAccess/);
  assert.match(source, /getElements\?\.\(\)/);
  assert.doesNotMatch(source, /document\.|querySelector|getElementById|addEventListener/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|fetch|XMLHttpRequest/);
  assert.doesNotMatch(source, /provider|parser|storage|schema|package|vite|css|template/i);
});
