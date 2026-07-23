import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GEMINI_MEMORY_SUMMARY_MODEL,
  createGeminiMemoryCaptureClient
} from '../src/app/runtime/memory/gemini-memory-capture-client.js';

test('uses Gemini 3.5 Flash Lite for structured memory capture without exposing the API key', async () => {
  const calls = [];
  const client = createGeminiMemoryCaptureClient({
    getApiKey: () => 'gemini-secret',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify({
                    recentTurnSummary: '使用者想重作記憶功能。',
                    capsule: {
                      topic: '記憶功能重作',
                      summary: '討論新的分層記憶設計。',
                      confirmedDecisions: ['姓名不可主動稱呼'],
                      openQuestions: []
                    },
                    profileCandidates: [{
                      kind: 'preference',
                      content: '使用繁體中文回答',
                      extractionConfidence: 0.9,
                      sourceTurnIndexes: [0],
                      suggestedSupersedes: ['brief']
                    }]
                  })
                }]
              }
            }]
          };
        }
      };
    }
  });

  const capture = await client.capture({
    recentTurnSummary: '正在討論記憶架構。',
    turns: [{ role: 'user', text: '我想重作記憶功能。' }],
    activeProfileEntries: [{ id: 'brief', kind: 'preference', content: '回答要簡短' }]
  });

  assert.equal(GEMINI_MEMORY_SUMMARY_MODEL, 'gemini-3.5-flash-lite');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /gemini-3\.5-flash-lite:generateContent$/);
  assert.doesNotMatch(calls[0].url, /gemini-secret/);
  assert.equal(calls[0].options.headers['x-goog-api-key'], 'gemini-secret');
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.generationConfig.responseMimeType, 'application/json');
  assert.match(payload.contents[0].parts[0].text, /正在討論記憶架構/);
  assert.match(payload.contents[0].parts[0].text, /brief \| 回答要簡短/);
  assert.deepEqual(capture.capsule.confirmedDecisions, ['姓名不可主動稱呼']);
  assert.equal(capture.profileCandidates[0].content, '使用繁體中文回答');
  assert.deepEqual(capture.profileCandidates[0].suggestedSupersedes, ['brief']);
});

test('rejects capture attempts without a configured Gemini API key', async () => {
  const client = createGeminiMemoryCaptureClient({ getApiKey: () => '' });

  await assert.rejects(
    () => client.capture({ turns: [{ role: 'user', text: '測試' }] }),
    /Gemini API key/
  );
});
