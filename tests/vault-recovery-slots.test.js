import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_RECOVERY_SLOTS, addRecoverySlot, createPasskeySlot, findRecoverySlotByCredential, isSlotCurrent, normalizeRecoverySlots, openRecoverySlot, removeRecoverySlot, rewrapRecoverySlot
} from '../src/app/sync/vault-recovery-slots.js';
import { isInAppBrowser, passkeyPrfAvailability, readAnyRecoveryPasskey, registerRecoveryPasskey } from '../src/app/sync/passkey-prf.js';

const secretA = () => Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const secretB = () => Uint8Array.from({ length: 32 }, (_, index) => 200 - index);
const record = { version: 1, algorithm: 'AES-GCM', salt: 'c2FsdA==', iv: 'aXY=', check: 'Y2hlY2s=' };
const salt = Buffer.alloc(32, 7).toString('base64');
const make = (over = {}) => createPasskeySlot({ secret: secretA(), credentialId: 'cred-1', prfSalt: salt, password: 'sync-password-1', record, label: 'iPhone', ...over });

test('a slot holds the sync password and record sealed: nothing readable is in it, and the right secret opens it', async () => {
  const slot = await make();
  assert.equal(slot.type, 'passkey');
  assert.ok(!JSON.stringify(slot).includes('sync-password-1'), 'the password is not in the stored text');
  assert.ok(!JSON.stringify(slot).includes('c2FsdA=='), 'nor the record');
  assert.deepEqual(await openRecoverySlot(slot, secretA()), { password: 'sync-password-1', record });
});

test('a wrong secret, a changed slot, or a short secret does not open it', async () => {
  const slot = await make();
  await assert.rejects(openRecoverySlot(slot, secretB()), { code: 'recovery-slot-unreadable' });
  const flipped = { ...slot, ciphertext: Buffer.from(Buffer.from(slot.ciphertext, 'base64').map((byte, index) => (index === 0 ? byte ^ 1 : byte))).toString('base64') };
  await assert.rejects(openRecoverySlot(flipped, secretA()), { code: 'recovery-slot-unreadable' });
  await assert.rejects(openRecoverySlot({ ...slot, prfSalt: Buffer.alloc(32, 9).toString('base64') }, secretA()), { code: 'recovery-slot-unreadable' }, 'the salt is part of the key');
  await assert.rejects(openRecoverySlot(slot, new Uint8Array(16)), { code: 'recovery-secret-invalid' });
  await assert.rejects(openRecoverySlot({ type: 'x' }, secretA()), { code: 'recovery-slot-invalid' });
});

test('two slots of the same passwords are different (a new IV each time), and a re-wrap keeps the passkey and id', async () => {
  const one = await make();
  const two = await make();
  assert.notEqual(one.ciphertext, two.ciphertext);
  assert.notEqual(one.id, two.id);
  const next = await rewrapRecoverySlot(one, secretA(), { password: 'new-sync-password', record: { ...record, iv: 'bmV3' } });
  assert.equal(next.id, one.id);
  assert.equal(next.credentialId, one.credentialId);
  assert.equal(next.createdAt, one.createdAt);
  assert.notEqual(next.iv, one.iv);
  assert.deepEqual(await openRecoverySlot(next, secretA()), { password: 'new-sync-password', record: { ...record, iv: 'bmV3' } });
  assert.equal((await openRecoverySlot(one, secretA())).password, 'sync-password-1', 'the old slot still opens with the old password: replacing it in the list is the caller\'s job');
});

