export const HISTORY_RECALL_DEVICE_CONSENT_KEY = 'noureon:history-recall-device-consent:v1';

export function createDeviceHistoryRecallConsent({
  storage,
  storageKey = HISTORY_RECALL_DEVICE_CONSENT_KEY,
  // The consent follows the account: while the (synced) setting is on, it was given when it was turned on, on whichever device that was, so this
  // device needs none of its own. `isImplied()` says whether the setting is on.
  isImplied = () => false,
  now = () => new Date().toISOString()
} = {}) {
  if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) {
    throw new TypeError('History recall consent requires a local storage adapter.');
  }

  let granted = false;
  let loaded = false;
  let activeStorageKey = null;
  const getActiveStorageKey = () => activeStorageKey ||= (
    typeof storageKey === 'function' ? storageKey() : storageKey
  );

  return {
    async load() {
      const saved = await storage.getItem(getActiveStorageKey());
      granted = Boolean(saved?.grantedAt);
      loaded = true;
      return granted;
    },
    isGranted: () => granted || isImplied() === true,
    isLoaded: () => loaded,
    async grant() {
      const grantedAt = now();
      await storage.setItem(getActiveStorageKey(), { grantedAt });
      granted = true;
      loaded = true;
      return grantedAt;
    },
    async revoke() {
      await storage.removeItem(getActiveStorageKey());
      granted = false;
      loaded = true;
    }
  };
}

export function createDeviceHistoryRecallConsentRuntime(options = {}) {
  const consent = createDeviceHistoryRecallConsent(options);
  let ready = null;
  const ensureReady = () => {
    if (!ready) {
      ready = consent.load()
        .catch(error => options.logger?.warn?.('History recall consent could not load.', error))
        .finally(() => options.onLoaded?.());
    }
    return ready;
  };
  return {
    ...consent,
    ensureReady,
    async grant() {
      await ensureReady();
      return consent.grant();
    },
    async revoke() {
      await ensureReady();
      return consent.revoke();
    }
  };
}
