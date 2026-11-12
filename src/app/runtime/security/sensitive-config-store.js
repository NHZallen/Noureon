import { normalizeApiKeyValue as defaultNormalizeApiKeyValue } from '../kernel/config-normalization.js';
import { SENSITIVE_API_KEY_FIELDS, registerApiKeySource } from './sensitive-config-redaction.js';

const PROVIDER_KEY_ALIASES = Object.freeze({
  gemini: 'gemini',
  openrouter: 'openrouter',
  nvidia: 'nvidia',
  'opencode-go': 'opencode-go',
  openai: 'openai',
  tavily: 'tavily',
  tinyfish: 'tinyfish'
});

export function normalizeProviderKey(provider) {
  return PROVIDER_KEY_ALIASES[provider] || provider;
}

function createEmptyApiKeys() {
  return Object.fromEntries(SENSITIVE_API_KEY_FIELDS.map((field) => [field, '']));
}

function normalizeApiKeys(apiKeys = {}, normalizeApiKeyValue = defaultNormalizeApiKeyValue) {
  const normalized = createEmptyApiKeys();
  if (!apiKeys || typeof apiKeys !== 'object') return normalized;

  for (const [provider, value] of Object.entries(apiKeys)) {
    const normalizedProvider = normalizeProviderKey(provider);
    normalized[normalizedProvider] = normalizeApiKeyValue(value);
  }

  return normalized;
}

function normalizeApiKeyUpdates(apiKeys = {}, normalizeApiKeyValue = defaultNormalizeApiKeyValue) {
  if (!apiKeys || typeof apiKeys !== 'object') return {};
  return Object.fromEntries(
    Object.entries(apiKeys).map(([provider, value]) => [
      normalizeProviderKey(provider),
      normalizeApiKeyValue(value)
    ])
  );
}

export function createSensitiveConfigStore({
  initialApiKeys = {},
  normalizeApiKeyValue = defaultNormalizeApiKeyValue
} = {}) {
  let apiKeys = normalizeApiKeys(initialApiKeys, normalizeApiKeyValue);
  // What the provider's errors may repeat is taken out of the text before it is shown or saved (scrubApiKeys).
  registerApiKeySource(() => apiKeys);

  function getApiKeys() {
    return { ...apiKeys };
  }

  function getApiKey(provider) {
    return apiKeys[normalizeProviderKey(provider)] || '';
  }

  function setApiKey(provider, value) {
    const normalizedProvider = normalizeProviderKey(provider);
    apiKeys = {
      ...apiKeys,
      [normalizedProvider]: normalizeApiKeyValue(value)
    };
    return getApiKeys();
  }

  function mergeApiKeys(nextApiKeys = {}) {
    apiKeys = {
      ...apiKeys,
      ...normalizeApiKeyUpdates(nextApiKeys, normalizeApiKeyValue)
    };
    return getApiKeys();
  }

  function replaceApiKeys(nextApiKeys = {}) {
    apiKeys = normalizeApiKeys(nextApiKeys, normalizeApiKeyValue);
    return getApiKeys();
  }

  function clearApiKeys() {
    apiKeys = createEmptyApiKeys();
    return getApiKeys();
  }

  return {
    getApiKeys,
    getApiKey,
    setApiKey,
    mergeApiKeys,
    replaceApiKeys,
    clearApiKeys
  };
}

const isLockedError = (error) => error?.code === 'local-keys-locked';

export function createSensitiveConfigPersistence({
  getCurrentUser,
  getItem,
  setItem,
  removeItem,
  getApiKeys,
  replaceApiKeys,
  onSaved = () => {},
  eventTarget = globalThis.window
} = {}) {
  async function markCloudSyncPending() {
    try {
      return await onSaved();
    } catch {
      return false;
    }
  }

  function getSensitiveConfigKey(user = getCurrentUser?.()) {
    return user?.username ? `chatSensitiveConfig_v1_${user.username}` : null;
  }

  // Whether the keys were locked since they were last read: the keys typed meanwhile are put with the ones that are read after the unlock.
  let wasLocked = false;

  async function loadSensitiveConfig() {
    const key = getSensitiveConfigKey();
    if (!key) return null;
    let saved;
    try {
      saved = await getItem(key);
    } catch (error) {
      // The keys of this device are locked (the protection with a passkey, and the sync vault is not unlocked): there are none to show yet, and nothing is
      // written over what is kept. They are read again when the vault is unlocked.
      if (isLockedError(error)) {
        wasLocked = true;
        replaceApiKeys({});
        return null;
      }
      throw error;
    }
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    const nextApiKeys = parsed?.apiKeys && typeof parsed.apiKeys === 'object'
      ? parsed.apiKeys
      : parsed;
    replaceApiKeys(nextApiKeys || {});
    return getApiKeys();
  }

  async function saveSensitiveConfig() {
    const key = getSensitiveConfigKey();
    if (!key) return;
    const serializedConfig = JSON.stringify({ apiKeys: getApiKeys() });
    await markCloudSyncPending();
    try {
      await setItem(key, serializedConfig);
    } catch (error) {
      // Locked: what is kept stays as it is (the page holds no keys now, and must not replace them with nothing). What the person typed stays in memory and is saved
      // after the unlock, which is asked for now.
      if (isLockedError(error)) {
        wasLocked = true;
        eventTarget?.dispatchEvent?.(new eventTarget.CustomEvent('noureon:local-keys-needed'));
        return;
      }
      throw error;
    }
    await markCloudSyncPending();
  }

  async function clearSensitiveConfig() {
    const key = getSensitiveConfigKey();
    if (!key) return;
    await markCloudSyncPending();
    await removeItem(key);
    replaceApiKeys({});
    await markCloudSyncPending();
  }

  // The protection with a passkey (security/local-key-protection.js): locking takes the keys out of the page's memory; unlocking the sync vault reads them again.
  const isMine = (username) => Boolean(username) && getCurrentUser?.()?.username === username;
  eventTarget?.addEventListener?.('noureon:local-keys-locked', (event) => {
    if (!isMine(event?.detail?.username)) return;
    wasLocked = true;
    replaceApiKeys({});
  });
  eventTarget?.addEventListener?.('astra:sync-vault-unlocked', async (event) => {
    if (!isMine(event?.detail?.username)) return;
    try {
      const typedWhileLocked = wasLocked ? Object.fromEntries(Object.entries(getApiKeys()).filter(([, value]) => value)) : {};
      let loaded = await loadSensitiveConfig();
      wasLocked = false;
      if (Object.keys(typedWhileLocked).length) {
        replaceApiKeys({ ...(loaded || {}), ...typedWhileLocked });
        loaded = getApiKeys();
        await saveSensitiveConfig();
      }
      // The rest of the page (the usage rings, the models that need a key) follows the keys it is given.
      if (loaded) eventTarget.dispatchEvent(new eventTarget.CustomEvent('astra:cloud-sensitive-config', { detail: { apiKeys: loaded } }));
    } catch (error) {
      globalThis.console?.warn?.('The API keys could not be read after the unlock.', error);
    }
  });

  return {
    getSensitiveConfigKey,
    loadSensitiveConfig,
    saveSensitiveConfig,
    clearSensitiveConfig
  };
}
