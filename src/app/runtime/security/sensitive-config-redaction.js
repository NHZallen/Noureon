export const SENSITIVE_API_KEY_FIELDS = Object.freeze([
  'gemini',
  'openrouter',
  'nvidia',
  'stepPlan',
  'tavily'
]);

const SENSITIVE_API_KEY_FIELD_SET = new Set(SENSITIVE_API_KEY_FIELDS);
const DEFAULT_REDACTION_MASK = '********';

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
