import assert from 'node:assert/strict';
import test from 'node:test';

import { initializeCloudWorkspaceSync } from '../src/app/sync/cloud-workspace-sync.js';
import { createAndUnlockSyncVault, getSyncVaultStorageKey, lockSyncVault } from '../src/app/sync/sync-vault.js';
import { digestSettings } from '../src/data/settings-merge.js';
import { SERVICES, getService, withdrawService } from '../src/app/runtime/services.js';

// The sync of the settings, the API keys and the sync password, started with a cloud, a device storage and a window of its own (the `deps`
// hook), so what it does when the cloud answers, refuses, changes under it or is gone can be told without a network.

const USER = { id: 'user-1' };
const USERNAME = 'supabase:user-1';
const KEYS = {
  config: `chatConfig_v_v8.6_${USERNAME}`,
  sensitive: `chatSensitiveConfig_v1_${USERNAME}`,
  vault: getSyncVaultStorageKey(USERNAME),
  meta: `chatCloudSyncMeta_v1_${USERNAME}`
};

const makeStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: async (key) => (data.has(key) ? data.get(key) : null),
    setItem: async (key, value) => { data.set(key, value); },
    removeItem: async (key) => { data.delete(key); },
    readItems: async (keys) => keys.map((key) => (data.has(key) ? data.get(key) : null)),
    setItemsAtomic: async (items) => { for (const { key, value } of items) data.set(key, value); }
  };
};

const makeWindow = () => {
  const target = new EventTarget();
  const events = [];
  return {
    CustomEvent,
    events,
    addEventListener: (...args) => target.addEventListener(...args),
    removeEventListener: (...args) => target.removeEventListener(...args),
    dispatchEvent: (event) => { events.push({ type: event.type, detail: event.detail }); return target.dispatchEvent(event); },
    emit: (type, detail) => target.dispatchEvent(new CustomEvent(type, { detail }))
  };
};

// A cloud with one row for the person. `row` is what is stored; `failing` makes the next calls of that kind answer with an error.
const makeCloud = (row = null) => {
  const state = { row, upserts: [], selects: 0, failing: { select: 0, upsert: 0 }, channels: [], removed: [] };
  const clock = { at: 0 };
  const nextTime = () => new Date(Date.UTC(2026, 9, 22, 12, 0, clock.at++)).toISOString();
  const client = {
    state,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            state.selects += 1;
            if (state.failing.select > 0) { state.failing.select -= 1; return { data: null, error: new Error('cloud unreachable') }; }
            return { data: state.row, error: null };
          }
        })
      }),
      upsert: (payload) => ({
        select: () => ({
          single: async () => {
            if (state.failing.upsert > 0) { state.failing.upsert -= 1; return { data: null, error: new Error('cloud refused the upload') }; }
            state.upserts.push(payload);
            state.row = { created_at: nextTime(), ...(state.row || {}), ...payload };
            return { data: state.row, error: null };
          }
        })
      })
    }),
    // The files service (storage): nothing in these settings is a file, so it is only there to be asked.
    storage: { from: () => ({}) },
    channel: (name) => {
      const channel = { name, handlers: [], on(kind, filter, handler) { this.handlers.push({ filter, handler }); return this; }, subscribe() { return this; } };
      state.channels.push(channel);
      return channel;
    },
    removeChannel: async (channel) => { state.removed.push(channel.name); }
  };
  return client;
};

const withNavigator = async (online, run) => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: online }, configurable: true, writable: true });
  try { await run(); } finally {
    if (saved) Object.defineProperty(globalThis, 'navigator', saved); else delete globalThis.navigator;
  }
};

const quiet = async (run) => {
  const saved = { warn: console.warn, info: console.info };
  console.warn = () => {}; console.info = () => {};
  try { return await run(); } finally { Object.assign(console, saved); }
};

const stand = () => ({ ready: Promise.resolve(), stop: () => {}, flush: async () => ({}), getStatus: () => ({}) });
const start = async ({ cloud, storage = makeStorage(), window = makeWindow(), session = { user: USER } } = {}) => {
  const stopped = [];
  const api = await initializeCloudWorkspaceSync({
    window,
    session,
    deps: { supabase: cloud, storage, initializeConversationShadowSync: () => ({ ...stand(), stop: () => stopped.push('conversations') }), initializeMemorySummaryCloudSync: () => ({ ...stand(), stop: () => stopped.push('memory') }) }
  });
  return { api, storage, window, cloud, stopped };
};
const cleanup = () => {
  withdrawService(SERVICES.workspaceSync, getService(SERVICES.workspaceSync));
};
const stored = (storage, key) => JSON.parse(storage.data.get(key));

