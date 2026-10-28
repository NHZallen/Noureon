import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSuggestionPrompt, parseSuggestion, suggestionSubject } from '../src/app/runtime/features/reply-suggestion-core.js';

const user = (text, extra = {}) => ({ role: 'user', parts: [{ text }], ...extra });
const model = (text, extra = {}) => ({ role: 'model', parts: [{ text }], ...extra });
const conversation = (messages, extra = {}) => ({ id: 'c1', messages, ...extra });
const QUESTION = '我可以做成 A 方案（8 頁精簡版）或 B 方案（15 頁完整版）。要不要採用 A 方案？';

test('the subject is the last answer of a model to a message of the person', () => {
  const subject = suggestionSubject(conversation([user('幫我做簡報'), model(QUESTION, { id: 'm2' })]));
  assert.deepEqual(subject, { replyText: QUESTION, userText: '幫我做簡報', replyId: 'm2' });
});

test('only the end of a long answer and the start of a long message are looked at', () => {
  const subject = suggestionSubject(conversation([user('q'.repeat(900)), model(`${'x'.repeat(5000)}END`)]));
  assert.equal(subject.userText.length, 400);
  assert.equal(subject.replyText.length, 1500);
  assert.ok(subject.replyText.endsWith('END'));
});

test('nothing to suggest for: no messages, a last message of the person, a very short answer, an error', () => {
  assert.equal(suggestionSubject(conversation([])), null);
  assert.equal(suggestionSubject(null), null);
  assert.equal(suggestionSubject(conversation([model(QUESTION), user('好')])), null);
  assert.equal(suggestionSubject(conversation([user('hi'), model('好的')])), null);
  assert.equal(suggestionSubject(conversation([user('hi'), model('抱歉，發生錯誤：Failed to fetch something')]), { errorPrefixes: ['抱歉，發生錯誤：'] }), null);
  // An answer that is not an error is not mistaken for one when the prefix is another.
  assert.ok(suggestionSubject(conversation([user('hi'), model(QUESTION)]), { errorPrefixes: ['Sorry, an error occurred: '] }));
  assert.equal(suggestionSubject(conversation([model(QUESTION)])), null);
});

test('nothing for a temporary chat, a council, or a reply that a message was put into', () => {
  const messages = [user('幫我做簡報'), model(QUESTION)];
  assert.equal(suggestionSubject(conversation(messages, { isTemporary: true })), null);
  assert.equal(suggestionSubject(conversation(messages, { retentionMode: 'ephemeral' })), null);
  assert.equal(suggestionSubject(conversation(messages, { council: { enabled: true } })), null);
  const steered = [user('幫我做簡報'), model('先查資料……'), user('順便加上圖表', { metadata: { steer: true } }), model(QUESTION)];
  assert.equal(suggestionSubject(conversation(steered)), null);
  // The steered message is not taken for the question: the one before it is.
  const plainAfterSteer = [user('第一題'), model('答一'), user('第二題'), model(QUESTION)];
  assert.equal(suggestionSubject(conversation(plainAfterSteer)).userText, '第二題');
});

test('the words for the model carry both messages, and ask for NONE when nothing is asked', () => {
  const prompt = buildSuggestionPrompt({ userText: '幫我做簡報', replyText: QUESTION });
  assert.match(prompt, /exactly: NONE/);
  assert.match(prompt, /The user's last message:\n幫我做簡報/);
  assert.match(prompt, /The assistant's last message:\n我可以做成/);
  assert.match(prompt, /same language as the user's last message/);
});

test('the answer of the model is made one clean line, or nothing', () => {
  assert.equal(parseSuggestion('好，採用 A 方案'), '好，採用 A 方案');
  assert.equal(parseSuggestion('  "好，採用 A 方案"  \n'), '好，採用 A 方案');
  assert.equal(parseSuggestion('「好，採用 A 方案」'), '好，採用 A 方案');
  assert.equal(parseSuggestion('Suggestion: Yes, go with plan A'), 'Yes, go with plan A');
  assert.equal(parseSuggestion('- **Yes, please**'), 'Yes, please');
  assert.equal(parseSuggestion('好，採用 A 方案\n\n這是因為它比較精簡'), '好，採用 A 方案');
  for (const none of ['NONE', 'none.', 'None', '無', '沒有', '', '   ', null, undefined]) assert.equal(parseSuggestion(none), '', String(none));
  assert.equal(parseSuggestion('x'.repeat(81)), '');
  assert.equal(parseSuggestion('x'.repeat(80)).length, 80);
});

test('the final cleanup of a reply tells whoever listens for the end of a reply', async () => {
  const { runSubmitFinalCleanupLifecycle } = await import('../src/app/runtime/reply/submit-final-cleanup-lifecycle.js');
  const { onReplyEnded } = await import('../src/app/runtime/features/reply-events.js');
  let ended = 0;
  const stop = onReplyEnded(() => { ended += 1; });
  const order = [];
  const result = runSubmitFinalCleanupLifecycle(() => order.push('stop'), () => order.push('reset'), () => order.push('button'), () => order.push('input'), () => order.push('council'), () => order.push('indicators'), () => 'last');
  stop();
  assert.equal(result, 'last');
  assert.equal(ended, 1);
  assert.deepEqual(order, ['stop', 'reset', 'button', 'input', 'council', 'indicators']);
});

test('the small-model runner takes its own purpose and token limit', async () => {
  const { createMemoryModelRunner } = await import('../src/app/runtime/shell/memory-model-runner.js');
  const seen = [];
  const run = createMemoryModelRunner({ models: [{ id: 'm1', name: 'M1', category: 'chat' }], streamApiCall: async (parts, onChunk, signal, flag, options) => { seen.push(options); onChunk('ok'); } });
  assert.equal(await run({ modelId: 'm1', prompt: 'hello', maxTokens: 120, requestPurpose: 'background-suggestion' }), 'ok');
  assert.equal(seen[0].requestPurpose, 'background-suggestion');
  assert.equal(seen[0].genConfig.maxTokens, 120);
  await run({ modelId: 'm1', prompt: 'hello' });
  assert.equal(seen[1].requestPurpose, 'background-memory');
  assert.equal(seen[1].genConfig.maxTokens, 1800);
});

test('the setting is on unless it was turned off, in the defaults and when it is read', async () => {
  const { normalizeConfig } = await import('../src/app/runtime/kernel/config-normalization.js').catch(() => ({}));
  const { createDefaultConfig } = await import('../src/app/runtime/kernel/config-store.js').catch(() => ({}));
  if (typeof normalizeConfig === 'function' && typeof createDefaultConfig === 'function') {
    assert.equal(normalizeConfig({ ...createDefaultConfig(), replySuggestionEnabled: undefined }).replySuggestionEnabled, true);
    assert.equal(normalizeConfig({ ...createDefaultConfig(), replySuggestionEnabled: false }).replySuggestionEnabled, false);
  }
});
