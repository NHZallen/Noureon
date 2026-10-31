import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { isShareRoute, shareCodeOf } from '../src/app/share-page/share-route.js';
import { hydrateSharedSnapshot, sharedAssetUrl } from '../src/app/share-page/share-assets.js';
import { SHARE_PAGE_TEXTS } from '../src/app/share-page/share-texts.js';
import { initializeSharePage, markPageAsPrivate } from '../src/app/share-page/share-page.js';

const CODE = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6';
const SHARE_ID = '33333333-3333-4333-8333-333333333333';
const HASH = 'a'.repeat(64);
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

test('only /s/<code> opens the viewer, and a code that cannot be one is not read', () => {
  assert.equal(isShareRoute(`/s/${CODE}`), true);
  assert.equal(isShareRoute(`/s/${CODE}/`), true);
  assert.equal(isShareRoute('/s'), false);
  assert.equal(isShareRoute('/settings'), false);
  assert.equal(shareCodeOf(`/s/${CODE}`), CODE);
  assert.equal(shareCodeOf('/s/short'), '');
  assert.equal(shareCodeOf('/s/has space or ../dots'), '');
});

test('the address of a file is made only from a path that names a share and a hash', () => {
  assert.equal(sharedAssetUrl('https://x.supabase.co/', `${SHARE_ID}/${HASH}`), `https://x.supabase.co/storage/v1/object/public/shared-assets/${SHARE_ID}/${HASH}`);
  assert.equal(sharedAssetUrl('https://x.supabase.co', '../secret'), '');
  assert.equal(sharedAssetUrl('https://x.supabase.co', `${SHARE_ID}/..%2f${HASH}`), '');
});

test('the files come back into the parts, a picture keeps only its address, and a missing file is counted', async () => {
  const bytes = Buffer.from('hello');
  const requested = [];
  const fetchImpl = async (url) => { requested.push(url); return url.endsWith(HASH) ? { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } : { ok: false }; };
  const snapshot = { messages: [{ role: 'user', parts: [
    { inlineData: { mimeType: 'text/plain', name: 'a.txt', data: { __astraSharedAsset: { path: `${SHARE_ID}/${HASH}`, mimeType: 'text/plain', encoding: 'base64' } } } },
    { inlineData: { mimeType: 'image/png', data: { __astraSharedAsset: { path: `${SHARE_ID}/${'b'.repeat(64)}`, mimeType: 'image/png', encoding: 'data-url' } } } },
    { inlineData: { mimeType: 'image/png', data: { __astraSharedAsset: { missing: true } } } },
    { generatedImage: { id: 'g', cloudAsset: { __astraSharedAsset: { path: `${SHARE_ID}/${HASH}`, mimeType: 'image/png', encoding: 'blob' } } } },
    { text: 'hi' }
  ] }] };
  const { snapshot: out, missing } = await hydrateSharedSnapshot(snapshot, { baseUrl: 'https://x.supabase.co', fetchImpl });
  const parts = out.messages[0].parts;
  assert.equal(parts[0].inlineData.data, bytes.toString('base64'));
  assert.equal(parts[1].inlineData.data, '');
  assert.equal(parts[2].inlineData.data, '');
  assert.equal(missing, 2);
  assert.equal(parts[3].generatedImage.cloudAsset.url, `https://x.supabase.co/storage/v1/object/public/shared-assets/${SHARE_ID}/${HASH}`);
  assert.equal(parts[4].text, 'hi');
  assert.equal(requested.some((url) => url.includes('/b'.repeat(1))), true);
  assert.equal(requested.length, 2, 'a picture a model drew is not downloaded');
});

test('the page tells search engines to keep away and sends no referrer', async () => {
  const window = new Window({ url: `https://noureon.test/s/${CODE}` });
  try {
    window.document.head.innerHTML = '<link rel="canonical" href="https://noureon.com/"><meta property="og:url" content="https://noureon.com/">';
    markPageAsPrivate(window.document);
    assert.equal(window.document.querySelector('meta[name="robots"]').content, 'noindex, nofollow, noarchive');
    assert.equal(window.document.querySelector('meta[name="referrer"]').content, 'no-referrer');
    assert.equal(window.document.querySelector('link[rel="canonical"]'), null);
    markPageAsPrivate(window.document);
    assert.equal(window.document.querySelectorAll('meta[name="robots"]').length, 1);
  } finally { await window.happyDOM.abort(); }
});

