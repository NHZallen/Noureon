import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('an edit stops the visual check and the reply being written, then cuts the conversation, then sends; a plain send is still locked by a check', () => {
  const submit = source('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const start = submit.indexOf('const handleFormSubmit = async');
  const body = submit.slice(start, submit.indexOf('const preparedSubmit = Object.keys', start));
  const order = ['vc.cancel(activeId)', 'await stopReplyAndWait(', 'await effectiveSubmitOptions.prepare?.()'].map((part) => body.indexOf(part));
  assert.ok(order.every((at) => at >= 0), 'all three steps are there');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in that order');
  assert.match(body, /else if \(vc\.isRunning\(activeId\)\) \{[\s\S]*sendLockedNotice[\s\S]*return;/);
  assert.match(body, /else \{\s*onRegularSubmit\(\);/);
});

test('a visual check whose message was cut away meanwhile adds nothing to the conversation, and one whose copies were refreshed still does', async () => {
  const { findMessageInChat } = await import('../src/app/ui/files/vision/vision-eligibility.js');
  const message = { id: 'm1', role: 'model', parts: [{ text: 'deck' }] };
  const conversation = { id: 'c1', messages: [{ id: 'u1', role: 'user', parts: [] }, message] };
  const active = (value) => () => value;
  assert.deepEqual(findMessageInChat({ conversation, message, getActiveConversation: active(conversation) }), { conversation, message }, 'still there');

  // The cloud sync replaced the conversation and its messages with refreshed copies of the same ones: the check carries on in them.
  const refreshed = { id: 'c1', messages: [{ id: 'u1', role: 'user', parts: [] }, { id: 'm1', role: 'model', parts: [{ text: 'deck' }] }] };
  const found = findMessageInChat({ conversation, message, getActiveConversation: active(refreshed) });
  assert.equal(found.conversation, refreshed);
  assert.equal(found.message, refreshed.messages[1]);

  // The person edited an earlier message: it is cut away in the live chat, whatever the copy the check holds still says.
  const cut = { id: 'c1', messages: [] };
  assert.equal(findMessageInChat({ conversation, message, getActiveConversation: active(cut) }), null);

  // Another chat is open now: the conversation the check holds is the one that has it.
  const other = { id: 'c2', messages: [] };
  assert.equal(findMessageInChat({ conversation, message, getActiveConversation: active(other) }).conversation, conversation);
  assert.equal(findMessageInChat({ conversation, message }).conversation, conversation, 'no way to ask: the same');
});

test('both visual checks look for their message in the live chat before they add their result, and add it there', () => {
  for (const path of ['src/app/ui/files/vision/vision-check.js', 'src/app/ui/files/vision/vision-free-check.js']) {
    const check = source(path);
    const lookup = check.indexOf('findMessageInChat({ conversation, message, getActiveConversation })');
    assert.ok(lookup > 0 && lookup < check.indexOf('inChat.conversation.messages.push(revised)'), path);
    assert.doesNotMatch(check, /(?<!inChat\.)conversation\.messages\.push\(revised\)/, 'nothing is pushed to the copy the check started from');
  }
});
