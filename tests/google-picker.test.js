import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { GOOGLE_FILE_MAX_BYTES, createGooglePicker, googlePickerConfigured } from '../src/app/runtime/projects/google-picker.js';

// Google's own picker: the scripts are loaded, the person signs in with the narrow scope, Google's window is shown with its places, and the picked files are taken with the token.

const CONFIG = { clientId: 'client.apps.example', apiKey: 'API-KEY', appId: '123456789' };

function setup({ docs = [], action = 'picked', tokenError = null, fetchImpl } = {}) {
  const window = new Window({ url: 'https://noureon.test/projects' });
  const { document } = window;
  const state = { scripts: [], gapiLoads: [], clients: [], tokenRequests: 0, views: [], builder: {}, shown: 0, fetched: [] };
  // The scripts "load" at once, and put Google's objects on the window as the real ones do.
  document.head.appendChild = (tag) => {
    state.scripts.push(tag.src);
    setTimeout(() => tag.onload?.(), 0);
    return tag;
  };
  window.gapi = { load: (name, options) => { state.gapiLoads.push(name); options.callback(); } };
  class View { constructor(id) { this.id = id; state.views.push(this); this.calls = []; } setIncludeFolders(v) { this.calls.push(['folders', v]); return this; } setSelectFolderEnabled(v) { this.calls.push(['selectFolder', v]); return this; } setOwnedByMe(v) { this.calls.push(['ownedByMe', v]); return this; } setStarred(v) { this.calls.push(['starred', v]); return this; } }
  class Builder {
    constructor() { state.builder.views = []; }
    addView(view) { state.builder.views.push(view); return this; }
    enableFeature(feature) { state.builder.feature = feature; return this; }
    setOAuthToken(value) { state.builder.token = value; return this; }
    setDeveloperKey(value) { state.builder.key = value; return this; }
    setAppId(value) { state.builder.appId = value; return this; }
    setLocale(value) { state.builder.locale = value; return this; }
    setOrigin(value) { state.builder.origin = value; return this; }
    setCallback(callback) { state.builder.callback = callback; return this; }
    build() { return { setVisible: () => { state.shown += 1; setTimeout(() => state.builder.callback(action === 'picked' ? { action: 'picked', docs } : { action }), 0); } }; }
  }
  window.google = {
    accounts: { oauth2: { initTokenClient: (options) => { state.clients.push(options); return { requestAccessToken: () => { state.tokenRequests += 1; setTimeout(() => (tokenError ? options.error_callback(tokenError) : options.callback({ access_token: `TOKEN-${state.tokenRequests}`, expires_in: 3600 })), 0); } }; } } },
    picker: { DocsView: View, PickerBuilder: Builder, ViewId: { DOCS: 'docs', RECENTLY_PICKED: 'recent' }, Feature: { MULTISELECT_ENABLED: 'multi' }, Action: { PICKED: 'picked', CANCEL: 'cancel' } }
  };
  const fetchStub = fetchImpl || (async (url, options) => { state.fetched.push([url, options.headers.Authorization, options.redirect]); return new Response(new Uint8Array([1, 2, 3])); });
  const picker = createGooglePicker({ config: CONFIG, document, win: window, fetchImpl: fetchStub, getLanguage: () => 'zh-TW' });
  return { picker, state, window };
}

test('the picker is there only when the three keys are', () => {
  assert.equal(googlePickerConfigured(CONFIG), true);
  assert.equal(googlePickerConfigured({ ...CONFIG, apiKey: '' }), false);
  assert.equal(googlePickerConfigured({}), false);
  assert.equal(googlePickerConfigured(null), false);
});

