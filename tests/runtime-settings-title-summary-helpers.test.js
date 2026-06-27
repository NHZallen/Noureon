import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createSettingsProviderStructuredHelpers } from '../src/app/runtime/legacy-core/settings-provider-structured-helpers.js';
import {
  buildTitleSummaryPrompt,
  createSettingsTitleSummaryHelpers,
  normalizeTitleSummaryResponse
} from '../src/app/runtime/legacy-core/settings-title-summary-helpers.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const sampleConversation = {
  messages: [
    { role: 'user', parts: [{ text: 'What is the capital of France?' }] },
    { role: 'model', parts: [{ text: 'Paris.' }] }
  ]
};

test('module exports title summary helper functions and imports inertly', () => {
  assert.equal(typeof createSettingsTitleSummaryHelpers, 'function');
  assert.equal(typeof buildTitleSummaryPrompt, 'function');
  assert.equal(typeof normalizeTitleSummaryResponse, 'function');
  const source = readSource('src/app/runtime/legacy-core/settings-title-summary-helpers.js');

  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|document\.|window\./);
});

test('factory validates required dependencies', () => {
  assert.throws(
    () => createSettingsTitleSummaryHelpers(),
    /callApiWithSchema/
  );
});

test('buildTitleSummaryPrompt keeps conversation text and expected JSON contract', () => {
  const prompt = buildTitleSummaryPrompt(sampleConversation);

  assert.match(prompt, /What is the capital of France\?/);
  assert.match(prompt, /Paris\./);
  assert.match(prompt, /"title"/);
  assert.match(prompt, /"summary"/);
});

test('normalizeTitleSummaryResponse accepts valid title summary JSON shape', () => {
  assert.deepEqual(
    normalizeTitleSummaryResponse({ title: 'France', summary: 'Capital question' }),
    { title: 'France', summary: 'Capital question' }
  );
});

test('normalizeTitleSummaryResponse rejects malformed responses as null fallback', () => {
  assert.equal(normalizeTitleSummaryResponse(null), null);
  assert.equal(normalizeTitleSummaryResponse({ title: 'Only title' }), null);
  assert.equal(normalizeTitleSummaryResponse({ title: 123, summary: 'Nope' }), null);
});

test('requestTitleSummary calls injected structured API helper and returns normalized data', async () => {
  const calls = [];
  const helpers = createSettingsTitleSummaryHelpers({
    callApiWithSchema: async (prompt, schema, signal) => {
      calls.push({ prompt, schema, signal });
      return { title: 'France', summary: 'Asked about Paris' };
    }
  });

  const result = await helpers.requestTitleSummary(sampleConversation, 'signal');

  assert.deepEqual(result, { title: 'France', summary: 'Asked about Paris' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].prompt, /What is the capital of France\?/);
  assert.equal(calls[0].schema.properties.title.type, 'STRING');
  assert.equal(calls[0].schema.properties.summary.type, 'STRING');
  assert.equal(calls[0].signal, 'signal');
});

test('requestTitleSummary preserves null fallback for missing key or malformed data', async () => {
  const helpers = createSettingsTitleSummaryHelpers({
    callApiWithSchema: async () => null
  });

  assert.equal(await helpers.requestTitleSummary(sampleConversation), null);
});

test('title summary request can parse fenced JSON through structured helper transport', async () => {
  const requests = [];
  const structuredHelpers = createSettingsProviderStructuredHelpers({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          candidates: [
            { content: { parts: [{ text: '```json\n{"title":"France","summary":"Asked about Paris"}\n```' }] } }
          ]
        })
      };
    },
    AbortSignal: { timeout: () => ({}) },
    getApiKeyForProvider: (provider) => provider === 'gemini' ? 'gemini-secret-key' : '',
    readErrorBody: async () => ({ error: { message: 'bad response' } }),
    cheapModelId: 'cheap-model',
    logger: { error() {}, warn() {} }
  });
  const titleHelpers = createSettingsTitleSummaryHelpers({
    callApiWithSchema: structuredHelpers.callApiWithSchema
  });

  const result = await titleHelpers.requestTitleSummary(sampleConversation);

  assert.deepEqual(result, { title: 'France', summary: 'Asked about Paris' });
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/cheap-model:generateContent$/);
  assert.equal(requests[0].url.includes('?key='), false);
  assert.equal(requests[0].url.includes('gemini-secret-key'), false);
  assert.deepEqual(requests[0].options.headers, {
    'Content-Type': 'application/json',
    'x-goog-api-key': 'gemini-secret-key'
  });
});