test('every language of the viewer has the same words', () => {
  const keys = Object.keys(SHARE_PAGE_TEXTS.en).sort();
  for (const [language, table] of Object.entries(SHARE_PAGE_TEXTS)) assert.deepEqual(Object.keys(table).sort(), keys, language);
});

const open = async (path, { rpc, localStorage } = {}) => {
  const window = new Window({ url: `https://noureon.test${path}` });
  window.document.body.innerHTML = '<div id="app"></div>';
  window.document.head.innerHTML = '<title>x</title>';
  if (localStorage) Object.defineProperty(window, 'localStorage', { value: localStorage });
  const supabase = { rpc: async (name, args) => rpc(name, args) };
  const result = await initializeSharePage({ window, document: window.document, supabase, fetchImpl: async () => ({ ok: false }), baseUrl: 'https://x.supabase.co', renderMarkdown: (text) => `<p>${text.replace(/</g, '&lt;')}</p>` });
  return { window, result };
};

test('a share that exists is drawn with the icon, the title, who shared it, the messages and the way to report', async () => {
  const calls = [];
  const { window } = await open(`/s/${CODE}`, { rpc: async (name, args) => {
    calls.push([name, args]);
    if (name === 'report_shared_conversation') return { data: true, error: null };
    return { data: { title: 'Trip <plan>', mode: 'view', ownerName: 'Ada', createdAt: '2026-10-30T00:00:00Z', updatedAt: '2026-10-31T00:00:00Z', snapshot: { v: 1, title: 'Trip <plan>', modelName: 'Some Model', messages: [{ role: 'user', parts: [{ text: 'Where?' }] }, { role: 'model', parts: [{ text: 'Lisbon <b>' }] }] } }, error: null };
  } });
  try {
    const { document } = window;
    assert.deepEqual(calls[0], ['get_shared_conversation', { p_code: CODE }]);
    assert.equal(document.querySelector('.sp-header .sp-mark').getAttribute('src'), '/icon-192.png');
    assert.equal(document.querySelector('.sp-header .sp-name').textContent, 'Noureon');
    assert.equal(document.querySelector('.sp-title').textContent, 'Trip <plan>');
    assert.equal(document.querySelector('.sp-title b'), null);
    assert.match(document.querySelector('.sp-meta').textContent, /Ada/);
    assert.match(document.querySelector('.sp-meta').textContent, /Some Model/);
    assert.equal(document.querySelectorAll('#sp-messages .user-message, #sp-messages .model-message').length, 2);
    assert.equal(document.querySelector('.sp-action button'), null, 'a read only share has no button to continue');
    assert.equal(document.querySelector('meta[name="robots"]').content.startsWith('noindex'), true);
    document.querySelector('.sp-footer .sp-link').click();
    document.querySelector('.sp-report textarea').value = 'spam';
    document.querySelector('.sp-report').dispatchEvent(new window.Event('submit', { cancelable: true }));
    await tick();
    assert.deepEqual(calls[1], ['report_shared_conversation', { p_code: CODE, p_reason: 'spam' }]);
    assert.match(document.querySelector('.sp-report-slot').textContent, /\S/);
  } finally { await window.happyDOM.abort(); }
});

test('a share that can be continued has the button, which leaves the code for the app and goes there', async () => {
  const stored = {};
  const { window } = await open(`/s/${CODE}`, {
    localStorage: { setItem: (key, value) => { stored[key] = value; }, getItem: () => null, removeItem: () => {} },
    rpc: async () => ({ data: { title: 'T', mode: 'continue', ownerName: '', createdAt: '2026-10-30T00:00:00Z', updatedAt: '2026-10-30T00:00:00Z', snapshot: { v: 1, title: 'T', messages: [{ role: 'user', parts: [{ text: 'q' }] }] } }, error: null })
  });
  try {
    const button = window.document.querySelector('.sp-action button');
    assert.ok(button);
    assert.equal(window.document.querySelector('.sp-meta').textContent.includes('Ada'), false);
    window.location.assign = () => {};
    button.click();
    assert.equal(JSON.parse(stored['noureon:pending-share']).code, CODE);
  } finally { await window.happyDOM.abort(); }
});

