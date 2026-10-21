import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createRuntimeConfigAccess } from '../src/app/legacy-runtime/runtime/runtime-config-access.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function createHarness(initialConfig) {
  let storeConfig = initialConfig;
  const access = createRuntimeConfigAccess({
    getConfig: () => storeConfig,
    replaceConfig: (nextConfig) => {
      storeConfig = nextConfig;
      return storeConfig;
    }
  });

  return {
    access,
    getStoreConfig: () => storeConfig
  };
}

test('live config getter returns the config store current pointer', () => {
  const initialConfig = { uiLanguage: 'zh-TW' };
  const harness = createHarness(initialConfig);

  assert.equal(harness.access.getConfig(), initialConfig);

  const replacement = { uiLanguage: 'en' };
  harness.access.replaceConfig(replacement);
  assert.equal(harness.access.getConfig(), replacement);
});

test('replaceConfig updates the store pointer without mirror synchronization', () => {
  const harness = createHarness({ theme: 'light' });
  const replacement = { theme: 'dark' };

  assert.equal(harness.access.replaceConfig(replacement), replacement);
  assert.equal(harness.getStoreConfig(), replacement);
});

test('mutateConfig operates on the latest pointer after replacement', () => {
  const staleConfig = { outputMode: 'typewriter' };
  const harness = createHarness(staleConfig);
  const replacement = { outputMode: 'typewriter' };

  harness.access.replaceConfig(replacement);
  const mutated = harness.access.mutateConfig((config) => {
    config.outputMode = 'realtime';
  });

  assert.equal(mutated, replacement);
  assert.equal(harness.getStoreConfig(), replacement);
  assert.equal(replacement.outputMode, 'realtime');
  assert.equal(staleConfig.outputMode, 'typewriter');
});

test('mutateConfig applies object patches without replacing the active pointer', () => {
  const currentConfig = { uiLanguage: 'zh-TW', theme: 'light' };
  const harness = createHarness(currentConfig);

  const mutated = harness.access.mutateConfig({ uiLanguage: 'fr' });

  assert.equal(mutated, currentConfig);
  assert.equal(harness.getStoreConfig(), currentConfig);
  assert.deepEqual(currentConfig, { uiLanguage: 'fr', theme: 'light' });
});

test('legacy core routes lifecycle config state through the live store bridge', () => {
  const source = readSource('src/app/runtime/legacy-core/legacy-core.js');

  assert.doesNotMatch(source, /let\s+config\s*=/);
  assert.doesNotMatch(source, /syncConfig\s*:/);
  assert.match(source, /replaceConfig:\s*\(nextConfig\)\s*=>\s*runtimeConfigStore\.replaceConfig\(nextConfig\)/);
  assert.match(source, /initialApiKeys:\s*runtimeConfigAccess\.getConfig\(\)\.apiKeys/);
  // The lifecycles read the settings from the config store itself; the shell state (shell-state.js) holds no settings (NOU-78).
  const shellSource = readSource('src/app/runtime/legacy-core/shell-state.js');
  assert.doesNotMatch(shellSource, /getConfig|replaceConfig|configAccess\./);
  assert.match(source, /const getConfig = \(\) => runtimeConfigAccess\.getConfig\(\);/);
  assert.doesNotMatch(source, /state:\s*shell\b/);
  assert.doesNotMatch(source, /set config\(next\)\s*\{\s*config\s*=\s*next;\s*\}/);
});

test('loadConfig replacement and mutation use the current store pointer through the bridge', () => {
  const source = readSource('src/app/runtime/legacy-core/workspace-load.js');

  assert.ok((source.match(/currentConfig:\s*configAccess\.getConfig\(\)/g) || []).length >= 2);
  assert.match(source, /configAccess\.replaceConfig\(normalizedConfig\)/);
  assert.match(source, /configAccess\.mutateConfig\(normalizedConfig\)/);
  assert.doesNotMatch(source, /currentConfig:\s*config\b/);
  assert.doesNotMatch(source, /Object\.assign\(config,\s*normalizedConfig\)/);
});

test('the workspace features resolve state.config at call time', () => {
  const source = readSource('src/app/runtime/legacy-core/workspace-features.js');

  assert.match(source, /const getConfig = \(\) => runtimeConfigAccess\.getConfig\(\);/);
  assert.match(source, /if\s*\(typeof mutator === 'function'\) return mutator\(getConfig\(\)\)/);
  assert.match(source, /Object\.assign\(getConfig\(\),\s*mutator\)/);
});
