import assert from 'node:assert/strict';
import test from 'node:test';

import { executeReply } from '../server/executor.js';
import { researchReportsForApi } from '../src/app/ui/research/research-history.js';

const report = { title: 'Batteries', text: '# Batteries\n\nClaim [1].', sources: [{ n: 1, url: 'https://a.example/x', title: 'A page' }, { n: 2, url: 'https://b.example' }] };

test('the model is shown the whole report with its sources, and a line for a research that did not end in one', () => {
  const history = [
    { role: 'user', parts: [{ text: 'research batteries' }] },
    { role: 'model', parts: [{ text: '' }, { researchReport: report }] },
    { role: 'model', parts: [{ text: '' }, { researchPlan: { phase: 'failed', topic: 'cells' } }] },
    { role: 'model', parts: [{ text: '' }, { researchPlan: { phase: 'researching', title: 'T' } }] }
  ];
  const shown = researchReportsForApi(history);
  assert.equal(shown[0], history[0], 'other messages are the same');
  assert.match(shown[1].parts[1].text, /Deep research report "Batteries"/);
  assert.match(shown[1].parts[1].text, /# Batteries\n\nClaim \[1\]\./);
  assert.match(shown[1].parts[1].text, /Sources:\n\[1\] A page — https:\/\/a\.example\/x\n\[2\] https:\/\/b\.example — https:\/\/b\.example/);
  assert.match(shown[2].parts[1].text, /"cells" was started but did not end in a report/);
  assert.match(shown[3].parts[1].text, /"T" is still in progress/);
  assert.ok(history[1].parts[1].researchReport, 'the stored message is not changed');
});

test('a reply after a research is sent the report', async () => {
  const requests = [];
  await executeReply({
    spec: {
      protocol: 1,
      conversationId: '123e4567-e89b-12d3-a456-426614174000',
      assistantMessageId: '223e4567-e89b-12d3-a456-426614174001',
      sequence: 3,
      model: { provider: 'openrouter', id: 'test/model', info: { id: 'm', apiId: 'test/model', name: 'M', provider: 'openrouter' } },
      request: { history: [{ role: 'user', parts: [{ text: 'research batteries' }] }, { role: 'model', parts: [{ text: '' }, { researchReport: report }] }], currentMessage: { parts: [{ text: 'Make the summary shorter.' }] }, systemInstruction: '', language: 'en' },
      tools: { webSearch: 'off', searchProvider: 'tavily', advanced: false }
    },
    secrets: { providerKey: 'sk-provider-secret-value' },
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      return new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
  });
  assert.match(JSON.stringify(requests[0].messages), /Claim \[1\]/);
});
