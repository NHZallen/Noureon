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

test('runtime config access bridge avoids unrelated systems', () => {
  const source = readSource('src/app/legacy-runtime/runtime/runtime-config-access.js');

  assert.match(source, /export\s+function\s+createRuntimeConfigAccess/);
  assert.match(source, /const\s+readConfig\s*=\s*\(\)\s*=>\s*getConfig\?\.\(\)/);
  assert.match(source, /replaceConfig\(nextConfig\)/);
  assert.match(source, /mutateConfig\(mutatorOrPatch\)/);
  assert.match(source, /return\s+readConfig\(\)\?\.uiLanguage/);
  assert.doesNotMatch(source, /syncConfig|syncCurrentConfig/);
  assert.doesNotMatch(source, /document|window|localStorage|sessionStorage|fetch|XMLHttpRequest/);
  assert.doesNotMatch(source, /provider|parser|storage|schema|package|vite|css|template/i);
  assert.doesNotMatch(source, /config\.uiLanguage\s*=/);
  assert.doesNotMatch(source, /saveConfig|loadConfig|applyLanguage/);
});
