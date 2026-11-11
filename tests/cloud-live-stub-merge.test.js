import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeRemoteWorkspaceAppData } from '../src/app/sync/cloud-sync-versioning.js';
import { mergeRemoteWithStubs } from '../src/app/runtime/features/cloud-live-stub-merge.js';
import { EMPTY_MESSAGES, defaultStubOf, isStub, stubObjectFrom } from '../src/app/runtime/kernel/conversation-stub.js';

const conv = (id, n, extra = {}) => ({ id, title: `T${id}`, createdAt: '2026-11-01T00:00:00.000Z', lastUpdatedAt: `2026-11-0${Math.min(9, n)}T00:00:00.000Z`, messages: Array.from({ length: n }, (_, i) => ({ id: `${id}-${i}`, parts: [{ text: `m${i}` }] })), ...extra });
const stub = (c) => stubObjectFrom(defaultStubOf(c));
const merge = (live, remote, protectedConversation) => mergeRemoteWorkspaceAppData(live, remote, protectedConversation);

test('without stubs it is the usual merge, untouched', () => {
  const live = { conversations: [conv('a', 2)], folders: [] };
  const remote = { conversations: [conv('a', 3)], folders: [] };
  assert.deepEqual(mergeRemoteWithStubs(live, remote, null, merge), merge(live, remote, null));
});

test('a conversation the sync did not touch (a stub of the cloud side) keeps the object the page holds, whole or stub', () => {
  const wholeA = conv('a', 3);
  const stubB = stub(conv('b', 2));
  const live = { conversations: [wholeA, stubB], folders: [] };
  const remote = { conversations: [stub(conv('a', 3)), stub(conv('b', 2)), stub(conv('c', 1))], folders: [] };
  const out = mergeRemoteWithStubs(live, remote, null, merge);
  assert.equal(out.conversations[0], wholeA, 'a conversation the page holds whole (maybe changed) is not replaced by an empty one');
  assert.equal(wholeA.messages.length, 3);
  assert.equal(out.conversations[1], stubB);
  assert.equal(isStub(out.conversations[2]), true, 'one the page does not have comes as the stub the sync gave');
  assert.deepEqual(out.conversations.map(c => c.id), ['a', 'b', 'c'], 'the order is the sync\'s');
});

test('a conversation the sync touched replaces the stub of the page IN PLACE (the held object is filled, not replaced)', () => {
  const held = stub(conv('a', 2));
  const live = { conversations: [held, stub(conv('b', 1))], folders: [] };
  const remote = { conversations: [conv('a', 5), stub(conv('b', 1))], folders: [] };
  const out = mergeRemoteWithStubs(live, remote, null, merge);
  assert.equal(out.conversations[0], held);
  assert.equal(isStub(held), false);
  assert.equal(held.messages.length, 5);
  assert.equal('__stub' in held, false);
  assert.equal(isStub(out.conversations[1]), true);
});

test('a conversation touched on both sides is merged as usual (the longer one wins), and the protected open chat and drafts are kept', () => {
  const live = { conversations: [conv('a', 6), stub(conv('z', 1)), conv('open', 2), conv('draft', 0, { isTemporary: true })], folders: [] };
  const remote = { conversations: [conv('a', 3), stub(conv('z', 1))], folders: [] };
  const out = mergeRemoteWithStubs(live, remote, live.conversations[2], merge);
  assert.equal(out.conversations.find(c => c.id === 'a').messages.length, 6);
  assert.ok(out.conversations.some(c => c.id === 'open'));
  assert.ok(out.conversations.some(c => c.id === 'draft'));
  assert.equal(out.conversations.filter(c => c.id === 'z').length, 1);
});

test('no stub of the page is ever turned into an empty chat that looks whole', () => {
  const live = { conversations: [stub(conv('a', 4))], folders: [] };
  const remote = { conversations: [stub(conv('a', 4))], folders: [] };
  const out = mergeRemoteWithStubs(live, remote, null, merge);
  assert.equal(out.conversations[0].messages, EMPTY_MESSAGES);
  assert.equal(isStub(out.conversations[0]), true);
});
