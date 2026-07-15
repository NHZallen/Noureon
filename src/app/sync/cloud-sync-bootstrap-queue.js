import { createLegacyRuntimeStorageAdapter } from '../runtime/kernel/storage-adapter.js';

export const CLOUD_SYNC_BOOTSTRAP_KINDS = Object.freeze(['config', 'sensitive', 'vault']);
const CLOUD_SYNC_BOOTSTRAP_KEY_PREFIX = 'chatCloudSyncBootstrapPending_v1_';

export function getCloudSyncBootstrapPendingKey(username, kind) {
  if (!username || !CLOUD_SYNC_BOOTSTRAP_KINDS.includes(kind)) return null;
  return `${CLOUD_SYNC_BOOTSTRAP_KEY_PREFIX}${username}_${kind}`;
}

export function installCloudSyncBootstrapQueue({
  window = globalThis.window,
  username,
  storage = createLegacyRuntimeStorageAdapter(),
  logger = console
} = {}) {
  if (!window || !username) return null;
  const pendingKinds = new Set();
  let target = null;
  let markerWrites = Promise.resolve();
  let pendingVaultUnlock = false;

  const persistMarker = (kind) => {
    const key = getCloudSyncBootstrapPendingKey(username, kind);
    if (!key) return Promise.resolve(false);
    pendingKinds.add(kind);
    const result = markerWrites
      .catch(() => {})
      .then(() => storage.setItem(key, '1'));
    markerWrites = result.catch((error) => {
      logger.warn?.('Noureon could not persist an early cloud-sync marker:', error);
    });
    return result.then(() => true, () => false);
  };

  const queueLocalChange = async (kind) => {
    if (!CLOUD_SYNC_BOOTSTRAP_KINDS.includes(kind)) return false;
    if (target?.queueLocalChange) {
      try {
        const result = await target.queueLocalChange(kind);
        if (result === false) await persistMarker(kind);
        return result;
      } catch (error) {
        await persistMarker(kind);
        logger.warn?.(`Noureon could not hand ${kind} to cloud sync:`, error);
        return false;
      }
    }
    return persistMarker(kind);
  };

  const unlockedHandler = event => {
    if (event.detail?.username !== username) return;
    pendingVaultUnlock = true;
    void queueLocalChange('vault');
  };
  window.addEventListener?.('astra:sync-vault-unlocked', unlockedHandler);

  const stub = Object.freeze({
    enabled: true,
    initializing: true,
    queueLocalChange,
    flush: async () => ({ state: 'initializing' })
  });
  window.__astraCloudWorkspaceSync = stub;

  async function handoff(nextApi) {
    if (!nextApi?.queueLocalChange) throw new TypeError('Cloud sync handoff requires a queue API.');
    target = nextApi;
    await markerWrites;
    for (const kind of CLOUD_SYNC_BOOTSTRAP_KINDS) {
      const key = getCloudSyncBootstrapPendingKey(username, kind);
      let persisted;
      try {
        persisted = await storage.getItem(key);
      } catch (error) {
        logger.warn?.(`Noureon could not read the early ${kind} cloud-sync marker:`, error);
        persisted = 'unknown';
      }
      if (!pendingKinds.has(kind) && persisted == null) continue;
      let queued = false;
      try {
        queued = await nextApi.queueLocalChange(kind);
      } catch (error) {
        logger.warn?.(`Noureon could not drain the early ${kind} cloud-sync marker:`, error);
      }
      if (queued === false) {
        await persistMarker(kind);
        continue;
      }
      try {
        await storage.removeItem(key);
      } catch (error) {
        logger.warn?.(`Noureon could not clear the drained ${kind} cloud-sync marker:`, error);
      }
      pendingKinds.delete(kind);
    }
    window.removeEventListener?.('astra:sync-vault-unlocked', unlockedHandler);
    if (window.__astraCloudWorkspaceSync === stub) window.__astraCloudWorkspaceSync = nextApi;
    return nextApi;
  }

  function takePendingVaultUnlock() {
    const pending = pendingVaultUnlock;
    pendingVaultUnlock = false;
    return pending;
  }

  return Object.freeze({ stub, handoff, takePendingVaultUnlock });
}
