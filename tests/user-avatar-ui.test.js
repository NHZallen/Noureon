import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { letterOf, startUserAvatar, USER_READY_EVENT } from '../src/app/ui/user-avatar/user-avatar.js';
import { createAvatarStore } from '../src/app/ui/user-avatar/avatar-store.js';

const flush = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
const USER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const cloudUser = { authProvider: 'supabase', supabaseUserId: USER_ID, displayName: 'Ada Lovelace', email: 'ada@example.com' };
const localUser = { authProvider: 'local', username: 'bob' };

const MARKUP = `
<aside id="sidebar"><div id="user-controls"><button id="user-profile-btn"><div class="user-avatar"></div></button></div></aside>
<div id="settings-modal"><div id="user-section"><div class="us-avatar-wrap">
  <div id="user-avatar" class="us-avatar"></div>
  <button id="user-avatar-edit" type="button" hidden></button>
  <div id="user-avatar-menu" hidden><button type="button" data-avatar-action="change"></button><button type="button" data-avatar-action="reset"></button></div>
  <input id="user-avatar-input" type="file" hidden>
</div></div></div>`;

function fakeClient({ row = null, google = '' } = {}) {
  const calls = [];
  const state = { row };
  const builder = { select: () => builder, eq: () => builder, maybeSingle: async () => ({ data: state.row, error: null }), single: async () => ({ data: { avatar_version: 1 }, error: null }), upsert: (value) => { calls.push(['upsert', value]); state.row = { avatar_path: value.avatar_path, avatar_version: 1 }; return builder; }, update: (value) => ({ eq: async () => { calls.push(['update', value]); state.row = { avatar_path: null, avatar_version: 2 }; return { error: null }; } }) };
  return {
    calls,
    auth: { getSession: async () => ({ data: { session: { user: { user_metadata: google ? { avatar_url: google } : {} } } } }) },
    from: () => builder,
    storage: { from: () => ({ download: async () => ({ data: { tag: 'blob' }, error: null }), upload: async (path) => { calls.push(['upload', path]); return { error: null }; }, remove: async () => { calls.push(['remove']); return { error: null }; } }) }
  };
}

class FakeCropper {
  constructor(image, options) { FakeCropper.last = { image, options }; }
  getCroppedCanvas(options) { FakeCropper.cropped = options; return { toBlob: (callback, type, quality) => { FakeCropper.blobArgs = [type, quality]; callback({ type: 'image/webp', size: 1500, tag: 'new' }); } }; }
  destroy() { FakeCropper.destroyed = true; }
}

function setup({ client = fakeClient(), language = 'en' } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = MARKUP;
  const notices = [];
  const store = createAvatarStore({ getSupabase: () => client, blobToDataUrl: async (blob) => `data:image/webp;base64,${blob.tag}` });
  const avatar = startUserAvatar({ document, store, getLanguage: () => language, showNotification: (text, kind) => notices.push([text, kind]), loadCropper: async () => FakeCropper });
  const ready = async (user) => { document.dispatchEvent(new window.CustomEvent(USER_READY_EVENT, { detail: { user } })); await flush(); };
  return { window, document, client, store, avatar, notices, ready, sidebar: () => document.querySelector('.user-avatar'), settings: () => document.getElementById('user-avatar') };
}

test('the letter is the first letter of the name, shown in both places', async () => {
  assert.equal(letterOf(cloudUser), 'A');
  assert.equal(letterOf({ email: 'zed@example.com' }), 'Z');
  assert.equal(letterOf({}), '?');
  const { window, ready, sidebar, settings } = setup();
  await ready(cloudUser);
  assert.equal(sidebar().textContent, 'A');
  assert.equal(settings().textContent, 'A');
  window.happyDOM.abort();
});

test('the Google photo fills both circles when there is no picture of their own', async () => {
  const google = 'https://lh3.googleusercontent.com/a/photo';
  const { window, ready, sidebar, settings } = setup({ client: fakeClient({ google }) });
  await ready(cloudUser);
  for (const place of [sidebar(), settings()]) {
    const image = place.querySelector('img');
    assert.equal(image.getAttribute('src'), google);
    assert.equal(image.referrerPolicy, 'no-referrer');
    assert.equal(place.classList.contains('has-picture'), true);
  }
  window.happyDOM.abort();
});

test('a Google photo that does not load goes back to the letter', async () => {
  const { window, ready, sidebar } = setup({ client: fakeClient({ google: 'https://lh3.googleusercontent.com/a/gone' }) });
  await ready(cloudUser);
  sidebar().querySelector('img').dispatchEvent(new window.Event('error'));
  await flush();
  assert.equal(sidebar().querySelector('img'), null);
  assert.equal(sidebar().textContent, 'A');
  window.happyDOM.abort();
});

test('a local account shows the letter and has no edit button', async () => {
  const { window, ready, sidebar, document } = setup();
  await ready(localUser);
  assert.equal(sidebar().textContent, 'B');
  assert.equal(document.getElementById('user-avatar-edit').hidden, true);
  window.happyDOM.abort();
});

test('a cloud account has the edit button, and with no picture of its own it opens the file box at once', async () => {
  const { window, ready, document } = setup();
  await ready(cloudUser);
  const edit = document.getElementById('user-avatar-edit');
  assert.equal(edit.hidden, false);
  assert.equal(edit.getAttribute('aria-label'), 'Edit picture');
  let opened = 0;
  document.getElementById('user-avatar-input').click = () => { opened += 1; };
  edit.click();
  assert.equal(opened, 1);
  assert.equal(document.getElementById('user-avatar-menu').hidden, true);
  window.happyDOM.abort();
});

