import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import en from '../src/data/i18n/en.js';
import { importSharedConversation, snapshotFileBytes } from '../src/app/runtime/share/share-import.js';
import { startShares } from '../src/app/runtime/share/start-shares.js';
import { announceUser } from '../src/app/runtime/features/user-ready.js';
import { SERVICES, provideService } from '../src/app/runtime/services.js';

const CODE = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6';
const SHARE_ID = '44444444-4444-4444-8444-444444444444';
const HASH = 'c'.repeat(64);
const defaults = { model: 'm1', provider: 'p1', genConfig: { temperature: 1 }, council: { enabled: false } };
const png = Buffer.from('png-bytes');
const fetchImpl = async () => ({ ok: true, arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) });
const marker = (size = 100) => ({ __astraSharedAsset: { path: `${SHARE_ID}/${HASH}`, mimeType: 'image/png', encoding: 'base64', size } });
const share = (extra = {}) => ({ mode: 'continue', ownerName: 'Ada', title: 'Trip', snapshot: { v: 1, title: 'Trip', messages: [
  { role: 'user', createdAt: '2026-10-30T00:00:00Z', parts: [{ text: 'Look' }, { inlineData: { mimeType: 'image/png', name: 'a.png', data: marker() } }] },
  { role: 'model', createdAt: '2026-10-30T00:00:01Z', parts: [{ text: 'Nice' }, { generatedImage: { id: 'g', mediaType: 'image/png', cloudAsset: { __astraSharedAsset: { path: `${SHARE_ID}/${HASH}`, mimeType: 'image/png', encoding: 'blob', size: 50 } } } }] }
] }, ...extra });
const run = (overrides = {}) => importSharedConversation({ code: CODE, read: async () => share(), fetchImpl, baseUrl: 'https://x.supabase.co', defaults, uuid: (() => { let n = 0; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; })(), now: () => '2026-10-31T00:00:00.000Z', ...overrides });

test('the sizes of the files in a snapshot add up', () => {
  assert.equal(snapshotFileBytes(share().snapshot.messages), 150);
});

test('a share that can be continued becomes a new conversation with the files attached and the mark kept for good', async () => {
  const result = await run();
  assert.equal(result.ok, true);
  const conversation = result.conversation;
  assert.equal(conversation.title, 'Trip');
  assert.deepEqual(conversation.sharedFrom, { at: '2026-10-31T00:00:00.000Z', name: 'Ada' });
  assert.equal(conversation.isTemporary, false);
  assert.equal(conversation.model, 'm1');
  assert.equal(conversation.messages.length, 2);
  assert.equal(conversation.messages[0].parts[1].inlineData.data, png.toString('base64'));
  assert.equal(conversation.messages[1].parts[1].inlineData.data, png.toString('base64'), 'a picture a model drew is attached as a picture');
  assert.equal(conversation.messages[1].parts[1].generatedImage, undefined);
  assert.equal(result.textOnly, false);
  assert.notEqual(conversation.id, SHARE_ID);
});

test('a read only share, a share that is gone and a failing read are not copied', async () => {
  assert.deepEqual(await run({ read: async () => share({ mode: 'view' }) }), { ok: false, code: 'gone' });
  assert.deepEqual(await run({ read: async () => null }), { ok: false, code: 'gone' });
  assert.deepEqual(await run({ read: async () => { throw new Error('x'); } }), { ok: false, code: 'failed' });
});

test('when the cloud space cannot hold the files, only the text is copied', async () => {
  const result = await run({ quota: async () => ({ usedBytes: 500 * 1024 * 1024 - 10, quotaBytes: 500 * 1024 * 1024 }) });
  assert.equal(result.ok, true);
  assert.equal(result.textOnly, true);
  assert.deepEqual(result.conversation.messages.map((message) => message.parts), [[{ text: 'Look' }], [{ text: 'Nice' }]]);
  const unknown = await run({ quota: async () => ({ usedBytes: null, quotaBytes: 1 }) });
  assert.equal(unknown.textOnly, false, 'an unknown use does not stop the copy');
});

