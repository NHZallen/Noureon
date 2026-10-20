import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiKeyWarningBadgeUpdater } from '../src/app/runtime/legacy-core/api-key-warning-badge.js';

function harness({ conversation = { id: 'c', model: 'm' }, council = false, councilReason = '', keys = {} } = {}) {
  const hidden = new Set(['hidden']);
  const badge = {
    classList: {
      add: (name) => hidden.add(name),
      toggle: (name, force) => (force ? hidden.add(name) : hidden.delete(name))
    }
  };
  const update = createApiKeyWarningBadgeUpdater({
    elements: { apiKeyWarningBadge: badge },
    getActiveConversation: () => conversation,
    normalizeConversationModel: () => ({ provider: 'gemini' }),
    isCouncilEnabled: () => council,
    getCouncilValidation: () => ({ reason: councilReason }),
    getApiKeyForProvider: (provider) => keys[provider] || ''
  });
  return { update, isHidden: () => hidden.has('hidden') };
}

test('the badge shows when the model of the open conversation has no key, and hides when it has one', () => {
  const missing = harness();
  missing.update();
  assert.equal(missing.isHidden(), false);
  const present = harness({ keys: { gemini: 'k' } });
  present.update();
  assert.equal(present.isHidden(), true);
});

test('with a council the badge follows its validation; with no conversation it is hidden', () => {
  const council = harness({ council: true, councilReason: 'missingApiKey', keys: { gemini: 'k' } });
  council.update();
  assert.equal(council.isHidden(), false);
  const otherReason = harness({ council: true, councilReason: 'tooFewModels' });
  otherReason.update();
  assert.equal(otherReason.isHidden(), true);
  const none = harness({ conversation: null });
  none.update();
  assert.equal(none.isHidden(), true);
});