test('with a picture of its own the edit button opens a menu: change, and go back to the default', async () => {
  const google = 'https://lh3.googleusercontent.com/a/photo';
  const { window, ready, document } = setup({ client: fakeClient({ row: { avatar_path: `${USER_ID}/avatar.webp`, avatar_version: 2 }, google }) });
  await ready(cloudUser);
  const menu = document.getElementById('user-avatar-menu');
  document.getElementById('user-avatar-edit').click();
  assert.equal(menu.hidden, false);
  assert.equal(document.querySelector('[data-avatar-action="change"]').textContent, 'Change picture');
  // With a Google photo the way back says so; without one it says remove.
  assert.equal(document.querySelector('[data-avatar-action="reset"]').textContent, 'Use my Google picture');
  assert.equal(document.querySelector('[data-avatar-action="reset"]').hidden, false);
  document.body.click();
  assert.equal(menu.hidden, true);
  window.happyDOM.abort();
});

test('going back to the default removes the picture, and says so', async () => {
  const { window, ready, document, client, notices, settings } = setup({ client: fakeClient({ row: { avatar_path: `${USER_ID}/avatar.webp`, avatar_version: 2 } }) });
  await ready(cloudUser);
  assert.equal(settings().querySelector('img').getAttribute('src'), 'data:image/webp;base64,blob');
  assert.equal(document.querySelector('[data-avatar-action="reset"]').textContent, 'Remove picture');
  document.querySelector('[data-avatar-action="reset"]').click();
  await flush();
  assert.deepEqual(client.calls.map((call) => call[0]), ['update', 'remove']);
  assert.equal(settings().textContent, 'A');
  assert.deepEqual(notices.at(-1), ['Picture removed', 'success']);
  window.happyDOM.abort();
});

test('choosing a picture opens the crop window; saving uploads a 256 pixel picture and closes it', async () => {
  const { window, ready, document, client, notices, sidebar } = setup();
  await ready(cloudUser);
  const input = document.getElementById('user-avatar-input');
  Object.defineProperty(input, 'files', { value: [new window.File(['x'], 'me.png', { type: 'image/png' })], configurable: true });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  await flush(60);
  const dialog = document.querySelector('.ua-modal');
  assert.ok(dialog, 'the crop window opened');
  assert.deepEqual(FakeCropper.last.options.aspectRatio, 1);
  dialog.querySelector('.ua-save').click();
  await flush(30);
  assert.deepEqual(FakeCropper.cropped.width, 256);
  assert.deepEqual(FakeCropper.blobArgs, ['image/webp', 0.9]);
  assert.deepEqual(client.calls.map((call) => call[0]), ['upload', 'upsert']);
  assert.equal(document.querySelector('.ua-modal'), null);
  assert.equal(sidebar().querySelector('img').getAttribute('src'), 'data:image/webp;base64,new');
  assert.deepEqual(notices.at(-1), ['Picture updated', 'success']);
  window.happyDOM.abort();
});

test('cancel and Escape close the crop window without saving', async () => {
  const { window, ready, document, client } = setup();
  await ready(cloudUser);
  const input = document.getElementById('user-avatar-input');
  Object.defineProperty(input, 'files', { value: [new window.File(['x'], 'me.jpg', { type: 'image/jpeg' })], configurable: true });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  await flush(60);
  document.querySelector('.ua-cancel').click();
  assert.equal(document.querySelector('.ua-modal'), null);
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  await flush(60);
  assert.ok(document.querySelector('.ua-modal'));
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(document.querySelector('.ua-modal'), null);
  assert.equal(client.calls.length, 0);
  window.happyDOM.abort();
});

test('a file that is not a picture, or is too big, is refused with a notice', async () => {
  const { window, ready, document, notices } = setup();
  await ready(cloudUser);
  const input = document.getElementById('user-avatar-input');
  Object.defineProperty(input, 'files', { value: [new window.File(['x'], 'a.pdf', { type: 'application/pdf' })], configurable: true });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  await flush();
  assert.equal(notices.at(-1)[1], 'warning');
  assert.match(notices.at(-1)[0], /not a usable picture/);
  const big = new window.File(['x'], 'big.png', { type: 'image/png' });
  Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
  Object.defineProperty(input, 'files', { value: [big], configurable: true });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  await flush();
  assert.match(notices.at(-1)[0], /under 10 MB/);
  assert.equal(document.querySelector('.ua-modal'), null);
  window.happyDOM.abort();
});

test('a save that fails keeps the crop window open and says so', async () => {
  const client = fakeClient();
  client.storage = { from: () => ({ upload: async () => ({ error: new Error('quota') }), download: async () => ({ data: null, error: null }), remove: async () => ({ error: null }) }) };
  const { window, ready, document, notices } = setup({ client });
  await ready(cloudUser);
  const input = document.getElementById('user-avatar-input');
  Object.defineProperty(input, 'files', { value: [new window.File(['x'], 'me.webp', { type: 'image/webp' })], configurable: true });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  await flush(60);
  document.querySelector('.ua-save').click();
  await flush(30);
  assert.ok(document.querySelector('.ua-modal'));
  assert.equal(document.querySelector('.ua-save').disabled, false);
  assert.deepEqual(notices.at(-1), ['The picture was not saved. Please try again later.', 'error']);
  window.happyDOM.abort();
});

test('the words follow the language', async () => {
  const { window, ready, document } = setup({ language: 'zh-TW' });
  await ready(cloudUser);
  assert.equal(document.getElementById('user-avatar-edit').getAttribute('aria-label'), '編輯頭像');
  window.happyDOM.abort();
});