test('the app takes the code the viewer left, once there is a cloud account, and opens the new conversation', async () => {
  const window = new Window({ url: 'https://noureon.test/' });
  const { document } = window;
  try {
    const conversations = [];
    const saved = []; const opened = []; const notes = [];
    const storage = new Map([['noureon:pending-share', JSON.stringify({ code: CODE, at: Date.now() })]]);
    provideService(SERVICES.cloudSync, { getStatus: () => ({ enabled: true }), flush: async () => {} });
    announceUser(document, { supabaseUserId: 'u1', username: 'ada' });
    const supabase = { rpc: async (name) => (name === 'get_shared_conversation' ? { data: share(), error: null } : { data: [], error: null }) };
    window.fetch = fetchImpl;
    startShares({
      document, window,
      configAccess: { getUiLanguage: () => 'en', getConfig: () => ({ defaultModel: 'x' }) },
      dataStore: { getConversations: () => conversations }, i18n: { en },
      saveAppData: async (options) => { saved.push(options); }, showNotification: (message, kind) => notes.push([message, kind]),
      showCustomConfirm: async () => true, renderSidebar: () => {}, openConversation: (id) => opened.push(id),
      client: { list: async () => ({ ok: true, items: [] }) }, supabase, quota: async () => ({ usedBytes: 0, quotaBytes: 500 * 1024 * 1024 }),
      storage: { getItem: (key) => storage.get(key) ?? null, removeItem: (key) => storage.delete(key), setItem: (key, value) => storage.set(key, value) }
    });
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(storage.has('noureon:pending-share'), false, 'the code is taken once');
    assert.equal(conversations.length, 1);
    assert.equal(conversations[0].sharedFrom.name, 'Ada');
    assert.deepEqual(saved, [{ immediateCloudSync: true }]);
    assert.deepEqual(opened, [conversations[0].id]);
    assert.deepEqual(notes, [[en.csImportDone, 'success']]);
  } finally {
    provideService(SERVICES.cloudSync, null);
    announceUser(document, null);
    await window.happyDOM.abort();
  }
});

test('deleting a conversation is never held up by the lookup of its shares: a lookup that hangs or fails lets the delete go on', async () => {
  const window = new Window({ url: 'https://noureon.test/' });
  try {
    provideService(SERVICES.cloudSync, { getStatus: () => ({ enabled: true }), flush: async () => {} });
    for (const list of [() => new Promise(() => {}), async () => { throw new Error('down'); }]) {
      const api = startShares({
        document: window.document, window, configAccess: { getUiLanguage: () => 'en', getConfig: () => ({}) }, dataStore: { getConversations: () => [] }, i18n: { en },
        saveAppData: async () => {}, showNotification: () => {}, showCustomConfirm: async () => { throw new Error('asked'); }, renderSidebar: () => {}, client: { list }, lookupWaitMs: 20, storage: { getItem: () => null, removeItem() {}, setItem() {} }
      });
      const started = Date.now();
      assert.equal(await api.confirmDelete(['c1']), true);
      assert.ok(Date.now() - started < 1000);
    }
    // With the shares known, the person is asked, and the answer decides.
    const api = startShares({
      document: window.document, window, configAccess: { getUiLanguage: () => 'en', getConfig: () => ({}) }, dataStore: { getConversations: () => [] }, i18n: { en },
      saveAppData: async () => {}, showNotification: () => {}, showCustomConfirm: async () => false, renderSidebar: () => {},
      client: { list: async () => ({ ok: true, items: [{ id: 'a', conversationId: 'c1', code: 'x', mode: 'view', title: 'T', deleted: false }] }) }, lookupWaitMs: 200, storage: { getItem: () => null, removeItem() {}, setItem() {} }
    });
    assert.equal(await api.confirmDelete(['c1']), false);
    assert.equal(await api.confirmDelete(['other']), true);
  } finally {
    provideService(SERVICES.cloudSync, null);
    await window.happyDOM.abort();
  }
});
