import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDisabledCouncilConfig,
  disableConversationCouncil
} from '../src/app/runtime/legacy-core/conversation-council-state.js';

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

// That a new conversation starts with the council off and that opening one turns it off is tested in tests/conversation-actions.test.js.
