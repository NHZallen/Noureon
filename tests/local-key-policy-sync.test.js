import assert from 'node:assert/strict';
import test from 'node:test';
import { startLocalKeyPolicySync } from '../src/app/runtime/security/local-key-policy-sync.js';
import { DEFAULT_REAUTH_DAYS, normalizeLocalKeyPolicy } from '../src/app/runtime/security/local-key-policy.js';

// A device: what it does now (own), a settings object, and the events of a window.
function setup({ own = null, config = {}, vault = true, unlocked = true, passkey = true } = {}) {
  const calls = [];
  const state = { own, config: { ...config }, unlocked, saved: 0 };
  const target = new EventTarget();
  const window = {
    addEventListener: (...args) => target.addEventListener(...args),
    removeEventListener: (...args) => target.removeEventListener(...args),
    setTimeout: (fn) => { window.pending.push(fn); return window.pending.length; },
    clearTimeout: () => {},
    pending: []
  };
  const protection = {
    protection: () => state.own,
    hasVault: async () => vault,
    async enable({ days }) { calls.push(['enable', days]); state.own = { days }; target.dispatchEvent(new Event('noureon:local-keys-changed')); },
    async disable() { calls.push(['disable']); state.own = null; target.dispatchEvent(new Event('noureon:local-keys-changed')); },
    async setDays(days) { calls.push(['days', days]); state.own = { days }; target.dispatchEvent(new Event('noureon:local-keys-changed')); }
  };
  const settings = { getConfig: () => state.config, update: (patch) => { Object.assign(state.config, patch); }, save: async () => { state.saved += 1; } };
  const sync = startLocalKeyPolicySync({ window, protection, settings, canTurnOn: async () => passkey, isUnlocked: () => state.unlocked, warn: () => {} });
  return { calls, state, sync, window, target };
}

test('the choice is read back as { on, days }, or null while nothing was chosen', () => {
  assert.equal(normalizeLocalKeyPolicy(undefined), null);
  assert.equal(normalizeLocalKeyPolicy('on'), null);
  assert.deepEqual(normalizeLocalKeyPolicy({ on: true, days: 3 }), { on: true, days: 3 });
  assert.deepEqual(normalizeLocalKeyPolicy({ on: 'yes', days: 5 }), { on: false, days: DEFAULT_REAUTH_DAYS });
  assert.deepEqual(normalizeLocalKeyPolicy({ on: true, days: 0 }), { on: true, days: 0 });
});

test('a change made on this device is written to the settings, with its days', async () => {
  const { state, target } = setup({ config: { localKeyProtection: { on: false, days: 7 } } });
  state.own = { days: 14 };
  target.dispatchEvent(new Event('noureon:local-keys-changed'));
  assert.deepEqual(state.config.localKeyProtection, { on: true, days: 14 });
  await Promise.resolve();
  assert.equal(state.saved, 1);
  state.own = null;
  target.dispatchEvent(new Event('noureon:local-keys-changed'));
  assert.deepEqual(state.config.localKeyProtection, { on: false, days: 14 }, 'turning it off keeps the days for the next time');
});

test('nothing is written when the settings already say the same, and nothing is invented for a device that never used it', async () => {
  const { state, target, sync } = setup({ config: {} });
  target.dispatchEvent(new Event('noureon:local-keys-changed'));
  assert.equal(state.config.localKeyProtection, undefined);
  assert.equal(await sync.reconcile(), '');
  assert.equal(state.saved, 0);
});

test('a device with the protection already on, and no choice in the settings, makes its own the first choice', async () => {
  const { state, sync } = setup({ own: { days: 3 }, config: {} });
  assert.equal(await sync.reconcile(), 'published');
  assert.deepEqual(state.config.localKeyProtection, { on: true, days: 3 });
});

