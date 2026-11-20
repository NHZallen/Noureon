// The link of an invite code of the browser agent: the address, what the start of the page keeps, and what waits for the app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { PENDING_INVITE_KEY, clearPendingInvite, inviteCodeOf, inviteUrl, readPendingInvite, rememberInviteCode } from '../src/app/runtime/browser-agent/browser-invite-link.js';

test('the address and the code in it go both ways', () => {
  const url = inviteUrl('https://noureon.com/', 'nrn-abcd-2345');
  assert.equal(url, 'https://noureon.com/#browser-invite=NRN-ABCD-2345');
  assert.equal(inviteCodeOf(new URL(url).hash), 'NRN-ABCD-2345');
});

test('something that is not a code is not taken', () => {
  for (const hash of ['', '#', '#browser-invite=', '#browser-invite=<script>', '#browser-invite=a b', '#other=NRN-ABCD-2345', '#browser-invite=ZZZZZZZZZZZZZZZZZZZZZZZZZZZ']) assert.equal(inviteCodeOf(hash), '', hash);
});

test('the start of the page keeps the code and takes it out of the address', () => {
  const window = new Window({ url: 'https://noureon.test/?x=1#browser-invite=NRN-ABCD-2345' });
  assert.equal(rememberInviteCode(window, 1000), 'NRN-ABCD-2345');
  assert.equal(window.location.hash, '');
  assert.equal(window.location.search, '?x=1');
  assert.equal(readPendingInvite(window.localStorage, 2000), 'NRN-ABCD-2345');
});

test('an address without a code changes nothing', () => {
  const window = new Window({ url: 'https://noureon.test/#other' });
  assert.equal(rememberInviteCode(window), '');
  assert.equal(window.location.hash, '#other');
  assert.equal(window.localStorage.getItem(PENDING_INVITE_KEY), null);
});

test('a code that waited more than a day is forgotten, and a code can be cleared', () => {
  const window = new Window({ url: 'https://noureon.test/#browser-invite=NRN-ABCD-2345' });
  rememberInviteCode(window, 0);
  assert.equal(readPendingInvite(window.localStorage, 24 * 60 * 60 * 1000 + 1), '');
  assert.equal(readPendingInvite(window.localStorage, 1000), 'NRN-ABCD-2345');
  clearPendingInvite(window.localStorage);
  assert.equal(readPendingInvite(window.localStorage, 1000), '');
});

test('a storage that fails does not break the page', () => {
  const window = new Window({ url: 'https://noureon.test/#browser-invite=NRN-ABCD-2345' });
  Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  assert.equal(rememberInviteCode(window), 'NRN-ABCD-2345');
  assert.equal(readPendingInvite({ getItem() { throw new Error('blocked'); } }), '');
});
