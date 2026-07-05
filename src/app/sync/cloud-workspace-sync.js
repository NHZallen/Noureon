import { getSupabaseClient } from '../auth/supabase-client.js';
import { createLegacyRuntimeStorageAdapter } from '../runtime/kernel/storage-adapter.js';
import {
  decryptSyncVaultPayload,
  encryptSyncVaultPayload,
  getSyncVaultStorageKey,
  getUnlockedSyncVaultKey,
  lockSyncVault,
  takePreviousSyncVaultKey
} from './sync-vault.js';
import { createCloudAssetTransport } from './cloud-assets.js';
import { repairGeneratedImageStorageKeys } from './generated-image-key-repair.js';
import {
  canCommitHydratedRemote,
  cloudValuesEqual,
  enqueueRecoveringTask,
  mergeConcurrentWorkspaceAppData,
  mergeWorkspaceAppData,
  settleCloudUpload,
  shouldApplyCloudRemote
} from './cloud-sync-versioning.js';

const TABLE = 'user_workspaces';
const SYNC_DEBOUNCE_MS = 750;
const SYNC_META_VERSION = 3;

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
  const upgradingMeta = meta.version !== SYNC_META_VERSION;
  let remote = null;
  let timer = null;
  let syncing = false;
  let realtimeWork = Promise.resolve();
  let realtimeDeferred = false;
  let appDataBase = null;
  let preparedAppData = null;
  const pending = new Set();
  const activeUploads = new Map();
  const reportRealtimeError = error => console.warn('AstraChat realtime queue recovered after an error:', error);
  const queueRealtimeWork = task => {
    realtimeWork = enqueueRecoveringTask(realtimeWork, task, reportRealtimeError);
  };

  const savedAppData = parseJson(await storage.getItem(keys.appData));
  if (savedAppData && await repairGeneratedImageStorageKeys({ value: savedAppData, storage, username })) {
    const repairedAt = new Date().toISOString();
    await storage.setItem(keys.appData, JSON.stringify(savedAppData));
    meta.appData = { ...(meta.appData || {}), localRevision: repairedAt, dirty: true };
    await storage.setItem(metaKey, JSON.stringify(meta));
    pending.add('appData');
  }

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
    if (kind === 'appData') {
      await fetchRemote();
      if (!remote?.app_data) {
        preparedAppData = value;
      } else {
        const remoteAppData = await assets.hydrate(remote.app_data);
        preparedAppData = mergeConcurrentWorkspaceAppData(appDataBase || value || {}, value || {}, remoteAppData || {});
      }
      return preparedAppData ? assets.externalize(preparedAppData) : null;
    }
    if (kind === 'config') return value ? assets.externalize(value) : null;
    if (kind === 'vault') return value;
    if (!await readLocal('vault')) return null;
    const key = getUnlockedSyncVaultKey(username);
    if (!key) return undefined;
    return value && hasApiKeys(value) ? encryptSyncVaultPayload(value, key) : null;
  }

  async function uploadKind(kind) {
    if (activeUploads.has(kind)) return { complete: false };
    const definition = KINDS[kind];
    let localRevision = meta[kind]?.localRevision;
    if (!localRevision) {
      localRevision = crypto.randomUUID();
      await setMeta(kind, { localRevision, dirty: true });
    }
    activeUploads.set(kind, localRevision);
    try {
      const value = await prepareUpload(kind);
      if (value === undefined) return { complete: false };
      const clientTimestamp = new Date().toISOString();
      const payload = {
        user_id: user.id,
        [definition.column]: value,
        [definition.timestamp]: clientTimestamp,
        updated_at: clientTimestamp
      };
      const { data, error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'user_id' }).select().single();
      if (error) throw error;
      remote = data;
      const remoteUpdatedAt = data[definition.timestamp] || data.updated_at || clientTimestamp;
      const settled = settleCloudUpload(meta[kind], localRevision, remoteUpdatedAt);
      meta[kind] = settled.state;
      await saveMeta();
      if (kind === 'appData' && preparedAppData) {
        appDataBase = preparedAppData;
        if (settled.complete) {
          await storage.setItem(keys.appData, JSON.stringify(preparedAppData));
          window.dispatchEvent(new window.CustomEvent('astra:cloud-app-data', { detail: preparedAppData }));
        }
      }
      return { complete: settled.complete, localRevision };
    } finally {
      if (kind === 'appData') preparedAppData = null;
      activeUploads.delete(kind);
    }
  }

  async function applyRemote(kind) {
    const definition = KINDS[kind];
    const remoteSnapshot = remote;
    const startedRevision = meta[kind]?.localRevision;
    const value = remoteSnapshot?.[definition.column];
    if (value == null && !remoteSnapshot?.[definition.timestamp]) return false;
    let hydrated = value;
    if (kind === 'appData' || kind === 'config') hydrated = await assets.hydrate(value);
    if (kind === 'sensitive') {
      const key = getUnlockedSyncVaultKey(username);
      if (value != null) {
        if (!key) return false;
        hydrated = await decryptSyncVaultPayload(value, key);
      }
    }
    if (!canCommitHydratedRemote({
      startedRevision,
      currentState: meta[kind],
      activeUpload: activeUploads.has(kind),
      remoteUnchanged: remote === remoteSnapshot
    })) {
      realtimeDeferred = true;
      console.info('AstraChat discarded a stale hydrated workspace snapshot.', { kind });
      return false;
    }
    const timestamp = remoteSnapshot[definition.timestamp] || remoteSnapshot.updated_at;
    if (hydrated == null) await storage.removeItem(keys[kind]);
    else await storage.setItem(keys[kind], JSON.stringify(hydrated));
    if (kind === 'appData') appDataBase = hydrated || {};
    await setMeta(kind, { remoteUpdatedAt: timestamp, dirty: false });
    if (kind === 'appData') window.dispatchEvent(new window.CustomEvent('astra:cloud-app-data', { detail: hydrated }));
    if (kind === 'config') window.dispatchEvent(new window.CustomEvent('astra:cloud-config', { detail: hydrated }));
    if (kind === 'sensitive') window.dispatchEvent(new window.CustomEvent('astra:cloud-sensitive-config', { detail: hydrated }));
    if (kind === 'vault') {
      lockSyncVault(username);
      window.dispatchEvent(new window.CustomEvent('astra:cloud-vault', { detail: hydrated }));
    }
    return true;
  }

  async function reconcileKind(kind) {
    const definition = KINDS[kind];
    const local = await readLocal(kind);
    const remoteValue = remote?.[definition.column];
    const remoteUpdatedAt = remote?.[definition.timestamp] || remote?.updated_at;

    if (activeUploads.has(kind) || meta[kind]?.dirty) return false;
    if (remoteValue == null) {
      if (remote?.[definition.timestamp] && shouldApplyCloudRemote(meta[kind], remoteUpdatedAt)) return applyRemote(kind);
      if (local != null) return uploadKind(kind);
      return false;
    }
    if (shouldApplyCloudRemote(meta[kind], remoteUpdatedAt)) return applyRemote(kind);
    return false;
  }

  async function reconcileRemoteKinds() {
    for (const kind of ['vault', 'appData', 'config', 'sensitive']) {
      try {
        await reconcileKind(kind);
      } catch (error) {
        console.warn(`AstraChat realtime ${kind} sync failed:`, error);
      }
    }
  }

  async function upgradeSyncMetadata() {
    if (!upgradingMeta) return;
    for (const state of Object.values(meta)) {
      if (state && typeof state === 'object') delete state.remoteUpdatedAt;
    }
    const localAppData = await readLocal('appData');
    const remoteAppData = remote?.app_data ? await assets.hydrate(remote.app_data) : null;
    appDataBase = remoteAppData || {};
    if (localAppData || remoteAppData) {
      const merged = mergeWorkspaceAppData(localAppData || {}, remoteAppData || {});
      await storage.setItem(keys.appData, JSON.stringify(merged));
      if (!cloudValuesEqual(merged, remoteAppData || {})) {
        meta.appData = {
          ...(meta.appData || {}),
          localRevision: crypto.randomUUID(),
          dirty: true
        };
        pending.add('appData');
      } else {
        meta.appData = {
          ...(meta.appData || {}),
          remoteUpdatedAt: remote?.app_data_updated_at || remote?.updated_at,
          dirty: false
        };
      }
    }
    meta.version = SYNC_META_VERSION;
    await saveMeta();
  }

  async function flush() {
    if (syncing || !navigator.onLine) return;
    syncing = true;
    try {
      const kinds = [...pending];
      for (const kind of kinds) {
        const result = await uploadKind(kind);
        if (result.complete && meta[kind]?.localRevision === result.localRevision) pending.delete(kind);
      }
    } catch (error) {
      console.warn('AstraChat cloud sync is waiting to retry:', error);
    } finally {
      syncing = false;
      if (realtimeDeferred) {
        realtimeDeferred = false;
        queueRealtimeWork(async () => {
          await fetchRemote();
          await reconcileRemoteKinds();
        });
      }
      if (pending.size) {
        clearTimeout(timer);
        timer = setTimeout(flush, SYNC_DEBOUNCE_MS);
      }
    }
  }

  async function queueLocalChange(kind) {
    if (!KINDS[kind]) return;
    try {
      const localRevision = crypto.randomUUID();
      pending.add(kind);
      await setMeta(kind, { localRevision, dirty: true });
      clearTimeout(timer);
      timer = setTimeout(flush, SYNC_DEBOUNCE_MS);
    } catch (error) {
      console.warn(`AstraChat could not queue ${kind} for cloud sync:`, error);
    }
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

  const realtimeChannel = supabase
    .channel(`user-workspace:${user.id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: TABLE,
      filter: `user_id=eq.${user.id}`
    }, payload => {
      queueRealtimeWork(async () => {
        remote = payload.new;
        if (activeUploads.size) {
          realtimeDeferred = true;
          return;
        }
        await reconcileRemoteKinds();
      });
    })
    .subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('AstraChat realtime subscription needs to reconnect:', status);
      }
    });

  try {
    await fetchRemote();
    await upgradeSyncMetadata();
    for (const kind of ['vault', 'appData', 'config']) await reconcileKind(kind);
    if (!appDataBase) appDataBase = await readLocal('appData') || {};
    for (const [kind, state] of Object.entries(meta)) if (state?.dirty) pending.add(kind);
    if (pending.size) timer = setTimeout(flush, 0);
  } catch (error) {
    console.warn('AstraChat cloud sync is unavailable until its database migration is installed:', error);
  }
  api.stop = () => supabase.removeChannel(realtimeChannel);
  return api;
}
