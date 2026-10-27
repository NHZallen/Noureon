import assert from 'node:assert/strict';
import test from 'node:test';

import { AVATAR_BUCKET, avatarPathOf, createAvatarStore, googlePhotoOf } from '../src/app/ui/user-avatar/avatar-store.js';
import { AVATAR_TEXTS, avatarText } from '../src/app/ui/user-avatar/avatar-texts.js';

const USER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const cloudUser = { authProvider: 'supabase', supabaseUserId: USER_ID, displayName: 'Ada' };
const blob = (type = 'image/webp') => ({ type, size: 2000, tag: 'blob' });
const toDataUrl = async (value) => `data:image/webp;base64,${value.tag}`;
const memoryStorage = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key), data }; };

// A small fake of the Supabase client: the profile row, the bucket, and the session user.
function fakeClient({ row = null, session = { user: { user_metadata: {} } }, downloadError = null, uploadError = null } = {}) {
  const calls = [];
  const state = { row };
  const query = (table) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => { calls.push(['select', table]); return { data: state.row, error: null }; },
      single: async () => ({ data: { avatar_version: (state.row?.avatar_version || 0) + 1 }, error: null }),
      upsert: (value) => { calls.push(['upsert', table, value]); state.row = { avatar_path: value.avatar_path, avatar_version: (state.row?.avatar_version || 0) + 1 }; return builder; },
      update: (value) => { calls.push(['update', table, value]); return { eq: async () => { state.row = { ...state.row, ...value }; return { error: null }; } }; }
    };
    return builder;
  };
  return {
    calls,
    state,
    auth: { getSession: async () => ({ data: { session } }) },
    from: query,
    storage: {
      from: (bucket) => ({
        download: async (path) => { calls.push(['download', bucket, path]); return downloadError ? { data: null, error: downloadError } : { data: blob(), error: null }; },
        upload: async (path, body, options) => { calls.push(['upload', bucket, path, options]); return { error: uploadError }; },
        remove: async (paths) => { calls.push(['remove', bucket, paths]); return { error: null }; }
      })
    }
  };
}

test('the file of a person has one name', () => {
  assert.equal(avatarPathOf(USER_ID), `${USER_ID}/avatar.webp`);
  assert.equal(AVATAR_BUCKET, 'user-avatars');
});

test('the Google photo is taken only from an https address', () => {
  assert.equal(googlePhotoOf({ user_metadata: { avatar_url: 'https://lh3.googleusercontent.com/a/x' } }), 'https://lh3.googleusercontent.com/a/x');
  assert.equal(googlePhotoOf({ user_metadata: { picture: 'https://example.com/p.png' } }), 'https://example.com/p.png');
  assert.equal(googlePhotoOf({ user_metadata: { avatar_url: 'http://example.com/p.png' } }), '');
  assert.equal(googlePhotoOf({ user_metadata: { avatar_url: 'javascript:alert(1)' } }), '');
  assert.equal(googlePhotoOf({}), '');
});

test('a local account has no picture and asks for nothing', async () => {
  const client = fakeClient();
  const store = createAvatarStore({ getSupabase: () => client, blobToDataUrl: toDataUrl });
  await store.load({ username: 'local', authProvider: 'local' });
  assert.deepEqual(store.get(), { src: '', kind: 'none' });
  assert.equal(store.snapshot().canEdit, false);
  assert.equal(client.calls.length, 0);
});

test('with no picture of their own the Google photo is the default, else nothing', async () => {
  const google = 'https://lh3.googleusercontent.com/a/photo';
  const store = createAvatarStore({ getSupabase: () => fakeClient({ session: { user: { user_metadata: { avatar_url: google } } } }), blobToDataUrl: toDataUrl });
  await store.load(cloudUser);
  assert.deepEqual(store.get(), { src: google, kind: 'google' });
  const plain = createAvatarStore({ getSupabase: () => fakeClient(), blobToDataUrl: toDataUrl });
  await plain.load(cloudUser);
  assert.deepEqual(plain.get(), { src: '', kind: 'none' });
  assert.equal(plain.snapshot().canEdit, true);
});

test('the picture the person chose is fetched, kept in this browser, and wins over the Google photo', async () => {
  const storage = memoryStorage();
  const client = fakeClient({ row: { avatar_path: avatarPathOf(USER_ID), avatar_version: 3 }, session: { user: { user_metadata: { avatar_url: 'https://g.example/p.png' } } } });
  const store = createAvatarStore({ getSupabase: () => client, storage, blobToDataUrl: toDataUrl });
  await store.load(cloudUser);
  assert.equal(store.get().kind, 'custom');
  assert.equal(store.get().src, 'data:image/webp;base64,blob');
  assert.deepEqual(client.calls.find((call) => call[0] === 'download'), ['download', 'user-avatars', avatarPathOf(USER_ID)]);
  assert.equal(JSON.parse(storage.data.get(`noureon.userAvatar.v1.${USER_ID}`)).version, 3);
});

test('a picture kept in this browser is shown at once, and fetched again only when the version changed', async () => {
  const storage = memoryStorage();
  storage.setItem(`noureon.userAvatar.v1.${USER_ID}`, JSON.stringify({ version: 3, dataUrl: 'data:image/webp;base64,old' }));
  const sameVersion = fakeClient({ row: { avatar_path: avatarPathOf(USER_ID), avatar_version: 3 } });
  const seen = [];
  const store = createAvatarStore({ getSupabase: () => sameVersion, storage, blobToDataUrl: toDataUrl });
  store.subscribe((picture) => seen.push(picture.src));
  await store.load(cloudUser);
  assert.equal(seen[0], 'data:image/webp;base64,old');
  assert.equal(sameVersion.calls.some((call) => call[0] === 'download'), false);
  const newer = fakeClient({ row: { avatar_path: avatarPathOf(USER_ID), avatar_version: 4 } });
  const next = createAvatarStore({ getSupabase: () => newer, storage, blobToDataUrl: toDataUrl });
  await next.load(cloudUser);
  assert.equal(next.get().src, 'data:image/webp;base64,blob');
  assert.equal(JSON.parse(storage.data.get(`noureon.userAvatar.v1.${USER_ID}`)).version, 4);
});

