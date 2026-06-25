import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createLegacyConversationMailSender,
  sendConversationToMail
} from '../src/app/runtime/features/conversation-mail.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createDependencies = (overrides = {}) => ({
  getActiveConversation: () => ({
    id: 'conversation-1',
    title: 'Launch plan',
    model: 'model-1'
  }),
  getModels: () => [{ id: 'model-1', name: 'Model One' }],
  isCouncilEnabled: () => false,
  getCouncilTexts: () => ({ title: 'Council' }),
  postJsonWithReadableError: async () => {},
  now: () => new Date('2026-06-26T12:00:00.000Z'),
  logger: {
    log() {},
    error() {}
  },
  ...overrides
});

test('sendConversationToMail preserves the legacy endpoint and payload formatting', async () => {
  const calls = [];
  const dependencies = createDependencies({
    postJsonWithReadableError: async (...args) => calls.push(args)
  });

  await sendConversationToMail({
    parts: [
      { text: 'Hello' },
      { inlineData: { mimeType: 'image/png' } },
      {}
    ]
  }, 'World', dependencies);

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0][0],
    'https://script.google.com/macros/s/AKfycbzDz8mauVmRsJtSxpXbfMiMCnx0Mofqh0r3YV_riwRTwugf8EUgzsD_gCwfwSvmOqV4yg/exec'
  );
  assert.deepEqual(calls[0][1], {
    subject: 'Astra 對話紀錄: Launch plan',
    timestamp: '2026-06-26T12:00:00.000Z',
    conversation: 'Launch plan',
    model_used: 'Model One',
    user_message: 'Hello\n[附加檔案: image/png]\n',
    ai_response: 'World'
  });
});

test('sendConversationToMail preserves council and fallback model naming', async () => {
  const payloads = [];
  const sender = createLegacyConversationMailSender(createDependencies({
    getActiveConversation: () => ({ title: 'Council chat', model: 'missing' }),
    getModels: () => [],
    isCouncilEnabled: () => true,
    postJsonWithReadableError: async (_url, payload) => payloads.push(payload)
  }));

  await sender({ parts: [{ text: 'Question' }] }, 'Answer');

  assert.equal(payloads[0].model_used, 'Council');
  assert.equal(payloads[0].conversation, 'Council chat');
});

test('sendConversationToMail preserves caught network error logging behavior', async () => {
  const error = new Error('offline');
  const errors = [];

  await sendConversationToMail(
    { parts: [] },
    'Answer',
    createDependencies({
      postJsonWithReadableError: async () => {
        throw error;
      },
      logger: {
        log() {},
        error: (...args) => errors.push(args)
      }
    })
  );

  assert.equal(errors.length, 1);
  assert.equal(errors[0][1], error);
});

test('conversation mail module has no legacy fragment or virtual runtime dependency', () => {
  const source = readSource('src/app/runtime/features/conversation-mail.js');

  assert.match(source, /export\s+async\s+function\s+sendConversationToMail/);
  assert.match(source, /export\s+function\s+createLegacyConversationMailSender/);
  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/);
});
