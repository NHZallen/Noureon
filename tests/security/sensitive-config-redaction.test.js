import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  SENSITIVE_API_KEY_FIELDS,
  createExportSafeConfig,
  isSensitiveConfigKey,
  redactApiKey,
  redactApiKeys,
  redactSensitiveConfig,
  removeSensitiveConfig
} from '../../src/app/runtime/security/sensitive-config-redaction.js';

const projectFile = (path) => new URL(`../../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

test('sensitive config redaction exports the expected helper API', () => {
  assert.deepEqual(
    [...SENSITIVE_API_KEY_FIELDS].sort(),
    ['gemini', 'nvidia', 'openrouter', 'stepPlan', 'tavily'].sort()
  );
  assert.equal(typeof isSensitiveConfigKey, 'function');
  assert.equal(typeof redactApiKey, 'function');
  assert.equal(typeof redactApiKeys, 'function');
  assert.equal(typeof redactSensitiveConfig, 'function');
  assert.equal(typeof removeSensitiveConfig, 'function');
  assert.equal(typeof createExportSafeConfig, 'function');
});

test('removeSensitiveConfig returns a copy without apiKeys and does not mutate input', () => {
  const config = {
    defaultModel: 'model-a',
    outputMode: 'typewriter',
    apiKeys: {
      gemini: 'gemini-secret',
      openrouter: 'sk-or-secret'
    }
  };

  const safeConfig = removeSensitiveConfig(config);

  assert.deepEqual(safeConfig, {
    defaultModel: 'model-a',
    outputMode: 'typewriter'
  });
  assert.deepEqual(config.apiKeys, {
    gemini: 'gemini-secret',
    openrouter: 'sk-or-secret'
  });
  assert.notEqual(safeConfig, config);
});

test('redactSensitiveConfig masks all known provider keys and unknown keys safely', () => {
  const config = {
    apiKeys: {
      gemini: 'gemini-secret-1234',
      openrouter: 'sk-or-openrouter-1234',
      nvidia: 'nvapi-secret-1234',
      stepPlan: 'stepfun-secret-1234',
      tavily: 'tvly-secret-1234',
      extraProvider: 'extra-secret-1234'
    },
    theme: 'dark'
  };

  const redacted = redactSensitiveConfig(config);
  const serialized = JSON.stringify(redacted);

  for (const secret of Object.values(config.apiKeys)) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.equal(redacted.theme, 'dark');
  assert.equal(Object.keys(redacted.apiKeys).sort().join(','), Object.keys(config.apiKeys).sort().join(','));
  assert.match(redacted.apiKeys.gemini, /\*{4,}/);
  assert.match(redacted.apiKeys.extraProvider, /\*{4,}/);
});

test('createExportSafeConfig defaults to no full secrets and preserves only explicit opt-in secrets', () => {
  const config = {
    uiLanguage: 'en',
    apiKeys: {
      gemini: 'gemini-secret',
      openrouter: 'openrouter-secret',
      nvidia: 'nvidia-secret',
      stepPlan: 'step-plan-secret',
      tavily: 'tavily-secret'
    }
  };

  const defaultSafeConfig = createExportSafeConfig(config);
  const explicitSecretConfig = createExportSafeConfig(config, { includeSecrets: true });

  assert.equal('apiKeys' in defaultSafeConfig, false);
  assert.deepEqual(explicitSecretConfig.apiKeys, config.apiKeys);
  assert.notEqual(explicitSecretConfig.apiKeys, config.apiKeys);
  assert.deepEqual(config.apiKeys, {
    gemini: 'gemini-secret',
    openrouter: 'openrouter-secret',
    nvidia: 'nvidia-secret',
    stepPlan: 'step-plan-secret',
    tavily: 'tavily-secret'
  });
});

test('missing or non-object configs are safe', () => {
  assert.deepEqual(removeSensitiveConfig(), {});
  assert.deepEqual(redactSensitiveConfig(null), {});
  assert.deepEqual(redactApiKeys(null), {});
  assert.equal(redactApiKey(undefined), '');
  assert.equal(isSensitiveConfigKey('apiKeys'), true);
  assert.equal(isSensitiveConfigKey('theme'), false);
});

test('sensitive config redaction module does not import fragments or virtual runtime', () => {
  const source = readSource('src/app/runtime/security/sensitive-config-redaction.js');

  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js/);
});
