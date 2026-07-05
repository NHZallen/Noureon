import { normalizeApiKeyValue as defaultNormalizeApiKeyValue } from '../kernel/config-normalization.js';
import { SENSITIVE_API_KEY_FIELDS } from './sensitive-config-redaction.js';

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
  onSaved = () => {}
} = {}) {
  function getSensitiveConfigKey(user = getCurrentUser?.()) {
    return user?.username ? `chatSensitiveConfig_v1_${user.username}` : null;
  }

  async function loadSensitiveConfig() {
    const key = getSensitiveConfigKey();
    if (!key) return null;
    const saved = await getItem(key);
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
    await setItem(key, JSON.stringify({ apiKeys: getApiKeys() }));
    onSaved();
  }

  async function clearSensitiveConfig() {
    const key = getSensitiveConfigKey();
    if (!key) return;
    await removeItem(key);
    replaceApiKeys({});
  }

  return {
    getSensitiveConfigKey,
    loadSensitiveConfig,
    saveSensitiveConfig,
    clearSensitiveConfig
  };
}