test('another account never sees the picture kept for this one', async () => {
  const storage = memoryStorage();
  storage.setItem(`noureon.userAvatar.v1.${USER_ID}`, JSON.stringify({ version: 1, dataUrl: 'data:image/webp;base64,mine' }));
  const other = '11111111-2222-4333-8444-555555555555';
  const store = createAvatarStore({ getSupabase: () => fakeClient(), storage, blobToDataUrl: toDataUrl });
  await store.load({ authProvider: 'supabase', supabaseUserId: other });
  assert.deepEqual(store.get(), { src: '', kind: 'none' });
});

test('a row without a path drops a picture kept before (it was removed on another device)', async () => {
  const storage = memoryStorage();
  storage.setItem(`noureon.userAvatar.v1.${USER_ID}`, JSON.stringify({ version: 2, dataUrl: 'data:image/webp;base64,old' }));
  const store = createAvatarStore({ getSupabase: () => fakeClient({ row: { avatar_path: null, avatar_version: 3 } }), storage, blobToDataUrl: toDataUrl });
  await store.load(cloudUser);
  assert.equal(store.get().kind, 'none');
  assert.equal(storage.data.has(`noureon.userAvatar.v1.${USER_ID}`), false);
});

test('when the database cannot be read the picture shown stays and nothing throws', async () => {
  const storage = memoryStorage();
  storage.setItem(`noureon.userAvatar.v1.${USER_ID}`, JSON.stringify({ version: 2, dataUrl: 'data:image/webp;base64,kept' }));
  const client = fakeClient({ row: { avatar_path: avatarPathOf(USER_ID), avatar_version: 5 }, downloadError: new Error('offline') });
  const warnings = [];
  const store = createAvatarStore({ getSupabase: () => client, storage, blobToDataUrl: toDataUrl, warn: (...args) => warnings.push(args) });
  await store.load(cloudUser);
  assert.equal(store.get().src, 'data:image/webp;base64,kept');
  assert.equal(warnings.length, 1);
});

test('a new picture is uploaded to the one name, the row says so, and every window is told', async () => {
  const client = fakeClient();
  const storage = memoryStorage();
  const store = createAvatarStore({ getSupabase: () => client, storage, blobToDataUrl: toDataUrl });
  await store.load(cloudUser);
  const seen = [];
  store.subscribe((picture) => seen.push(picture.kind));
  await store.set(blob());
  assert.deepEqual(client.calls.find((call) => call[0] === 'upload'), ['upload', 'user-avatars', avatarPathOf(USER_ID), { upsert: true, contentType: 'image/webp', cacheControl: '3600' }]);
  assert.deepEqual(client.calls.find((call) => call[0] === 'upsert'), ['upsert', 'user_profiles', { user_id: USER_ID, avatar_path: avatarPathOf(USER_ID) }]);
  assert.equal(store.get().kind, 'custom');
  assert.deepEqual(seen, ['custom']);
  assert.ok(storage.data.has(`noureon.userAvatar.v1.${USER_ID}`));
});

test('a picture that could not be uploaded changes nothing and is reported', async () => {
  const client = fakeClient({ uploadError: new Error('quota') });
  const store = createAvatarStore({ getSupabase: () => client, blobToDataUrl: toDataUrl });
  await store.load(cloudUser);
  await assert.rejects(() => store.set(blob()), /quota/);
  assert.equal(store.get().kind, 'none');
  assert.equal(client.calls.some((call) => call[0] === 'upsert'), false);
});

test('going back to the default clears the row first, then the file, and the Google photo shows again', async () => {
  const google = 'https://lh3.googleusercontent.com/a/photo';
  const client = fakeClient({ row: { avatar_path: avatarPathOf(USER_ID), avatar_version: 2 }, session: { user: { user_metadata: { avatar_url: google } } } });
  const storage = memoryStorage();
  const store = createAvatarStore({ getSupabase: () => client, storage, blobToDataUrl: toDataUrl });
  await store.load(cloudUser);
  assert.equal(store.get().kind, 'custom');
  await store.clear();
  assert.deepEqual(store.get(), { src: google, kind: 'google' });
  const order = client.calls.filter((call) => ['update', 'remove'].includes(call[0])).map((call) => call[0]);
  assert.deepEqual(order, ['update', 'remove']);
  assert.deepEqual(client.calls.find((call) => call[0] === 'update')[2], { avatar_path: null });
  assert.equal(storage.data.has(`noureon.userAvatar.v1.${USER_ID}`), false);
});

test('a Google photo that does not load is not shown again', async () => {
  const google = 'https://lh3.googleusercontent.com/a/gone';
  const store = createAvatarStore({ getSupabase: () => fakeClient({ session: { user: { user_metadata: { picture: google } } } }), blobToDataUrl: toDataUrl });
  await store.load(cloudUser);
  assert.equal(store.get().kind, 'google');
  store.dropBroken(google);
  assert.equal(store.get().kind, 'none');
});

test('the words are the same in the five languages', () => {
  const keys = Object.keys(AVATAR_TEXTS.en).sort();
  for (const language of ['zh-TW', 'fr', 'ru', 'es']) assert.deepEqual(Object.keys(AVATAR_TEXTS[language]).sort(), keys, language);
  assert.equal(avatarText('xx', 'save'), 'Save');
});
