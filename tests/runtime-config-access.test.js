import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRuntimeConfigAccess } from '../src/app/legacy-runtime/runtime/runtime-config-access.js';
import { createLegacyRuntimeConfigStore } from '../src/app/runtime/kernel/config-store.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('getUiLanguage reads the injected config getter', () => {
  const access = createRuntimeConfigAccess({
    getConfig: () => ({ uiLanguage: 'en' })
  });

  assert.equal(access.getUiLanguage(), 'en');
});

test('getUiLanguage reads latest config without stale snapshots', () => {
  let config = { uiLanguage: 'zh-TW' };
  const access = createRuntimeConfigAccess({
    getConfig: () => config
  });

  assert.equal(access.getUiLanguage(), 'zh-TW');
  config = { uiLanguage: 'fr' };
  assert.equal(access.getUiLanguage(), 'fr');
  config.uiLanguage = 'en';
  assert.equal(access.getUiLanguage(), 'en');
});

test('getUiLanguage reads the latest config store pointer after replacement', () => {
  const configStore = createLegacyRuntimeConfigStore({ defaultModelId: 'model' });
  const access = createRuntimeConfigAccess({
    getConfig: () => configStore.getConfig()
  });

  assert.equal(access.getUiLanguage(), 'zh-TW');
  configStore.replaceConfig({ uiLanguage: 'fr' });
  assert.equal(access.getUiLanguage(), 'fr');
});

test('missing config returns undefined without inventing a fallback', () => {
  const access = createRuntimeConfigAccess({
    getConfig: () => undefined
  });
  const accessWithoutGetter = createRuntimeConfigAccess();

  assert.equal(access.getUiLanguage(), undefined);
  assert.equal(accessWithoutGetter.getUiLanguage(), undefined);
});

test('reading the language changes nothing in the settings', () => {
  const config = { uiLanguage: 'fr', theme: 'dark' };
  const access = createRuntimeConfigAccess({ getConfig: () => config });

  assert.equal(access.getUiLanguage(), 'fr');
  assert.deepEqual(config, { uiLanguage: 'fr', theme: 'dark' });
});

// Boundary: the access only reads and replaces what it is given; the page, storage, the network and the saving of the settings are
// elsewhere, and the old mirror synchronization does not come back.
test('runtime config access stays a bridge to the injected store', () => {
  const source = readSource('src/app/legacy-runtime/runtime/runtime-config-access.js');

  assert.doesNotMatch(
    source,
    /\b(?:document|window|localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest)\b|saveConfig|loadConfig|applyLanguage|syncConfig|syncCurrentConfig/
  );
});
