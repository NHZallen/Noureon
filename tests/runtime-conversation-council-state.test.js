import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createDisabledCouncilConfig,
  disableConversationCouncil
} from '../src/app/runtime/legacy-core/conversation-council-state.js';

const readLegacyCore = () => readFileSync(
  new URL('../src/app/runtime/legacy-core/legacy-core.js', import.meta.url),
  'utf8'
);

test('createDisabledCouncilConfig preserves council selections while disabling it', () => {
  const original = {
    enabled: true,
    mode: 'deliberation',
    participantModelIds: ['model-a', 'model-b'],
    synthesizerModelId: 'model-c'
  };

  const result = createDisabledCouncilConfig(original, (value) => ({
    ...value,
    participantModelIds: [...value.participantModelIds]
  }));

  assert.equal(result.enabled, false);
  assert.equal(result.mode, 'deliberation');
  assert.deepEqual(result.participantModelIds, ['model-a', 'model-b']);
  assert.equal(result.synthesizerModelId, 'model-c');
  assert.notEqual(result, original);
  assert.notEqual(result.participantModelIds, original.participantModelIds);
  assert.equal(original.enabled, true);
});

test('disableConversationCouncil reports whether a persisted reset is needed', () => {
  const enabledConversation = {
    council: { enabled: true, participantModelIds: ['model-a', 'model-b'] }
  };
  const disabledConversation = {
    council: { enabled: false, participantModelIds: ['model-a', 'model-b'] }
  };

  assert.equal(disableConversationCouncil(enabledConversation), true);
  assert.equal(enabledConversation.council.enabled, false);
  assert.equal(disableConversationCouncil(disabledConversation), false);
  assert.equal(disabledConversation.council.enabled, false);
  assert.equal(disableConversationCouncil(null), false);
});

test('new and switched conversations are wired to start with council disabled', () => {
  const source = readLegacyCore();
  const createStart = source.indexOf('const createBaseConversation =');
  const newChatStart = source.indexOf('const startNewChat =', createStart);
  const loadStart = source.indexOf('const loadChat =', newChatStart);
  const loadEnd = source.indexOf('let cancelPendingMemoryCapture', loadStart);
  const createBody = source.slice(createStart, newChatStart);
  const loadBody = source.slice(loadStart, loadEnd);

  assert.match(
    createBody,
    /council:\s*createDisabledCouncilConfig\(currentConfig\.lastCouncilConfig,\s*cloneCouncilConfig\)/
  );
  assert.ok(
    loadBody.indexOf('conversationStateAccess.setCurrentConversationId(id)')
      < loadBody.indexOf('disableConversationCouncil(conv, cloneCouncilConfig)')
  );
  assert.ok(
    loadBody.indexOf('disableConversationCouncil(conv, cloneCouncilConfig)')
      < loadBody.indexOf('renderAll()')
  );
  assert.match(loadBody, /if \(councilWasEnabled\) \{\s*saveAppData\(\)\.catch/);
});