test('without a cloud, without a person, or on a device that belongs to another account, nothing is synced and the page is told why', async () => {
  await withNavigator(true, async () => {
    const window = makeWindow();
    assert.deepEqual(await initializeCloudWorkspaceSync({ window, session: { user: USER }, deps: { supabase: null } }), { enabled: false });
    assert.equal(getService(SERVICES.cloudSync).getStatus().reason, 'supabase-not-configured');
    withdrawService(SERVICES.cloudSync, getService(SERVICES.cloudSync));

    assert.deepEqual(await initializeCloudWorkspaceSync({ window, session: null, deps: { supabase: makeCloud(), storage: makeStorage() } }), { enabled: false });
    assert.equal(getService(SERVICES.cloudSync).getStatus().reason, 'no-session');
    withdrawService(SERVICES.cloudSync, getService(SERVICES.cloudSync));

    const other = makeStorage({ chat_lastUser: 'supabase:someone-else' });
    assert.deepEqual(await initializeCloudWorkspaceSync({ window, session: { user: USER }, deps: { supabase: makeCloud(), storage: other } }), { enabled: false });
    const status = getService(SERVICES.cloudSync).getStatus();
    assert.equal(status.reason, 'cloud-user-not-active');
    assert.equal(status.activeUser, 'supabase:someone-else');
    withdrawService(SERVICES.cloudSync, getService(SERVICES.cloudSync));
  });
});

test('settings that only this device has are sent to an empty cloud when it starts, and the page is told they are in sync', async () => {
  await withNavigator(true, async () => {
    const cloud = makeCloud(null);
    const { api, storage } = await start({ cloud, storage: makeStorage({ chat_lastUser: USERNAME, [KEYS.config]: JSON.stringify({ theme: 'dark' }) }) });
    try {
      await api.syncNow();
      assert.equal(cloud.state.upserts.length, 1);
      assert.deepEqual(cloud.state.upserts[0].config.theme, 'dark');
      assert.equal(cloud.state.upserts[0].user_id, USER.id);
      assert.equal(api.getStatus().kinds.config.state, 'synced');
      assert.equal(stored(storage, KEYS.meta).config.dirty, false, 'nothing is left waiting');
    } finally { await api.stop(); cleanup(); }
  });
});

test('settings the cloud has and this device does not are brought here and the page is told, without sending anything back', async () => {
  await withNavigator(true, async () => {
    const cloud = makeCloud({ user_id: USER.id, config: { theme: 'light', language: 'fr' }, config_updated_at: '2026-10-22T10:00:00.000Z', updated_at: '2026-10-22T10:00:00.000Z' });
    const { api, storage, window } = await start({ cloud, storage: makeStorage({ chat_lastUser: USERNAME }) });
    try {
      assert.deepEqual(stored(storage, KEYS.config), { theme: 'light', language: 'fr' });
      assert.deepEqual(window.events.find((event) => event.type === 'astra:cloud-config').detail, { theme: 'light', language: 'fr' });
      assert.equal(cloud.state.upserts.length, 0);
    } finally { await api.stop(); cleanup(); }
  });
});

test('a device that changed one setting does not wipe out a setting another device changed later: both are kept', async () => {
  await withNavigator(true, async () => {
    const later = Date.now() + 60_000;
    const cloud = makeCloud({
      user_id: USER.id,
      config: { theme: 'light', language: 'fr', settingsStamps: { language: later } },
      config_updated_at: '2026-10-22T10:00:00.000Z', updated_at: '2026-10-22T10:00:00.000Z'
    });
    // This device last sent {theme: light, language: en}; since then the person set the theme to dark here, and the change waits to be sent.
    const storage = makeStorage({
      chat_lastUser: USERNAME,
      [KEYS.config]: JSON.stringify({ theme: 'dark', language: 'en' }),
      [KEYS.meta]: JSON.stringify({ version: 6, config: { dirty: true, localRevision: 'r1' }, settingsDigests: digestSettings({ theme: 'light', language: 'en' }) })
    });
    const { api, window } = await start({ cloud, storage });
    try {
      await api.syncNow();
      const sent = cloud.state.upserts.at(-1).config;
      assert.equal(sent.theme, 'dark', 'the change made here goes up');
      assert.equal(sent.language, 'fr', 'the later change of the other device is not undone');
      assert.equal(stored(storage, KEYS.config).language, 'fr', 'and it is kept here too');
      assert.ok(window.events.some((event) => event.type === 'astra:cloud-config' && event.detail.language === 'fr'), 'the page applies it');
    } finally { await api.stop(); cleanup(); }
  });
});

test('an upload the cloud refuses is shown as failed and stays queued, and goes through the next time', async () => {
  await withNavigator(true, async () => {
    const cloud = makeCloud(null);
    const storage = makeStorage({ chat_lastUser: USERNAME });
    const { api } = await start({ cloud, storage });
    try {
      await storage.setItem(KEYS.config, JSON.stringify({ theme: 'dark' }));
      await api.queueLocalChange('config');
      cloud.state.failing.upsert = 1;
      await quiet(() => api.flush());
      assert.equal(api.getStatus().kinds.config.state, 'failed');
      assert.match(api.getStatus().kinds.config.reason, /refused/);
      assert.equal(cloud.state.upserts.length, 0);
      await api.flush();
      assert.equal(cloud.state.upserts.length, 1, 'sent once, the second time');
      const result = await api.syncNow();
      assert.equal(result.ok, true);
      assert.equal(api.getStatus().kinds.config.state, 'synced');
    } finally { await api.stop(); cleanup(); }
  });
});

