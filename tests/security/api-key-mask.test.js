import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  isMaskedApiKeyDisplayValue,
  maskApiKeyForDisplay
} from '../../src/app/runtime/security/sensitive-config-redaction.js';
import {
  markApiKeyInputCleared,
  markApiKeyInputDirty,
  prepareApiKeyInput,
  readApiKeyInputIntent
} from '../../src/app/runtime/security/api-key-input-intent.js';

const projectFile = (path) => new URL(`../../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createInput = () => ({
  value: '',
  dataset: {},
  addEventListener() {}
});

test('maskApiKeyForDisplay does not return the full raw key', () => {
  const rawKey = 'sk-or-v1-secret-value-abcd';
  const masked = maskApiKeyForDisplay(rawKey);

  assert.notEqual(masked, rawKey);
  assert.equal(masked.startsWith('sk-or-v1'), true);
  assert.equal(masked.endsWith('abcd'), true);
  assert.equal(masked.includes('secret-value'), false);
  assert.equal(isMaskedApiKeyDisplayValue(masked), true);
});

test('maskApiKeyForDisplay handles empty and short keys without leaking the raw value', () => {
  assert.equal(maskApiKeyForDisplay(''), '');
  assert.equal(maskApiKeyForDisplay(null), '');
  assert.equal(maskApiKeyForDisplay(undefined), '');

  const shortMasked = maskApiKeyForDisplay('abc');
  assert.notEqual(shortMasked, 'abc');
  assert.equal(shortMasked.includes('************'), true);
  assert.equal(isMaskedApiKeyDisplayValue(shortMasked), true);
});

test('api key input intent keeps raw secrets out of value and dataset', () => {
  const input = createInput();
  const rawKey = 'gemini-secret-value-abcd';

  prepareApiKeyInput(input, { provider: 'gemini', rawValue: rawKey });

  assert.notEqual(input.value, rawKey);
  assert.equal(JSON.stringify(input.dataset).includes(rawKey), false);
  assert.deepEqual(readApiKeyInputIntent(input), { action: 'unchanged', provider: 'gemini' });

  input.value = 'new-gemini-key';
  markApiKeyInputDirty(input);
  assert.deepEqual(readApiKeyInputIntent(input), {
    action: 'set',
    provider: 'gemini',
    value: 'new-gemini-key'
  });

  markApiKeyInputCleared(input);
  assert.deepEqual(readApiKeyInputIntent(input), { action: 'clear', provider: 'gemini' });
});

test('api key input intent module does not import fragments or virtual runtime', () => {
  const source = readSource('src/app/runtime/security/api-key-input-intent.js');

  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js/);
});