test('a share that is gone, a code that cannot be one, and a failing database each say so', async () => {
  const gone = await open(`/s/${CODE}`, { rpc: async () => ({ data: null, error: null }) });
  const wrong = await open('/s/nope', { rpc: async () => { throw new Error('not asked'); } });
  const broken = await open(`/s/${CODE}`, { rpc: async () => ({ data: null, error: { message: 'x' } }) });
  try {
    assert.ok(gone.window.document.querySelector('.sp-notice'));
    assert.equal(gone.window.document.querySelector('.sp-messages'), null);
    assert.ok(wrong.window.document.querySelector('.sp-notice'));
    assert.ok(broken.window.document.querySelector('.sp-notice .sp-btn'), 'a failure offers to try again');
    assert.equal(gone.window.document.querySelector('.sp-footer .sp-link'), null, 'nothing to report when there is no conversation');
  } finally { for (const { window } of [gone, wrong, broken]) await window.happyDOM.abort(); }
});

test('?review=1 reads a share through the administrator function, and falls back to the ordinary read for anyone else', async () => {
  const snapshot = { v: 1, title: 'T', messages: [{ role: 'user', parts: [{ text: 'q' }] }] };
  const calls = [];
  const admin = await open(`/s/${CODE}?review=1`, { rpc: async (name) => { calls.push(name); return name === 'admin_get_shared_conversation' ? { data: { title: 'T', mode: 'view', status: 'suspended', createdAt: '2026-10-30T00:00:00Z', updatedAt: '2026-10-30T00:00:00Z', snapshot }, error: null } : { data: null, error: null }; } });
  try {
    assert.deepEqual(calls, ['admin_get_shared_conversation']);
    assert.match(admin.window.document.querySelector('.sp-banner').textContent, /paused|已暫停/);
    assert.ok(admin.window.document.querySelector('#sp-messages'));
  } finally { await admin.window.happyDOM.abort(); }
  const otherCalls = [];
  const other = await open(`/s/${CODE}?review=1`, { rpc: async (name) => { otherCalls.push(name); return name === 'admin_get_shared_conversation' ? { data: null, error: { message: 'Not allowed' } } : { data: null, error: null }; } });
  try {
    assert.deepEqual(otherCalls, ['admin_get_shared_conversation', 'get_shared_conversation']);
    assert.equal(other.window.document.querySelector('.sp-banner'), null);
    assert.ok(other.window.document.querySelector('.sp-notice'), 'a paused share is not there for anyone else');
  } finally { await other.window.happyDOM.abort(); }
  const plain = await open(`/s/${CODE}`, { rpc: async (name) => { assert.equal(name, 'get_shared_conversation', 'no review without ?review=1'); return { data: null, error: null }; } });
  await plain.window.happyDOM.abort();
});

test('the database client answers with something that can be waited for but has no catch: the review read still works', async () => {
  const snapshot = { v: 1, title: 'T', messages: [{ role: 'user', parts: [{ text: 'q' }] }] };
  const window = new Window({ url: `https://noureon.test/s/${CODE}?review=1` });
  window.document.body.innerHTML = '<div id="app"></div>';
  const thenable = (value) => ({ then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) });
  const supabase = { rpc: (name) => thenable(name === 'admin_get_shared_conversation' ? { data: { title: 'T', mode: 'view', status: 'suspended', createdAt: '2026-10-30T00:00:00Z', updatedAt: '2026-10-30T00:00:00Z', snapshot }, error: null } : { data: null, error: null }) };
  try {
    await initializeSharePage({ window, document: window.document, supabase, fetchImpl: async () => ({ ok: false }), baseUrl: 'https://x.supabase.co', renderMarkdown: (text) => `<p>${text}</p>` });
    assert.ok(window.document.querySelector('#sp-messages'), 'the share is drawn');
    assert.equal(window.document.querySelector('.sp-notice'), null);
  } finally { await window.happyDOM.abort(); }
});
