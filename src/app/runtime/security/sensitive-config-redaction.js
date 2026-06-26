export const SENSITIVE_API_KEY_FIELDS = Object.freeze([
  'gemini',
  'openrouter',
  'nvidia',
  'stepPlan',
  'tavily'
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
  const { apiKeys, ...safeConfig } = config;
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
