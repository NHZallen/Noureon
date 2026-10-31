import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import en from '../src/data/i18n/en.js';
import { createShareClient, shareUrl, SHARE_MAX } from '../src/app/runtime/share/share-client.js';
import { createShareState } from '../src/app/runtime/share/share-state.js';
import { setShares, shareTagsHtml, confirmDeleteShared } from '../src/app/runtime/share/share-ref.js';
import { openShareDialog, failureText } from '../src/app/ui/share/share-dialog.js';
import { ensureSharedItemsCard } from '../src/app/ui/share/shared-items-card.js';

const CONV = '11111111-1111-4111-8111-111111111111';
const text = (key, values = {}) => String(en[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
const withPage = async (run) => {
  const window = new Window({ url: 'https://noureon.test/' });
  const { document } = window;
  try { await run({ window, document }); } finally { await window.happyDOM.abort(); }
};
const okShare = (extra = {}) => ({ ok: true, status: 201, data: { share: { id: '22222222-2222-4222-8222-222222222222', code: 'a'.repeat(32), mode: 'view', showName: false, title: 'Trip', createdAt: '2026-10-31T00:00:00Z', ...extra } } });

test('the address of a share is the page of the site', () => {
  assert.equal(shareUrl('abc', 'https://noureon.com/'), 'https://noureon.com/s/abc');
});

test('the client sends the name only when the person chose to show it, and understands the failures', async () => {
  const sent = [];
  const answers = [okShare({ showName: true }), { ok: false, status: 409, data: { error: { reason: 'limit', limit: 30 } } }, { ok: false, status: 413, data: { error: { reason: 'too_large', what: 'files' } } }, { ok: false, status: 404, data: {} }, { ok: false, status: 401, data: {} }];
  const client = createShareClient({ request: async (method, path, options) => { sent.push({ method, path, body: JSON.parse(options.body) }); return answers.shift(); } });
  const first = await client.create({ conversationId: CONV, mode: 'continue', showName: true, ownerName: 'Ada' });
  assert.equal(first.ok, true);
  assert.deepEqual(sent[0].body, { conversationId: CONV, mode: 'continue', showName: true, ownerName: 'Ada' });
  assert.deepEqual(await client.create({ conversationId: CONV, mode: 'view', showName: false, ownerName: 'Ada' }), { ok: false, code: 'limit', max: 30 });
  assert.equal(sent[1].body.ownerName, '');
  assert.deepEqual(await client.create({ conversationId: CONV, mode: 'view' }), { ok: false, code: 'too_large', what: 'files' });
  assert.equal((await client.refresh('x')).code, 'gone');
  assert.equal((await client.create({ conversationId: CONV, mode: 'view' })).code, 'sign_in');
  assert.equal(failureText(text, { code: 'limit', max: SHARE_MAX }).includes('30'), true);
});

test('the client lists and revokes through the database, newest first, and never throws', async () => {
  const calls = [];
  const supabase = { rpc: async (name, args) => { calls.push([name, args]); return name === 'list_my_conversation_shares'
    ? { data: [{ id: 'a', conversation_id: CONV, code: 'c1', mode: 'continue', show_name: true, title: 'T', status: 'conversation_deleted', created_at: '2026-10-30T00:00:00Z', updated_at: '2026-10-30T00:00:00Z' }], error: null }
    : { data: true, error: null }; } };
  const client = createShareClient({ getSupabase: () => supabase });
  const listed = await client.list();
  assert.equal(listed.items[0].deleted, true);
  assert.equal(listed.items[0].mode, 'continue');
  assert.equal((await client.revoke('a')).ok, true);
  assert.deepEqual(calls[1], ['revoke_conversation_share', { p_id: 'a' }]);
  assert.equal((await createShareClient({ getSupabase: () => null }).list()).code, 'sign_in');
  assert.equal((await createShareClient({ getSupabase: () => { throw new Error('boom'); } }).list()).ok, false);
});

test('the state tells which conversations have a share that works', () => {
  const state = createShareState();
  let changes = 0;
  state.onChange(() => { changes += 1; });
  state.replace([{ id: 'a', conversationId: CONV, deleted: false }, { id: 'b', conversationId: 'other', deleted: true }]);
  assert.equal(state.activeFor(CONV).length, 1);
  assert.equal(state.activeFor('other').length, 0);
  state.remove('a');
  assert.equal(state.active().length, 0);
  assert.equal(changes, 2);
});

test('the sidebar tags: "Shared" while a share works, "From a share" for good, and the delete is asked about', async () => {
  const state = createShareState();
  state.replace([{ id: 'a', conversationId: CONV, deleted: false }]);
  let asked = null;
  setShares({ state, confirmDelete: async (ids) => { asked = ids; return false; } });
  assert.match(shareTagsHtml({ id: CONV }, text), />Shared</);
  const both = shareTagsHtml({ id: CONV, sharedFrom: { at: 'x' } }, text);
  assert.match(both, /From a share/);
  assert.match(both, /Shared/);
  assert.equal(shareTagsHtml({ id: 'zzz' }, text), '');
  assert.equal(await confirmDeleteShared([CONV]), false);
  assert.deepEqual(asked, [CONV]);
  setShares(null);
  assert.equal(shareTagsHtml({ id: CONV }, text), '');
  assert.equal(await confirmDeleteShared([CONV]), true);
});

test('the dialog makes a link, copies it, updates it and revokes it', async () => {
  await withPage(async ({ window, document }) => {
    const state = createShareState();
    const calls = [];
    const client = {
      create: async (args) => { calls.push(['create', args]); return { ok: true, share: { id: 'sid', code: 'c'.repeat(32), mode: args.mode, showName: args.showName, title: 'Trip', createdAt: '2026-10-31T00:00:00Z' } }; },
      refresh: async (id) => { calls.push(['refresh', id]); return { ok: true, share: { title: 'Trip 2' } }; },
      revoke: async (id) => { calls.push(['revoke', id]); return { ok: true }; }
    };
    const copied = []; const notes = []; let flushed = 0;
    const closed = openShareDialog({ document, text, client, state, conversation: { id: CONV, title: 'Trip' }, ownerName: 'Ada', flush: async () => { flushed += 1; }, copy: async (v) => { copied.push(v); return true; }, notify: (m, k) => notes.push([m, k]), confirm: async () => true });
    assert.equal(document.querySelectorAll('input[type=radio]').length, 2);
    document.querySelectorAll('input[type=radio]')[1].click();
    document.querySelector('.cs-check input').click();
    [...document.querySelectorAll('.cs-btn')].find((b) => b.textContent === en.csCreate).click();
    await tick();
    assert.deepEqual(calls[0][1], { conversationId: CONV, mode: 'continue', showName: true, ownerName: 'Ada' });
    assert.equal(flushed, 1);
    assert.equal(state.activeFor(CONV).length, 1);
    assert.equal(document.querySelector('.cs-link input').value, `https://noureon.test/s/${'c'.repeat(32)}`);
    [...document.querySelectorAll('.cs-btn')].find((b) => b.textContent === en.csCopy).click();
    await tick();
    assert.deepEqual(copied, [`https://noureon.test/s/${'c'.repeat(32)}`]);
    [...document.querySelectorAll('.cs-btn')].find((b) => b.textContent === en.csUpdate).click();
    await tick();
    assert.deepEqual(calls[1], ['refresh', 'sid']);
    [...document.querySelectorAll('.cs-btn')].find((b) => b.textContent === en.csRevoke).click();
    await tick();
    assert.deepEqual(calls[2], ['revoke', 'sid']);
    assert.equal(state.all().length, 0);
    assert.equal(await closed, null);
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(document.querySelector('.cs-overlay'), null);
  });
});

test('the dialog opens on the link of a share the conversation already has, and a failure is told in words', async () => {
  await withPage(async ({ document }) => {
    const state = createShareState();
    const client = { create: async () => ({ ok: false, code: 'limit', max: 30 }), refresh: async () => ({ ok: false, code: 'gone' }), revoke: async () => ({ ok: true }) };
    const existing = { id: 'sid', conversationId: CONV, code: 'd'.repeat(32), mode: 'view', title: 'Trip', deleted: false };
    const closed = openShareDialog({ document, text, client, state, conversation: { id: CONV, title: 'Trip' }, existing, copy: async () => true });
    assert.equal(document.querySelector('.cs-link input').value.endsWith('d'.repeat(32)), true);
    [...document.querySelectorAll('.cs-btn')].find((b) => b.textContent === en.csUpdate).click();
    await tick();
    assert.equal(document.querySelector('.cs-message').textContent, en.csErrGone);
    [...document.querySelectorAll('.cs-btn')].find((b) => b.textContent === en.csClose).click();
    assert.equal((await closed).id, 'sid');
  });
});

test('the card lists the shares with their permission, marks a deleted conversation and removes a record', async () => {
  await withPage(async ({ document }) => {
    document.body.innerHTML = '<div id="data-management-section"><div class="pz"><div class="pz-danger"></div></div></div>';
    const state = createShareState();
    state.replace([
      { id: 'a', conversationId: CONV, code: 'e'.repeat(32), mode: 'continue', title: 'Trip <b>', deleted: false, createdAt: '2026-10-30T00:00:00Z' },
      { id: 'b', conversationId: 'gone', code: 'f'.repeat(32), mode: 'view', title: 'Old', deleted: true, createdAt: '2026-10-01T00:00:00Z' }
    ]);
    const revoked = [];
    const client = { revoke: async (id) => { revoked.push(id); return { ok: true }; } };
    ensureSharedItemsCard({ document, config: { uiLanguage: 'en' }, elements: {}, state, client, text, reload: async () => ({ ok: true }), cloudOn: () => true, copy: async () => true, notify: () => {}, confirm: async () => true });
    ensureSharedItemsCard({ document, config: { uiLanguage: 'en' }, elements: {}, state, client, text, reload: async () => ({ ok: true }), cloudOn: () => true, copy: async () => true, notify: () => {}, confirm: async () => true });
    await tick();
    const block = document.getElementById('shared-items-block');
    assert.equal(document.querySelectorAll('#shared-items-block').length, 1);
    assert.match(block.textContent, /1\/30/);
    assert.match(block.textContent, /Trip <b>/);
    assert.equal(block.querySelectorAll('b').length, 0);
    assert.match(block.textContent, /Can continue/);
    assert.match(block.textContent, new RegExp(en.csRowDeleted));
    assert.equal(block.querySelectorAll('.cs-item.is-gone').length, 1);
    const remove = [...block.querySelectorAll('.cs-btn')].find((b) => b.textContent === en.csRowRemove);
    remove.click();
    await tick();
    assert.deepEqual(revoked, ['b']);
    assert.equal(block.querySelectorAll('.cs-item').length, 1);
    [...block.querySelectorAll('.cs-btn')].find((b) => b.textContent === en.csRowRevoke).click();
    await tick();
    assert.deepEqual(revoked, ['b', 'a']);
    assert.match(block.textContent, new RegExp(en.csCardEmpty));
    assert.equal(document.getElementById('shared-items-block').nextElementSibling, document.querySelector('.pz-danger'));
  });
});

test('without a cloud account the card is hidden', async () => {
  await withPage(async ({ document }) => {
    document.body.innerHTML = '<div id="data-management-section"></div>';
    ensureSharedItemsCard({ document, config: { uiLanguage: 'en' }, elements: {}, state: createShareState(), client: {}, text, reload: async () => { throw new Error('not asked'); }, cloudOn: () => false, copy: async () => true, notify: () => {}, confirm: async () => true });
    assert.equal(document.getElementById('shared-items-block').textContent, '');
  });
});
