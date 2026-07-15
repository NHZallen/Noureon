import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isCloudUsername,
  resolveStartupIdentity
} from '../src/app/auth/startup-identity.js';

const storageWith = (value, { userRecord, removeItem } = {}) => ({
  getItem: async key => {
    if (key === 'chat_lastUser') return value;
    if (key === `chatUser_${value}`) {
      return userRecord === undefined && value && !isCloudUsername(value)
        ? JSON.stringify({ username: value, passwordHash: 'local-password-hash' })
        : userRecord ?? null;
    }
    return null;
  },
  ...(removeItem ? { removeItem } : {})
});

test('local startup identity never asks Supabase for a session', async () => {
  let supabaseModuleLoads = 0;
  const identity = await resolveStartupIdentity({
    storage: storageWith('alice'),
    loadSupabaseClientModule: async () => {
      supabaseModuleLoads += 1;
      throw new Error('local startup must not load Supabase');
    }
  });

  assert.equal(identity.mode, 'local');
  assert.equal(identity.safeToReadWorkspace, true);
  assert.equal(identity.sessionChecked, false);
  assert.equal(supabaseModuleLoads, 0);
});

test('cloud startup identity exposes cached data only after the Supabase user matches', async () => {
  let supabaseModuleLoads = 0;
  let sessionReads = 0;
  const loadSupabaseClientModule = sessionUserId => async () => {
    supabaseModuleLoads += 1;
    return {
      isSupabaseConfigured: () => true,
      getSupabaseClient: () => ({
        auth: {
          getSession: async () => {
            sessionReads += 1;
            return {
              data: { session: { user: { id: sessionUserId } } },
              error: null
            };
          }
        }
      })
    };
  };
  const matching = await resolveStartupIdentity({
    storage: storageWith('supabase:user-1'),
    loadSupabaseClientModule: loadSupabaseClientModule('user-1')
  });
  const mismatch = await resolveStartupIdentity({
    storage: storageWith('supabase:user-1'),
    loadSupabaseClientModule: loadSupabaseClientModule('user-2')
  });

  assert.equal(matching.mode, 'cloud');
  assert.equal(matching.safeToReadWorkspace, true);
  assert.equal(mismatch.mode, 'cloud-pending');
  assert.equal(mismatch.safeToReadWorkspace, false);
  assert.equal(supabaseModuleLoads, 2);
  assert.equal(sessionReads, 2);
});

test('anonymous startup dynamically loads Supabase before deciding whether a session exists', async () => {
  let supabaseModuleLoads = 0;
  let sessionReads = 0;
  const identity = await resolveStartupIdentity({
    storage: storageWith(null),
    loadSupabaseClientModule: async () => {
      supabaseModuleLoads += 1;
      return {
        isSupabaseConfigured: () => true,
        getSupabaseClient: () => ({
          auth: {
            getSession: async () => {
              sessionReads += 1;
              return { data: { session: null }, error: null };
            }
          }
        })
      };
    }
  });

  assert.equal(identity.mode, 'anonymous');
  assert.equal(identity.sessionChecked, true);
  assert.equal(supabaseModuleLoads, 1);
  assert.equal(sessionReads, 1);
});

test('expired cloud session keeps cached cloud data behind the auth boundary', async () => {
  const sessionError = new Error('expired');
  const identity = await resolveStartupIdentity({
    storage: storageWith('supabase:user-1'),
    configured: true,
    supabase: { auth: { getSession: async () => ({ data: { session: null }, error: sessionError }) } }
  });

  assert.equal(identity.mode, 'auth-required');
  assert.equal(identity.safeToReadWorkspace, false);
  assert.equal(identity.sessionError, sessionError);
});

test('dangling local marker is removed before auth and never bypasses Turnstile setup', async () => {
  const removed = [];
  let supabaseModuleLoads = 0;
  const identity = await resolveStartupIdentity({
    storage: storageWith('alice', {
      userRecord: null,
      removeItem: async key => removed.push(key)
    }),
    loadSupabaseClientModule: async () => {
      supabaseModuleLoads += 1;
      return {
        isSupabaseConfigured: () => false,
        getSupabaseClient: () => null
      };
    }
  });

  assert.deepEqual(removed, ['chat_lastUser']);
  assert.equal(identity.mode, 'anonymous');
  assert.equal(identity.safeToReadWorkspace, true);
  assert.equal(supabaseModuleLoads, 1);
});

test('an incomplete local marker cannot be treated as safe when storage cannot clear it', async () => {
  const identity = await resolveStartupIdentity({
    storage: storageWith('alice', { userRecord: '{broken' }),
    loadSupabaseClientModule: async () => assert.fail('unsafe local marker must stop before cloud loading')
  });

  assert.equal(identity.mode, 'auth-required');
  assert.equal(identity.safeToReadWorkspace, false);
  assert.match(identity.sessionError.message, /incomplete/i);
});

test('cloud username classification is strict', () => {
  assert.equal(isCloudUsername('supabase:user-1'), true);
  assert.equal(isCloudUsername('alice'), false);
  assert.equal(isCloudUsername(null), false);
});

test('cloud session lookup has a bounded timeout instead of blocking startup forever', async () => {
  let triggerTimeout;
  const identityPromise = resolveStartupIdentity({
    storage: storageWith(null),
    configured: true,
    supabase: { auth: { getSession: () => new Promise(() => {}) } },
    sessionTimeoutMs: 25,
    scheduleTimeout(callback) {
      triggerTimeout = callback;
      return 1;
    },
    clearScheduledTimeout() {}
  });

  while (!triggerTimeout) await Promise.resolve();
  triggerTimeout();
  const identity = await identityPromise;

  assert.equal(identity.mode, 'anonymous');
  assert.equal(identity.safeToReadWorkspace, true);
  assert.match(identity.sessionError.message, /timed out/i);
});