test('the settings say on: this device turns it on with the days of the settings', async () => {
  const { calls, state, sync } = setup({ config: { localKeyProtection: { on: true, days: 14 } } });
  assert.equal(await sync.reconcile(), 'enabled');
  assert.deepEqual(calls, [['enable', 14]]);
  assert.deepEqual(state.config.localKeyProtection, { on: true, days: 14 }, 'what it did is not written back as a new choice');
  assert.equal(state.saved, 0);
});

test('the settings say off: this device turns it off; only the days differ: only the days change', async () => {
  const off = setup({ own: { days: 7 }, config: { localKeyProtection: { on: false, days: 7 } } });
  assert.equal(await off.sync.reconcile(), 'disabled');
  assert.deepEqual(off.calls, [['disable']]);
  const days = setup({ own: { days: 7 }, config: { localKeyProtection: { on: true, days: 1 } } });
  assert.equal(await days.sync.reconcile(), 'days');
  assert.deepEqual(days.calls, [['days', 1]]);
  const same = setup({ own: { days: 7 }, config: { localKeyProtection: { on: true, days: 7 } } });
  assert.equal(await same.sync.reconcile(), '');
  assert.deepEqual(same.calls, []);
});

test('with the sync vault locked, turning it on or off waits (nothing is touched) and happens after the unlock', async () => {
  const on = setup({ unlocked: false, config: { localKeyProtection: { on: true, days: 7 } } });
  assert.equal(await on.sync.reconcile(), '');
  const off = setup({ own: { days: 7 }, unlocked: false, config: { localKeyProtection: { on: false, days: 7 } } });
  assert.equal(await off.sync.reconcile(), '');
  assert.deepEqual([...on.calls, ...off.calls], []);
  on.state.unlocked = true;
  on.target.dispatchEvent(new Event('astra:sync-vault-unlocked'));
  for (const fn of on.window.pending.splice(0)) fn();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(on.calls, [['enable', 7]]);
});

test('no sync password, or no passkey, means the settings cannot turn it on here', async () => {
  const noVault = setup({ vault: false, config: { localKeyProtection: { on: true, days: 7 } } });
  assert.equal(await noVault.sync.reconcile(), '');
  const noPasskey = setup({ passkey: false, config: { localKeyProtection: { on: true, days: 7 } } });
  assert.equal(await noPasskey.sync.reconcile(), '');
  assert.deepEqual([...noVault.calls, ...noPasskey.calls], []);
});

test('a failure is reported and leaves the device as it was; the next event tries again', async () => {
  const warnings = [];
  const state = { own: null };
  const target = new EventTarget();
  const window = { addEventListener: (...a) => target.addEventListener(...a), removeEventListener: (...a) => target.removeEventListener(...a), setTimeout: () => 1, clearTimeout() {} };
  const protection = { protection: () => state.own, hasVault: async () => true, enable: async () => { throw new Error('boom'); } };
  const sync = startLocalKeyPolicySync({ window, protection, settings: { getConfig: () => ({ localKeyProtection: { on: true, days: 7 } }), update() {}, save: async () => {} }, warn: (...a) => warnings.push(a), isUnlocked: () => true });
  assert.equal(await sync.reconcile(), '');
  assert.equal(warnings.length, 1);
  assert.equal(state.own, null);
});

test('the settings are there a little after the start: nothing happens until they are', async () => {
  const state = { own: { days: 7 }, access: null, config: {} };
  const target = new EventTarget();
  const window = { addEventListener: (...a) => target.addEventListener(...a), removeEventListener: (...a) => target.removeEventListener(...a), setTimeout: () => 1, clearTimeout() {} };
  const protection = { protection: () => state.own, hasVault: async () => true };
  const sync = startLocalKeyPolicySync({ window, protection, settings: () => state.access, isUnlocked: () => true });
  assert.equal(await sync.reconcile(), '');
  assert.equal(sync.publish(), false);
  state.access = { getConfig: () => state.config, update: (patch) => Object.assign(state.config, patch), save: async () => {} };
  assert.equal(await sync.reconcile(), 'published');
  assert.deepEqual(state.config.localKeyProtection, { on: true, days: 7 });
});