test('Google scripts are loaded once, the sign-in asks for the narrow scope, and the window shows the places of Drive with the keys of the project', async () => {
  const { picker, state } = setup({ docs: [{ id: 'f1', name: 'photo.png', mimeType: 'image/png', sizeBytes: '3' }] });
  picker.warm();
  const picked = await picker.pick();
  assert.deepEqual(state.scripts, ['https://apis.google.com/js/api.js', 'https://accounts.google.com/gsi/client'], 'each script once, though warm and pick both ask');
  assert.deepEqual(state.gapiLoads, ['picker']);
  assert.equal(state.clients[0].scope, 'https://www.googleapis.com/auth/drive.file');
  assert.equal(state.clients[0].client_id, CONFIG.clientId);
  assert.equal(state.builder.token, 'TOKEN-1');
  assert.equal(state.builder.key, 'API-KEY');
  assert.equal(state.builder.appId, '123456789');
  assert.equal(state.builder.locale, 'zh-TW');
  assert.equal(state.builder.origin, 'https://noureon.test');
  assert.equal(state.builder.feature, 'multi', 'several files may be picked');
  assert.deepEqual(state.builder.views.map((view) => view.id || view), ['docs', 'docs', 'docs', 'recent'], 'My Drive, shared with me, starred, recent');
  assert.deepEqual(state.views[1].calls[0], ['ownedByMe', false]);
  assert.deepEqual(state.views[2].calls[0], ['starred', true]);
  assert.equal(picked.ok, true);
});

test('a picked file is taken with the token, no redirect followed; a Google Doc goes out as a PDF; a form, a big file and a refused one are told by name', async () => {
  const docs = [
    { id: 'p1', name: 'report.pdf', mimeType: 'application/pdf', sizeBytes: '3' },
    { id: 'g1', name: 'Plan', mimeType: 'application/vnd.google-apps.document' },
    { id: 'x1', name: 'Survey', mimeType: 'application/vnd.google-apps.form' },
    { id: 'b1', name: 'big.zip', mimeType: 'application/zip', sizeBytes: String(GOOGLE_FILE_MAX_BYTES + 1) },
    { id: 'n1', name: 'gone.txt', mimeType: 'text/plain', sizeBytes: '1' }
  ];
  const { picker, state } = setup({ docs, fetchImpl: async (url, options) => { state.fetched.push([url, options.headers.Authorization, options.redirect]); return url.includes('/n1') ? new Response('no', { status: 404 }) : new Response(new Uint8Array([1, 2, 3])); } });
  const picked = await picker.pick();
  assert.deepEqual(picked.files.map((file) => [file.name, file.type, file.size]), [['report.pdf', 'application/pdf', 3], ['Plan.pdf', 'application/pdf', 3]]);
  assert.deepEqual(picked.failed, [{ name: 'Survey', code: 'failed' }, { name: 'big.zip', code: 'too_big' }, { name: 'gone.txt', code: 'failed' }]);
  assert.deepEqual(state.fetched.map(([url]) => url), [
    'https://www.googleapis.com/drive/v3/files/p1?alt=media&supportsAllDrives=true',
    'https://www.googleapis.com/drive/v3/files/g1/export?mimeType=application%2Fpdf',
    'https://www.googleapis.com/drive/v3/files/n1?alt=media&supportsAllDrives=true'
  ]);
  assert.ok(state.fetched.every(([, auth, redirect]) => auth === 'Bearer TOKEN-1' && redirect === 'error'));
});

test('the sign-in is asked once for an hour; a closed window is a cancel, a blocked one and a failure are said', async () => {
  const first = setup({ docs: [] });
  await first.picker.pick();
  await first.picker.pick();
  assert.equal(first.state.tokenRequests, 1, 'the token of the hour is used again');
  assert.deepEqual(await setup({ action: 'cancel' }).picker.pick(), { ok: false, code: 'cancelled' });
  assert.deepEqual(await setup({ tokenError: { type: 'popup_closed' } }).picker.pick(), { ok: false, code: 'cancelled' });
  assert.deepEqual(await setup({ tokenError: { type: 'popup_failed_to_open' } }).picker.pick(), { ok: false, code: 'blocked' });
  const broken = setup();
  broken.window.gapi = { load: (name, options) => options.onerror() };
  assert.deepEqual(await broken.picker.pick(), { ok: false, code: 'failed' });
});
