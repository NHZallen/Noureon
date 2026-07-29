import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryModelClient } from '../src/app/runtime/memory/memory-model-client.js';

test('routes capture through the configured memory model and keeps every user turn as classifiable evidence', async () => {
  const calls = [];
  const client = createMemoryModelClient({
    getModelId: () => 'openai/gpt-5.6-terra',
    runModel: async input => {
      calls.push(input);
      return JSON.stringify({
        recentTurnSummary: 'Discussed deployment choices.',
        capsule: { topic: 'Deployment', summary: 'The user is evaluating a NUC.', confirmedDecisions: [], openQuestions: [] },
        profileCandidates: [],
        evidenceStates: [{ sourceTurnIndex: 0, state: 'exploration' }, { sourceTurnIndex: 2, state: 'question' }],
        memorySummaryPatch: { overview: 'The user is evaluating a NUC.', sections: [] }
      });
    }
  });

  const capture = await client.capture({
    turns: [
      { role: 'user', text: 'Maybe use a NUC.' },
      { role: 'assistant', text: 'A NUC is compact.' },
      { role: 'user', text: 'Would it work for OpenClaw?' }
    ]
  });

  assert.equal(calls[0].modelId, 'openai/gpt-5.6-terra');
  assert.match(calls[0].prompt, /Every non-empty user turn/);
  assert.deepEqual(capture.evidenceStates, [
    { sourceTurnIndex: 0, state: 'exploration' },
    { sourceTurnIndex: 2, state: 'question' }
  ]);
});

test('does not substitute a different model when the configured one fails', async () => {
  let calls = 0;
  const client = createMemoryModelClient({
    getModelId: () => 'selected-model',
    runModel: async () => { calls += 1; throw new Error('selected model unavailable'); }
  });

  await assert.rejects(
    () => client.resolve({ queryText: 'What about it?' }),
    /selected model unavailable/
  );
  assert.equal(calls, 1);
});

test('writes visible memory text in the current interface language without localizing the JSON contract', async () => {
  const calls = [];
  const client = createMemoryModelClient({
    getModelId: () => 'selected-model',
    getOutputLanguage: () => 'zh-TW',
    runModel: async input => {
      calls.push(input);
      return JSON.stringify({
        recentTurnSummary: '已更新。',
        capsule: { topic: '主題', summary: '摘要', confirmedDecisions: [], openQuestions: [] },
        profileCandidates: [],
        evidenceStates: [{ sourceTurnIndex: 0, state: 'current-state' }],
        memorySummaryPatch: { overview: '目前狀態。', sections: [] }
      });
    }
  });

  await client.capture({ turns: [{ role: 'user', text: '請用繁中整理。' }] });

  assert.match(calls[0].prompt, /Traditional Chinese/);
  assert.match(calls[0].prompt, /JSON property names and state values exactly as specified/);
});

test('creates the visible overview only from complete memory in the current interface language', async () => {
  const calls = [];
  const client = createMemoryModelClient({
    getModelId: () => 'selected-model',
    getOutputLanguage: () => 'zh-TW',
    runModel: async input => {
      calls.push(input);
      return JSON.stringify({
        overview: '目前以 NUC 作為本機部署主機。',
        sections: [{ key: 'deployment', title: '部署', content: 'OpenClaw 目前使用 NUC。' }]
      });
    }
  });

  const overview = await client.summarizeOverview({
    memorySummary: {
      overview: '完整目前記憶。',
      sections: [{ title: '部署', content: 'OpenClaw 目前使用 NUC。' }]
    }
  });

  assert.equal(overview.sections[0].content, 'OpenClaw 目前使用 NUC。');
  assert.match(calls[0].prompt, /Traditional Chinese/);
  assert.match(calls[0].prompt, /Complete current memory summary/);
});

test('blocks visual media work for a selected model without attachment capability', async () => {
  const client = createMemoryModelClient({
    getModelId: () => 'text-only-model',
    runModel: async () => assert.fail('text-only model must not receive attachment bytes'),
    canInterpretAttachment: () => false
  });

  await assert.rejects(
    () => client.describe({ attachment: { mimeType: 'image/png', data: 'AA==' } }),
    /cannot interpret this attachment/
  );
});
