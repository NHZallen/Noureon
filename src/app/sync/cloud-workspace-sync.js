import { getSupabaseClient } from '../auth/supabase-client.js';
import { createLegacyRuntimeStorageAdapter } from '../runtime/kernel/storage-adapter.js';
import {
  clearPreviousSyncVaultKeys,
  decryptSyncVaultPayload,
  encryptSyncVaultPayload,
  getPreviousSyncVaultKeys,
  getSyncVaultRotationStorageKey,
  getSyncVaultStorageKey,
  getUnlockedSyncVaultKey,
  lockSyncVault
} from './sync-vault.js';
import { createCloudAssetTransport } from './cloud-assets.js';
import { repairCloudWorkspaceGeneratedImageKeys } from './cloud-workspace-image-repair.js';
import { ensureWorkspaceRecoveryBackup } from './workspace-recovery-backup.js';
import { initializeConversationShadowSync } from './cloud-sync-v2-shadow.js';
import { getCloudSyncBootstrapPendingKey } from './cloud-sync-bootstrap-queue.js';
import { createConversationRealtimeRefreshScheduler } from './cloud-sync-realtime-refresh.js';
import { withWorkspaceStorageExclusive } from './workspace-storage-coordinator.js';
import {
  canCommitHydratedRemote,
  enqueueRecoveringTask,
  settleCloudUpload,
  shouldApplyCloudRemote
} from './cloud-sync-versioning.js';

const TABLE = 'user_workspaces';
const SYNC_DEBOUNCE_MS = 750;
const SYNC_META_VERSION = 6;

export const CLOUD_SYNC_KINDS = Object.freeze({
  config: { column: 'config', timestamp: 'config_updated_at' },
  sensitive: { column: 'sensitive_config', timestamp: 'sensitive_config_updated_at' },
  vault: { column: 'vault_record', timestamp: 'vault_record_updated_at' }
});

const REMOTE_SYNC_COLUMNS = [
  'user_id',
  'config',
  'sensitive_config',
  'vault_record',
  'config_updated_at',
  'sensitive_config_updated_at',
  'vault_record_updated_at',
  'created_at',
  'updated_at'
].join(',');

