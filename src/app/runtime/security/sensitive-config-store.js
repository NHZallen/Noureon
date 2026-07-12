import { normalizeApiKeyValue as defaultNormalizeApiKeyValue } from '../kernel/config-normalization.js';
import { SENSITIVE_API_KEY_FIELDS } from './sensitive-config-redaction.js';
import {
  createPersistentApiKeyEncryptionKey,
  decryptPersistentApiKeys,
  encryptPersistentApiKeys
} from './persistent-api-key-encryption.js';

const PROVIDER_KEY_ALIASES = Object.freeze({
  gemini: 'gemini',
  openrouter: 'openrouter',
  nvidia: 'nvidia',
  tavily: 'tavily',
  stepfun: 'stepPlan',
  stepPlan: 'stepPlan'
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

export function createSensitiveConfigPersistence({
  getCurrentUser,
  getItem,
  setItem,
  removeItem,
  getApiKeys,
  replaceApiKeys,
  onSaved = () => {},
  cryptoImpl = globalThis.crypto
} = {}) {
  function getSensitiveConfigKey(user = getCurrentUser?.()) {
    return user?.username ? `chatSensitiveConfig_v1_${user.username}` : null;
  }

  function getEncryptedConfigKey(user = getCurrentUser?.()) {
    return user?.username ? `chatSensitiveConfigCiphertext_v2_${user.username}` : null;
  }

  function getEncryptionKeyKey(user = getCurrentUser?.()) {
    return user?.username ? `chatSensitiveConfigKey_v2_${user.username}` : null;
  }

  async function getOrCreateEncryptionKey() {
    const keyStorageKey = getEncryptionKeyKey();
    let key = await getItem(keyStorageKey);
    if (key) return key;
    key = await createPersistentApiKeyEncryptionKey(cryptoImpl);
    await setItem(keyStorageKey, key);
    return key;
  }

  async function persistEncryptedApiKeys() {
    const encryptedConfigKey = getEncryptedConfigKey();
    if (!encryptedConfigKey) return;
    const key = await getOrCreateEncryptionKey();
    await setItem(encryptedConfigKey, await encryptPersistentApiKeys(getApiKeys(), key, cryptoImpl));
  }

  async function loadSensitiveConfig() {
    const legacyKey = getSensitiveConfigKey();
    const encryptedConfigKey = getEncryptedConfigKey();
    const encryptionKeyKey = getEncryptionKeyKey();
    if (!legacyKey || !encryptedConfigKey || !encryptionKeyKey) return null;

    const encrypted = await getItem(encryptedConfigKey);
    const encryptionKey = await getItem(encryptionKeyKey);
    if (encrypted && encryptionKey) {
      try {
        replaceApiKeys(await decryptPersistentApiKeys(encrypted, encryptionKey, cryptoImpl));
        await removeItem(legacyKey);
        return getApiKeys();
      } catch {
        await removeItem(encryptedConfigKey);
        await removeItem(encryptionKeyKey);
      }
    } else if (encrypted || encryptionKey) {
      await removeItem(encryptedConfigKey);
      await removeItem(encryptionKeyKey);
    }

    const saved = await getItem(legacyKey);
    if (!saved) return null;

    let parsed;
    try {
      parsed = JSON.parse(saved);
    } catch {
      await removeItem(legacyKey);
      return null;
    }
    const nextApiKeys = parsed?.apiKeys && typeof parsed.apiKeys === 'object'
      ? parsed.apiKeys
      : parsed;
    replaceApiKeys(nextApiKeys || {});
    try {
      await persistEncryptedApiKeys();
    } catch {
      return getApiKeys();
    }
    await removeItem(legacyKey);
    return getApiKeys();
  }

  async function saveSensitiveConfig() {
    const legacyKey = getSensitiveConfigKey();
    if (!legacyKey) return;
    await persistEncryptedApiKeys();
    await removeItem(legacyKey);
    await onSaved({ apiKeys: getApiKeys() });
  }

  async function clearSensitiveConfig() {
    const legacyKey = getSensitiveConfigKey();
    if (!legacyKey) return;
    await removeItem(legacyKey);
    await removeItem(getEncryptedConfigKey());
    await removeItem(getEncryptionKeyKey());
    replaceApiKeys({});
  }

  return {
    getSensitiveConfigKey,
    getEncryptedConfigKey,
    getEncryptionKeyKey,
    loadSensitiveConfig,
    saveSensitiveConfig,
    clearSensitiveConfig
  };
}
