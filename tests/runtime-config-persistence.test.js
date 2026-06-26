import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { createLegacyRuntimeConfigPersistence } from '../src/app/runtime/kernel/config-persistence.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const findMatchingBrace = (source, openIndex) => {
  let state = 'code';
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    const previous = source[index - 1];
    if (state === 'code') {
      if (char === '/' && next === '/') {
        state = 'line-comment';
        index += 1;
        continue;
      }
      if (char === '/' && next === '*') {
        state = 'block-comment';
        index += 1;
        continue;
      }
      if (char === '"') {
        state = 'double-quote';
        continue;
      }
      if (char === "'") {
        state = 'single-quote';
        continue;
      }
      if (char === '`') {
        state = 'template';
        continue;
      }
      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) return index;
      }
    } else if (state === 'line-comment') {
      if (char === '\n') state = 'code';
    } else if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        state = 'code';
        index += 1;
      }
    } else if (state === 'double-quote') {
      if (char === '"' && previous !== '\\') state = 'code';
    } else if (state === 'single-quote') {
      if (char === "'" && previous !== '\\') state = 'code';
    } else if (state === 'template') {
      if (char === '`' && previous !== '\\') state = 'code';
    }
  }
  return -1;
};

const getConstFunctionBody = (source, name) => {
  const match = new RegExp(`const\\s+${name}\\s*=\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>\\s*\\{`).exec(source);
  assert.ok(match, `Expected to find ${name}`);
  const openIndex = match.index + match[0].lastIndexOf('{');
  const closeIndex = findMatchingBrace(source, openIndex);
  assert.notEqual(closeIndex, -1, `Expected to close ${name}`);
  return source.slice(match.index, closeIndex + 1);
};

