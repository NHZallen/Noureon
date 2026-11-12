import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { registerApiKeySource, scrubApiKeys } from '../src/app/runtime/security/sensitive-config-redaction.js';
import { createSensitiveConfigStore } from '../src/app/runtime/security/sensitive-config-store.js';
import { getErrorMessage, readErrorBody } from '../src/app/runtime/shell/shell-utilities.js';

test('the keys the person set are taken out of a provider\'s error text, whole', () => {
  const store = createSensitiveConfigStore({ initialApiKeys: { openai: 'custom-key-123456' } });
  const text = 'Incorrect API key provided: custom-key-123456. You can find your key at the dashboard.';
  const scrubbed = scrubApiKeys(text);
  assert.ok(!scrubbed.includes('custom-key-123456'));
  assert.match(scrubbed, /\[hidden\]/);
  store.setApiKey('openai', 'second-key-abcdef');
  assert.ok(!scrubApiKeys('bad second-key-abcdef').includes('second-key-abcdef'), 'a changed key is followed');
  assert.ok(scrubApiKeys('bad custom-key-123456').includes('custom-key-123456'), 'a key that is no longer set is just text');
});

test('anything shaped like a provider key is taken out too, and ordinary words are not', () => {
  const text = 'keys sk-proj-abcdefghijklmnop12345 AIzaSyA1234567890abcdefghijk nvapi-abcdefghijklmnop1234 tvly-abcdefghijklmnop1234 sk-or-v1-abcdefghijklmnop';
  const scrubbed = scrubApiKeys(text);
  assert.equal(scrubbed, 'keys [hidden] [hidden] [hidden] [hidden] [hidden]');
  assert.equal(scrubApiKeys('the task-management skill and a risk-assessment of the desk-lamp'), 'the task-management skill and a risk-assessment of the desk-lamp');
  assert.equal(scrubApiKeys(undefined), undefined);
  assert.equal(scrubApiKeys(''), '');
});

test('a source that fails does not stop the others', () => {
  const stop = registerApiKeySource(() => { throw new Error('gone'); });
  assert.equal(scrubApiKeys('plain text'), 'plain text');
  stop();
});

test('an error body read from a response, and its message, carry no key', async () => {
  createSensitiveConfigStore({ initialApiKeys: { gemini: 'gem-secret-value-1' } });
  const response = { text: async () => JSON.stringify({ error: { message: 'API key gem-secret-value-1 is not valid (AIzaSyA1234567890abcdefghijk)' } }), statusText: 'Bad Request' };
  const body = await readErrorBody(response);
  assert.ok(!JSON.stringify(body).includes('gem-secret-value-1'));
  assert.ok(!getErrorMessage({ message: 'x gem-secret-value-1 y' }).includes('gem-secret-value-1'));
  const plain = await readErrorBody({ text: async () => 'upstream said gem-secret-value-1', statusText: 'Bad Gateway' });
  assert.ok(!plain.error.message.includes('gem-secret-value-1'));
});

test('the content security policy lets the page talk to its own Supabase projects only, not to any *.supabase.co', () => {
  const config = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');
  assert.ok(!config.includes('*.supabase.co'));
  assert.ok(config.includes('https://clctveoosifoapbafhrl.supabase.co') && config.includes('wss://clctveoosifoapbafhrl.supabase.co'));
  assert.ok(config.includes('https://nnousccvghbkucloewrs.supabase.co') && config.includes('wss://nnousccvghbkucloewrs.supabase.co'));
});
