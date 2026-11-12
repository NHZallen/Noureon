import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { startLocalKeyNotice } from '../../src/app/runtime/security/local-key-notice.js';

test('the person is told once that the keys of this device cannot be read, however many keys say so', () => {
  const window = new Window();
  const notices = [];
  startLocalKeyNotice({ window, getText: (_key, fallback) => fallback, showNotification: (message, type) => notices.push({ message, type }) });
  window.dispatchEvent(new window.CustomEvent('noureon:local-keys-unreadable', { detail: { storageKey: 'a' } }));
  window.dispatchEvent(new window.CustomEvent('noureon:local-keys-unreadable', { detail: { storageKey: 'b' } }));
  assert.equal(notices.length, 1);
  assert.equal(notices[0].type, 'error');
  assert.match(notices[0].message, /API 金鑰讀不到/);
});

test('a key found unreadable before the notice started is told when it starts', async () => {
  const { createLocalKeySeal, getSharedLocalKeySeal } = await import('../../src/app/runtime/security/local-key-seal.js');
  const seal = getSharedLocalKeySeal();
  // The shared seal has no browser here (no IndexedDB): a sealed text cannot be opened, which is what counts.
  assert.equal((await seal.open('chatSensitiveConfig_v1_x', 'nd1.AAAA.BBBB')).unreadable, true);
  void createLocalKeySeal;
  const window = new Window();
  const notices = [];
  startLocalKeyNotice({ window, getText: (_key, fallback) => fallback, showNotification: (message) => notices.push(message) });
  assert.equal(notices.length, 1);
});