test('the list: malformed entries are dropped, ids are unique, the limit holds, add replaces, remove removes', async () => {
  const slot = await make();
  assert.deepEqual(normalizeRecoverySlots([slot, slot, { type: 'passkey' }, null, 'x']), [slot]);
  assert.deepEqual(normalizeRecoverySlots(undefined), []);
  const second = await make({ credentialId: 'cred-2' });
  const list = addRecoverySlot(addRecoverySlot([], slot), second);
  assert.equal(list.length, 2);
  assert.equal(findRecoverySlotByCredential(list, 'cred-2').id, second.id);
  assert.deepEqual(removeRecoverySlot(list, slot.id), [second]);
  const replaced = addRecoverySlot(list, { ...slot, label: 'renamed' });
  assert.equal(replaced.length, 2);
  assert.equal(replaced[0].label, 'renamed');
  let full = [];
  for (let index = 0; index < MAX_RECOVERY_SLOTS; index += 1) full = addRecoverySlot(full, await make({ credentialId: `c${index}` }));
  assert.throws(() => addRecoverySlot(full, { ...slot, id: 'one-more' }), { code: 'recovery-slots-full' });
});

// --- The passkey helper, with a fake browser. -------------------------------------------------------------------------
const makeCredential = ({ rawId, prf }) => ({ rawId: rawId.buffer, getClientExtensionResults: () => ({ prf }) });
const urlOf = (bytes) => Buffer.from(bytes).toString('base64url');

test('registering a passkey that gives its secret as it is made needs one confirmation; one that does not is asked again', async () => {
  const id = Uint8Array.from([1, 2, 3, 4]);
  const calls = [];
  const secret = secretA();
  const direct = { credentials: { create: async (options) => { calls.push('create'); assert.equal(options.publicKey.rp.id, 'noureon.test'); assert.deepEqual(options.publicKey.excludeCredentialIds, undefined); return makeCredential({ rawId: id, prf: { enabled: true, results: { first: secret.buffer } } }); }, get: async () => { calls.push('get'); } } };
  const first = await registerRecoveryPasskey({ rpId: 'noureon.test', userId: new Uint8Array(16), userName: 'p', nav: direct });
  assert.deepEqual(calls, ['create']);
  assert.equal(first.credentialId, urlOf(id));
  assert.deepEqual([...first.secret], [...secret]);

  const lazy = { credentials: {
    create: async () => makeCredential({ rawId: id, prf: { enabled: true } }),
    get: async (options) => { calls.push('get'); const evals = options.publicKey.extensions.prf.evalByCredential; assert.ok(evals[urlOf(id)].first.length === 32); return makeCredential({ rawId: id, prf: { results: { first: secret.buffer } } }); }
  } };
  const second = await registerRecoveryPasskey({ rpId: 'noureon.test', userId: new Uint8Array(16), nav: lazy });
  assert.deepEqual([...second.secret], [...secret]);
  assert.deepEqual(calls, ['create', 'get']);
});

test('a passkey without PRF, a cancelled confirmation and a passkey that is there already are told apart', async () => {
  const noPrf = { credentials: { create: async () => makeCredential({ rawId: Uint8Array.from([9]), prf: { enabled: false } }) } };
  await assert.rejects(registerRecoveryPasskey({ rpId: 'x', userId: new Uint8Array(16), nav: noPrf }), { code: 'passkey-prf-unsupported' });
  // A sheet the person closes takes a moment (a refusal that comes at once is "blocked": see below).
  const cancelled = { credentials: { create: async () => { await new Promise((resolve) => setTimeout(resolve, 350)); throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } } };
  await assert.rejects(registerRecoveryPasskey({ rpId: 'x', userId: new Uint8Array(16), nav: cancelled }), { code: 'passkey-cancelled' });
  const exists = { credentials: { create: async () => { throw Object.assign(new Error('x'), { name: 'InvalidStateError' }); } } };
  await assert.rejects(registerRecoveryPasskey({ rpId: 'x', userId: new Uint8Array(16), nav: exists }), { code: 'passkey-exists' });
});

