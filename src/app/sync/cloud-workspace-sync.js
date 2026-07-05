import { getSupabaseClient } from '../auth/supabase-client.js';
import { createLegacyRuntimeStorageAdapter } from '../runtime/kernel/storage-adapter.js';
import {
  decryptSyncVaultPayload,
  encryptSyncVaultPayload,
  getSyncVaultStorageKey,
  getUnlockedSyncVaultKey,
  takePreviousSyncVaultKey
} from './sync-vault.js';
import { createCloudAssetTransport } from './cloud-assets.js';

const TABLE = 'user_workspaces';
const SYNC_DEBOUNCE_MS = 750;

const KINDS = Object.freeze({
  appData: { column: 'app_data', timestamp: 'app_data_updated_at' },
  config: { column: 'config', timestamp: 'config_updated_at' },
  sensitive: { column: 'sensitive_config', timestamp: 'sensitive_config_updated_at' },
  vault: { column: 'vault_record', timestamp: 'vault_record_updated_at' }
});

function parseJson(value) {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function hasApiKeys(value) {
  const apiKeys = value?.apiKeys || value;
  return apiKeys && typeof apiKeys === 'object' && Object.values(apiKeys).some(Boolean);
}

export async function initializeCloudWorkspaceSync({ window, session } = {}) {
  const supabase = getSupabaseClient();
  const user = session?.user;
  if (!supabase || !user) return { enabled: false };

  const storage = createLegacyRuntimeStorageAdapter();
  const username = `supabase:${user.id}`;
  if (await storage.getItem('chat_lastUser') !== username) return { enabled: false };

  const keys = {
    appData: `chatAppData_v8.6_${username}`,
    config: `chatConfig_v_v8.6_${username}`,
    sensitive: `chatSensitiveConfig_v1_${username}`,
    vault: getSyncVaultStorageKey(username)
  };
  const metaKey = `chatCloudSyncMeta_v1_${username}`;
  const assets = createCloudAssetTransport({ supabase, storage, userId: user.id });
  let meta = parseJson(await storage.getItem(metaKey)) || {};
  let remote = null;
  let timer = null;
  let syncing = false;
  const pending = new Set();

  const saveMeta = () => storage.setItem(metaKey, JSON.stringify(meta));
  const setMeta = async (kind, values) => {
    meta[kind] = { ...(meta[kind] || {}), ...values };
    await saveMeta();
  };

  async function fetchRemote() {
    const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    remote = data;
    return data;
  }

  async function readLocal(kind) {
    return parseJson(await storage.getItem(keys[kind]));
  }

  async function prepareUpload(kind) {
    const value = await readLocal(kind);
    if (kind === 'appData' || kind === 'config') return value ? assets.externalize(value) : null;
    if (kind === 'vault') return value;
    if (!await readLocal('vault')) return null;
    const key = getUnlockedSyncVaultKey(username);
    if (!key) return undefined;
    return value && hasApiKeys(value) ? encryptSyncVaultPayload(value, key) : null;
  }

  async function uploadKind(kind) {
    const definition = KINDS[kind];
    const value = await prepareUpload(kind);
    if (value === undefined) return false;
    const updatedAt = meta[kind]?.localUpdatedAt || new Date().toISOString();
    const payload = {
      user_id: user.id,
      [definition.column]: value,
      [definition.timestamp]: updatedAt,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'user_id' }).select().single();
    if (error) throw error;
    remote = data;
    await setMeta(kind, { localUpdatedAt: updatedAt, remoteUpdatedAt: updatedAt, dirty: false });
    return updatedAt;
  }

  async function applyRemote(kind) {
    const definition = KINDS[kind];
    const value = remote?.[definition.column];
    if (value == null) return false;
    let hydrated = value;
    if (kind === 'appData' || kind === 'config') hydrated = await assets.hydrate(value);
    if (kind === 'sensitive') {
      const key = getUnlockedSyncVaultKey(username);
      if (!key) return false;
      hydrated = await decryptSyncVaultPayload(value, key);
    }
    await storage.setItem(keys[kind], JSON.stringify(hydrated));
    const timestamp = remote[definition.timestamp] || remote.updated_at;
    await setMeta(kind, { localUpdatedAt: timestamp, remoteUpdatedAt: timestamp, dirty: false });
    if (kind === 'sensitive') {
      window.dispatchEvent(new window.CustomEvent('astra:cloud-sensitive-config', { detail: hydrated }));
    }
    return true;
  }

  async function reconcileKind(kind) {
    const definition = KINDS[kind];
    const local = await readLocal(kind);
    const remoteValue = remote?.[definition.column];
    const localTimestamp = Date.parse(meta[kind]?.localUpdatedAt || 0);
    const remoteTimestamp = Date.parse(remote?.[definition.timestamp] || remote?.updated_at || 0);

    if (meta[kind]?.dirty && localTimestamp >= remoteTimestamp) return uploadKind(kind);
    if (remoteValue != null && remoteTimestamp >= localTimestamp) return applyRemote(kind);
    if (local != null && remoteValue == null) return uploadKind(kind);
    return false;
  }

  async function flush() {
    if (syncing || !navigator.onLine) return;
    syncing = true;
    try {
      const kinds = [...pending];
      for (const kind of kinds) {
        const syncedTimestamp = await uploadKind(kind);
        if (syncedTimestamp && meta[kind]?.localUpdatedAt === syncedTimestamp) pending.delete(kind);
      }
    } catch (error) {
      console.warn('AstraChat cloud sync is waiting to retry:', error);
    } finally {
      syncing = false;
      if (pending.size) {
        clearTimeout(timer);
        timer = setTimeout(flush, SYNC_DEBOUNCE_MS);
      }
    }
  }

  async function queueLocalChange(kind) {
    if (!KINDS[kind]) return;
    const timestamp = new Date().toISOString();
    pending.add(kind);
    await setMeta(kind, { localUpdatedAt: timestamp, dirty: true });
    clearTimeout(timer);
    timer = setTimeout(flush, SYNC_DEBOUNCE_MS);
  }

  const api = { enabled: true, queueLocalChange, flush, refresh: async () => {
    await fetchRemote();
    for (const kind of Object.keys(KINDS)) await reconcileKind(kind);
  } };
  window.__astraCloudWorkspaceSync = api;
  window.addEventListener('online', flush);
  window.addEventListener('astra:sync-vault-unlocked', async event => {
    if (event.detail?.username !== username) return;
    const previousKey = takePreviousSyncVaultKey(username);
    await queueLocalChange('vault');
    try {
      await fetchRemote();
      if (previousKey && remote?.sensitive_config) {
        const decrypted = await decryptSyncVaultPayload(remote.sensitive_config, previousKey);
        await storage.setItem(keys.sensitive, JSON.stringify(decrypted));
        window.dispatchEvent(new window.CustomEvent('astra:cloud-sensitive-config', { detail: decrypted }));
        await queueLocalChange('sensitive');
      } else {
        await reconcileKind('sensitive');
        if (!remote?.sensitive_config) await queueLocalChange('sensitive');
      }
    } catch (error) {
      console.warn('AstraChat encrypted API key sync failed:', error);
    }
  });

  try {
    await fetchRemote();
    for (const kind of ['vault', 'appData', 'config']) await reconcileKind(kind);
    for (const [kind, state] of Object.entries(meta)) if (state?.dirty) pending.add(kind);
    if (pending.size) timer = setTimeout(flush, 0);
  } catch (error) {
    console.warn('AstraChat cloud sync is unavailable until its database migration is installed:', error);
  }
  return api;
}
