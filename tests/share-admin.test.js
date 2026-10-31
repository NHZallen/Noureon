import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { isAdminSharesRoute, isReviewRequest } from '../src/app/share-page/share-route.js';
import { SHARE_ADMIN_TEXTS } from '../src/app/share-page/share-admin-texts.js';
import { initializeShareAdminPage } from '../src/app/share-page/share-admin-page.js';
import { createShareState } from '../src/app/runtime/share/share-state.js';
import { createShareClient } from '../src/app/runtime/share/share-client.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
const REPORTED = { share_id: 's1', code: 'A'.repeat(32), title: 'Strawberry <cake>', mode: 'continue', status: 'suspended', owner_id: 'u1', owner_email: 'ada@example.test', readers: 3, total_reports: 4, reasons: ['it is rude', '<b>x</b>'] };

const open = async ({ session = { user: {} }, admin = true, rows = [REPORTED], calls = [] } = {}) => {
  const window = new Window({ url: 'https://noureon.test/admin/shares' });
  window.document.body.innerHTML = '<div id="app"></div>';
  const supabase = {
    auth: { getSession: async () => ({ data: { session } }) },
    rpc: async (name, args) => { calls.push([name, args]); if (name === 'is_service_admin') return { data: admin, error: null }; if (name === 'admin_list_share_reports') return { data: rows, error: null }; return { data: true, error: null }; }
  };
  const result = await initializeShareAdminPage({ window, document: window.document, supabase });
  return { window, result, calls };
};

test('the routes of the review page and of the review of one share', () => {
  assert.equal(isAdminSharesRoute('/admin/shares'), true);
  assert.equal(isAdminSharesRoute('/admin/shares/'), true);
  assert.equal(isAdminSharesRoute('/admin'), false);
  assert.equal(isReviewRequest('?review=1'), true);
  assert.equal(isReviewRequest('?review=0'), false);
  assert.equal(isReviewRequest(''), false);
});

test('every language of the review page has the same words', () => {
  const keys = Object.keys(SHARE_ADMIN_TEXTS.en).sort();
  for (const [language, table] of Object.entries(SHARE_ADMIN_TEXTS)) assert.deepEqual(Object.keys(table).sort(), keys, language);
});

test('someone who is not signed in, or not named by the owner, gets nothing and is not told the page exists', async () => {
  const signedOut = await open({ session: null });
  const stranger = await open({ admin: false });
  try {
    assert.equal(signedOut.result.admin, false);
    assert.equal(signedOut.calls.length, 0);
    assert.equal(stranger.result.admin, false);
    assert.deepEqual(stranger.calls.map((call) => call[0]), ['is_service_admin'], 'the list is not even asked for');
    assert.equal(stranger.window.document.querySelectorAll('.sp-admin-card').length, 0);
    assert.equal(stranger.window.document.querySelector('meta[name="robots"]').content.startsWith('noindex'), true);
  } finally { await signedOut.window.happyDOM.abort(); await stranger.window.happyDOM.abort(); }
});

test('the owner sees each reported share with what was said as text, and can restore, clear and delete', async () => {
  const calls = [];
  const { window } = await open({ calls });
  try {
    const { document } = window;
    const card = document.querySelector('.sp-admin-card');
    assert.equal(card.querySelector('.sp-admin-title').textContent, 'Strawberry <cake>');
    assert.equal(card.querySelectorAll('b').length, 0, 'what a reader wrote is text');
    assert.match(card.querySelector('.sp-meta').textContent, /ada@example.test/);
    assert.equal(card.querySelector('a.sp-btn').getAttribute('href'), `/s/${'A'.repeat(32)}?review=1`);
    const button = (label) => [...card.querySelectorAll('button')].find((node) => node.textContent === label);
    const words = SHARE_ADMIN_TEXTS.en;
    assert.equal(button(words.pause), undefined, 'a paused share is not paused again');
    button(words.restore).click();
    await tick();
    assert.deepEqual(calls.find((call) => call[0] === 'admin_set_share_status')[1], { p_id: 's1', p_status: 'active' });
    const second = document.querySelector('.sp-admin-card');
    [...second.querySelectorAll('button')].find((node) => node.textContent === words.dismiss).click();
    await tick();
    assert.ok(calls.some((call) => call[0] === 'admin_dismiss_share_reports'));
    const del = [...document.querySelector('.sp-admin-card').querySelectorAll('button')].find((node) => node.textContent === words.remove);
    del.click();
    assert.equal(calls.some((call) => call[0] === 'admin_remove_share'), false, 'taking down asks once more');
    del.click();
    await tick();
    assert.deepEqual(calls.find((call) => call[0] === 'admin_remove_share')[1], { p_id: 's1' });
  } finally { await window.happyDOM.abort(); }
});

test('a share with nothing reported says so; a paused share of the person is listed but not counted', async () => {
  const empty = await open({ rows: [] });
  try { assert.match(empty.window.document.querySelector('.sp-loading').textContent, /./); assert.equal(empty.window.document.querySelectorAll('.sp-admin-card').length, 0); } finally { await empty.window.happyDOM.abort(); }
  const client = createShareClient({ getSupabase: () => ({ rpc: async () => ({ data: [{ id: 'a', conversation_id: 'c', code: 'x', mode: 'view', show_name: false, title: 'T', status: 'suspended', created_at: 'x', updated_at: 'x' }], error: null }) }) });
  const state = createShareState();
  state.replace((await client.list()).items);
  assert.equal(state.all().length, 1);
  assert.equal(state.all()[0].suspended, true);
  assert.equal(state.active().length, 0);
  assert.equal(state.activeFor('c').length, 0);
});

test('a share taken down is a record: it can only be deleted, and the person sees it as taken down and not counted', async () => {
  const taken = await open({ rows: [{ ...REPORTED, status: 'removed' }] });
  try {
    const card = taken.window.document.querySelector('.sp-admin-card');
    assert.equal(card.querySelector('a.sp-btn'), null, 'nothing to read');
    const labels = [...card.querySelectorAll('button')].map((node) => node.textContent);
    assert.ok(labels.includes(SHARE_ADMIN_TEXTS.en.deleteRecord));
    assert.equal(labels.includes(SHARE_ADMIN_TEXTS.en.remove), false);
  } finally { await taken.window.happyDOM.abort(); }
  const client = createShareClient({ getSupabase: () => ({ rpc: async () => ({ data: [{ id: 'a', conversation_id: 'c', code: 'x', mode: 'view', show_name: false, title: 'T', status: 'removed', created_at: 'x', updated_at: 'x' }], error: null }) }) });
  const state = createShareState();
  state.replace((await client.list()).items);
  assert.equal(state.all()[0].removed, true);
  assert.equal(state.active().length, 0);
});
