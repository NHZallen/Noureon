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

  return {
    async load() {
      const saved = await storage.getItem(storageKey);
      granted = Boolean(saved?.grantedAt);
      loaded = true;
      return granted;
    },
    isGranted: () => granted,
    isLoaded: () => loaded,
    async grant() {
      const grantedAt = now();
      await storage.setItem(storageKey, { grantedAt });
      granted = true;
      loaded = true;
      return grantedAt;
    },
    async revoke() {
      await storage.removeItem(storageKey);
      granted = false;
      loaded = true;
    }
  };
}
