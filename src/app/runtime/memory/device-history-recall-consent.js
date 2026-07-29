export const HISTORY_RECALL_DEVICE_CONSENT_KEY = 'noureon:history-recall-device-consent:v1';

export function createDeviceHistoryRecallConsent({
  storage,
  storageKey = HISTORY_RECALL_DEVICE_CONSENT_KEY,
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
    isGranted: () => granted,
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
