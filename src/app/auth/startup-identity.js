import { createLegacyRuntimeStorageAdapter } from '../runtime/kernel/storage-adapter.js';

const CLOUD_USER_PREFIX = 'supabase:';

const loadDefaultSupabaseClientModule = () => import('./supabase-client.js');

async function readSessionWithTimeout(auth, {
  timeoutMs,
  scheduleTimeout,
  clearScheduledTimeout
}) {
  let timeoutId;
  const timeout = new Promise(resolve => {
    timeoutId = scheduleTimeout(() => resolve({
      data: { session: null },
      error: new Error('Cloud session lookup timed out.')
    }), timeoutMs);
  });
  try {
    return await Promise.race([auth.getSession(), timeout]);
  } finally {
    clearScheduledTimeout(timeoutId);
  }
}

export function isCloudUsername(username) {
  return typeof username === 'string' && username.startsWith(CLOUD_USER_PREFIX);
}

function parseLocalUserRecord(value, expectedUsername) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const record = JSON.parse(value);
    if (
      !record
      || typeof record !== 'object'
      || Array.isArray(record)
      || record.username !== expectedUsername
      || record.authProvider === 'supabase'
      || typeof record.passwordHash !== 'string'
      || !record.passwordHash
    ) return null;
    return record;
  } catch {
    return null;
  }
}

export async function resolveStartupIdentity({
  storage = createLegacyRuntimeStorageAdapter(),
  supabase,
  configured,
  loadSupabaseClientModule = loadDefaultSupabaseClientModule,
  sessionTimeoutMs = 5000,
  scheduleTimeout = globalThis.setTimeout,
  clearScheduledTimeout = globalThis.clearTimeout
} = {}) {
  let lastUsername = await storage.getItem('chat_lastUser');

  if (lastUsername && !isCloudUsername(lastUsername)) {
    const savedUser = await storage.getItem(`chatUser_${lastUsername}`);
    if (parseLocalUserRecord(savedUser, lastUsername)) {
      return Object.freeze({
        mode: 'local',
        lastUsername,
        session: null,
        sessionError: null,
        sessionChecked: false,
        safeToReadWorkspace: true
      });
    }
    if (typeof storage.removeItem === 'function') {
      await storage.removeItem('chat_lastUser');
      lastUsername = null;
    } else {
      return Object.freeze({
        mode: 'auth-required',
        lastUsername,
        session: null,
        sessionError: new Error('Cached local identity is incomplete.'),
        sessionChecked: false,
        safeToReadWorkspace: false
      });
    }
  }

  let resolvedSupabase = supabase;
  let resolvedConfigured = configured;
  if (
    typeof resolvedConfigured !== 'boolean'
    || (resolvedConfigured && resolvedSupabase === undefined)
  ) {
    const supabaseClientModule = await loadSupabaseClientModule();
    if (typeof resolvedConfigured !== 'boolean') {
      resolvedConfigured = supabaseClientModule.isSupabaseConfigured();
    }
    if (resolvedConfigured && resolvedSupabase === undefined) {
      resolvedSupabase = supabaseClientModule.getSupabaseClient();
    }
  }

  if (!resolvedConfigured || !resolvedSupabase) {
    return Object.freeze({
      mode: lastUsername ? 'auth-required' : 'anonymous',
      lastUsername: lastUsername || null,
      session: null,
      sessionError: null,
      sessionChecked: false,
      safeToReadWorkspace: !lastUsername
    });
  }

  const { data, error } = await readSessionWithTimeout(resolvedSupabase.auth, {
    timeoutMs: sessionTimeoutMs,
    scheduleTimeout,
    clearScheduledTimeout
  });
  const session = data?.session || null;
  const sessionUsername = session?.user?.id ? `${CLOUD_USER_PREFIX}${session.user.id}` : null;
  const matchesCachedCloudUser = Boolean(sessionUsername && sessionUsername === lastUsername);

  return Object.freeze({
    mode: matchesCachedCloudUser
      ? 'cloud'
      : sessionUsername
        ? 'cloud-pending'
        : lastUsername
          ? 'auth-required'
          : 'anonymous',
    lastUsername: lastUsername || null,
    session,
    sessionError: error || null,
    sessionChecked: true,
    safeToReadWorkspace: matchesCachedCloudUser || !lastUsername
  });
}
