export const SENSITIVE_API_KEY_FIELDS = Object.freeze([
  'gemini',
  'openrouter',
  'nvidia',
  'opencode-go',
  'openai',
  'tavily',
  'tinyfish'
]);

const SENSITIVE_API_KEY_FIELD_SET = new Set(SENSITIVE_API_KEY_FIELDS);
const DEFAULT_REDACTION_MASK = '********';
const DEFAULT_DISPLAY_MASK = '************';

export function isSensitiveConfigKey(key) {
  return key === 'apiKeys' || SENSITIVE_API_KEY_FIELD_SET.has(key);
}

export function redactApiKey(value, {
  mask = DEFAULT_REDACTION_MASK,
  visiblePrefix = 0,
  visibleSuffix = 4
} = {}) {
  if (value == null) return '';
  const stringValue = String(value);
  if (!stringValue) return '';

  const prefix = visiblePrefix > 0 ? stringValue.slice(0, visiblePrefix) : '';
  const suffix = visibleSuffix > 0 ? stringValue.slice(-visibleSuffix) : '';
  return `${prefix}${mask}${suffix}`;
}

export function maskApiKeyForDisplay(value, {
  mask = DEFAULT_DISPLAY_MASK,
  visiblePrefix = 8,
  visibleSuffix = 4
} = {}) {
  if (value == null) return '';
  const stringValue = String(value);
  if (!stringValue) return '';

  if (stringValue.length <= visiblePrefix + visibleSuffix) {
    const prefixLength = Math.min(4, Math.max(1, stringValue.length - 1));
    const suffixLength = stringValue.length > 1 ? 1 : 0;
    const prefix = stringValue.slice(0, prefixLength);
    const suffix = suffixLength > 0 ? stringValue.slice(-suffixLength) : '';
    return `${prefix}${mask}${suffix}`;
  }

  return redactApiKey(stringValue, { mask, visiblePrefix, visibleSuffix });
}

export function isMaskedApiKeyDisplayValue(value, { mask = DEFAULT_DISPLAY_MASK } = {}) {
  if (value == null) return false;
  const stringValue = String(value);
  return stringValue.includes(mask);
}

export function redactApiKeys(apiKeys, options = {}) {
  if (!apiKeys || typeof apiKeys !== 'object') return {};

  return Object.fromEntries(
    Object.entries(apiKeys).map(([key, value]) => [
      key,
      isSensitiveConfigKey(key) ? redactApiKey(value, options) : redactApiKey(value, options)
    ])
  );
}

export function removeSensitiveConfig(config) {
  if (!config || typeof config !== 'object') return {};
  const { apiKeys, theme: _retiredTheme, ...safeConfig } = config;
  return { ...safeConfig };
}

export function redactSensitiveConfig(config, options = {}) {
  if (!config || typeof config !== 'object') return {};
  const safeConfig = removeSensitiveConfig(config);
  if (!config.apiKeys || typeof config.apiKeys !== 'object') return safeConfig;

  return {
    ...safeConfig,
    apiKeys: redactApiKeys(config.apiKeys, options)
  };
}

export function createExportSafeConfig(config, { includeSecrets = false, redact = false } = {}) {
  if (includeSecrets) {
    if (!config || typeof config !== 'object') return {};
    return {
      ...config,
      apiKeys: config.apiKeys && typeof config.apiKeys === 'object'
        ? { ...config.apiKeys }
        : config.apiKeys
    };
  }

  return redact ? redactSensitiveConfig(config) : removeSensitiveConfig(config);
}

// Text that came back from a provider (an error body) may repeat a key: the page shows it in the chat and the chat is saved and synced, so a
// key must never be left in it. The keys the person has set are taken out whole (the stores of keys register themselves here), and so is
// anything shaped like the keys of the providers the page talks to. The server does the same for its replies (server/executor.js, scrubText).
const REPLACEMENT = '[hidden]';
const MIN_KEY_CHARS = 6;
const KEY_SHAPES = /\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|nvapi-[A-Za-z0-9_-]{16,}|tvly-[A-Za-z0-9_-]{16,})/g;
const keySources = new Set();

/** `getKeys()` returns the keys now set (an array of strings or an object of them). Returns a function that takes the source away. */
export function registerApiKeySource(getKeys) {
  if (typeof getKeys !== 'function') return () => {};
  keySources.add(getKeys);
  return () => keySources.delete(getKeys);
}

export function scrubApiKeys(text) {
  if (typeof text !== 'string' || !text) return text;
  let result = text;
  for (const source of keySources) {
    let keys;
    try { keys = source(); } catch { continue; }
    for (const value of Array.isArray(keys) ? keys : Object.values(keys || {})) {
      if (typeof value === 'string' && value.length >= MIN_KEY_CHARS) result = result.split(value).join(REPLACEMENT);
    }
  }
  return result.replace(KEY_SHAPES, REPLACEMENT);
}