const getBlockFromMarker = (source, marker) => {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Expected to find marker ${marker}`);
  const openIndex = source.indexOf('{', markerIndex);
  assert.notEqual(openIndex, -1, `Expected to find block for marker ${marker}`);
  const closeIndex = findMatchingBrace(source, openIndex);
  assert.notEqual(closeIndex, -1, `Expected to close block for marker ${marker}`);
  return source.slice(markerIndex, closeIndex + 1);
};

const assertMarkersInOrder = (source, markers, context) => {
  let cursor = -1;
  for (const marker of markers) {
    const next = source.indexOf(marker, cursor + 1);
    assert.notEqual(next, -1, `${context} should contain ${marker}`);
    assert.ok(next > cursor, `${marker} should remain in ${context} legacy order`);
    cursor = next;
  }
};

test('serialized config persistence writes the latest config for the latest user', async () => {
  const calls = [];
  let currentUser = null;
  let config = { theme: 'light' };
  const persistence = createLegacyRuntimeConfigPersistence({
    getCurrentUser: () => currentUser,
    getConfig: () => config,
    getConfigKey: () => `chatConfig_v_v8.6_${currentUser.username}`,
    setItem: async (key, value) => {
      calls.push({ key, value });
    }
  });

  await persistence.saveConfig();
  assert.deepEqual(calls, []);

  currentUser = { username: 'alice' };
  config = { theme: 'dark', nested: { enabled: true } };
  await persistence.saveConfig();
  assert.deepEqual(calls, [
    {
      key: 'chatConfig_v_v8.6_alice',
      value: JSON.stringify(config)
    }
  ]);

  currentUser = { username: 'bob' };
  config = { theme: 'light', items: [1, 2, 3] };
  await persistence.saveConfig();
  assert.deepEqual(calls.at(-1), {
    key: 'chatConfig_v_v8.6_bob',
    value: JSON.stringify(config)
  });
});

test('serialized config persistence preserves rejection and stringify error boundaries', async () => {
  const setItemError = new Error('write failed');
  const rejectingPersistence = createLegacyRuntimeConfigPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getConfig: () => ({ theme: 'dark' }),
    getConfigKey: () => 'chatConfig_v_v8.6_alice',
    setItem: async () => {
      throw setItemError;
    }
  });

  await assert.rejects(() => rejectingPersistence.saveConfig(), setItemError);

  const circularConfig = {};
  circularConfig.self = circularConfig;
  const circularPersistence = createLegacyRuntimeConfigPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getConfig: () => circularConfig,
    getConfigKey: () => 'chatConfig_v_v8.6_alice',
    setItem: async () => {}
  });

  await assert.rejects(
    () => circularPersistence.saveConfig(),
    /circular structure|Converting circular/i
  );
});

test('serialized config persistence exposes only saveConfig and avoids storage reader ownership', () => {
  const persistence = createLegacyRuntimeConfigPersistence({
    getCurrentUser: () => null,
    getConfig: () => ({}),
    getConfigKey: () => 'unused',
    setItem: async () => {}
  });
  const source = readSource('src/app/runtime/kernel/config-persistence.js');

  assert.deepEqual(Object.keys(persistence), ['saveConfig']);
  assert.equal(typeof persistence.saveConfig, 'function');
  assert.doesNotMatch(source, /loadConfig|getItem|removeItem|openDB|indexedDB|localStorage|sessionStorage/);
});

test('config persistence receives the extracted IndexedDB adapter and keeps the exact user-scoped key', () => {
  const source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const storageSource = readSource('src/app/runtime/kernel/storage-adapter.js');

  assert.match(source, /createLegacyRuntimeStorageAdapter/);
  assert.match(source, /const\s+\{\s*getItem,\s*setItem,\s*removeItem\s*\}\s*=\s*runtimeStorageAdapter/);
  assert.match(storageSource, /dbName\s*=\s*'ChatAppDB'/);
  assert.match(storageSource, /storeName\s*=\s*'keyValue'/);
  assert.match(storageSource, /indexedDBFactory\.open\(dbName,\s*version\)/);
  assert.match(storageSource, /idb\.createObjectStore\(storeName,\s*\{\s*keyPath:\s*'key'\s*\}\)/);
  assert.match(storageSource, /idb\.transaction\(storeName,\s*'readonly'\)/);
  assert.match(storageSource, /idb\.transaction\(storeName,\s*'readwrite'\)/);
  assert.match(
    source,
    /const\s+getConfigKey\s*=\s*\(\)\s*=>\s*`chatConfig_v_v8\.6_\$\{currentUser\.username\}`;/
  );
  assert.equal((source.match(/chatConfig_v_v8\.6_/g) || []).length, 1);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});

test('saveConfig preserves missing-user, serialization, and rejection behavior', () => {
  const source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const persistenceSource = readSource('src/app/runtime/kernel/config-persistence.js');
  const body = getConstFunctionBody(source, 'saveConfig');

  assert.match(
    body,
    /await\s+runtimeConfigPersistence\.saveConfig\(\)/
  );
  assert.match(
    persistenceSource,
    /const\s+currentUser\s*=\s*getCurrentUser\(\);\s*if\s*\(currentUser\)\s*\{\s*await\s+setItem\(getConfigKey\(\),\s*JSON\.stringify\(getConfig\(\)\)\);/s
  );
  assert.doesNotMatch(`${body}\n${persistenceSource}`, /\belse\b|try\s*\{|catch\s*\(/);
  assert.doesNotMatch(
    `${body}\n${persistenceSource}`,
    /applyUiTheme|applyLanguage|render(?:All|Chat|Store|ModelSwitcher)|showNotification|runtimeDialogCoordinator/
  );
});

test('loadConfig preserves missing-user, null storage, and invalid JSON boundaries', () => {
  const source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const body = getConstFunctionBody(source, 'loadConfig');
  const savedIfMarker = 'if (saved) {';
  const savedIfStart = body.indexOf(savedIfMarker);
  const savedIfOpen = body.indexOf('{', savedIfStart);
  const savedIfClose = findMatchingBrace(body, savedIfOpen);
  const savedIfBody = body.slice(savedIfStart, savedIfClose + 1);

  assertMarkersInOrder(body, [
    'if (!currentUser) return',
    'const saved = await getItem(getConfigKey())',
    savedIfMarker,
    'const savedConfig = JSON.parse(saved)'
  ], 'loadConfig storage boundary');
  assert.doesNotMatch(body, /try\s*\{|catch\s*\(/);
  assert.match(savedIfBody, /config\s*=\s*runtimeConfigStore\.replaceConfig\(normalizedConfig\)/);
  assert.equal((body.match(/runtimeConfigStore\.replaceConfig\(/g) || []).length, 1);
  assert.ok(
    body.indexOf('Object.assign(config, normalizedConfig)') > savedIfClose,
    'null storage should skip pointer replacement while retaining legacy normalization through the current pointer'
  );
});

test('loadConfig preserves saved config and nested merge precedence', () => {
  const source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const body = getConstFunctionBody(source, 'loadConfig');
  const normalizationSource = readSource('src/app/runtime/kernel/config-normalization.js');

  assertMarkersInOrder(body, [
    'const savedConfig = JSON.parse(saved)',
    'const normalizedConfig = normalizeLoadedLegacyConfig({',
    'currentConfig: config',
    'savedConfig',
    'models: MODELS',
    'config = runtimeConfigStore.replaceConfig(normalizedConfig)'
  ], 'loadConfig merge precedence');
  assertMarkersInOrder(normalizationSource, [
    'openrouterKey = normalizeApiKeyValue(savedConfig.apiKeys.openrouter)',
    'stepPlanKey = normalizeApiKeyValue(savedConfig.apiKeys.stepPlan)',
    'nvidiaKey = normalizeApiKeyValue(savedConfig.apiKeys.nvidia)',
    'tavilyKey = normalizeApiKeyValue(savedConfig.apiKeys.tavily)',
    '...currentConfig',
    '...savedConfig',
    'apiKeys: {',
    '...currentConfig.apiKeys',
    '...savedConfig.apiKeys',
    'openrouter: openrouterKey',
    'stepPlan: stepPlanKey',
    'nvidia: nvidiaKey',
    'tavily: tavilyKey',
    'uiTheme: { ...currentConfig.uiTheme, ...(savedConfig.uiTheme || {}) }'
  ], 'config normalization merge precedence');
});

test('loadConfig keeps API, model, and council normalization in legacy order', () => {
  const source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const body = getConstFunctionBody(source, 'loadConfig');
  const normalizationSource = readSource('src/app/runtime/kernel/config-normalization.js');

  assertMarkersInOrder(body, [
    'const normalizedConfig = normalizeLoadedLegacyConfig({',
    'councilTranslatorCandidates: getCouncilTranslatorCandidates()',
    'singleTranslatorCandidates: getSingleTranslatorCandidates()',
    'config = runtimeConfigStore.replaceConfig(normalizedConfig)'
  ], 'loadConfig normalization');
  assertMarkersInOrder(normalizationSource, [
    "normalizedConfig.outputMode = normalizedConfig.outputMode === 'realtime' ? 'realtime' : 'typewriter'",
    "normalizedConfig.tavilySearchDepth = normalizedConfig.tavilySearchDepth === 'advanced' ? 'advanced' : 'basic'",
    'const allModelIds = new Set(models.map(m => m.id))',
    'const id = canonicalizeModelId(setting.id)',
    'models.forEach((model) =>',
    'normalizedConfig.modelSettings.sort((a, b) => a.order - b.order)',
    'normalizedConfig.modelSettings.forEach((s, index) => { s.order = index; })',
    'normalizedConfig.defaultModel = canonicalizeModelId(normalizedConfig.defaultModel)',
    'normalizedConfig.lastUsedModel = canonicalizeModelId(normalizedConfig.lastUsedModel)',
    'normalizedConfig.lastCouncilConfig = normalizeCouncilConfig(normalizedConfig.lastCouncilConfig',
    'councilTranslatorCandidates.some(model => model.id === normalizedConfig.councilTranslatorModelId)',
    'singleTranslatorCandidates.some(model => model.id === normalizedConfig.singleDocumentTranslatorModelId)'
  ], 'config normalization model and council order');
});

test('settings persistence keeps mutation, visual, save, render, and notification order', () => {
  const settingsAuthProviderSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const appBootstrapLifecycleSource = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');
  const saveSettingsBody = getConstFunctionBody(settingsAuthProviderSource, 'saveSettings');
  const initChatAppBody = getBlockFromMarker(appBootstrapLifecycleSource, 'async function initChatApp()');

  assertMarkersInOrder(saveSettingsBody, [
    'config.apiKeys.gemini = ALL_ELEMENTS.geminiApiKeyInput.value.trim()',
    'config.uiLanguage = ALL_ELEMENTS.uiLanguageSelect.value',
    'config.uiTheme.mode = selectedThemeMode',
    'setAiBubbleColor()',
    'setUserBubbleColor()',
    'applyUiTheme()',
    'await saveConfig()',
    'applyLanguage(config.uiLanguage)',
    'renderModelSwitcher()',
    'renderChat()',
    'renderStore()',
    'if (close) {',
    'toggleModal(ALL_ELEMENTS.settingsModal, false)',
    'updateApiKeyWarningBadge()',
    'updateInputState()',
    'if (notify) {',
    'showNotification('
  ], 'settings save persistence');

  assert.match(
    initChatAppBody,
    /ALL_ELEMENTS\.settingsModal\.addEventListener\('change',[\s\S]*?saveSettings\(\{\s*close:\s*false,\s*notify:\s*false\s*\}\)/
  );
  assert.match(
    initChatAppBody,
    /saveTimer\s*=\s*scheduleTimeout\(\(\)\s*=>\s*saveSettings\(\{\s*close:\s*false,\s*notify:\s*false\s*\}\),\s*350\)/
  );
  assert.match(
    initChatAppBody,
    /event\.target\.closest\('\.color-swatch, \.color-option, \.translator-picker-option'\)[\s\S]*?scheduleTimeout\(\(\)\s*=>\s*saveSettings\(\{\s*close:\s*false,\s*notify:\s*false\s*\}\),\s*0\)/
  );
});

test('startup restores the user before config and app data visual handoff', () => {
  const source = readSource('src/app/runtime/features/startup-lifecycle.js');
  const body = getBlockFromMarker(source, 'async function initializeApp()');

  assertMarkersInOrder(body, [
    "const lastUsername = await getItem('chat_lastUser')",
    'const userKey = getUserKey(lastUsername)',
    'const savedUser = await getItem(userKey)',
    'setCurrentUser(JSON.parse(savedUser))',
    'await loadConfig()',
    'await loadAppData()',
    'applyCustomWallpaper()',
    'applyUiTheme()',
    "elements.authContainer.style.display = 'none'",
    "elements.appContainer.classList.remove('hidden')",
    "elements.appContainer.classList.add('visible')",
    'initChatApp()'
  ], 'startup config persistence');
});

test('config persistence extracts only the serialized write adapter', () => {
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const persistenceSource = readSource('src/app/runtime/kernel/config-persistence.js');
  const storeSource = readSource('src/app/runtime/kernel/config-store.js');
  const runtimeAppSource = readSource('src/app/runtime-app.js');

  assert.equal(existsSync(projectFile('src/app/runtime/kernel/config-persistence.js')), true);
  assert.match(persistenceSource, /export\s+function\s+createLegacyRuntimeConfigPersistence/);
  assert.doesNotMatch(
    persistenceSource,
    /loadConfig|getItem|removeItem|openDB|indexedDB|localStorage|sessionStorage|legacy-runtime\/fragments|virtual:legacy-app-runtime/
  );
  assert.match(fragment00Source, /import\s+\{\s*createLegacyRuntimeConfigPersistence\s*\}/);
  assert.match(fragment00Source, /const\s+runtimeConfigPersistence\s*=\s*createLegacyRuntimeConfigPersistence\(\{/);
  assertMarkersInOrder(fragment00Source, [
    'getCurrentUser: () => currentUser',
    'getConfig: () => runtimeConfigStore.getConfig()',
    'getConfigKey',
    'setItem'
  ], '00 config persistence adapter wiring');
  assert.match(fragment00Source, /const\s+saveConfig\s*=\s*async\s*\(\)\s*=>\s*\{\s*await\s+runtimeConfigPersistence\.saveConfig\(\);\s*\}/);
  assert.match(fragment00Source, /const\s+loadConfig\s*=\s*async\s*\(\)\s*=>/);
  assert.doesNotMatch(
    storeSource,
    /indexedDB|localStorage|sessionStorage|getItem|setItem|removeItem|JSON\.parse|JSON\.stringify/
  );
  assert.doesNotMatch(
    runtimeAppSource,
    /config-persistence|loadConfig|saveConfig|indexedDB|localStorage|sessionStorage/
  );
  assert.doesNotMatch(runtimeAppSource, /virtual:legacy-app-runtime|legacy-runtime\/fragments/);
  assert.doesNotMatch(runtimeAppSource, /addEventListener|DOMContentLoaded|initChatApp|initializeApp/);
});