test('recovering asks every passkey of the slots, each with its own salt, and says which one answered', async () => {
  const slotA = await make({ credentialId: urlOf([1, 1]) });
  const slotB = await make({ credentialId: urlOf([2, 2]), prfSalt: Buffer.alloc(32, 5).toString('base64') });
  let asked;
  const nav = { credentials: { get: async (options) => {
    asked = options.publicKey;
    return makeCredential({ rawId: Uint8Array.from([2, 2]), prf: { results: { first: secretB().buffer } } });
  } } };
  const found = await readAnyRecoveryPasskey({ rpId: 'noureon.test', slots: [slotA, slotB], nav });
  assert.equal(found.slot.id, slotB.id);
  assert.deepEqual([...found.secret], [...secretB()]);
  assert.equal(asked.allowCredentials.length, 2);
  assert.deepEqual(Object.keys(asked.extensions.prf.evalByCredential).sort(), [slotA.credentialId, slotB.credentialId].sort());
  assert.equal(asked.userVerification, 'required');
  await assert.rejects(readAnyRecoveryPasskey({ rpId: 'x', slots: [], nav }), { code: 'passkey-none' });
});

test('the browser says whether passkeys with PRF can be used: yes, no, or it cannot say', async () => {
  const nav = { credentials: { create() {} } };
  assert.equal(await passkeyPrfAvailability({ pkc: undefined, nav }), 'no');
  assert.equal(await passkeyPrfAvailability({ pkc: { getClientCapabilities: async () => ({ 'extension:prf': true }) }, nav }), 'yes');
  assert.equal(await passkeyPrfAvailability({ pkc: { getClientCapabilities: async () => ({ 'extension:prf': false }) }, nav }), 'no');
  assert.equal(await passkeyPrfAvailability({ pkc: {}, nav }), 'unknown');
  assert.equal(await passkeyPrfAvailability({ pkc: { getClientCapabilities: async () => { throw new Error('x'); } }, nav }), 'unknown');
});

test('a slot keeps the fingerprint of its vault record in the open, so one sealed for an earlier password can be told from a current one', async () => {
  const slot = await make();
  assert.equal(slot.recordFingerprint, record.check);
  assert.equal(isSlotCurrent(slot, record), true);
  assert.equal(isSlotCurrent(slot, { ...record, check: 'another-record' }), false);
  const sealed = await rewrapRecoverySlot(slot, secretA(), { password: 'sync-password-2', record: { ...record, check: 'another-record' } });
  assert.equal(isSlotCurrent(sealed, { ...record, check: 'another-record' }), true);
  assert.equal(isSlotCurrent({ ...slot, recordFingerprint: undefined }, record), false, 'a slot with no fingerprint is not taken for current');
});

test('a refusal of the browser keeps its own name, so the page can show what kind it was', async () => {
  const nav = { credentials: { create: async () => { await new Promise((resolve) => setTimeout(resolve, 350)); throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } } };
  await assert.rejects(
    registerRecoveryPasskey({ rpId: 'noureon.test', userId: new Uint8Array(4), nav }),
    (error) => error.code === 'passkey-cancelled' && error.detail === 'NotAllowedError'
  );
});

test('an app\'s own browser view is known by its name, and a refusal that comes at once (no sheet was shown) is told apart from a cancelled one', async () => {
  const google = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/445.5 Mobile/15E148 Safari/604.1';
  const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  assert.equal(isInAppBrowser(google), true);
  assert.equal(isInAppBrowser(safari), false);
  const pkc = class { static getClientCapabilities() { return Promise.resolve({ 'extension:prf': true }); } };
  assert.equal(await passkeyPrfAvailability({ pkc, nav: { credentials: { create() {} }, userAgent: google } }), 'in-app');
  assert.equal(await passkeyPrfAvailability({ pkc, nav: { credentials: { create() {} }, userAgent: safari } }), 'yes');

  const refuse = (delay) => ({ credentials: { create: () => new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })), delay)) } });
  await assert.rejects(registerRecoveryPasskey({ rpId: 'noureon.test', userId: new Uint8Array(4), nav: refuse(5) }), (error) => error.code === 'passkey-blocked');
  await assert.rejects(registerRecoveryPasskey({ rpId: 'noureon.test', userId: new Uint8Array(4), nav: refuse(400) }), (error) => error.code === 'passkey-cancelled');
});
