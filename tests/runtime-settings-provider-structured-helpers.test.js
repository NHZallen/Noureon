import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createSettingsProviderStructuredHelpers } from '../src/app/runtime/legacy-core/settings-provider-structured-helpers.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

function createHarness(overrides = {}) {
  const requests = [];
  const logs = [];
  const helpers = createSettingsProviderStructuredHelpers({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          candidates: [
            { content: { parts: [{ text: '{"ok":true}' }] } }
          ]
        }),
        ...overrides.response
      };
    },
    AbortSignal: {
      timeout(ms) {
        return { timeoutMs: ms };
      }
    },
    getApiKeyForProvider: (provider) => provider === 'gemini' ? 'gemini-secret-key' : '',
    readErrorBody: async () => ({ error: { message: 'bad response' } }),
    cheapModelId: 'cheap-model',
    logger: {
      error: (...args) => logs.push(['error', ...args]),
      warn: (...args) => logs.push(['warn', ...args])
    },
    ...overrides.dependencies
  });
  return { helpers, requests, logs };
}

test('module exports createSettingsProviderStructuredHelpers and imports inertly', () => {
  assert.equal(typeof createSettingsProviderStructuredHelpers, 'function');
  const source = readSource('src/app/runtime/legacy-core/settings-provider-structured-helpers.js');
  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|document\.|window\./);
});

test('factory validates required dependencies', () => {
  assert.throws(
    () => createSettingsProviderStructuredHelpers({ fetchImpl: null, getApiKeyForProvider: () => '', readErrorBody: async () => ({}), cheapModelId: 'cheap' }),
    /fetchImpl/
  );
  assert.throws(
    () => createSettingsProviderStructuredHelpers({ fetchImpl: async () => ({}), getApiKeyForProvider: null, readErrorBody: async () => ({}), cheapModelId: 'cheap' }),
    /getApiKeyForProvider/
  );
  assert.throws(
    () => createSettingsProviderStructuredHelpers({ fetchImpl: async () => ({}), getApiKeyForProvider: () => '', readErrorBody: null, cheapModelId: 'cheap' }),
    /readErrorBody/
  );
  assert.throws(
    () => createSettingsProviderStructuredHelpers({ fetchImpl: async () => ({}), getApiKeyForProvider: () => '', readErrorBody: async () => ({}) }),
    /cheapModelId/
  );
});

test('callApiWithSchema sends Gemini key through header and keeps it out of URL', async () => {
  const { helpers, requests } = createHarness();

  const result = await helpers.callApiWithSchema('Return JSON', {
    type: 'OBJECT',
    properties: { ok: { type: 'BOOLEAN' } }
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/cheap-model:generateContent$/);
  assert.equal(requests[0].url.includes('?key='), false);
  assert.equal(requests[0].url.includes('gemini-secret-key'), false);
  assert.deepEqual(requests[0].options.headers, {
    'Content-Type': 'application/json',
    'x-goog-api-key': 'gemini-secret-key'
  });
});

test('callApiWithSchema parses fenced structured JSON response', async () => {
  const { helpers } = createHarness({
    response: {
      json: async () => ({
        candidates: [
          { content: { parts: [{ text: '```json\n{"title":"Ok","summary":"Done"}\n```' }] } }
        ]
      })
    }
  });

  const result = await helpers.callApiWithSchema('Return JSON', {});

  assert.deepEqual(result, { title: 'Ok', summary: 'Done' });
});

test('callApiWithSchema preserves missing-key boundary without issuing a request', async () => {
  const { helpers, requests, logs } = createHarness({
    dependencies: {
      getApiKeyForProvider: () => ''
    }
  });

  const result = await helpers.callApiWithSchema('Return JSON', {});

  assert.equal(result, null);
  assert.equal(requests.length, 0);
  assert.equal(logs[0][0], 'error');
});

test('shouldPerformWebSearch sends Gemini key through header and parses yes/no decision', async () => {
  const { helpers, requests } = createHarness({
    response: {
      json: async () => ({
        candidates: [
          { content: { parts: [{ text: ' yes ' }] } }
        ]
      })
    }
  });

  const result = await helpers.shouldPerformWebSearch('Latest release notes?');

  assert.equal(result, true);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/cheap-model:generateContent$/);
  assert.equal(requests[0].url.includes('?key='), false);
  assert.equal(requests[0].url.includes('gemini-secret-key'), false);
  assert.deepEqual(requests[0].options.headers, {
    'Content-Type': 'application/json',
    'x-goog-api-key': 'gemini-secret-key'
  });
  assert.deepEqual(requests[0].options.signal, { timeoutMs: 3000 });
});

test('shouldPerformWebSearch preserves missing-key boundary without issuing a request', async () => {
  const { helpers, requests, logs } = createHarness({
    dependencies: {
      getApiKeyForProvider: () => ''
    }
  });

  const result = await helpers.shouldPerformWebSearch('Latest release notes?');

  assert.equal(result, false);
  assert.equal(requests.length, 0);
  assert.equal(logs[0][0], 'warn');
});
