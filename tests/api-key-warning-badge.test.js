import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiKeyWarningBadgeUpdater } from '../src/app/runtime/shell/api-key-warning-badge.js';

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

test('with a wait to settle, the warning is not shown before the keys have had their time, and shows if they do not come', () => {
  const timers = [];
  const listeners = new Map();
  const eventTarget = { addEventListener: (name, fn) => listeners.set(name, fn) };
  const hidden = new Set(['hidden']);
  const badge = { classList: { toggle: (name, force) => (force ? hidden.add(name) : hidden.delete(name)) } };
  const keys = {};
  const update = createApiKeyWarningBadgeUpdater({
    elements: { apiKeyWarningBadge: badge },
    getActiveConversation: () => ({ id: 'c' }),
    normalizeConversationModel: () => ({ provider: 'gemini' }),
    getApiKeyForProvider: (provider) => keys[provider] || '',
    settleMs: 4000,
    setTimer: (fn, ms) => timers.push({ fn, ms }),
    eventTarget
  });
  update();
  assert.equal(hidden.has('hidden'), true, 'no flash while the keys may still come');
  // The keys arrive (the sync): the warning never showed.
  keys.gemini = 'k';
  listeners.get('astra:cloud-sensitive-config')();
  assert.equal(hidden.has('hidden'), true);
  keys.gemini = '';
  update();
  assert.equal(hidden.has('hidden'), false, 'once settled, a missing key is told at once');

  // No keys came: the wait ends and the warning shows.
  const later = new Set(['hidden']);
  const timersLater = [];
  const updateLater = createApiKeyWarningBadgeUpdater({
    elements: { apiKeyWarningBadge: { classList: { toggle: (name, force) => (force ? later.add(name) : later.delete(name)) } } },
    getActiveConversation: () => ({ id: 'c' }),
    normalizeConversationModel: () => ({ provider: 'gemini' }),
    settleMs: 4000,
    setTimer: (fn, ms) => timersLater.push({ fn, ms }),
    eventTarget: null
  });
  updateLater();
  assert.equal(later.has('hidden'), true);
  assert.equal(timersLater[0].ms, 4000);
  timersLater[0].fn();
  assert.equal(later.has('hidden'), false);
});