test('the same change queued many times is sent once, and nothing is sent while the device is offline', async () => {
  const cloud = makeCloud(null);
  const storage = makeStorage({ chat_lastUser: USERNAME });
  let handle;
  await withNavigator(true, async () => {
    handle = await start({ cloud, storage });
    await storage.setItem(KEYS.config, JSON.stringify({ theme: 'dark' }));
  });
  const { api } = handle;
  try {
    await withNavigator(false, async () => {
      await api.queueLocalChange('config');
      await api.flush();
      assert.equal(cloud.state.upserts.length, 0, 'offline: nothing goes');
      const result = await api.syncNow();
      assert.deepEqual([result.ok, result.reason], [false, 'offline']);
    });
    await withNavigator(true, async () => {
      await Promise.all([api.queueLocalChange('config'), api.queueLocalChange('config'), api.queueLocalChange('config')]);
      await Promise.all([api.flush(), api.flush()]);
      assert.equal(cloud.state.upserts.length, 1, 'three changes and two flushes at once make one upload');
    });
  } finally { await api.stop(); cleanup(); }
});

test('API keys are never sent while the sync password is locked, and are sent encrypted (never as they are) once it is open', async () => {
  await withNavigator(true, async () => {
    const cloud = makeCloud(null);
    const storage = makeStorage({ chat_lastUser: USERNAME });
    // The sync password is set up on this device, then locked again.
    await createAndUnlockSyncVault({ storage, username: USERNAME, password: 'a long sync password' });
    lockSyncVault(USERNAME);
    await storage.setItem(KEYS.sensitive, JSON.stringify({ apiKeys: { openrouter: 'sk-secret-plain-key' } }));
    const { api } = await start({ cloud, storage });
    try {
      await api.queueLocalChange('sensitive');
      await api.flush();
      assert.equal(api.getStatus().kinds.sensitive.state, 'waiting', 'it waits for the password');
      assert.equal(cloud.state.upserts.some((payload) => 'sensitive_config' in payload), false);

      const { unlockSyncVault } = await import('../src/app/sync/sync-vault.js');
      await unlockSyncVault({ storage, username: USERNAME, password: 'a long sync password' });
      await api.queueLocalChange('sensitive');
      await api.flush();
      const upload = cloud.state.upserts.find((payload) => 'sensitive_config' in payload);
      assert.ok(upload, 'sent once the password is open');
      assert.doesNotMatch(JSON.stringify(upload), /sk-secret-plain-key/, 'the key does not leave the device as it is');
      assert.equal(api.getStatus().kinds.sensitive.state, 'synced');
    } finally { await api.stop(); lockSyncVault(USERNAME); cleanup(); }
  });
});

test('a change another device makes arrives live and is applied here, and a cloud that cannot be reached leaves what is here alone', async () => {
  await withNavigator(true, async () => {
    const cloud = makeCloud({ user_id: USER.id, config: { theme: 'light' }, config_updated_at: '2026-10-22T10:00:00.000Z', updated_at: '2026-10-22T10:00:00.000Z' });
    const { api, storage, window } = await start({ cloud, storage: makeStorage({ chat_lastUser: USERNAME }) });
    try {
      const channel = cloud.state.channels.find((entry) => entry.name === `user-workspace:${USER.id}`);
      const update = channel.handlers.find((entry) => entry.filter.event === 'UPDATE').handler;
      update({ new: { user_id: USER.id, config: { theme: 'dark' }, config_updated_at: '2026-10-22T11:00:00.000Z', updated_at: '2026-10-22T11:00:00.000Z' } });
      for (let waited = 0; stored(storage, KEYS.config).theme !== 'dark' && waited < 50; waited += 1) await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(stored(storage, KEYS.config).theme, 'dark');
      assert.equal(window.events.filter((event) => event.type === 'astra:cloud-config').at(-1).detail.theme, 'dark');

      cloud.state.failing.select = 5;
      const result = await quiet(() => api.syncNow());
      assert.equal(result.ok, false);
      assert.equal(stored(storage, KEYS.config).theme, 'dark', 'what is here is untouched');
      assert.equal(api.getStatus().kinds.config.state, 'failed');
    } finally { await api.stop(); cleanup(); }
  });
});

test('stopping the sync leaves the cloud channels, the conversation sync and the memory sync, and the files service is withdrawn', async () => {
  await withNavigator(true, async () => {
    const cloud = makeCloud(null);
    const { api, stopped } = await start({ cloud, storage: makeStorage({ chat_lastUser: USERNAME }) });
    assert.ok(getService(SERVICES.cloudAssets));
    await api.stop();
    assert.deepEqual(cloud.state.removed.sort(), [`user-conversations:${USER.id}`, `user-workspace:${USER.id}`]);
    assert.deepEqual(stopped.sort(), ['conversations', 'memory']);
    assert.equal(getService(SERVICES.cloudAssets), null);
    cleanup();
  });
});