function installConversationShadowStatus(window, status) {
  if (window?.__astraCloudSyncV2 || globalThis.__astraCloudSyncV2) return;
  const frozenStatus = Object.freeze({
    state: 'disabled',
    enabled: false,
    pending: false,
    ...status
  });
  const api = Object.freeze({
    captureWorkspace: () => false,
    flush: async () => frozenStatus,
    stop: () => {},
    getStatus: () => frozenStatus,
    diagnose: async () => ({
      status: frozenStatus,
      online: globalThis.navigator?.onLine !== false
    })
  });
  if (window) window.__astraCloudSyncV2 = api;
  globalThis.__astraCloudSyncV2 = api;
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function hasApiKeys(value) {
  const apiKeys = value?.apiKeys || value;
  return apiKeys && typeof apiKeys === 'object' && Object.values(apiKeys).some(Boolean);
}

export async function initializeCloudWorkspaceSync({ window, session, bootstrapQueue } = {}) {
  const supabase = getSupabaseClient();
  const user = session?.user;
  if (!supabase) {
    installConversationShadowStatus(window, { reason: 'supabase-not-configured' });
    return { enabled: false };
  }
  if (!user) {
    installConversationShadowStatus(window, { reason: 'no-session' });
    return { enabled: false };
  }

  const storage = createLegacyRuntimeStorageAdapter();
  const username = `supabase:${user.id}`;
  const lastUsername = await storage.getItem('chat_lastUser');
  if (lastUsername !== username) {
    installConversationShadowStatus(window, {
      reason: 'cloud-user-not-active',
      expectedUser: username,
      activeUser: lastUsername || null
    });
    return { enabled: false };
  }

  const keys = {
    appData: `chatAppData_v8.6_${username}`,
    config: `chatConfig_v_v8.6_${username}`,
    sensitive: `chatSensitiveConfig_v1_${username}`,
    vault: getSyncVaultStorageKey(username)
  };
  const rotationKey = getSyncVaultRotationStorageKey(username);
  const metaKey = `chatCloudSyncMeta_v1_${username}`;
  const assets = createCloudAssetTransport({ supabase, storage, userId: user.id });
  const cloudAssetRuntime = Object.freeze({
    hydrateConversation: conversation => assets.hydrateConversation(conversation)
  });
  window.__astraCloudAssets = cloudAssetRuntime;
  let meta = parseJson(await storage.getItem(metaKey)) || {};
  const upgradingMeta = meta.version !== SYNC_META_VERSION;
  let remote = null;
  let remoteWriteEpoch = 0;
  let timer = null;
  let syncing = false;
  let realtimeWork = Promise.resolve();
  let realtimeDeferred = false;
  let remoteRefreshTimer = null;
  const pending = new Set();
  const activeUploads = new Map();
  const reportRealtimeError = error => console.warn('Noureon realtime queue recovered after an error:', error);
  const queueRealtimeWork = task => {
    realtimeWork = enqueueRecoveringTask(realtimeWork, task, reportRealtimeError);
  };

  await ensureWorkspaceRecoveryBackup({
    storage,
    username,
    appDataKey: keys.appData
  });

  await repairCloudWorkspaceGeneratedImageKeys({
    storage,
    username,
    appDataKey: keys.appData
  });

  const readStoredMeta = async () => parseJson(await storage.getItem(metaKey)) || {};
  const refreshMeta = () => withWorkspaceStorageExclusive(async () => {
    meta = await readStoredMeta();
    return meta;
  });
  const mutateMeta = mutator => withWorkspaceStorageExclusive(async () => {
    const latest = await readStoredMeta();
    const next = mutator(latest) || latest;
    meta = next;
    await storage.setItem(metaKey, JSON.stringify(next));
    return next;
  });
  const setMeta = async (kind, values) => {
    const next = await mutateMeta(latest => ({
      ...latest,
      [kind]: { ...(latest[kind] || {}), ...values }
    }));
    return next[kind];
  };

  async function fetchRemote() {
    const requestEpoch = ++remoteWriteEpoch;
    const { data, error } = await supabase.from(TABLE).select(REMOTE_SYNC_COLUMNS).eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (requestEpoch === remoteWriteEpoch) remote = data;
    return remote;
  }

  async function readLocal(kind) {
    return parseJson(await storage.getItem(keys[kind]));
  }

  async function prepareUpload(kind) {
    const value = await readLocal(kind);
    if (kind === 'config') return value ? assets.externalize(value) : null;
    const rotation = parseJson(await storage.getItem(rotationKey));
    if (kind === 'vault') {
      if (rotation || meta.sensitive?.dirty) return undefined;
      return value;
    }
    if (!value || !hasApiKeys(value)) return null;
    if (!await readLocal('vault')) return null;
    if (rotation?.state && rotation.state !== 'pending') return undefined;
    const key = getUnlockedSyncVaultKey(username);
    if (!key) return undefined;
    return encryptSyncVaultPayload(value, key);
  }

  async function uploadKind(kind) {
    if (activeUploads.has(kind)) return { complete: false };
    const definition = CLOUD_SYNC_KINDS[kind];
    if (!definition) return { complete: true };
    await refreshMeta();
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
      const uploadEpoch = ++remoteWriteEpoch;
      const { data, error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'user_id' }).select(REMOTE_SYNC_COLUMNS).single();
      if (error) throw error;
      if (uploadEpoch === remoteWriteEpoch) remote = data;
      const remoteUpdatedAt = data[definition.timestamp] || data.updated_at || clientTimestamp;
      let settled;
      await mutateMeta(latest => {
        settled = settleCloudUpload(latest[kind], localRevision, remoteUpdatedAt);
        return { ...latest, [kind]: settled.state };
      });
      if (kind === 'sensitive' && settled.complete && await storage.getItem(rotationKey)) {
        await storage.removeItem(rotationKey);
        clearPreviousSyncVaultKeys(username);
        await queueLocalChange('vault');
      }
      return { complete: settled.complete, localRevision };
    } finally {
      activeUploads.delete(kind);
    }
  }

  async function applyRemote(kind) {
    const definition = CLOUD_SYNC_KINDS[kind];
    if (!definition) return false;
    await refreshMeta();
    const remoteSnapshot = remote;
    const startedRevision = meta[kind]?.localRevision;
    const value = remoteSnapshot?.[definition.column];
    if (value == null && !remoteSnapshot?.[definition.timestamp]) return false;
    let hydrated = value;
    if (kind === 'config') hydrated = await assets.hydrate(value);
    if (kind === 'sensitive') {
      const key = getUnlockedSyncVaultKey(username);
      if (value != null) {
        if (!key) return false;
        hydrated = await decryptSyncVaultPayload(value, key);
      }
    }
    const timestamp = remoteSnapshot[definition.timestamp] || remoteSnapshot.updated_at;
    let applied = false;
    await withWorkspaceStorageExclusive(async () => {
      const latest = await readStoredMeta();
      meta = latest;
      if (!canCommitHydratedRemote({
        startedRevision,
        currentState: latest[kind],
        activeUpload: activeUploads.has(kind),
        remoteUnchanged: remote === remoteSnapshot
      })) return;
      if (hydrated == null) await storage.removeItem(keys[kind]);
      else await storage.setItem(keys[kind], JSON.stringify(hydrated));
      meta = {
        ...latest,
        [kind]: { ...(latest[kind] || {}), remoteUpdatedAt: timestamp, dirty: false }
      };
      await storage.setItem(metaKey, JSON.stringify(meta));
      applied = true;
    });
    if (!applied) {
      scheduleRemoteRefresh();
      console.info('Noureon discarded a stale hydrated workspace snapshot.', { kind });
      return false;
    }
    if (kind === 'config') window.dispatchEvent(new window.CustomEvent('astra:cloud-config', { detail: hydrated }));
    if (kind === 'sensitive') window.dispatchEvent(new window.CustomEvent('astra:cloud-sensitive-config', { detail: hydrated }));
    if (kind === 'vault') {
      lockSyncVault(username);
      window.dispatchEvent(new window.CustomEvent('astra:cloud-vault', { detail: hydrated }));
    }
    return true;
  }

  async function reconcileKind(kind) {
    const definition = CLOUD_SYNC_KINDS[kind];
    if (!definition) return false;
    await refreshMeta();
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
    for (const kind of Object.keys(CLOUD_SYNC_KINDS)) {
      try {
        await reconcileKind(kind);
      } catch (error) {
        console.warn(`Noureon realtime ${kind} sync failed:`, error);
      }
    }
  }

  async function upgradeSyncMetadata() {
    if (!upgradingMeta) return;
    await mutateMeta(latest => {
      if (latest.version === SYNC_META_VERSION) return latest;
      const upgraded = { ...latest };
      delete upgraded.appData;
      for (const [key, state] of Object.entries(upgraded)) {
        if (state && typeof state === 'object') {
          const nextState = { ...state };
          delete nextState.remoteUpdatedAt;
          upgraded[key] = nextState;
        }
      }
      upgraded.version = SYNC_META_VERSION;
      return upgraded;
    });
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
      console.warn('Noureon cloud sync is waiting to retry:', error);
    } finally {
      syncing = false;
      if (realtimeDeferred) scheduleRemoteRefresh();
      if (pending.size) {
        clearTimeout(timer);
        timer = setTimeout(flush, SYNC_DEBOUNCE_MS);
      }
    }
  }

  async function queueLocalChange(kind) {
    if (!CLOUD_SYNC_KINDS[kind]) return false;
    const localRevision = crypto.randomUUID();
    pending.add(kind);
    try {
      await setMeta(kind, { localRevision, dirty: true });
      const pendingKey = getCloudSyncBootstrapPendingKey(username, kind);
      if (pendingKey) {
        try { await storage.removeItem(pendingKey); } catch {}
      }
      clearTimeout(timer);
      timer = setTimeout(flush, SYNC_DEBOUNCE_MS);
      return localRevision;
    } catch (error) {
      console.warn(`Noureon could not queue ${kind} for cloud sync:`, error);
      const pendingKey = getCloudSyncBootstrapPendingKey(username, kind);
      if (pendingKey) {
        try { await storage.setItem(pendingKey, '1'); } catch {}
      }
      clearTimeout(timer);
      timer = setTimeout(flush, SYNC_DEBOUNCE_MS);
      return false;
    }
  }

  function scheduleRemoteRefresh() {
    realtimeDeferred = true;
    if (remoteRefreshTimer !== null) return;
    remoteRefreshTimer = setTimeout(() => {
      remoteRefreshTimer = null;
      queueRealtimeWork(async () => {
        if (activeUploads.size) {
          scheduleRemoteRefresh();
          return;
        }
        try {
          await fetchRemote();
          await reconcileRemoteKinds();
          realtimeDeferred = false;
        } catch (error) {
          realtimeDeferred = true;
          throw error;
        }
      });
    }, SYNC_DEBOUNCE_MS);
  }

  async function decryptRotatedSensitivePayload(payload, candidateKeys) {
    let lastError;
    for (const candidateKey of candidateKeys) {
      if (!candidateKey) continue;
      try {
        return await decryptSyncVaultPayload(payload, candidateKey);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('No sync-vault key could decrypt the sensitive payload.');
  }

  async function handleSyncVaultUnlocked(event) {
    if (event?.detail?.username !== username) return;
    const rotation = parseJson(await storage.getItem(rotationKey));
    const previousKeys = getPreviousSyncVaultKeys(username);
    await queueLocalChange('vault');
    const rotationSensitiveRevision = rotation || previousKeys.length
      ? await queueLocalChange('sensitive')
      : null;
    try {
      await fetchRemote();
      if ((rotation || previousKeys.length) && remote?.sensitive_config) {
        const decrypted = await decryptRotatedSensitivePayload(
          remote.sensitive_config,
          [...previousKeys, getUnlockedSyncVaultKey(username)]
        );
        let applied = false;
        await withWorkspaceStorageExclusive(async () => {
          const latest = await readStoredMeta();
          if (!rotationSensitiveRevision || latest.sensitive?.localRevision !== rotationSensitiveRevision) return;
          await storage.setItem(keys.sensitive, JSON.stringify(decrypted));
          applied = true;
        });
        if (applied) {
          window.dispatchEvent(new window.CustomEvent('astra:cloud-sensitive-config', { detail: decrypted }));
          await queueLocalChange('sensitive');
        }
      } else if (!rotation && !previousKeys.length) {
        await reconcileKind('sensitive');
        if (!remote?.sensitive_config) await queueLocalChange('sensitive');
      }
    } catch (error) {
      console.warn('Noureon encrypted API key sync failed; the local rotation remains queued:', error);
    }
  }

  let conversationShadowSync = null;
  const conversationRefreshScheduler = createConversationRealtimeRefreshScheduler({
    getSync: () => conversationShadowSync,
    logger: console
  });
  const scheduleConversationRemoteRefresh = payload => conversationRefreshScheduler.request(payload);
  const handleOnline = () => {
    void flush();
    scheduleConversationRemoteRefresh();
    if (realtimeDeferred) scheduleRemoteRefresh();
  };

  const api = { enabled: true, queueLocalChange, flush, refresh: async () => {
    await fetchRemote();
    for (const kind of Object.keys(CLOUD_SYNC_KINDS)) await reconcileKind(kind);
  } };
  if (bootstrapQueue?.handoff) await bootstrapQueue.handoff(api);
  else window.__astraCloudWorkspaceSync = api;
  window.addEventListener('online', handleOnline);
  window.addEventListener('astra:sync-vault-unlocked', handleSyncVaultUnlocked);
  if (bootstrapQueue?.takePendingVaultUnlock?.()) {
    await handleSyncVaultUnlocked({ detail: { username } });
  }

  const handleWorkspaceRealtimeChange = payload => {
    queueRealtimeWork(async () => {
      remoteWriteEpoch += 1;
      remote = payload.new;
      if (activeUploads.size) {
        scheduleRemoteRefresh();
        return;
      }
      await reconcileRemoteKinds();
    });
  };
  const realtimeChannel = supabase
    .channel(`user-workspace:${user.id}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: TABLE,
      filter: `user_id=eq.${user.id}`
    }, handleWorkspaceRealtimeChange)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: TABLE,
      filter: `user_id=eq.${user.id}`
    }, handleWorkspaceRealtimeChange)
    .subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Noureon realtime subscription needs to reconnect:', status);
      }
    });

  const conversationRealtimeChannel = supabase
    .channel(`user-conversations:${user.id}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'workspace_conversations',
      filter: `user_id=eq.${user.id}`
    }, scheduleConversationRemoteRefresh)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'workspace_conversations',
      filter: `user_id=eq.${user.id}`
    }, scheduleConversationRemoteRefresh)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'workspace_tombstones',
      filter: `user_id=eq.${user.id}`
    }, scheduleConversationRemoteRefresh)
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        scheduleConversationRemoteRefresh();
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Noureon conversation realtime subscription needs to reconnect:', status);
      }
    });

  try {
    await fetchRemote();
    await upgradeSyncMetadata();
    for (const kind of Object.keys(CLOUD_SYNC_KINDS)) await reconcileKind(kind);
    for (const kind of Object.keys(CLOUD_SYNC_KINDS)) if (meta[kind]?.dirty) pending.add(kind);
    if (pending.size) timer = setTimeout(flush, 0);
  } catch (error) {
    console.warn('Noureon cloud sync is unavailable until its database migration is installed:', error);
  }
  conversationShadowSync = initializeConversationShadowSync({
    window,
    supabase,
    storage,
    user,
    username,
    assetTransport: assets
  });
  try {
    await conversationShadowSync.ready;
  } catch (error) {
    console.warn('Noureon conversation refresh did not block local runtime startup:', error);
  }
  conversationRefreshScheduler.resume();
  api.stop = () => {
    window.removeEventListener?.('online', handleOnline);
    conversationRefreshScheduler.stop();
    if (window.__astraCloudAssets === cloudAssetRuntime) delete window.__astraCloudAssets;
    conversationShadowSync.stop();
    return Promise.all([
      supabase.removeChannel(realtimeChannel),
      supabase.removeChannel(conversationRealtimeChannel)
    ]);
  };
  return api;
}
