import assert from 'node:assert/strict';
import test from 'node:test';

import { createVisionCheckScheduler } from '../src/app/runtime/features/vision-check-scheduler.js';

const deckMessage = { parts: [{ text: '```file deck.pptx\n```' }] };

const harness = () => {
  const changes = [];
  const scheduler = createVisionCheckScheduler({
    getConfig: () => ({ visionCheckEnabled: true }),
    getActiveConversation: () => null,
    normalizeConversationModel: () => ({ id: 'vision-model' }),
    isCouncilEnabled: () => false,
    modelSupportsVision: () => true,
    document: { querySelectorAll: () => [] },
    logger: { error: () => {} },
    onChange: (ids) => changes.push(ids)
  });
  return { scheduler, changes };
};

test('a chat is marked as being checked from the moment its check is scheduled, and is freed when it is stopped', async () => {
  const { scheduler, changes } = harness();
  assert.equal(scheduler.isRunning('c1'), false);
  scheduler.schedule({ conversation: { id: 'c1' }, message: deckMessage });
  assert.equal(scheduler.isRunning('c1'), true, 'locked at once');
  assert.deepEqual(changes.at(-1), ['c1']);
  scheduler.cancel('c1');
  assert.equal(scheduler.isRunning('c1'), false, 'stopping frees it without waiting for the check to wind down');
  assert.deepEqual(changes.at(-1), []);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(scheduler.isRunning('c1'), false);
});

test('a reply with no deck, or a model that cannot see images, starts no check and locks nothing', () => {
  const { scheduler, changes } = harness();
  scheduler.schedule({ conversation: { id: 'c2' }, message: { parts: [{ text: 'just text' }] } });
  assert.equal(scheduler.isRunning('c2'), false);
  assert.deepEqual(changes, []);
});

test('sending is refused while the chat is under its visual check, before anything is prepared or cancelled', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/app/runtime/legacy-core/submit-input-council-lifecycle.js', import.meta.url), 'utf8');
  const submit = source.slice(source.indexOf('const handleFormSubmit'));
  const gate = submit.indexOf('vc.isRunning(activeId)');
  assert.ok(gate > 0 && gate < submit.indexOf('prepareSubmitResponse'), 'the gate comes first');
  // Only an edit stops the check (it cuts the conversation under it); a new message does not.
  const beforeGate = submit.slice(0, gate);
  assert.match(beforeGate, /if \(isEdit\) \{[\s\S]*vc\.cancel\(activeId\)/);
  assert.doesNotMatch(submit.slice(gate, submit.indexOf('prepareSubmitResponse')), /vc\.cancel/, 'a new message no longer cancels the check');
});
