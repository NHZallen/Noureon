import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');
const listFilesIfDirExists = (path) => {
  const directory = projectFile(path);
  if (!existsSync(directory)) return [];
  return readdirSync(directory);
};

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
        if (depth === 0) {
          return index;
        }
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

const getFunctionDeclarationBody = (source, name) => {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`).exec(source);
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

const findCrossFragmentBracePairs = (fragments) => {
  const offsets = [];
  let combined = '';
  for (const fragment of fragments) {
    offsets.push(combined.length);
    combined += `${fragment.source}\n`;
  }
  const findFragmentAt = (index) => {
    let fragmentIndex = 0;
    for (let cursor = 0; cursor < offsets.length; cursor += 1) {
      if (index >= offsets[cursor]) fragmentIndex = cursor;
    }
    const fragment = fragments[fragmentIndex];
    const relativeIndex = index - offsets[fragmentIndex];
    return {
      name: fragment.name,
      index: fragmentIndex,
      line: fragment.source.slice(0, relativeIndex).split(/\r?\n/).length
    };
  };

  const stack = [];
  const pairs = [];
  let state = 'code';
  for (let index = 0; index < combined.length; index += 1) {
    const char = combined[index];
    const next = combined[index + 1];
    const previous = combined[index - 1];
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
        stack.push(index);
      } else if (char === '}') {
        const openIndex = stack.pop();
        if (openIndex !== undefined) {
          const open = findFragmentAt(openIndex);
          const close = findFragmentAt(index);
          if (open.index !== close.index) {
            pairs.push({ open, close });
          }
        }
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

  return pairs;
};

test('legacy model registry owns static model metadata and capability helpers', () => {
  const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const modelRegistryPath = 'src/app/runtime/legacy-core/model-registry.js';
  const modelRegistrySource = readSource(modelRegistryPath);
  const legacyCoreLineCount = readSource('src/app/runtime/legacy-core/legacy-core.js').split(/\r?\n/).length;

  assert.equal(existsSync(projectFile(modelRegistryPath)), true);
  assert.equal(existsSync(projectFile('tests/runtime-model-registry.test.js')), true);
  assert.match(modelRegistrySource, /export\s+const\s+MODELS\s*=\s*\[/);
  assert.match(modelRegistrySource, /export\s+const\s+CHEAP_MODEL_ID\s*=/);
  assert.match(modelRegistrySource, /export\s+const\s+OPENROUTER_VISION_MODELS\s*=\s*\[/);
  assert.match(modelRegistrySource, /export\s+const\s+NVIDIA_VISION_MODELS\s*=\s*\[/);
  assert.match(modelRegistrySource, /export\s+const\s+STEP_PLAN_VISION_MODELS\s*=\s*\[/);
  assert.match(modelRegistrySource, /export\s+const\s+GEMINI_DOCUMENT_MODELS\s*=\s*\[/);
  assert.match(modelRegistrySource, /export\s+function\s+createLegacyModelRegistry/);
  assert.match(modelRegistrySource, /export\s+const\s+modelSupportsVision\s*=/);
  assert.match(modelRegistrySource, /export\s+const\s+modelSupportsDocumentUpload\s*=/);
  assert.match(modelRegistrySource, /export\s+const\s+getModelApiId\s*=/);
  assert.match(modelRegistrySource, /export\s+const\s+getProviderLabel\s*=/);
  assert.match(modelRegistrySource, /export\s+const\s+getCouncilTranslatorCandidates\s*=/);
  assert.match(modelRegistrySource, /export\s+const\s+getSingleTranslatorCandidates\s*=/);
  assert.doesNotMatch(modelRegistrySource, /virtual:legacy-app-runtime|legacy-runtime\/fragments|runtime-entry|legacy-app\.js/);

  assert.match(
    legacyCoreSource,
    /from\s+['"]\/src\/app\/runtime\/legacy-core\/model-registry\.js['"]/
  );
  assert.match(legacyCoreSource, /createLegacyModelRegistry\(\{/);
  assert.doesNotMatch(legacyCoreSource, /const\s+MODELS\s*=\s*\[/);
  assert.doesNotMatch(legacyCoreSource, /const\s+OPENROUTER_VISION_MODELS\s*=\s*\[/);
  assert.doesNotMatch(legacyCoreSource, /const\s+NVIDIA_VISION_MODELS\s*=\s*\[/);
  assert.doesNotMatch(legacyCoreSource, /const\s+STEP_PLAN_VISION_MODELS\s*=\s*\[/);
  assert.doesNotMatch(legacyCoreSource, /const\s+GEMINI_DOCUMENT_MODELS\s*=\s*\[/);
  assert.match(legacyCoreSource, /export\s+\{\s*legacyRuntimeContext\s*\};/);
  assert.match(legacyCoreSource, /createSensitiveConfigStore\(\{/);
  assert.ok(legacyCoreLineCount < 2150, 'legacy-core should have meaningful line-count headroom after model registry extraction');
});

test('active conversation id ownership lives in a small kernel store', () => {
  const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const activeConversationStorePath = 'src/app/runtime/kernel/active-conversation-store.js';
  const activeConversationStoreSource = readSource(activeConversationStorePath);

  assert.equal(existsSync(projectFile(activeConversationStorePath)), true);
  assert.equal(existsSync(projectFile('tests/runtime-active-conversation-store.test.js')), true);
  assert.match(activeConversationStoreSource, /export\s+function\s+createActiveConversationStore/);
  assert.match(activeConversationStoreSource, /getActiveConversationId/);
  assert.match(activeConversationStoreSource, /setActiveConversationId/);
  assert.match(activeConversationStoreSource, /clearActiveConversationId/);
  assert.match(activeConversationStoreSource, /hasActiveConversation/);
  assert.doesNotMatch(activeConversationStoreSource, /document|window|indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(activeConversationStoreSource, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js/);

  assert.match(
    legacyCoreSource,
    /import\s+\{\s*createActiveConversationStore\s*\}\s+from\s+['"]\/src\/app\/runtime\/kernel\/active-conversation-store\.js['"]/
  );
  assertMarkersInOrder(legacyCoreSource, [
    'let conversations = runtimeAppDataStore.getConversations()',
    'const liveConversationsBridge = createLiveConversationsBridge({',
    'const activeConversationStore = createActiveConversationStore(null)',
    'const conversationStateAccess = createConversationStateAccess({',
    'getConversations: () => liveConversationsBridge.getConversations()',
    'getCurrentConversationId: () => activeConversationStore.getActiveConversationId()',
    'setCurrentConversationId: (id) => activeConversationStore.setActiveConversationId(id)'
  ], 'active conversation store bridge');
  assert.doesNotMatch(legacyCoreSource, /let\s+activeConversationId\s*=/);
  assert.doesNotMatch(legacyCoreSource, /activeConversationId\s*=/);
  assert.doesNotMatch(legacyCoreSource, /let\s+astras\s*=/);
  assert.doesNotMatch(legacyCoreSource, /let\s+personalMemories\s*=/);
  assert.match(legacyCoreSource, /get personalMemories\(\)\s*\{\s*return runtimeAppDataStore\.getPersonalMemories\(\);\s*\}/);
  assert.match(legacyCoreSource, /export\s+\{\s*legacyRuntimeContext\s*\};/);
  assert.match(legacyCoreSource, /from\s+['"]\/src\/app\/runtime\/legacy-core\/model-registry\.js['"]/);
});

test('live conversations bridge owns low-risk access while the legacy mirror remains deferred', () => {
  const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const bridgePath = 'src/app/runtime/kernel/live-conversations-bridge.js';
  const bridgeSource = readSource(bridgePath);
  const loadAppDataBody = getConstFunctionBody(legacyCoreSource, 'loadAppData');
  const startNewChatBody = getConstFunctionBody(legacyCoreSource, 'startNewChat');
  const loadChatBody = getConstFunctionBody(legacyCoreSource, 'loadChat');

  assert.equal(existsSync(projectFile(bridgePath)), true);
  assert.match(bridgeSource, /export\s+function\s+createLiveConversationsBridge/);
  assert.match(
    legacyCoreSource,
    /import\s+{\s*createLiveConversationsBridge\s*}\s+from\s+['"]\/src\/app\/runtime\/kernel\/live-conversations-bridge\.js['"]/
  );
  assertMarkersInOrder(legacyCoreSource, [
    'let conversations = runtimeAppDataStore.getConversations()',
    'const liveConversationsBridge = createLiveConversationsBridge({',
    'getConversations: () => runtimeAppDataStore.getConversations()',
    'replaceConversations: (nextConversations) => runtimeAppDataStore.replaceConversations(nextConversations)',
    'syncLegacyMirror: (nextConversations) => {',
    'conversations = nextConversations',
    'const activeConversationStore = createActiveConversationStore(null)'
  ], 'live conversations bridge composition');

  assert.match(legacyCoreSource, /getConversations:\s*\(\)\s*=>\s*liveConversationsBridge\.getConversations\(\)/);
  assert.ok((legacyCoreSource.match(/get conversations\(\)\s*{\s*return liveConversationsBridge\.getConversations\(\);\s*}/g) || []).length >= 4);
  assert.ok((legacyCoreSource.match(/set conversations\(next\)\s*{\s*liveConversationsBridge\.replaceConversations\(next\);\s*}/g) || []).length >= 2);
  assert.equal((loadAppDataBody.match(/liveConversationsBridge\.syncLegacyMirror\(latestAppData\.conversations\)/g) || []).length, 3);

  assert.match(legacyCoreSource, /let\s+conversations\s*=\s*runtimeAppDataStore\.getConversations\(\)/);
  assert.match(startNewChatBody, /liveConversationsBridge\.replaceConversations\(/);
  assert.match(loadChatBody, /liveConversationsBridge\.replaceConversations\(/);
  assert.doesNotMatch(startNewChatBody, /runtimeAppDataStore\.replaceConversations\(/);
  assert.doesNotMatch(loadChatBody, /runtimeAppDataStore\.replaceConversations\(/);
  assert.doesNotMatch(legacyCoreSource, /let\s+(activeConversationId|config|personalMemories|astras|folders)\s*=/);
});

test('config, personal memories, Astras, and folders use stores while conversations stays temporary', () => {
  const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const appDataStoreSource = readSource('src/app/runtime/kernel/app-data-store.js');
  const configStoreSource = readSource('src/app/runtime/kernel/config-store.js');
  const transitionBusSource = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');

  assert.match(appDataStoreSource, /export\s+function\s+createLegacyRuntimeAppDataStore/);
  assert.match(appDataStoreSource, /replaceAll:\s*\(\{/);
  assert.match(appDataStoreSource, /replaceConversations:\s*\(nextConversations\)\s*=>/);
  assert.match(appDataStoreSource, /replaceFolders:\s*\(nextFolders\)\s*=>/);
  assert.match(appDataStoreSource, /replaceAstras:\s*\(nextAstras\)\s*=>/);
  assert.match(appDataStoreSource, /replacePersonalMemories:\s*\(nextPersonalMemories\)\s*=>/);
  assert.match(configStoreSource, /export\s+function\s+createLegacyRuntimeConfigStore/);
  assert.match(configStoreSource, /const\s+getConfig\s*=\s*\(\)\s*=>\s*config/);
  assert.match(configStoreSource, /const\s+replaceConfig\s*=\s*\(nextConfig\)\s*=>/);

  assertMarkersInOrder(legacyCoreSource, [
    'const runtimeAppDataStore = runtimeAppKernel.appDataStore',
    'let conversations = runtimeAppDataStore.getConversations()',
    'const activeConversationStore = createActiveConversationStore(null)'
  ], 'temporary app data local mirror bridge');
  assertMarkersInOrder(legacyCoreSource, [
    'const runtimeConfigStore = runtimeAppKernel.configStore',
    'const runtimeConfigAccess = createRuntimeConfigAccess({',
    'getConfig: () => runtimeConfigStore.getConfig()'
  ], 'live config store bridge');

  assert.equal((legacyCoreSource.match(/\blet\s+conversations\s*=/g) || []).length, 1);
  assert.equal((legacyCoreSource.match(/\blet\s+folders\s*=/g) || []).length, 0);
  assert.equal((legacyCoreSource.match(/\blet\s+astras\s*=/g) || []).length, 0);
  assert.equal((legacyCoreSource.match(/\blet\s+personalMemories\s*=/g) || []).length, 0);
  assert.equal((legacyCoreSource.match(/\blet\s+config\s*=/g) || []).length, 0);
  assert.doesNotMatch(legacyCoreSource, /syncConfig\s*:/);
  assert.doesNotMatch(legacyCoreSource, /let\s+activeConversationId\s*=/);
  assert.doesNotMatch(legacyCoreSource, /let\s+(chatHistory|folderList|astraList|memoryList|runtimeConfig)\s*=/);

  assert.match(legacyCoreSource, /liveConversationsBridge\.replaceConversations\(/);
  assert.doesNotMatch(legacyCoreSource, /folders\s*=\s*runtimeAppDataStore\.replaceFolders\(nextFolders\)/);
  assert.doesNotMatch(legacyCoreSource, /folders\s*=\s*latestAppData\.folders/);
  assert.match(legacyCoreSource, /getFolders:\s*\(\)\s*=>\s*runtimeAppDataStore\.getFolders\(\)/);
  assert.match(legacyCoreSource, /replaceFolders:\s*\(nextFolders\)\s*=>\s*runtimeAppDataStore\.replaceFolders\(nextFolders\)/);
  assert.ok((legacyCoreSource.match(/get folders\(\)\s*\{\s*return runtimeAppDataStore\.getFolders\(\);\s*\}/g) || []).length >= 3);
  assert.ok((legacyCoreSource.match(/set folders\(next\)\s*\{\s*runtimeAppDataStore\.replaceFolders\(next\);\s*\}/g) || []).length >= 2);
  assert.doesNotMatch(legacyCoreSource, /astras\s*=\s*latestAppData\.astras/);
  assert.ok((legacyCoreSource.match(/get astras\(\)\s*\{\s*return runtimeAppDataStore\.getAstras\(\);\s*\}/g) || []).length >= 4);
  assert.ok((legacyCoreSource.match(/set astras\(next\)\s*\{\s*runtimeAppDataStore\.replaceAstras\(next\);\s*\}/g) || []).length >= 3);
  assert.match(legacyCoreSource, /replaceAstras:\s*\(nextAstras\)\s*=>\s*runtimeAppDataStore\.replaceAstras\(nextAstras\)/);
  assert.match(legacyCoreSource, /get personalMemories\(\)\s*\{\s*return runtimeAppDataStore\.getPersonalMemories\(\);\s*\}/);
  assert.match(legacyCoreSource, /set personalMemories\(next\)\s*\{\s*runtimeAppDataStore\.replacePersonalMemories\(next\);\s*\}/);
  assert.match(transitionBusSource, /state\.personalMemories\s*=\s*runtimeAppDataStore\.replacePersonalMemories\(nextPersonalMemories\)/);
  assert.match(legacyCoreSource, /runtimeConfigAccess\.replaceConfig\(normalizedConfig\)/);
  assert.ok((legacyCoreSource.match(/get config\(\)\s*\{\s*return runtimeConfigAccess\.getConfig\(\);\s*\}/g) || []).length >= 4);
  assert.ok((legacyCoreSource.match(/set config\(next\)\s*\{\s*runtimeConfigAccess\.replaceConfig\(next\);\s*\}/g) || []).length >= 2);
  assert.doesNotMatch(legacyCoreSource, /set config\(next\)\s*\{\s*config\s*=\s*next;\s*\}/);
  assert.match(legacyCoreSource, /getAppData:\s*\(\)\s*=>\s*runtimeAppDataStore\.getSnapshot\(\)/);
  assert.doesNotMatch(legacyCoreSource, /getAppData:\s*\(\)\s*=>\s*\(\{\s*conversations,\s*folders,\s*astras,\s*personalMemories\s*\}\)/);
});

test('sensitive config export redaction boundary is explicit', () => {
  const redactionPath = 'src/app/runtime/security/sensitive-config-redaction.js';
  const sensitiveStorePath = 'src/app/runtime/security/sensitive-config-store.js';
  const inputIntentPath = 'src/app/runtime/security/api-key-input-intent.js';
  const apiKeyControlsPath = 'src/app/runtime/legacy-core/settings-api-key-controls.js';
  const exportLifecycleSource = readSource('src/app/runtime/features/import-export-lifecycle.js');
  const configPersistenceSource = readSource('src/app/runtime/kernel/config-persistence.js');
  const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const settingsAuthProviderSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const settingsProviderStructuredSource = readSource('src/app/runtime/legacy-core/settings-provider-structured-helpers.js');
  const streamApiSource = readSource('src/app/legacy-runtime/features/stream-api-call.js');
  const redactionSource = readSource(redactionPath);
  const sensitiveStoreSource = readSource(sensitiveStorePath);
  const inputIntentSource = readSource(inputIntentPath);
  const apiKeyControlsSource = readSource(apiKeyControlsPath);

  assert.equal(existsSync(projectFile(redactionPath)), true);
  assert.equal(existsSync(projectFile(sensitiveStorePath)), true);
  assert.equal(existsSync(projectFile(inputIntentPath)), true);
  assert.equal(existsSync(projectFile(apiKeyControlsPath)), true);
  assert.equal(existsSync(projectFile('tests/security/sensitive-config-redaction.test.js')), true);
  assert.equal(existsSync(projectFile('tests/security/api-key-mask.test.js')), true);
  assert.equal(existsSync(projectFile('tests/security/export-redacts-secrets.test.js')), true);
  assert.equal(existsSync(projectFile('tests/security/sensitive-config-store.test.js')), true);
  assert.equal(existsSync(projectFile('tests/security/gemini-key-transport.test.js')), true);
  assert.equal(existsSync(projectFile('tests/runtime-sensitive-config-persistence.test.js')), true);
  assert.match(redactionSource, /export\s+const\s+SENSITIVE_API_KEY_FIELDS/);
  assert.match(redactionSource, /'gemini'/);
  assert.match(redactionSource, /'openrouter'/);
  assert.match(redactionSource, /'nvidia'/);
  assert.match(redactionSource, /'stepPlan'/);
  assert.match(redactionSource, /'tavily'/);
  assert.match(redactionSource, /export\s+function\s+createExportSafeConfig/);
  assert.match(redactionSource, /export\s+function\s+maskApiKeyForDisplay/);
  assert.match(redactionSource, /export\s+function\s+isMaskedApiKeyDisplayValue/);
  assert.match(inputIntentSource, /export\s+function\s+prepareApiKeyInput/);
  assert.match(inputIntentSource, /export\s+function\s+readApiKeyInputIntent/);
  assert.match(
    exportLifecycleSource,
    /import\s+\{\s*createExportSafeConfig\s*\}\s+from\s+['"]\.\.\/security\/sensitive-config-redaction\.js['"]/
  );
  assert.match(exportLifecycleSource, /rawData\.settings\s*=\s*createExportSafeConfig\(/);
  assert.match(exportLifecycleSource, /getSensitiveApiKeys/);
  assert.match(exportLifecycleSource, /mergeSensitiveApiKeys/);
  assert.match(exportLifecycleSource, /saveSensitiveConfig/);
  assert.match(exportLifecycleSource, /createExportSafeConfig\(\s*\{\s*apiKeys:\s*getSensitiveApiKeys\(\)\s*\},\s*\{\s*includeSecrets:\s*true\s*\}\s*\)\.apiKeys/);
  assert.match(exportLifecycleSource, /exportApiKeysWarning/);
  assert.match(sensitiveStoreSource, /export\s+function\s+createSensitiveConfigStore/);
  assert.match(sensitiveStoreSource, /export\s+function\s+createSensitiveConfigPersistence/);
  assert.match(sensitiveStoreSource, /chatSensitiveConfig_v1_\$\{user\.username\}/);
  assert.match(sensitiveStoreSource, /stepfun:\s*'stepPlan'/);
  assert.match(legacyCoreSource, /createSensitiveConfigStore\(\{/);
  assert.match(legacyCoreSource, /createSensitiveConfigPersistence\(\{/);
  assert.match(legacyCoreSource, /function\s+getApiKeyForProvider\(provider\)\s*\{\s*return\s+sensitiveConfigStore\.getApiKey\(provider\);/);
  assert.match(legacyCoreSource, /const\s+clearSensitiveApiKeys\s*=\s*\(\)\s*=>\s*sensitiveConfigStore\.clearApiKeys\(\);/);
  assert.match(legacyCoreSource, /mergeSensitiveApiKeys\(savedConfig\.apiKeys\)/);
  assert.match(legacyCoreSource, /removeSensitiveConfig\(savedConfig\)/);
  assert.match(configPersistenceSource, /removeSensitiveConfig\(getConfig\(\)\)/);
  assert.match(settingsAuthProviderSource, /createSettingsApiKeyControls/);
  assert.match(apiKeyControlsSource, /prepareApiKeyInput/);
  assert.match(apiKeyControlsSource, /readApiKeyInputIntent/);
  assert.match(apiKeyControlsSource, /markApiKeyInputCleared/);
  assert.doesNotMatch(settingsAuthProviderSource, /readApiKeyInputIntent|markApiKeyInputCleared/);
  assert.doesNotMatch(apiKeyControlsSource, /dataset\.[A-Za-z0-9_$]*\s*=\s*rawValue/);
  assert.match(settingsProviderStructuredSource, /'x-goog-api-key':\s*apiKey/);
  assert.match(streamApiSource, /'x-goog-api-key':\s*apiKey/);
  assert.doesNotMatch(settingsAuthProviderSource, /:generateContent\?key=|\?key=\$\{apiKey\}/);
  assert.doesNotMatch(settingsProviderStructuredSource, /:generateContent\?key=|\?key=\$\{apiKey\}/);
  assert.doesNotMatch(streamApiSource, /:streamGenerateContent\?key=|\?key=\$\{apiKey\}/);
  assert.doesNotMatch(inputIntentSource, /dataset\.[A-Za-z0-9_$]*\s*=\s*rawValue/);
  assert.doesNotMatch(inputIntentSource, /input\.dataset\.raw|dataset\.raw|secretValue/);
  assert.doesNotMatch(redactionSource, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js/);
  assert.doesNotMatch(inputIntentSource, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js/);
  assert.doesNotMatch(apiKeyControlsSource, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js/);
  assert.doesNotMatch(sensitiveStoreSource, /crypto\.subtle|AES-GCM/);
});

test('production runtime entry composes the explicit legacy dependency facade', () => {
  const runtimeEntryPath = 'src/app/runtime-entry.js';
  const dependencyPath = 'src/app/runtime/runtime-entry-dependencies.js';
  const runtimeEntrySource = readSource(runtimeEntryPath);
  const dependencySource = readSource(dependencyPath);
  const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const coreTailSource = readSource('src/app/runtime/legacy-core/core-tail-lifecycle.js');
  const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const runtimeAppSource = readSource('src/app/runtime-app.js');
  const mainSource = readSource('src/main.js');
  const legacyEntrySource = readSource('src/app/legacy-app.js');
  const viteSource = readSource('vite.config.js');

  assert.equal(existsSync(projectFile(runtimeEntryPath)), true);
  assert.equal(existsSync(projectFile(dependencyPath)), true);
  assert.match(runtimeEntrySource, /export\s+function\s+createRuntimeEntry/);
  assert.match(runtimeEntrySource, /export\s+function\s+startRuntimeEntry/);
  assert.match(runtimeEntrySource, /export\s+function\s+registerRuntimeEntryBindings/);
  assert.match(runtimeEntrySource, /export\s+function\s+getLegacyRuntimeEntryDependencies/);
  assert.match(runtimeEntrySource, /export\s+async\s+function\s+loadLegacyRuntimeContext/);
  assert.match(
    runtimeEntrySource,
    /await\s+import\('\.\/runtime\/legacy-core\/legacy-core\.js'\)/
  );
  assert.doesNotMatch(runtimeEntrySource, /virtual:legacy-app-runtime|legacy-runtime\/fragments/);
  assert.doesNotMatch(
    runtimeEntrySource,
    /(?:^|\n)\s*(?:void\s+)?(?:start|initializeApp|initChatApp)\(\);/
  );
  assert.match(dependencySource, /export\s+function\s+createLegacyRuntimeEntryDependencies/);
  assert.match(dependencySource, /export\s+function\s+validateLegacyRuntimeEntryDependencies/);
  assert.doesNotMatch(
    dependencySource,
    /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/
  );

  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/04-runtime.fragment.js')), false);
  assert.match(runtimeEntrySource, /import\s+\{\s*createLegacyCoreTailLifecycle\s*\}/);
  assert.match(runtimeEntrySource, /export\s+function\s+registerCoreTailBindings/);
  assert.match(runtimeEntrySource, /resolveBinding\(\s*['"]runtime\.coreTailDependencies['"]\s*\)/);
  assert.match(runtimeEntrySource, /registerCoreTailBindings\(\{\s*runtimeContext,\s*coreTailLifecycle\s*\}\)/);
  assert.match(runtimeEntrySource, /coreTailLifecycle\.registerRuntimeEntryDependencies\(\)/);
  assert.match(fragment03Source, /const\s+coreTailState\s*=\s*\{/);
  assert.match(fragment03Source, /const\s+coreTailDependencies\s*=\s*\{/);
  assert.match(
    fragment03Source,
    /legacyRuntimeContext\.registerLazyBinding\(\s*['"]runtime\.coreTailDependencies['"],\s*\(\)\s*=>\s*coreTailDependencies\s*\)/
  );
  assert.match(
    coreTailSource,
    /const\s+runtimeEntryDependencies\s*=\s*createLegacyRuntimeEntryDependencies\(\{/
  );
  assert.match(
    coreTailSource,
    /legacyRuntimeContext\.registerLazyBinding\(\s*['"]runtime\.entryDependencies['"],\s*\(\)\s*=>\s*runtimeEntryDependencies\s*\)/
  );
  assert.match(coreTailSource, /appBootstrap:\s*\{/);
  assert.match(coreTailSource, /startup:\s*\{/);
  assert.match(coreTailSource, /getCurrentUser:\s*\(\)\s*=>\s*state\.currentUser/);
  assert.match(coreTailSource, /getConfig:\s*\(\)\s*=>\s*state\.config/);
  assert.match(coreTailSource, /getConversations:\s*\(\)\s*=>\s*state\.conversations/);
  assert.match(coreTailSource, /getFolders:\s*\(\)\s*=>\s*state\.folders/);
  assert.match(coreTailSource, /getAstras:\s*\(\)\s*=>\s*state\.astras/);
  assert.match(coreTailSource, /getPersonalMemories:\s*\(\)\s*=>\s*state\.personalMemories/);
  assert.match(coreTailSource, /getItem,\s*getUserKey,\s*loadConfig,\s*loadAppData/s);
  assert.match(
    coreTailSource,
    /adjustTextareaHeight:\s*\(\.\.\.args\)\s*=>\s*legacyRuntimeContext\.resolveBinding\('submit\.adjustTextareaHeight'\)\(\.\.\.args\)/
  );
  assert.match(coreTailSource, /const\s+registerRuntimeEntryDependencies\s*=\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(fragment03Source, /\binitChatApp\(\);|\binitializeApp\(\);/);

  assert.match(runtimeEntrySource, /createLegacyAppBootstrapLifecycle\(/);
  assert.match(runtimeEntrySource, /createLegacyStartupLifecycle\(\{/);
  assert.match(runtimeEntrySource, /registerBinding\(\s*'app\.initChatApp'/);
  assert.match(runtimeEntrySource, /runtimeEntry\.submit\.adjustTextareaHeight/);
  assert.match(runtimeEntrySource, /if\s*\(productionStartPromise\)\s*return\s+productionStartPromise/);
  assert.match(runtimeEntrySource, /createLegacyAppBootstrapLifecycle\(\s*resolvedDependencies\.appBootstrap\s*\)/);
  assert.match(runtimeEntrySource, /createLegacyStartupLifecycle\(\{/);
  assert.match(dependencySource, /'handleExport'/);
  assert.match(dependencySource, /'handleImport'/);
  assert.match(dependencySource, /'loadConfig'/);
  assert.match(dependencySource, /'loadAppData'/);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/05-runtime.fragment.js')), false);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/06-runtime.fragment.js')), false);
  assert.match(legacyCoreSource, /export\s+\{\s*legacyRuntimeContext\s*\};/);
  assert.doesNotMatch(viteSource, /legacyRuntimeContext|virtual:legacy-app-runtime|legacyRuntimeFragmentsPlugin/);
  assert.match(legacyEntrySource, /from\s+['"]\.\/runtime-entry\.js['"]/);
  assert.doesNotMatch(legacyEntrySource, /virtual:legacy-app-runtime/);
  assert.match(mainSource, /await\s+import\(['"]\.\/app\/legacy-app\.js['"]\)/);
  assert.doesNotMatch(mainSource, /runtime-entry/);
  assert.doesNotMatch(runtimeAppSource, /runtime-entry|virtual:legacy-app-runtime/);
});

test('runtime entry cutover helpers no longer rely on 05 lexical ownership', () => {
  const conversationMailPath = 'src/app/runtime/features/conversation-mail.js';
  const imageCompressionPath = 'src/app/runtime/utils/image-compression.js';
  const conversationMailSource = readSource(conversationMailPath);
  const imageCompressionSource = readSource(imageCompressionPath);
  const fragment01Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const batchImportVoiceSource = readSource('src/app/runtime/legacy-core/batch-import-voice-lifecycle.js');
  const settingsAuthProviderSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const startupLifecycleSource = readSource('src/app/runtime/features/startup-lifecycle.js');
  const runtimeEntrySource = readSource('src/app/runtime-entry.js');
  const legacyEntrySource = readSource('src/app/legacy-app.js');
  const viteSource = readSource('vite.config.js');

  assert.equal(existsSync(projectFile(conversationMailPath)), true);
  assert.equal(existsSync(projectFile(imageCompressionPath)), true);
  assert.match(conversationMailSource, /export\s+async\s+function\s+sendConversationToMail/);
  assert.match(imageCompressionSource, /export\s+function\s+compressImage/);
  assert.doesNotMatch(
    `${conversationMailSource}\n${imageCompressionSource}`,
    /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/
  );

  assert.match(
    fragment01Source,
    /import\s+\{\s*createLegacyConversationMailSender\s*\}\s+from\s+['"]\/src\/app\/runtime\/features\/conversation-mail\.js['"]/
  );
  assert.match(
    fragment01Source,
    /const\s+sendConversationToMail\s*=\s*createLegacyConversationMailSender\(\{/
  );
  assert.match(
    batchImportVoiceSource,
    /import\s+\{\s*compressImage\s*\}\s+from\s+['"]\.\.\/utils\/image-compression\.js['"]/
  );
  assert.doesNotMatch(fragment03Source, /\bcompressImage\b/);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/05-runtime.fragment.js')), false);

  assert.match(runtimeEntrySource, /export\s+function\s+registerRuntimeEntryBindings/);
  assert.match(runtimeEntrySource, /runtimeEntry\.submit\.adjustTextareaHeight/);
  assert.match(
    fragment01Source,
    /resolveOptionalBinding\(\s*['"]runtimeEntry\.submit\.adjustTextareaHeight['"]\s*\)/
  );
  assert.match(startupLifecycleSource, /export\s+function\s+createLegacyStartupLifecycle/);
  assert.match(legacyEntrySource, /from\s+['"]\.\/runtime-entry\.js['"]/);
  assert.doesNotMatch(legacyEntrySource, /virtual:legacy-app-runtime/);
  assert.doesNotMatch(viteSource, /readdirSync\(fragmentsDir\)|readFileSync|legacyCoreFragmentNames/);
  assert.doesNotMatch(viteSource, /legacyCoreFragmentNames/);
  assert.doesNotMatch(
    viteSource,
    /legacyCoreFragmentNames\s*=\s*new Set\(\[[\s\S]*?(?:05|06)-runtime\.fragment\.js[\s\S]*?\]\)/
  );
});

test('runtime DOM registry ownership moves into the non-live runtime kernel', () => {
  const registryPath = 'src/app/runtime/kernel/dom-registry.js';
  const runtimeAppPath = 'src/app/runtime-app.js';
  const registrySource = readSource(registryPath);
  const runtimeAppSource = readSource(runtimeAppPath);
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const mainSource = readSource('src/main.js');
  const legacyEntrySource = readSource('src/app/legacy-app.js');
  const viteSource = readSource('vite.config.js');

  assert.equal(existsSync(projectFile(registryPath)), true, 'runtime DOM registry module should exist');
  assert.equal(existsSync(projectFile(runtimeAppPath)), true, 'runtime app kernel should exist');
  assert.match(registrySource, /export\s+function\s+createLegacyRuntimeDomRegistry/);
  assert.match(
    fragment00Source,
    /import\s+\{\s*createLegacyRuntimeDomRegistry\s*\}\s*from\s*['"]\/src\/app\/runtime\/kernel\/dom-registry\.js['"]/
  );
  assert.match(fragment00Source, /const\s+ALL_ELEMENTS\s*=\s*createLegacyRuntimeDomRegistry\(\);/);
  assert.doesNotMatch(fragment00Source, /const\s+ALL_ELEMENTS\s*=\s*\{/);

  assert.match(runtimeAppSource, /export\s+function\s+createRuntimeAppKernel/);
  assert.match(runtimeAppSource, /import\s+\{\s*createLegacyRuntimeDomRegistry\s*\}/);
  assert.match(runtimeAppSource, /elements\s*\?\?\s*createLegacyRuntimeDomRegistry\(rootDocument\)/);
  assert.doesNotMatch(runtimeAppSource, /virtual:legacy-app-runtime|legacy-runtime\/fragments/);

  assert.match(mainSource, /await\s+import\(['"]\.\/app\/legacy-app\.js['"]\)/);
  assert.match(legacyEntrySource, /from\s+['"]\.\/runtime-entry\.js['"]/);
  assert.doesNotMatch(legacyEntrySource, /virtual:legacy-app-runtime/);
  assert.doesNotMatch(viteSource, /legacyRuntimeFragmentsPlugin/);
  assert.doesNotMatch(viteSource, /legacyRuntimeFragmentsPlugin/);
});

test('runtime config ownership moves into a narrow non-live kernel store', () => {
  const storePath = 'src/app/runtime/kernel/config-store.js';
  const persistencePath = 'src/app/runtime/kernel/config-persistence.js';
  const normalizationPath = 'src/app/runtime/kernel/config-normalization.js';
  const storeSource = readSource(storePath);
  const persistenceSource = readSource(persistencePath);
  const normalizationSource = readSource(normalizationPath);
  const runtimeAppSource = readSource('src/app/runtime-app.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const importExportSource = readSource('src/app/runtime/features/import-export-lifecycle.js');
  const authImportSource = readSource('src/app/runtime/features/auth-import-lifecycle.js');
  const modelMemoryDashboardSource = readSource('src/app/runtime/legacy-core/model-memory-dashboard-lifecycle.js');
  const submitInputCouncilSource = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const coreTailSource = readSource('src/app/runtime/legacy-core/core-tail-lifecycle.js');
  const finalTailIndex = fragment00Source.indexOf('import { createLegacySidebarChatAstraRenderLifecycle');
  const fragment00CoreSource = finalTailIndex === -1 ? fragment00Source : fragment00Source.slice(0, finalTailIndex);
  const fragmentConfigAssignments = fragment00CoreSource.match(/\bconfig\s*=/g) || [];
  const laterFragmentSources = [].map((name) => {
    const source = readSource(`src/app/legacy-runtime/fragments/${name}`);
    const finalTailIndex = source.indexOf('const settingsAuthProviderState =');
    return finalTailIndex === -1 ? source : source.slice(0, finalTailIndex);
  });

  assert.equal(existsSync(projectFile(storePath)), true, 'runtime config store module should exist');
  assert.match(storeSource, /export\s+function\s+createLegacyRuntimeConfigStore/);
  assert.doesNotMatch(storeSource, /virtual:legacy-app-runtime|legacy-runtime\/fragments/);
  assert.doesNotMatch(storeSource, /import[\s\S]*\bMODELS\b/);
  assert.equal(existsSync(projectFile(persistencePath)), true, 'runtime config persistence module should exist');
  assert.match(persistenceSource, /export\s+function\s+createLegacyRuntimeConfigPersistence/);
  assert.doesNotMatch(persistenceSource, /virtual:legacy-app-runtime|legacy-runtime\/fragments|config-store/);
  assert.doesNotMatch(persistenceSource, /getItem|removeItem|openDB|loadConfig|indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(persistenceSource, /try\s*\{|catch\s*\(/);
  assert.equal(existsSync(projectFile(normalizationPath)), true, 'runtime config normalization module should exist');
  assert.match(normalizationSource, /export\s+function\s+normalizeLoadedLegacyConfig/);
  assert.match(normalizationSource, /export\s+function\s+normalizeApiKeyValue/);
  assert.match(normalizationSource, /export\s+function\s+normalizeCouncilConfig/);
  assert.doesNotMatch(normalizationSource, /virtual:legacy-app-runtime|legacy-runtime\/fragments|config-store|runtimeConfigStore/);
  assert.doesNotMatch(normalizationSource, /getItem|setItem|removeItem|openDB|indexedDB|localStorage|sessionStorage/);

  assert.match(fragment00Source, /import\s+\{\s*createRuntimeAppKernel\s*\}\s*from\s*['"]\/src\/app\/runtime-app\.js['"]/);
  assert.match(
    fragment00Source,
    /import\s+\{\s*createLegacyRuntimeConfigPersistence\s*\}\s*from\s*['"]\/src\/app\/runtime\/kernel\/config-persistence\.js['"]/
  );
  assert.match(
    fragment00Source,
    /from\s*['"]\/src\/app\/runtime\/kernel\/config-normalization\.js['"]/
  );
  assertMarkersInOrder(fragment00Source, [
    'const runtimeAppKernel = createRuntimeAppKernel({',
    'elements: ALL_ELEMENTS',
    'defaultModelId: MODELS[0].id',
    'const runtimeConfigStore = runtimeAppKernel.configStore',
    'const runtimeConfigAccess = createRuntimeConfigAccess({'
  ], '00 runtime config ownership');
  assert.doesNotMatch(fragment00Source, /createLegacyRuntimeConfigStore\(/);
  assert.doesNotMatch(fragment00Source, /let\s+config\s*=\s*\{\s*apiKeys:/);
  assert.match(fragment00Source, /runtimeConfigAccess\.replaceConfig\(normalizedConfig\)/);
  assert.equal(fragmentConfigAssignments.length, 0);
  for (const source of laterFragmentSources) {
    assert.doesNotMatch(source, /\bconfig\s*=/);
  }
  assert.match(fragment03Source, /get\s+config\(\)\s*\{\s*return\s+state\.config;\s*\}/);
  assert.match(fragment03Source, /set\s+config\(next\)\s*\{\s*state\.config\s*=\s*next;\s*\}/);
  assert.doesNotMatch(coreTailSource, /state\.config\s*=/);
  assert.match(fragment00Source, /getConfig:\s*\(\)\s*=>\s*runtimeConfigStore\.getConfig\(\)/);
  assertMarkersInOrder(fragment00Source, [
    'const getConfigKey = () => `chatConfig_v_v8.6_${currentUser.username}`',
    'const getAppDataKey = () => `chatAppData_v8.6_${currentUser.username}`',
    'const runtimeConfigPersistence = createLegacyRuntimeConfigPersistence({',
    'getCurrentUser: () => currentUser',
    'getConfig: () => runtimeConfigStore.getConfig()',
    'getConfigKey',
    'setItem',
    'const showNotification ='
  ], '00 runtime config persistence wiring');
  assert.match(fragment00Source, /const\s+saveConfig\s*=\s*async\s*\(\)\s*=>\s*\{\s*await\s+runtimeConfigPersistence\.saveConfig\(\);\s*\}/);
  assert.match(fragment00Source, /const\s+loadConfig\s*=\s*async\s*\(\)\s*=>/);
  assertMarkersInOrder(fragment00Source, [
    'const loadConfig = async () => {',
    'const saved = await getItem(getConfigKey())',
    'const savedConfig = JSON.parse(saved)',
    'const normalizedConfig = normalizeLoadedLegacyConfig({',
    'runtimeConfigAccess.replaceConfig(normalizedConfig)'
  ], '00 config load orchestration');
  assert.match(fragment00Source, /runtimeConfigAccess\.mutateConfig\(normalizedConfig\)/);
  assert.match(fragment00Source, /const\s+getConfigKey\s*=\s*\(\)\s*=>\s*`chatConfig_v_v8\.6_\$\{currentUser\.username\}`/);
  assert.match(fragment00Source, /createLegacyRuntimeStorageAdapter/);
  assert.match(fragment00Source, /const\s+\{\s*getItem,\s*setItem,\s*removeItem\s*\}\s*=\s*runtimeStorageAdapter/);
  assert.doesNotMatch(fragment00Source, /async\s+function\s+(?:openDB|getItem|setItem|removeItem)/);
  assert.equal(((laterFragmentSources.join('\n') + fragment03Source + coreTailSource + importExportSource + authImportSource + modelMemoryDashboardSource + submitInputCouncilSource).match(/\bsaveConfig\(\)/g) || []).length, 12);

  assert.match(runtimeAppSource, /import\s+\{\s*createLegacyRuntimeConfigStore\s*\}/);
  assert.match(runtimeAppSource, /const\s+configStore\s*=\s*createLegacyRuntimeConfigStore\(\{\s*defaultModelId\s*\}\)/);
  assert.match(runtimeAppSource, /return\s*\{\s*elements:\s*resolvedElements,\s*configStore,\s*appDataStore\s*\}/);
  assert.doesNotMatch(runtimeAppSource, /virtual:legacy-app-runtime|legacy-runtime\/fragments/);
  assert.doesNotMatch(runtimeAppSource, /addEventListener|DOMContentLoaded|bootstrap\(|initChatApp|initializeApp/);
  assert.doesNotMatch(
    storeSource,
    /indexedDB|localStorage|sessionStorage|getItem|setItem|removeItem|JSON\.parse|JSON\.stringify/
  );
  assert.doesNotMatch(persistenceSource, /config-normalization|normalizeLoadedLegacyConfig/);
  assert.doesNotMatch(runtimeAppSource, /config-persistence|loadConfig|saveConfig|indexedDB/);
});

test('runtime app data normalization moves into a pure non-live kernel helper', () => {
  const normalizationPath = 'src/app/runtime/kernel/app-data-normalization.js';
  const persistencePath = 'src/app/runtime/kernel/app-data-persistence.js';
  const normalizationSource = readSource(normalizationPath);
  const persistenceSource = readSource(persistencePath);
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const runtimeAppSource = readSource('src/app/runtime-app.js');
  const folderLifecycleSource = readSource('src/app/runtime/features/folder-lifecycle.js');
  const importExportSource = readSource('src/app/runtime/features/import-export-lifecycle.js');
  const authImportSource = readSource('src/app/runtime/features/auth-import-lifecycle.js');
  const modelMemoryDashboardSource = readSource('src/app/runtime/legacy-core/model-memory-dashboard-lifecycle.js');
  const batchImportVoiceSource = readSource('src/app/runtime/legacy-core/batch-import-voice-lifecycle.js');
  const appBootstrapLifecycleSource = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');
  const coreTailSource = readSource('src/app/runtime/legacy-core/core-tail-lifecycle.js');
  const settingsAuthProviderSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const submitInputCouncilSource = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const sidebarChatAstraRenderSource = readSource('src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js');
  const laterFragmentSources = [].map((name) => readSource(`src/app/legacy-runtime/fragments/${name}`));
  const loadAppDataBody = getConstFunctionBody(fragment00Source, 'loadAppData');
  const catchIndex = loadAppDataBody.indexOf('catch (e)');
  assert.notEqual(catchIndex, -1, 'loadAppData should keep its corruption catch in 00');
  const catchBody = loadAppDataBody.slice(catchIndex);

  assert.equal(existsSync(projectFile(normalizationPath)), true, 'runtime app data normalization module should exist');
  assert.match(normalizationSource, /export\s+function\s+normalizeLoadedLegacyAppData/);
  assert.match(normalizationSource, /export\s+function\s+normalizeConversationRecord/);
  assert.match(normalizationSource, /export\s+function\s+normalizeFolderRecord/);
  assert.match(normalizationSource, /export\s+function\s+normalizeAstraRecord/);
  assert.doesNotMatch(normalizationSource, /virtual:legacy-app-runtime|legacy-runtime\/fragments|runtimeContext/);
  assert.doesNotMatch(normalizationSource, /getItem|setItem|removeItem|openDB|indexedDB|localStorage|sessionStorage|currentUser/);
  assert.doesNotMatch(normalizationSource, /showNotification|renderAll|toggleModal|initChatApp|initializeApp/);
  assert.equal(existsSync(projectFile(persistencePath)), true, 'runtime app data persistence module should exist');
  assert.match(persistenceSource, /export\s+function\s+createLegacyRuntimeAppDataPersistence/);
  assert.doesNotMatch(persistenceSource, /virtual:legacy-app-runtime|legacy-runtime\/fragments|app-data-normalization/);
  assert.doesNotMatch(persistenceSource, /getItem|removeItem|openDB|loadAppData|indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(persistenceSource, /showNotification|renderAll|toggleModal|initChatApp|initializeApp/);
  assert.doesNotMatch(persistenceSource, /try\s*\{|catch\s*\(/);

  assert.match(
    fragment00Source,
    /import\s+\{\s*normalizeLoadedLegacyAppData\s*\}\s*from\s*['"]\/src\/app\/runtime\/kernel\/app-data-normalization\.js['"]/
  );
  assert.match(
    fragment00Source,
    /import\s+\{\s*createLegacyRuntimeAppDataPersistence\s*\}\s*from\s*['"]\/src\/app\/runtime\/kernel\/app-data-persistence\.js['"]/
  );
  assertMarkersInOrder(fragment00Source, [
    'const getAppDataKey = () => `chatAppData_v8.6_${currentUser.username}`',
    'const runtimeAppDataPersistence = createLegacyRuntimeAppDataPersistence({',
    'getCurrentUser: () => currentUser',
    'getAppData: () => runtimeAppDataStore.getSnapshot()',
    'getAppDataKey',
    'setItem',
    'const runtimeConfigPersistence = createLegacyRuntimeConfigPersistence({'
  ], '00 runtime app data persistence wiring');
  assert.match(fragment00Source, /const\s+loadAppData\s*=\s*async\s*\(\)\s*=>\s*\{/);
  assert.match(fragment00Source, /const\s+saveAppData\s*=\s*async\s*\(\)\s*=>\s*\{\s*await\s+runtimeAppDataPersistence\.saveAppData\(\);\s*\}/);
  assert.match(fragment00Source, /const\s+getAppDataKey\s*=\s*\(\)\s*=>\s*`chatAppData_v8\.6_\$\{currentUser\.username\}`/);
  assertMarkersInOrder(loadAppDataBody, [
    'if (!currentUser) return',
    'const saved = await getItem(getAppDataKey())',
    'if (saved) {',
    'try {',
    'const data = JSON.parse(saved)',
    'const normalizedData = normalizeLoadedLegacyAppData({',
    'rawData: data',
    'defaultFolder: getDefaultFolder()',
    'defaultGenConfig: getDefaultGenConfig()',
    'lastCouncilConfig: runtimeConfigAccess.getConfig().lastCouncilConfig',
    'normalizeCouncilConfig',
    'normalizeConversationModel',
    'const latestAppData = runtimeAppDataStore.replaceAll(normalizedData)',
    'liveConversationsBridge.syncLegacyMirror(latestAppData.conversations)'
  ], '00 app data load orchestration');
  assert.doesNotMatch(loadAppDataBody, /folders\s*=\s*latestAppData\.folders/);
  assert.doesNotMatch(loadAppDataBody, /astras\s*=\s*latestAppData\.astras/);
  assert.doesNotMatch(loadAppDataBody, /personalMemories\s*=\s*latestAppData\.personalMemories/);
  assert.match(catchBody, /console\.error\("Failed to parse app data:",\s*e\)/);
  assert.match(catchBody, /showNotification\(/);
  assert.match(catchBody, /const\s+latestAppData\s*=\s*runtimeAppDataStore\.replaceAll\(\{\s*conversations:\s*\[\],\s*folders:\s*\[\],\s*astras:\s*\[\],\s*personalMemories:\s*\[\]\s*\}\)/);
  assert.match(catchBody, /liveConversationsBridge\.syncLegacyMirror\(latestAppData\.conversations\)/);
  assert.doesNotMatch(catchBody, /folders\s*=\s*latestAppData\.folders/);
  assert.doesNotMatch(catchBody, /astras\s*=\s*latestAppData\.astras/);
  assert.match(catchBody, /await\s+removeItem\(getAppDataKey\(\)\)/);
  assert.match(loadAppDataBody, /else\s*\{\s*const\s+latestAppData\s*=\s*runtimeAppDataStore\.replaceAll\(\{\s*conversations:\s*\[\],\s*folders:\s*\[\],\s*astras:\s*\[\],\s*personalMemories:\s*\[\]\s*\}\);\s*liveConversationsBridge\.syncLegacyMirror\(latestAppData\.conversations\);\s*\}/);
  assert.match(fragment00Source, /const\s+\{\s*getItem,\s*setItem,\s*removeItem\s*\}\s*=\s*runtimeStorageAdapter/);

  assert.doesNotMatch(runtimeAppSource, /app-data-normalization|app-data-persistence|loadAppData|saveAppData|indexedDB/);
  const trashLifecycleSource = readSource('src/app/runtime/features/trash-lifecycle.js');
  assert.equal(
    ((laterFragmentSources.join('\n') + coreTailSource + folderLifecycleSource + trashLifecycleSource + importExportSource + authImportSource + appBootstrapLifecycleSource + modelMemoryDashboardSource + batchImportVoiceSource + settingsAuthProviderSource + submitInputCouncilSource + sidebarChatAstraRenderSource).match(/\bsaveAppData\(\)/g) || []).length,
    31
  );
  for (const source of laterFragmentSources) {
    assert.doesNotMatch(source, /app-data-normalization|app-data-persistence/);
  }
});

test('runtime app data store ownership covers 00 and selected linked replacements', () => {
  const runtimeAppSource = readSource('src/app/runtime-app.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment02Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const submitInputCouncilSource = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const settingsAuthProviderSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const sidebarChatAstraRenderSource = readSource('src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js');
  const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const modelMemoryDashboardSource = readSource('src/app/runtime/legacy-core/model-memory-dashboard-lifecycle.js');
  const coreTailSource = readSource('src/app/runtime/legacy-core/core-tail-lifecycle.js');
  const importExportSource = readSource('src/app/runtime/features/import-export-lifecycle.js');
  const authImportSource = readSource('src/app/runtime/features/auth-import-lifecycle.js');
  const trashLifecycleSource = readSource('src/app/runtime/features/trash-lifecycle.js');
  const persistenceSource = readSource('src/app/runtime/kernel/app-data-persistence.js');
  const normalizationSource = readSource('src/app/runtime/kernel/app-data-normalization.js');
  const storeSource = readSource('src/app/runtime/kernel/app-data-store.js');
  const runtimeEntrySource = readSource('src/app/runtime-entry.js');
  const loadAppDataBody = getConstFunctionBody(fragment00Source, 'loadAppData');
  const startNewChatBody = getConstFunctionBody(fragment00Source, 'startNewChat');
  const loadChatBody = getConstFunctionBody(fragment00Source, 'loadChat');
  const performImportBody = getFunctionDeclarationBody(importExportSource, 'performImport');
  const handleImportBody = getFunctionDeclarationBody(importExportSource, 'handleImport');
  const processAuthImportBody = getFunctionDeclarationBody(authImportSource, 'processAuthImport');
  const handleSubscriptionBody = getConstFunctionBody(coreTailSource, 'handleSubscription');
  const permanentDeleteBody = getConstFunctionBody(trashLifecycleSource, 'handleDeleteTrashItemPermanently');
  const batchDeleteBody = getConstFunctionBody(trashLifecycleSource, 'handleBatchDeleteFromTrash');
  const emptyTrashBody = getConstFunctionBody(trashLifecycleSource, 'handleEmptyTrash');
  const mainSource = readSource('src/main.js');
  const legacyEntrySource = readSource('src/app/legacy-app.js');
  const viteSource = readSource('vite.config.js');

  assert.equal(existsSync(projectFile('src/app/runtime/kernel/app-data-store.js')), true);
  assert.match(storeSource, /export\s+function\s+createLegacyRuntimeAppDataStore/);
  assert.doesNotMatch(storeSource, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtimeContext/);
  assert.doesNotMatch(storeSource, /getItem|setItem|removeItem|openDB|indexedDB|localStorage|sessionStorage|currentUser/);
  assert.doesNotMatch(storeSource, /showNotification|renderAll|toggleModal|initChatApp|initializeApp/);
  assert.match(fragment00Source, /import\s+\{\s*createRuntimeAppKernel\s*\}\s*from\s*['"]\/src\/app\/runtime-app\.js['"]/);
  assertMarkersInOrder(fragment00Source, [
    'const runtimeAppKernel = createRuntimeAppKernel({',
    'elements: ALL_ELEMENTS',
    'defaultModelId: MODELS[0].id',
    'const runtimeAppDataStore = runtimeAppKernel.appDataStore',
    'let conversations = runtimeAppDataStore.getConversations()',
    'const liveConversationsBridge = createLiveConversationsBridge({',
    'const activeConversationStore = createActiveConversationStore(null)'
  ], '00 app data store lexical bridge');
  assert.doesNotMatch(fragment00Source, /let\s+activeConversationId\s*=/);
  assert.doesNotMatch(fragment00Source, /let\s+personalMemories\s*=/);
  assert.match(fragment00Source, /get personalMemories\(\)\s*\{\s*return runtimeAppDataStore\.getPersonalMemories\(\);\s*\}/);
  assert.doesNotMatch(fragment00Source, /createLegacyRuntimeAppDataStore\(/);
  assert.match(runtimeAppSource, /import\s+\{\s*createLegacyRuntimeAppDataStore\s*\}/);
  assert.match(runtimeAppSource, /const\s+appDataStore\s*=\s*createLegacyRuntimeAppDataStore\(\)/);
  assertMarkersInOrder(loadAppDataBody, [
    'const normalizedData = normalizeLoadedLegacyAppData({',
    'const latestAppData = runtimeAppDataStore.replaceAll(normalizedData)',
    'liveConversationsBridge.syncLegacyMirror(latestAppData.conversations)'
  ], '00 loadAppData store-backed successful replacement');
  assert.doesNotMatch(loadAppDataBody, /folders\s*=\s*latestAppData\.folders/);
  assert.doesNotMatch(loadAppDataBody, /astras\s*=\s*latestAppData\.astras/);
  assert.doesNotMatch(loadAppDataBody, /personalMemories\s*=\s*latestAppData\.personalMemories/);
  assert.equal((loadAppDataBody.match(/runtimeAppDataStore\.replaceAll\(\{/g) || []).length, 2);
  assert.match(loadAppDataBody, /await\s+removeItem\(getAppDataKey\(\)\)/);
  assertMarkersInOrder(startNewChatBody, [
    'const currentConversations = liveConversationsBridge.getConversations()',
    'const oldTempChatCount = currentConversations.length',
    'const cleanedConversations = liveConversationsBridge.replaceConversations(',
    'currentConversations.filter(c => !c.isTemporary || c.messages.length > 0)',
    'if (cleanedConversations.length < oldTempChatCount)',
    'await saveAppData()',
    'uploadedFiles = []',
    "const newConv = createBaseConversation('新對話')",
    'liveConversationsBridge.getConversations().unshift(newConv)',
    'conversationStateAccess.setCurrentConversationId(newConv.id)',
    'renderAll()'
  ], '00 startNewChat store-backed temporary conversation replacement');
  assertMarkersInOrder(loadChatBody, [
    'const previousConv = getActiveConversation()',
    'const currentConversations = liveConversationsBridge.getConversations()',
    'liveConversationsBridge.replaceConversations(',
    'currentConversations.filter(c => c.id !== previousConv.id)',
    'conversationStateAccess.setCurrentConversationId(id)',
    'uploadedFiles = []',
    'renderAll()'
  ], '00 loadChat store-backed previous temporary conversation replacement');
  assert.equal((startNewChatBody.match(/liveConversationsBridge\.getConversations\(\)/g) || []).length, 2);
  assert.doesNotMatch(startNewChatBody, /\bconversations\.(?:length|filter|unshift)\b/);
  assert.match(loadChatBody, /currentConversations\.filter\(c\s*=>\s*c\.id\s*!==\s*previousConv\.id\)/);
  assert.doesNotMatch(loadChatBody, /\bconversations\.filter\(/);
  assert.doesNotMatch(startNewChatBody, /runtimeAppDataStore\.replaceConversations\(/);
  assert.doesNotMatch(loadChatBody, /runtimeAppDataStore\.replaceConversations\(/);
  const deleteAstrasBody = getConstFunctionBody(sidebarChatAstraRenderSource, 'deleteAstras');
  const folderLifecycleSource = readSource('src/app/runtime/features/folder-lifecycle.js');
  const deleteFolderBody = getConstFunctionBody(folderLifecycleSource, 'deleteFolder');
  assertMarkersInOrder(deleteAstrasBody, [
    'setAstras(replaceAstras(',
    'getAstras().filter(a => a.id !== id)',
    'getConversations().forEach(c => {',
    'if (c.astrasId === id) c.astrasId = null',
    'await saveAppData()',
    'runtimeRenderCoordinator.renderAll()',
    'runtimeDialogCoordinator.showNotification'
  ], '01 deleteAstras linked store replacement');
  assert.match(
    fragment01Source,
    /replaceAstras:\s*\(nextAstras\)\s*=>\s*runtimeAppDataStore\.replaceAstras\(nextAstras\)/
  );
  assertMarkersInOrder(deleteFolderBody, [
    'getConversations().forEach(conversation => {',
    'conversation.folderId = null',
    'replaceFolders(folders.filter(item => item.id !== id))',
    'await saveAppData()',
    'renderAll()',
    'showNotification'
  ], 'folder lifecycle deleteFolder linked store replacement');
  assert.match(
    fragment02Source,
    /replaceFolders:\s*\(nextFolders\)\s*=>\s*runtimeAppDataStore\.replaceFolders\(nextFolders\)/
  );
  assertMarkersInOrder(modelMemoryDashboardSource, [
    'personalMemories = replacePersonalMemories(',
    'personalMemories.filter(m => m.id !== id)',
    'await saveAppData()',
    'renderPersonalMemoryList()'
  ], '03 personal memory delete store replacement');
  assert.match(
    fragment03Source,
    /replacePersonalMemories:\s*\(nextPersonalMemories\)\s*=>\s*\{\s*state\.personalMemories\s*=\s*runtimeAppDataStore\.replacePersonalMemories\(nextPersonalMemories\);\s*return\s+state\.personalMemories;\s*\}/
  );
  assertMarkersInOrder(performImportBody, [
    'replaceAllAppData({',
    'conversations: data.conversations || []',
    'folders: data.folders || []',
    'astras: data.astras || []',
    'personalMemories: data.personalMemories || []',
    'await saveAppData()'
  ], 'import-export lifecycle performImport injected bulk replacement');
  assertMarkersInOrder(handleImportBody, [
    'const activeAppData = replaceAllAppData({',
    'conversations: []',
    'folders: []',
    'astras: []',
    'personalMemories: []',
    'activeAppData.astras.push(astra)',
    'activeAppData.folders = replaceFolders(rawData.folders)',
    'activeAppData.personalMemories = replacePersonalMemories(rawData.personalMemories)',
    'activeAppData.conversations.push(conversation)',
    'await saveAppData()'
  ], 'import-export lifecycle handleImport injected replacements and chunked pushes');
  assertMarkersInOrder(processAuthImportBody, [
    'const activeAppData = replaceAllAppData({',
    'conversations: []',
    'folders: []',
    'astras: []',
    'personalMemories: []',
    'activeAppData.astras.push(astra)',
    'activeAppData.folders = replaceFolders(rawData.folders)',
    'activeAppData.personalMemories = replacePersonalMemories(rawData.personalMemories)',
    'activeAppData.conversations.push(conversation)',
    'await saveAppData()',
    'await saveConfig()',
    'toggleModal(elements.importDataModalAuth, false)',
    'initChatApp()',
    "showNotification(text('importSuccess'"
  ], 'auth import lifecycle processAuthImport injected replacements and app handoff');
  assertMarkersInOrder(handleSubscriptionBody, [
    'state.astras = runtimeAppDataStore.replaceAstras(',
    'state.astras.filter(a => a.officialId !== officialId)',
    "showNotification(i18n[state.config.uiLanguage].unsubscribed",
    'state.astras.unshift(newAstra)',
    "showNotification(i18n[state.config.uiLanguage].subscribed",
    'await saveAppData()',
    'renderStore()',
    'renderAstras()'
  ], '04 store unsubscribe Astra replacement');
  assertMarkersInOrder(permanentDeleteBody, [
    'showCustomConfirm',
    'replaceConversations(',
    'getConversations().filter(conversation => conversation.id !== conversationId)',
    'await saveAppData()',
    'renderTrash()',
    'showNotification'
  ], '04 trash permanent delete store replacement');
  assertMarkersInOrder(batchDeleteBody, [
    'const count = selectedTrashIds.size',
    'showCustomConfirm',
    'replaceConversations(',
    'getConversations().filter(conversation => !selectedTrashIds.has(conversation.id))',
    'await saveAppData()',
    'toggleTrashSelectionMode()',
    'showNotification'
  ], '04 trash batch delete store replacement');
  assertMarkersInOrder(emptyTrashBody, [
    'showCustomConfirm',
    'const conversations = getConversations()',
    'const count = conversations.filter(conversation => conversation.deletedAt).length',
    'replaceConversations(',
    'conversations.filter(conversation => !conversation.deletedAt)',
    'await saveAppData()',
    'renderTrash()',
    'showNotification'
  ], '04 empty trash store replacement');
  assert.doesNotMatch(fragment01Source, /from\s+['"][^'"]*app-data-store\.js['"]/);
  assert.doesNotMatch(fragment02Source, /from\s+['"][^'"]*app-data-store\.js['"]/);
  assert.doesNotMatch(fragment03Source, /from\s+['"][^'"]*app-data-store\.js['"]/);
  assert.doesNotMatch(coreTailSource, /from\s+['"][^'"]*app-data-store\.js['"]/);
  assert.doesNotMatch(coreTailSource, /from\s+['"][^'"]*app-data-store\.js['"]/);
  assert.equal((performImportBody.match(/replaceAllAppData\(/g) || []).length, 1);
  assert.equal((handleImportBody.match(/replaceAllAppData\(/g) || []).length, 1);
  assert.equal((processAuthImportBody.match(/replaceAllAppData\(/g) || []).length, 1);
  assert.doesNotMatch(fragment03Source, /appendConversations|appendAstras|syncFromLexical/);
  assert.doesNotMatch(storeSource, /appendConversations|appendAstras|syncFromLexical/);
  assert.match(fragment00Source, /getAppData:\s*\(\)\s*=>\s*runtimeAppDataStore\.getSnapshot\(\)/);
  assert.doesNotMatch(fragment00Source, /getAppData:\s*\(\)\s*=>\s*\(\{\s*conversations,\s*folders,\s*astras,\s*personalMemories\s*\}\)/);
  assert.doesNotMatch(fragment00Source, /getAppData:[\s\S]{0,120}\bactiveConversationId\b/);
  assert.doesNotMatch(runtimeEntrySource, /runtimeAppDataStore|createLegacyRuntimeAppDataStore|app-data-store/);
  assert.match(runtimeAppSource, /const\s+appDataStore\s*=\s*createLegacyRuntimeAppDataStore\(\)/);
  assert.doesNotMatch(persistenceSource, /loadAppData|getItem|removeItem|openDB|normalizeLoadedLegacyAppData/);
  assert.doesNotMatch(normalizationSource, /showNotification|renderAll|toggleModal|currentUser|getItem|setItem|removeItem|openDB/);
  assert.match(mainSource, /await\s+import\(['"]\.\/app\/legacy-app\.js['"]\)/);
  assert.match(legacyEntrySource, /from\s+['"]\.\/runtime-entry\.js['"]/);
  assert.doesNotMatch(legacyEntrySource, /virtual:legacy-app-runtime/);
  assert.doesNotMatch(viteSource, /legacyRuntimeModuleId|virtual:legacy-app-runtime/);
});

test('legacy runtime fragments are retired after real legacy core cutover', () => {
  const fragmentNames = listFilesIfDirExists('src/app/legacy-runtime/fragments')
    .filter((name) => name.endsWith('.fragment.js'))
    .sort();
  const legacyCorePath = 'src/app/runtime/legacy-core/legacy-core.js';
  const legacyCoreSource = readSource(legacyCorePath);

  assert.deepEqual(fragmentNames, []);
  assert.ok(statSync(projectFile(legacyCorePath)).isFile(), `${legacyCorePath} should exist`);
  assert.match(legacyCoreSource, /export\s+\{\s*legacyRuntimeContext\s*\};/);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/00-runtime.fragment.js')), false);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/01-runtime.fragment.js')), false);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/02-runtime.fragment.js')), false);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/03-runtime.fragment.js')), false);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/04-runtime.fragment.js')), false);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/05-runtime.fragment.js')), false);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/06-runtime.fragment.js')), false);
});

test('folder metadata is shared without later-fragment lexical ownership', () => {
  const metadataPath = 'src/app/legacy-runtime/data/folder-metadata.js';
  const metadataSource = readSource(metadataPath);
  const fragment01Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment02Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const sidebarChatAstraRenderSource = readSource('src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js');
  const folderLifecycleSource = readSource('src/app/runtime/features/folder-lifecycle.js');
  const renderFoldersBody = getConstFunctionBody(sidebarChatAstraRenderSource, 'renderFolders');
  const showFolderSettingsModalBody = getConstFunctionBody(folderLifecycleSource, 'showFolderSettingsModal');

  assert.equal(existsSync(projectFile(metadataPath)), true, 'shared folder metadata module should exist');
  assert.match(metadataSource, /export\s+const\s+FOLDER_SVGS\s*=/);
  assert.match(metadataSource, /export\s+const\s+FOLDER_TEXT_COLORS\s*=/);
  assert.match(
    sidebarChatAstraRenderSource,
    /import\s*\{\s*FOLDER_SVGS,\s*FOLDER_TEXT_COLORS\s*\}\s*from\s*['"][^'"]*legacy-runtime\/data\/folder-metadata\.js['"]/
  );
  assert.match(
    fragment02Source,
    /import\s*\{\s*FOLDER_SVGS\s+as\s+FOLDER_ICON_OPTIONS,\s*\}\s*from\s*['"]\/src\/app\/legacy-runtime\/data\/folder-metadata\.js['"]/
  );
  assert.match(showFolderSettingsModalBody, /Object\.entries\(folderIconOptions\)/);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/06-runtime.fragment.js')), false);
  assert.match(
    renderFoldersBody,
    /FOLDER_SVGS\[folder\.icon\]\s*\|\|\s*FOLDER_SVGS(?:\[['"]default['"]\]|\.default)/
  );
  assert.match(
    renderFoldersBody,
    /FOLDER_TEXT_COLORS\[folder\.textColor\]\s*\|\|\s*FOLDER_TEXT_COLORS(?:\[['"]gray['"]\]|\.gray)/
  );
});

test('folder CRUD lifecycle ownership stays in a real module with legacy core wiring', () => {
  const lifecyclePath = 'src/app/runtime/features/folder-lifecycle.js';
  const lifecycleSource = readSource(lifecyclePath);
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment02Source = readSource('src/app/runtime/legacy-core/legacy-core.js');

  assert.equal(existsSync(projectFile(lifecyclePath)), true);
  assert.match(lifecycleSource, /export\s+function\s+createLegacyFolderLifecycle/);
  assert.doesNotMatch(
    lifecycleSource,
    /legacy-runtime\/fragments|virtual:legacy-app-runtime|storage-adapter|runtime-app|indexedDB|localStorage|sessionStorage|currentUser|loadConfig|loadAppData|initChatApp|initializeApp|Peer|P2P|JSZip/
  );
  assert.match(fragment02Source, /import\s+\{\s*createLegacyFolderLifecycle\s*\}\s+from\s+['"]\/src\/app\/runtime\/features\/folder-lifecycle\.js['"]/);
  assertMarkersInOrder(fragment02Source, [
    'const {',
    'createNewFolder',
    'moveConversationToFolder',
    'deleteFolder',
    'showFolderSettingsModal',
    'handleSaveFolderSettings',
    'createFolderMenu',
    '} = createLegacyFolderLifecycle({',
    'getFolders: () => runtimeAppDataStore.getFolders()',
    'getConversations: () => liveConversationsBridge.getConversations()',
    'replaceFolders: (nextFolders) => runtimeAppDataStore.replaceFolders(nextFolders)',
    'getDefaultFolder',
    'saveAppData',
    'renderFolders',
    'renderAll'
  ], '01 folder lifecycle wiring');
  for (const name of [
    'createNewFolder',
    'moveConversationToFolder',
    'deleteFolder',
    'showFolderSettingsModal',
    'handleSaveFolderSettings',
    'createFolderMenu'
  ]) {
    assert.doesNotMatch(fragment02Source, new RegExp(`const\\s+${name}\\s*=\\s*(?:async\\s*)?\\(`));
  }
  assert.doesNotMatch(fragment00Source, /\bfolderToCustomize\b/);
  assert.doesNotMatch(fragment02Source, /\bfolderToCustomize\b/);
  assert.match(lifecycleSource, /let\s+folderToCustomize\s*=\s*null/);
});

test('sidebar chat Astra render lifecycle ownership stays in a real module with legacy core wiring', () => {
  const lifecyclePath = 'src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js';
  const lifecycleSource = readSource(lifecyclePath);
  const fragment01Source = readSource('src/app/runtime/legacy-core/legacy-core.js');

  assert.equal(existsSync(projectFile(lifecyclePath)), true);
  assert.match(lifecycleSource, /export\s+function\s+createLegacySidebarChatAstraRenderLifecycle/);
  assert.doesNotMatch(lifecycleSource, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/);
  assert.match(
    fragment01Source,
    /import\s+\{\s*createLegacySidebarChatAstraRenderLifecycle\s*\}\s+from\s+['"]\/src\/app\/runtime\/legacy-core\/sidebar-chat-astra-render-lifecycle\.js['"]/
  );
  assert.match(fragment01Source, /const\s+sidebarChatAstraRenderLifecycle\s*=\s*createLegacySidebarChatAstraRenderLifecycle\(\{/);
  assert.match(fragment01Source, /replaceAstras:\s*\(nextAstras\)\s*=>\s*runtimeAppDataStore\.replaceAstras\(nextAstras\)/);
  assert.match(fragment01Source, /showMobileContextMenu:\s*\(\.\.\.args\)\s*=>\s*showMobileContextMenu\(\.\.\.args\)/);
  assert.match(fragment01Source, /showMobileContextMenuForFolder:\s*\(\.\.\.args\)\s*=>\s*showMobileContextMenuForFolder\(\.\.\.args\)/);
  assert.match(fragment01Source, /openAvatarEditor:\s*\(\.\.\.args\)\s*=>\s*openAvatarEditor\(\.\.\.args\)/);
  assert.match(fragment01Source, /setupMessageIntersectionObserver:\s*\(\.\.\.args\)\s*=>\s*setupMessageIntersectionObserver\(\.\.\.args\)/);
  assert.match(fragment01Source, /\{\s*renderFolders,[\s\S]*createConversationElement,[\s\S]*renderArchivedChats,[\s\S]*addMessageToUI,[\s\S]*renderChat,[\s\S]*createAstras,[\s\S]*handleSaveAstras,[\s\S]*deleteAstras[\s\S]*\}\s*=\s*sidebarChatAstraRenderLifecycle\);/);
  const settingsLifecycleIndex = fragment01Source.indexOf(
    'const settingsAuthProviderLifecycle = createLegacySettingsAuthProviderLifecycle({'
  );
  const createHistoryMenuAliasIndex = fragment01Source.indexOf(
    'createHistoryMenu,',
    settingsLifecycleIndex
  );
  const sidebarLifecycleIndex = fragment01Source.indexOf(
    'const sidebarChatAstraRenderLifecycle = createLegacySidebarChatAstraRenderLifecycle({'
  );
  assert.notEqual(settingsLifecycleIndex, -1, 'settings/auth/provider lifecycle should be wired');
  assert.notEqual(createHistoryMenuAliasIndex, -1, 'createHistoryMenu alias should be assigned from settings/auth/provider lifecycle');
  assert.notEqual(sidebarLifecycleIndex, -1, 'sidebar/chat/Astra lifecycle should be wired');
  assert.ok(
    settingsLifecycleIndex < createHistoryMenuAliasIndex && createHistoryMenuAliasIndex < sidebarLifecycleIndex,
    'createHistoryMenu should be assigned before sidebar/chat/Astra lifecycle receives it'
  );
  for (const removedInlineBody of [
    /const\s+renderFolders\s*=\s*\(\)\s*=>\s*\{/,
    /const\s+createConversationElement\s*=\s*\(conv\)\s*=>\s*\{/,
    /const\s+renderArchivedChats\s*=\s*\(\)\s*=>\s*\{/,
    /const\s+createAstras\s*=\s*async\s*\(\)\s*=>\s*\{/,
    /const\s+handleSaveAstras\s*=\s*async\s*\(\)\s*=>\s*\{/,
    /const\s+deleteAstras\s*=\s*async\s*\(id\)\s*=>\s*\{/,
    /createMessageListLifecycle\(\{/
  ]) {
    assert.doesNotMatch(fragment01Source, removedInlineBody);
  }
  assert.match(lifecycleSource, /const\s+renderFolders\s*=\s*\(\)\s*=>\s*\{/);
  assert.match(lifecycleSource, /const\s+createConversationElement\s*=\s*\(conv\)\s*=>\s*\{/);
  assert.match(lifecycleSource, /const\s+renderArchivedChats\s*=\s*\(\)\s*=>\s*\{/);
  assert.match(lifecycleSource, /const\s+createAstras\s*=\s*async\s*\(\)\s*=>\s*\{/);
  assert.match(lifecycleSource, /const\s+deleteAstras\s*=\s*async\s*\(id\)\s*=>\s*\{/);
  assert.match(lifecycleSource, /createMessageListLifecycle\(\{/);
  assert.match(fragment01Source, /const\s+submitInputCouncilLifecycle\s*=\s*createLegacySubmitInputCouncilLifecycle\(\{/);
  assert.match(fragment01Source, /const\s+transitionBusLifecycle\s*=\s*createLegacyTransitionBusLifecycle\(\{/);
  assert.match(fragment01Source, /transitionBusLifecycle\.registerCoreTailDependencies\(\);/);
});

test('trash lifecycle ownership moves out of 04 into a real runtime module', () => {
  const lifecyclePath = 'src/app/runtime/features/trash-lifecycle.js';
  const lifecycleSource = readSource(lifecyclePath);
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const coreTailSource = readSource('src/app/runtime/legacy-core/core-tail-lifecycle.js');

  assert.equal(existsSync(projectFile(lifecyclePath)), true);
  assert.match(lifecycleSource, /export\s+function\s+createLegacyTrashLifecycle/);
  assert.doesNotMatch(
    lifecycleSource,
    /legacy-runtime\/fragments|virtual:legacy-app-runtime|storage-adapter|runtime-app|indexedDB|localStorage|sessionStorage|currentUser|loadConfig|loadAppData|initChatApp|initializeApp|Peer|P2P|JSZip/
  );
  assert.match(coreTailSource, /import\s+\{\s*createLegacyTrashLifecycle\s*\}\s+from\s+['"]\.\.\/features\/trash-lifecycle\.js['"]/);
  assertMarkersInOrder(coreTailSource, [
    'const {',
    'renderTrash',
    'handleRestoreTrashItem',
    'handleDeleteTrashItemPermanently',
    'showTrashItemInViewModal',
    'toggleTrashSelectionMode',
    'renderTrashBatchActionBar',
    'handleBatchRestoreFromTrash',
    'handleBatchDeleteFromTrash',
    'handleEmptyTrash',
    '} = createLegacyTrashLifecycle({',
    'elements: ALL_ELEMENTS',
    'getConversations: () => state.conversations',
    'replaceConversations: (nextConversations) => {',
    'state.conversations = nextConversations',
    'return state.conversations',
    'saveAppData'
  ], 'core tail trash lifecycle wiring');
  assert.doesNotMatch(coreTailSource, /runtimeAppDataStore\.replaceConversations\(/);
  for (const name of [
    'renderTrash',
    'handleRestoreTrashItem',
    'handleDeleteTrashItemPermanently',
    'showTrashItemInViewModal',
    'toggleTrashSelectionMode',
    'renderTrashBatchActionBar',
    'handleBatchRestoreFromTrash',
    'handleBatchDeleteFromTrash',
    'handleEmptyTrash'
  ]) {
    assert.match(fragment03Source, new RegExp(`function\\s+${name}\\s*\\(\\.\\.\\.args\\)\\s*\\{\\s*return\\s+resolveCoreTailFunction\\('${name}'\\)\\(\\.\\.\\.args\\);\\s*\\}`));
  }
  assert.match(fragment03Source, /function\s+renderTrash\(\.\.\.args\)/);
  assert.match(fragment03Source, /function\s+handleEmptyTrash\(\.\.\.args\)/);
  assert.doesNotMatch(fragment00Source, /\bisTrashSelectionMode\b|\bselectedTrashIds\b/);
  assert.doesNotMatch(fragment03Source, /\blet\s+isTrashSelectionMode\b|\bselectedTrashIds\s*=\s*new\s+Set\(\)/);
  assert.match(lifecycleSource, /let\s+isTrashSelectionMode\s*=\s*false/);
  assert.match(lifecycleSource, /const\s+selectedTrashIds\s*=\s*new\s+Set\(\)/);
});

test('legacy core tail ownership stays in runtime entry with transition bus bridges', () => {
  const modulePath = 'src/app/runtime/legacy-core/core-tail-lifecycle.js';
  const moduleSource = readSource(modulePath);
  const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const runtimeEntrySource = readSource('src/app/runtime-entry.js');
  const legacyEntrySource = readSource('src/app/legacy-app.js');
  const viteSource = readSource('vite.config.js');

  assert.equal(existsSync(projectFile(modulePath)), true);
  assert.match(moduleSource, /export\s+function\s+createLegacyCoreTailLifecycle/);
  assert.doesNotMatch(moduleSource, /legacy-runtime\/fragments|virtual:legacy-app-runtime/);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/04-runtime.fragment.js')), false);
  assert.match(fragment03Source, /const\s+coreTailState\s*=\s*\{/);
  assert.match(fragment03Source, /const\s+coreTailDependencies\s*=\s*\{/);
  assert.match(fragment03Source, /state:\s*coreTailState/);
  assert.match(fragment03Source, /legacyRuntimeContext\.registerLazyBinding\(\s*['"]runtime\.coreTailDependencies['"]/);
  assert.match(runtimeEntrySource, /import\s+\{\s*createLegacyCoreTailLifecycle\s*\}/);
  assert.match(runtimeEntrySource, /registerCoreTailBindings\(\{\s*runtimeContext,\s*coreTailLifecycle\s*\}\)/);
  assert.match(runtimeEntrySource, /coreTailLifecycle\.registerRuntimeEntryDependencies\(\)/);
  for (const name of [
    'applyUiTheme',
    'applyCustomWallpaper',
    'renderStore',
    'applyLanguage',
    'showMobileContextMenu',
    'setupMessageIntersectionObserver'
  ]) {
    assert.match(fragment03Source, new RegExp(`function\\s+${name}\\s*\\(\\.\\.\\.args\\)`));
    assert.match(runtimeEntrySource, new RegExp(`'${name}'`));
    assert.match(moduleSource, new RegExp(`(?:const|function)\\s+${name}\\s*(?:=|\\()`));
  }
  assert.doesNotMatch(viteSource, /(?:04|05|06)-runtime\.fragment\.js/);
  assert.match(legacyEntrySource, /from\s+['"]\.\/runtime-entry\.js['"]/);
  assert.match(runtimeEntrySource, /core-tail-lifecycle/);
});

test('normal import/export lifecycle ownership moves out of 03 into a real runtime module', () => {
  const lifecyclePath = 'src/app/runtime/features/import-export-lifecycle.js';
  const lifecycleSource = readSource(lifecyclePath);
  const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const batchImportVoiceSource = readSource('src/app/runtime/legacy-core/batch-import-voice-lifecycle.js');
  const dependencySource = readSource('src/app/runtime/runtime-entry-dependencies.js');
  const appBootstrapLifecycleSource = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');
  const startupLifecycleSource = readSource('src/app/runtime/features/startup-lifecycle.js');

  assert.equal(existsSync(projectFile(lifecyclePath)), true);
  assert.match(lifecycleSource, /export\s+function\s+createLegacyImportExportLifecycle/);
  assert.doesNotMatch(
    lifecycleSource,
    /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app|initChatApp|initializeApp|chat_lastUser|createPasswordRecord|getUserKey/
  );
  assert.doesNotMatch(lifecycleSource, /(?:^|\n)\s*currentUser\s*=/);
  assert.match(batchImportVoiceSource, /import\s+\{\s*createLegacyImportExportLifecycle\s*\}\s+from\s+['"]\.\.\/features\/import-export-lifecycle\.js['"]/);
  assert.doesNotMatch(fragment03Source, /createLegacyImportExportLifecycle/);
  assertMarkersInOrder(batchImportVoiceSource, [
    'const importExportLifecycle = createLegacyImportExportLifecycle({',
    'getCurrentUser',
    'getConfig',
    'mutateConfig',
    'getConversations',
    'getFolders',
    'getAstras',
    'getPersonalMemories',
    'replaceAllAppData',
    'replaceFolders',
    'replacePersonalMemories',
    'saveAppData',
    'saveConfig',
    'const authImportLifecycle = createLegacyAuthImportLifecycle({'
  ], 'batch/import/voice lifecycle import/export composition and auth split');
  assertMarkersInOrder(fragment03Source, [
    'const batchImportVoiceLifecycle = createLegacyBatchImportVoiceLifecycle({',
    'getConfig: () => state.config',
    'mutateConfig: (mutator) => {',
    'getCurrentUser: () => state.currentUser',
    'getConversations: () => state.conversations',
    'getFolders: () => state.folders',
    'getAstras: () => state.astras',
    'getPersonalMemories: () => state.personalMemories',
    'replaceAllAppData: (nextAppData) => {',
    'const snapshot = runtimeAppDataStore.replaceAll(nextAppData)',
    'state.conversations = snapshot.conversations',
    'state.folders = snapshot.folders',
    'state.astras = snapshot.astras',
    'state.personalMemories = snapshot.personalMemories',
    'replaceFolders: (nextFolders) => {',
    'state.folders = runtimeAppDataStore.replaceFolders(nextFolders)',
    'replacePersonalMemories: (nextPersonalMemories) => {',
    'state.personalMemories = runtimeAppDataStore.replacePersonalMemories(nextPersonalMemories)',
    'const {',
    'handleExport',
    'performImport',
    'handleImport',
    '} = batchImportVoiceLifecycle'
  ], '03 batch/import/voice lifecycle wiring');
  for (const name of ['handleExport', 'performImport', 'handleImport']) {
    assert.doesNotMatch(fragment03Source, new RegExp(`const\\s+${name}\\s*=\\s*(?:async\\s*)?\\(`));
  }
  assert.match(dependencySource, /'handleExport'/);
  assert.match(dependencySource, /'handleImport'/);
  assert.match(appBootstrapLifecycleSource, /confirmExportBtn\.addEventListener\('click',\s*handleExport\)/);
  assert.match(appBootstrapLifecycleSource, /confirmImportBtn\.addEventListener\('click',\s*handleImport\)/);
  assert.match(startupLifecycleSource, /importBtnAuth\.addEventListener\('click',\s*handleImportOnAuth\)/);
  assert.match(startupLifecycleSource, /confirmImportBtnAuth\.addEventListener\('click',\s*processAuthImport\)/);
});

test('auth import lifecycle ownership moves out of 03 into a real runtime module', () => {
  const lifecyclePath = 'src/app/runtime/features/auth-import-lifecycle.js';
  const lifecycleSource = readSource(lifecyclePath);
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const batchImportVoiceSource = readSource('src/app/runtime/legacy-core/batch-import-voice-lifecycle.js');
  const startupLifecycleSource = readSource('src/app/runtime/features/startup-lifecycle.js');

  assert.equal(existsSync(projectFile(lifecyclePath)), true);
  assert.match(lifecycleSource, /export\s+function\s+createLegacyAuthImportLifecycle/);
  assert.doesNotMatch(
    lifecycleSource,
    /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app|legacyRuntimeContext|initializeApp|handleLogin|handleLogout/
  );
  assert.doesNotMatch(lifecycleSource, /(?:^|\n)\s*currentUser\s*=/);
  assert.match(batchImportVoiceSource, /import\s+\{\s*createLegacyAuthImportLifecycle\s*\}\s+from\s+['"]\.\.\/features\/auth-import-lifecycle\.js['"]/);
  assert.doesNotMatch(fragment03Source, /createLegacyAuthImportLifecycle/);
  assertMarkersInOrder(batchImportVoiceSource, [
    'const authImportLifecycle = createLegacyAuthImportLifecycle({',
    'elements: ALL_ELEMENTS',
    'getConfig',
    'mutateConfig',
    'setCurrentUser',
    'createPasswordRecord',
    'getUserKey',
    'setItem',
    'replaceAllAppData',
    'replaceFolders',
    'replacePersonalMemories',
    "initChatApp: () => legacyRuntimeContext.resolveBinding('app.initChatApp')()",
  ], 'batch/import/voice auth import lifecycle composition');
  assertMarkersInOrder(fragment03Source, [
    'setCurrentUser: (nextUser) => {',
    'currentUser = nextUser',
    'createPasswordRecord',
    'getUserKey',
    'setItem',
    'handleImportOnAuth',
    'processAuthImport',
    '} = batchImportVoiceLifecycle'
  ], '03 auth import bridge wiring');
  for (const name of ['handleImportOnAuth', 'processAuthImport']) {
    assert.doesNotMatch(fragment03Source, new RegExp(`const\\s+${name}\\s*=\\s*(?:async\\s*)?\\(`));
  }
  assert.match(fragment00Source, /const\s+createPasswordRecord\s*=\s*async\s*\(/);
  assert.match(fragment00Source, /const\s+getUserKey\s*=\s*\(username\)\s*=>\s*`chatUser_\$\{username\}`/);
  assert.match(startupLifecycleSource, /importBtnAuth\.addEventListener\('click',\s*handleImportOnAuth\)/);
  assert.match(startupLifecycleSource, /confirmImportBtnAuth\.addEventListener\('click',\s*processAuthImport\)/);
});

test('color contrast helper is shared without later-fragment lexical ownership', () => {
  const helperPath = 'src/utils/color-contrast.js';
  const helperSource = readSource(helperPath);
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const coreTailSource = readSource('src/app/runtime/legacy-core/core-tail-lifecycle.js');
  const renderHistorySidebarContentBody = getBlockFromMarker(fragment00Source, 'function renderHistorySidebarContent()');
  const applyUiThemeBody = getConstFunctionBody(coreTailSource, 'applyUiTheme');

  assert.equal(existsSync(projectFile(helperPath)), true, 'shared color contrast helper should exist');
  assert.match(helperSource, /export\s+function\s+getTextColorForBackground\s*\(/);
  assert.doesNotMatch(helperSource, /export\s+(?:const|function)\s+hexToRgb|export\s*\{[^}]*hexToRgb/);
  assert.match(
    fragment00Source,
    /import\s*\{\s*getTextColorForBackground\s*\}\s*from\s*['"]\/src\/utils\/color-contrast\.js['"]/
  );
  assert.match(
    coreTailSource,
    /import\s*\{\s*getTextColorForBackground\s+as\s+getThemeTextColorForBackground,\s*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\/color-contrast\.js['"]/
  );
  assert.doesNotMatch(coreTailSource, /const\s+hexToRgb\s*=/);
  assert.doesNotMatch(coreTailSource, /const\s+getTextColorForBackground\s*=/);
  assert.match(
    renderHistorySidebarContentBody,
    /listItem\.style\.color\s*=\s*getTextColorForBackground\(bgColor\);/
  );
  assert.match(
    applyUiThemeBody,
    /const\s+textColor\s*=\s*\(state\.config\.uiTheme\.style\s*===\s*'gradient'\s*&&\s*state\.config\.uiTheme\.mode\s*===\s*'adaptive'\)\s*\?\s*'#ffffff'\s*:\s*getThemeTextColorForBackground\(primaryBg\);/
  );
  assertMarkersInOrder(applyUiThemeBody, [
    "root.style.setProperty('--button-primary-bg', primaryBg)",
    "root.style.setProperty('--button-primary-text', textColor)"
  ], 'applyUiTheme color assignments');
});

test('legacy runtime real core has no remaining fragment boundary to stitch', () => {
  const fragmentNames = listFilesIfDirExists('src/app/legacy-runtime/fragments')
    .filter((name) => name.endsWith('.fragment.js'))
    .sort();
  const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');

  assert.deepEqual(fragmentNames, []);
  assert.match(legacyCoreSource, /export\s+\{\s*legacyRuntimeContext\s*\};/);
});

test('sidebar Astras lifecycle breaks the 00 to 01 renderAstras continuation boundary', () => {
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const sidebarAstrasSource = readSource('src/app/legacy-runtime/features/sidebar-astras-lifecycle.js');

  assert.match(sidebarAstrasSource, /export\s+function\s+createSidebarAstrasLifecycle/);
  assert.match(fragment00Source, /createSidebarAstrasLifecycle\(\{/);
  assert.match(fragment00Source, /const\s+renderAstras\s*=\s*\(\.\.\.args\)\s*=>\s*sidebarAstrasLifecycle\.renderAstras\(\.\.\.args\);/);
  assert.doesNotMatch(fragment00Source, /astras\.forEach\(ast\s*=>/);
  assert.doesNotMatch(fragment01Source, /^\s*astras\.forEach\(ast\s*=>/);

  const renderAstrasStart = fragment00Source.indexOf('const renderAstras =');
  assert.notEqual(renderAstrasStart, -1, '00 should still expose a renderAstras binding');
  const renderAstrasStatementEnd = fragment00Source.indexOf(';', renderAstrasStart);
  assert.notEqual(renderAstrasStatementEnd, -1, 'renderAstras binding should end inside 00');
  assert.ok(
    renderAstrasStatementEnd < fragment00Source.length,
    'renderAstras binding should not need 01 to finish its statement'
  );
  assert.doesNotMatch(
    fragment00Source.slice(renderAstrasStart, renderAstrasStatementEnd),
    /=>\s*\{/,
    'renderAstras should not reopen an inline body in 00'
  );

  const combinedStart = `${fragment00Source}\n`.length;
  const concatenated = `${fragment00Source}\n${fragment01Source}`;
  const nextOpenBrace = concatenated.indexOf('{', renderAstrasStart);
  const concatenatedClose = findMatchingBrace(concatenated, nextOpenBrace);
  assert.ok(nextOpenBrace === -1 || concatenatedClose < combinedStart || nextOpenBrace > renderAstrasStatementEnd);
});

test('model memory dashboard lifecycle moves model usage chart ownership out of 03', () => {
  const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const modelMemoryDashboardSource = readSource('src/app/runtime/legacy-core/model-memory-dashboard-lifecycle.js');
  const chartLifecycleSource = readSource('src/app/legacy-runtime/features/model-usage-chart-lifecycle.js');

  assert.equal(existsSync(projectFile('src/app/runtime/legacy-core/model-memory-dashboard-lifecycle.js')), true);
  assert.match(modelMemoryDashboardSource, /export\s+function\s+createLegacyModelMemoryDashboardLifecycle/);
  assert.match(fragment03Source, /import\s+\{\s*createLegacyModelMemoryDashboardLifecycle\s*\}/);
  assert.match(fragment03Source, /const\s+modelMemoryDashboardLifecycle\s*=\s*createLegacyModelMemoryDashboardLifecycle\(\{/);
  assert.match(fragment03Source, /renderModelManagementUI,\s*moveModelOrder,\s*renderPersonalMemoryList,/);
  assert.match(fragment03Source, /openDashboard,\s*renderDashboardStats,\s*renderModelUsageChart/);
  assert.doesNotMatch(fragment03Source, /const\s+renderModelManagementUI\s*=\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(fragment03Source, /const\s+renderPersonalMemoryList\s*=\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(fragment03Source, /const\s+openDashboard\s*=\s*\(\)\s*=>\s*\{/);
  assert.match(modelMemoryDashboardSource, /const\s+renderModelManagementUI\s*=\s*\(\)\s*=>\s*\{/);
  assert.match(modelMemoryDashboardSource, /const\s+renderPersonalMemoryList\s*=\s*\(\)\s*=>\s*\{/);
  assert.match(modelMemoryDashboardSource, /const\s+openDashboard\s*=\s*\(\)\s*=>\s*\{/);
  assert.match(chartLifecycleSource, /export\s+function\s+createModelUsageChartLifecycle/);
  assert.match(modelMemoryDashboardSource, /createModelUsageChartLifecycle\(\{/);
  assert.match(modelMemoryDashboardSource, /const\s+renderModelUsageChart\s*=\s*\(\.\.\.args\)\s*=>\s*\{\s*syncState\(\);\s*return\s+modelUsageChartLifecycle\.renderModelUsageChart\(\.\.\.args\);\s*\};/);
  assert.doesNotMatch(fragment03Source, /createModelUsageChartLifecycle\(\{/);
  assert.doesNotMatch(fragment03Source, /modelPieChart\s*=\s*new Chart\(ctx,/);
  assert.doesNotMatch(modelMemoryDashboardSource, /legacy-runtime\/fragments|virtual:legacy-app-runtime/);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/04-runtime.fragment.js')), false);

  assert.match(
    fragment03Source,
    /getModelPieChart:\s*\(\)\s*=>\s*state\.modelPieChart/
  );
  assert.match(
    fragment03Source,
    /setModelPieChart:\s*\(chart\)\s*=>\s*\{\s*state\.modelPieChart\s*=\s*chart;\s*\}/
  );
});

test('search upload sidebar lifecycle moves search upload sidebar ownership out of 03', () => {
  const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const lifecycleSource = readSource('src/app/runtime/legacy-core/search-upload-sidebar-lifecycle.js');

  assert.equal(existsSync(projectFile('src/app/runtime/legacy-core/search-upload-sidebar-lifecycle.js')), true);
  assert.match(lifecycleSource, /export\s+function\s+createLegacySearchUploadSidebarLifecycle/);
  assert.match(fragment03Source, /import\s+\{\s*createLegacySearchUploadSidebarLifecycle\s*\}/);
  assert.match(fragment03Source, /const\s+searchUploadSidebarLifecycle\s*=\s*createLegacySearchUploadSidebarLifecycle\(\{/);
  assert.match(fragment03Source, /getUploadedFiles:\s*\(\)\s*=>\s*state\.uploadedFiles/);
  assert.match(fragment03Source, /setUploadedFiles:\s*\(files\)\s*=>\s*\{\s*state\.uploadedFiles\s*=\s*files;\s*return\s+state\.uploadedFiles;\s*\}/);
  assert.match(fragment03Source, /getSidebarOpen:\s*\(\)\s*=>\s*state\.sidebarOpen/);
  assert.match(fragment03Source, /setSidebarOpen:\s*\(nextSidebarOpen\)\s*=>\s*\{\s*state\.sidebarOpen\s*=\s*nextSidebarOpen;\s*return\s+state\.sidebarOpen;\s*\}/);
  assert.match(fragment03Source, /performSearchAndRenderResults,\s*showConversationInViewModal,\s*generateSearchKeywords,/);
  assert.match(fragment03Source, /renderFilePreviews,\s*removeFile,\s*handleFileSelection,\s*toggleSidebar/);
  assert.match(fragment03Source, /const\s+registerSidebarBindings\s*=\s*\(\)\s*=>\s*\{/);
  assert.match(fragment03Source, /legacyRuntimeContext\.registerLazyBinding\('sidebar\.toggleSidebar',\s*\(\)\s*=>\s*toggleSidebar\);/);
  assert.doesNotMatch(fragment03Source, /const\s+performSearchAndRenderResults\s*=\s*async\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(fragment03Source, /const\s+showConversationInViewModal\s*=\s*\(convId\)\s*=>\s*\{/);
  assert.doesNotMatch(fragment03Source, /const\s+generateSearchKeywords\s*=\s*async\s*\(naturalQuery\)\s*=>\s*\{/);
  assert.doesNotMatch(fragment03Source, /createUploadedFilePreviewLifecycle\(\{/);
  assert.doesNotMatch(fragment03Source, /function\s+toggleSidebar\(show\)\s*\{/);
  assert.match(lifecycleSource, /const\s+performSearchAndRenderResults\s*=\s*async\s*\(\)\s*=>\s*\{/);
  assert.match(lifecycleSource, /createUploadedFilePreviewLifecycle\(\{/);
  assert.match(lifecycleSource, /function\s+toggleSidebar\(show\)\s*\{/);
  assert.doesNotMatch(lifecycleSource, /legacy-runtime\/fragments|virtual:legacy-app-runtime/);
  assert.match(fragment03Source, /const\s+registerCoreTailDependencies\s*=\s*\(\)\s*=>\s*\{/);
  assert.match(fragment03Source, /legacyRuntimeContext\.registerLazyBinding\(\s*['"]runtime\.coreTailDependencies['"]/);
});

test('batch import voice lifecycle moves batch import and voice ownership out of 03', () => {
  const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const lifecycleSource = readSource('src/app/runtime/legacy-core/batch-import-voice-lifecycle.js');

  assert.equal(existsSync(projectFile('src/app/runtime/legacy-core/batch-import-voice-lifecycle.js')), true);
  assert.match(lifecycleSource, /export\s+function\s+createLegacyBatchImportVoiceLifecycle/);
  assert.match(fragment03Source, /import\s+\{\s*createLegacyBatchImportVoiceLifecycle\s*\}/);
  assert.match(fragment03Source, /const\s+batchImportVoiceLifecycle\s*=\s*createLegacyBatchImportVoiceLifecycle\(\{/);
  assert.match(fragment03Source, /getSelectedConversationIds:\s*\(\)\s*=>\s*state\.selectedConversationIds/);
  assert.match(fragment03Source, /conversationStateAccess:\s*state\.conversationStateAccess/);
  assert.match(fragment03Source, /replaceAllAppData:\s*\(nextAppData\)\s*=>\s*\{/);
  assert.match(fragment03Source, /setCurrentSpeechRecognition:\s*\(nextRecognition\)\s*=>\s*\{/);
  assert.match(fragment03Source, /state\.currentSpeechRecognition\s*=\s*nextRecognition/);
  assert.match(fragment03Source, /setCurrentVoiceTarget:\s*\(nextTarget\)\s*=>\s*\{/);
  assert.match(fragment03Source, /state\.currentVoiceTarget\s*=\s*nextTarget/);
  assert.match(fragment03Source, /handleBatchDelete,\s*handleBatchArchive,\s*handleBatchMove,/);
  assert.match(fragment03Source, /handleExport,\s*performImport,\s*handleImport,/);
  assert.match(fragment03Source, /handleImportOnAuth,\s*processAuthImport,\s*setupVoiceInput,/);
  assert.doesNotMatch(fragment03Source, /const\s+handleBatchDelete\s*=\s*async\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(fragment03Source, /const\s+handleBatchArchive\s*=\s*async\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(fragment03Source, /const\s+setupVoiceInput\s*=\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(fragment03Source, /const\s+toggleVoiceInput\s*=\s*\(target\)\s*=>\s*\{/);
  assert.doesNotMatch(fragment03Source, /createLegacyImportExportLifecycle|createLegacyAuthImportLifecycle/);
  assert.match(lifecycleSource, /const\s+handleBatchDelete\s*=\s*async\s*\(\)\s*=>\s*\{/);
  assert.match(lifecycleSource, /createLegacyImportExportLifecycle\(\{/);
  assert.match(lifecycleSource, /createLegacyAuthImportLifecycle\(\{/);
  assert.match(lifecycleSource, /const\s+setupVoiceInput\s*=\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(lifecycleSource, /legacy-runtime\/fragments|virtual:legacy-app-runtime/);
  assert.match(fragment03Source, /const\s+registerCoreTailDependencies\s*=\s*\(\)\s*=>\s*\{/);
  assert.match(fragment03Source, /legacyRuntimeContext\.registerLazyBinding\(\s*['"]runtime\.coreTailDependencies['"]/);
});

test('batch action bar lifecycle breaks the 02 to 03 renderBatchActionBar continuation boundary', () => {
  const fragment02Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const batchActionBarSource = readSource('src/app/legacy-runtime/features/batch-action-bar-lifecycle.js');

  assert.match(batchActionBarSource, /export\s+function\s+createBatchActionBarLifecycle/);
  assert.match(fragment02Source, /createBatchActionBarLifecycle\(\{/);
  assert.match(fragment02Source, /const\s+renderBatchActionBar\s*=\s*\(\.\.\.args\)\s*=>\s*batchActionBarLifecycle\.renderBatchActionBar\(\.\.\.args\);/);
  assert.doesNotMatch(fragment02Source, /const\s+\{\s*batchActionBar,\s*userControls,\s*selectionCount,\s*batchDeleteBtn,\s*batchArchiveBtn,\s*batchMoveBtn\s*\}\s*=\s*ALL_ELEMENTS;/);
  assert.doesNotMatch(fragment03Source, /^\s*userControls\.classList\.add\('hidden'\);/);

  const renderBatchStart = fragment02Source.indexOf('const renderBatchActionBar =');
  assert.notEqual(renderBatchStart, -1, '02 should still expose a renderBatchActionBar binding');
  const renderBatchStatementEnd = fragment02Source.indexOf(';', renderBatchStart);
  assert.notEqual(renderBatchStatementEnd, -1, 'renderBatchActionBar binding should end inside 02');
  assert.ok(
    renderBatchStatementEnd < fragment02Source.length,
    'renderBatchActionBar binding should not need 03 to finish its statement'
  );
  assert.doesNotMatch(
    fragment02Source.slice(renderBatchStart, renderBatchStatementEnd),
    /=>\s*\{/,
    'renderBatchActionBar should not reopen an inline body in 02'
  );

  const combinedStart = `${fragment02Source}\n`.length;
  const concatenated = `${fragment02Source}\n${fragment03Source}`;
  const nextOpenBrace = concatenated.indexOf('{', renderBatchStart);
  const concatenatedClose = findMatchingBrace(concatenated, nextOpenBrace);
  assert.ok(nextOpenBrace === -1 || concatenatedClose < combinedStart || nextOpenBrace > renderBatchStatementEnd);
});

test('received data lifecycle is fully owned by real P2P and app-bootstrap modules', () => {
  const appBootstrapLifecycleSource = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');
  const p2pLifecycleSource = readSource('src/app/runtime/features/p2p-lifecycle.js');
  const receivedDataSource = readSource('src/app/legacy-runtime/features/received-data-lifecycle.js');

  assert.match(receivedDataSource, /export\s+function\s+createReceivedDataLifecycle/);
  assert.match(p2pLifecycleSource, /createReceivedDataLifecycle\(\{/);
  assert.match(p2pLifecycleSource, /const\s+processReceivedData\s*=\s*\(\.\.\.args\)\s*=>\s*receivedDataLifecycle\.processReceivedData\(\.\.\.args\);/);

  const processStart = appBootstrapLifecycleSource.indexOf('processReceivedData');
  assert.notEqual(processStart, -1, 'app bootstrap lifecycle should expose a processReceivedData binding');
  const processStatementEnd = appBootstrapLifecycleSource.indexOf('} = p2pLifecycle;', processStart);
  assert.notEqual(processStatementEnd, -1, 'processReceivedData binding should end inside app bootstrap lifecycle');
  assert.ok(
    processStatementEnd < appBootstrapLifecycleSource.length,
    'processReceivedData binding should not need 06 to finish its statement'
  );
  assert.doesNotMatch(
    appBootstrapLifecycleSource.slice(processStart, processStatementEnd),
    /=>\s*\{/,
    'processReceivedData should not reopen an inline body in app bootstrap lifecycle'
  );

  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/05-runtime.fragment.js')), false);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/06-runtime.fragment.js')), false);
});

test('app bootstrap composition owns late bootstrap event-binding tail', () => {
  const appBootstrapLifecycleSource = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');
  const p2pLifecycleSource = readSource('src/app/runtime/features/p2p-lifecycle.js');
  const compositionSource = readSource('src/app/legacy-runtime/features/app-bootstrap-composition.js');
  const scannerLifecycleSource = readSource('src/app/legacy-runtime/features/p2p-scanner-lifecycle.js');

  assert.match(compositionSource, /export\s+function\s+createAppBootstrapComposition/);
  assert.match(scannerLifecycleSource, /export\s+function\s+createP2PScannerLifecycle/);
  assert.match(p2pLifecycleSource, /createP2PScannerLifecycle\(\{/);
  assert.match(appBootstrapLifecycleSource, /createAppBootstrapComposition\(\{/);
  assert.match(appBootstrapLifecycleSource, /appBootstrapComposition\.runLateBootstrapBindings\(\);/);

  const initStart = appBootstrapLifecycleSource.indexOf('async function initChatApp()');
  assert.notEqual(initStart, -1, 'app bootstrap lifecycle should define initChatApp');
  const initOpen = appBootstrapLifecycleSource.indexOf('{', initStart);
  const initClose = findMatchingBrace(appBootstrapLifecycleSource, initOpen);
  assert.notEqual(initClose, -1, 'initChatApp should close inside app-bootstrap lifecycle');
  const initBody = appBootstrapLifecycleSource.slice(initStart, initClose);

  assert.match(initBody, /appBootstrapComposition\.runLateBootstrapBindings\(\);/);
  assert.match(p2pLifecycleSource, /p2pScannerLifecycle\.updateP2PProgress\(\.\.\.args\)/);
  assert.match(p2pLifecycleSource, /p2pScannerLifecycle\.startQRScanner\(\.\.\.args\)/);
  assert.match(p2pLifecycleSource, /p2pScannerLifecycle\.stopScannerIfActive\(\)/);
  assert.match(initBody, /startQRScanner:\s*\(\)\s*=>\s*startQRScanner\(\)/);
  assert.doesNotMatch(appBootstrapLifecycleSource, /\bhtml5QrcodeScanner\b/);
  assert.doesNotMatch(initBody, /setupHistorySidebarInteractions\(\);\s*setupHistorySidebarTriggers\(\);/);
  assert.doesNotMatch(initBody, /document\.getElementById\('p2p-start-scan-btn'\)\.addEventListener\('click'/);
});

test('app bootstrap lifecycle and runtime entry own the retired 05 listener shell', () => {
  const lifecycleSource = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');
  const startupLifecycleSource = readSource('src/app/runtime/features/startup-lifecycle.js');
  const runtimeEntrySource = readSource('src/app/runtime-entry.js');
  const dependencySource = readSource('src/app/runtime/runtime-entry-dependencies.js');
  const runtimeAppSource = readSource('src/app/runtime-app.js');
  const mainSource = readSource('src/main.js');
  const legacyEntrySource = readSource('src/app/legacy-app.js');
  const viteSource = readSource('vite.config.js');

  assert.match(lifecycleSource, /export\s+function\s+createLegacyAppBootstrapLifecycle/);
  assert.doesNotMatch(lifecycleSource, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/);
  assert.doesNotMatch(lifecycleSource, /loadConfig|loadAppData|getItem\(|setItem\(/);
  const currentUserAssignments = lifecycleSource.match(/currentUser\s*=/g) ?? [];
  assert.equal(currentUserAssignments.length, 1);
  assert.match(lifecycleSource, /const\s+currentUser\s*=\s*getCurrentUser\(\)/);
  assert.doesNotMatch(lifecycleSource, /function\s+handleLogin|const\s+handleLogin|function\s+handleLogout|const\s+handleLogout/);
  assert.match(lifecycleSource, /async\s+function\s+initChatApp\(\)/);
  assert.match(lifecycleSource, /createAppBootstrapComposition\(\{/);
  assert.match(lifecycleSource, /createLegacyP2PLifecycle\(\{/);

  assert.match(runtimeEntrySource, /createLegacyAppBootstrapLifecycle\(\s*resolvedDependencies\.appBootstrap\s*\)/);
  assert.match(runtimeEntrySource, /registerBinding\(\s*'app\.initChatApp'/);
  for (const field of [
    'getCurrentUser',
    'getConfig',
    'getConversations',
    'setSidebarOpen',
    'setSendConfirmed',
    'getAbortController'
  ]) {
    assert.match(dependencySource, new RegExp(`'${field}'`));
  }

  assert.match(startupLifecycleSource, /\binitChatApp\(\);/);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/05-runtime.fragment.js')), false);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/06-runtime.fragment.js')), false);
  assert.match(runtimeAppSource, /export\s+function\s+createRuntimeAppKernel/);
  assert.match(mainSource, /await\s+import\(['"]\.\/app\/legacy-app\.js['"]\)/);
  assert.match(legacyEntrySource, /from\s+['"]\.\/runtime-entry\.js['"]/);
  assert.doesNotMatch(legacyEntrySource, /virtual:legacy-app-runtime/);
  assert.doesNotMatch(viteSource, /legacyRuntimeModuleId|virtual:legacy-app-runtime/);
});

test('startup lifecycle and runtime entry own the retired 06 startup shell', () => {
  const lifecyclePath = 'src/app/runtime/features/startup-lifecycle.js';
  const lifecycleSource = readSource(lifecyclePath);
  const fragment01Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const runtimeEntrySource = readSource('src/app/runtime-entry.js');
  const runtimeAppSource = readSource('src/app/runtime-app.js');
  const mainSource = readSource('src/main.js');
  const legacyEntrySource = readSource('src/app/legacy-app.js');
  const viteSource = readSource('vite.config.js');

  assert.equal(existsSync(projectFile(lifecyclePath)), true);
  assert.match(lifecycleSource, /export\s+function\s+createLegacyStartupLifecycle/);
  assert.doesNotMatch(lifecycleSource, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/);
  assert.doesNotMatch(lifecycleSource, /legacyRuntimeContext|indexedDB|createLegacyRuntimeStorageAdapter/);
  assert.doesNotMatch(lifecycleSource, /function\s+handleLogin|function\s+handleImportOnAuth|function\s+processAuthImport/);
  assert.match(lifecycleSource, /function\s+bindAuthStartupListeners\(\)/);
  assert.match(lifecycleSource, /async\s+function\s+initializeApp\(\)/);
  assert.match(lifecycleSource, /function\s+bindLoginLanguageSwitcher\(\)/);
  assert.match(lifecycleSource, /function\s+adjustTextareaHeight\(\)/);
  assert.match(lifecycleSource, /function\s+runStartupPostlude\(\)/);

  assert.match(runtimeEntrySource, /createLegacyStartupLifecycle\(\{/);
  assert.match(runtimeEntrySource, /initChatApp:\s*appBootstrapLifecycle\.initChatApp/);
  assertMarkersInOrder(runtimeEntrySource, [
    'registerBindings()',
    'startupLifecycle.bindAuthStartupListeners()',
    'startupLifecycle.initializeApp()',
    'startupLifecycle.bindLoginLanguageSwitcher()',
    'startupLifecycle.runStartupPostlude()'
  ], 'runtime entry startup wiring');

  assert.match(
    fragment01Source,
    /registerLazyBinding\('submit\.adjustTextareaHeight',\s*\(\)\s*=>\s*\{[\s\S]*resolveRuntimeEntryAdjustTextareaHeight\(\)[\s\S]*return\s+adjustTextareaHeightAlias;[\s\S]*\}\)/
  );
  assert.doesNotMatch(fragment01Source, /return\s+adjustTextareaHeight;/);
  assert.match(runtimeEntrySource, /runtimeEntry\.submit\.adjustTextareaHeight/);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/05-runtime.fragment.js')), false);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/06-runtime.fragment.js')), false);

  assert.doesNotMatch(runtimeAppSource, /startup-lifecycle|initializeApp/);
  assert.match(mainSource, /await\s+import\(['"]\.\/app\/legacy-app\.js['"]\)/);
  assert.match(legacyEntrySource, /from\s+['"]\.\/runtime-entry\.js['"]/);
  assert.doesNotMatch(legacyEntrySource, /virtual:legacy-app-runtime/);
  assert.doesNotMatch(viteSource, /legacyRuntimeModuleId|virtual:legacy-app-runtime/);
});

test('P2P lifecycle owns Peer, QR, scanner, and transfer implementation after 05 retirement', () => {
  const lifecycleSource = readSource('src/app/runtime/features/p2p-lifecycle.js');
  const appBootstrapLifecycleSource = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');
  const dependencySource = readSource('src/app/runtime/runtime-entry-dependencies.js');

  assert.match(lifecycleSource, /export\s+function\s+createLegacyP2PLifecycle/);
  assert.match(lifecycleSource, /createReceivedDataLifecycle\(\{/);
  assert.match(lifecycleSource, /createP2PScannerLifecycle\(\{/);
  assert.doesNotMatch(
    lifecycleSource,
    /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app|storage-adapter|indexedDB|localStorage|sessionStorage|currentUser|initializeApp|initChatApp/
  );

  assert.match(appBootstrapLifecycleSource, /const\s+p2pLifecycle\s*=\s*createLegacyP2PLifecycle\(\{/);
  for (const field of [
    'getAstras',
    'getFolders',
    'getConversations',
    'Peer',
    'QRCode',
    'Html5Qrcode',
    'JSZip',
    'BlobCtor',
    'randomUUID',
    'random',
    'scheduleTimeout'
  ]) {
    assert.match(dependencySource, new RegExp(`'${field}'`));
  }

  for (const alias of [
    'initP2P',
    'resetP2PUI',
    'setP2PMode',
    'showP2PSelection',
    'startP2PReceiverUI',
    'startP2PSender',
    'connectToSender',
    'startQRScanner',
    'processReceivedData',
    'updateP2PProgress'
  ]) {
    assert.match(appBootstrapLifecycleSource, new RegExp(`\\b${alias}\\b`), `app bootstrap lifecycle should keep ${alias} binding`);
  }

  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/05-runtime.fragment.js')), false);
});

test('store navigation lifecycle owns only the selected bootstrap listeners', () => {
  const appBootstrapLifecycleSource = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');
  const lifecycleSource = readSource('src/app/legacy-runtime/features/store-navigation-lifecycle.js');
  const initStart = appBootstrapLifecycleSource.indexOf('async function initChatApp()');
  assert.notEqual(initStart, -1, 'app bootstrap lifecycle should define initChatApp');
  const initOpen = appBootstrapLifecycleSource.indexOf('{', initStart);
  const initClose = findMatchingBrace(appBootstrapLifecycleSource, initOpen);
  assert.notEqual(initClose, -1, 'initChatApp should close inside app-bootstrap lifecycle');
  const initBody = appBootstrapLifecycleSource.slice(initStart, initClose);

  assert.match(lifecycleSource, /export\s+function\s+createStoreNavigationLifecycle/);
  assert.match(
    appBootstrapLifecycleSource,
    /import\s*\{\s*createStoreNavigationLifecycle\s*\}\s*from\s+['"]\.\.\/\.\.\/legacy-runtime\/features\/store-navigation-lifecycle\.js['"]/
  );
  assert.doesNotMatch(initBody, /ALL_ELEMENTS\.openStoreBtn\.addEventListener\('click',\s*openStore\)/);
  assert.doesNotMatch(initBody, /ALL_ELEMENTS\.backToChatBtn\.addEventListener\('click',\s*closeStore\)/);
  assert.match(initBody, /getOpenStoreButton:\s*\(\)\s*=>\s*ALL_ELEMENTS\.openStoreBtn/);
  assert.match(initBody, /getBackToChatButton:\s*\(\)\s*=>\s*ALL_ELEMENTS\.backToChatBtn/);
  assert.match(initBody, /openStore,\s*closeStore\s*\}\);\s*storeNavigationLifecycle\.bind\(\);/);
  assert.match(
    initBody,
    /ALL_ELEMENTS\.uiLanguageSelect\.addEventListener\('change',[\s\S]*?storeNavigationLifecycle\.bind\(\);[\s\S]*?ALL_ELEMENTS\.astrasAvatarInput\.addEventListener\('change',\s*handleAvatarUpload\)/
  );
  assert.match(initBody, /ALL_ELEMENTS\.settingsBtn\.addEventListener\('click'/);
  assert.match(initBody, /ALL_ELEMENTS\.messageInput\.addEventListener\('keydown'/);
  assert.match(initBody, /ALL_ELEMENTS\.importDataBtn\.addEventListener\('click'/);
  assert.match(initBody, /appBootstrapComposition\.runLateBootstrapBindings\(\);/);
});

test('auth and homepage import bindings remain before startup in legacy order', () => {
  const runtimeEntrySource = readSource('src/app/runtime-entry.js');
  const startupLifecycleSource = readSource('src/app/runtime/features/startup-lifecycle.js');
  const initializeAppBody = getBlockFromMarker(startupLifecycleSource, 'async function initializeApp()');

  assertMarkersInOrder(startupLifecycleSource, [
    "elements.authForm.addEventListener('submit', handleLogin)",
    "elements.usernameInput.addEventListener('input', toggleAuthImportButton)",
    "elements.passwordInput.addEventListener('input', toggleAuthImportButton)",
    "elements.importBtnAuth.addEventListener('click', handleImportOnAuth)",
    "elements.confirmImportBtnAuth.addEventListener('click', processAuthImport)",
    "elements.cancelImportBtnAuth.addEventListener('click'",
    'async function initializeApp()'
  ], 'startup auth bootstrap');

  assertMarkersInOrder(initializeAppBody, [
    'await loadConfig()',
    'await loadAppData()',
    'applyCustomWallpaper()',
    'applyUiTheme()',
    "elements.authContainer.style.display = 'none'",
    "elements.appContainer.classList.remove('hidden')",
    "elements.appContainer.classList.add('visible')",
    'initChatApp()'
  ], 'auto-login startup');
  assertMarkersInOrder(runtimeEntrySource, [
    'startupLifecycle.bindAuthStartupListeners()',
    'startupLifecycle.initializeApp()',
    'startupLifecycle.bindLoginLanguageSwitcher()',
    'startupLifecycle.runStartupPostlude()'
  ], 'runtime entry startup lifecycle wiring');
});

test('input submit bindings and late P2P composition preserve bootstrap order', () => {
  const appBootstrapLifecycleSource = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');
  const initStart = appBootstrapLifecycleSource.indexOf('async function initChatApp()');
  assert.notEqual(initStart, -1, 'app bootstrap lifecycle should define initChatApp');
  const initOpen = appBootstrapLifecycleSource.indexOf('{', initStart);
  const initClose = findMatchingBrace(appBootstrapLifecycleSource, initOpen);
  assert.notEqual(initClose, -1, 'initChatApp should close inside 05');
  const initBody = appBootstrapLifecycleSource.slice(initStart, initClose);

  assertMarkersInOrder(initBody, [
    "ALL_ELEMENTS.messageInput.addEventListener('input', (e) =>",
    "ALL_ELEMENTS.messageInput.addEventListener('input', adjustTextareaHeight)",
    "ALL_ELEMENTS.messageInput.addEventListener('keydown'",
    "ALL_ELEMENTS.messageInput.addEventListener('focus', handleInputFocus)",
    "ALL_ELEMENTS.messageInput.addEventListener('input', () =>",
    "ALL_ELEMENTS.submitButton.addEventListener('click'",
    "ALL_ELEMENTS.chatForm.addEventListener('submit', handleFormSubmit)"
  ], '05 input and submit bootstrap');

  assertMarkersInOrder(initBody, [
    'storeNavigationLifecycle.bind()',
    "ALL_ELEMENTS.addFileBtn.addEventListener('click'",
    'const p2pLifecycle = createLegacyP2PLifecycle({',
    'const appBootstrapComposition = createAppBootstrapComposition({',
    'appBootstrapComposition.runLateBootstrapBindings()'
  ], '05 normal listeners and late P2P composition');
});

test('runtime core dependencies preserve their backing-state creation order', () => {
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');

  assertMarkersInOrder(fragment00Source, [
    'const legacyRuntimeContext = createLegacyRuntimeContext()',
    'const ALL_ELEMENTS = createLegacyRuntimeDomRegistry()',
    'const runtimeDomAccess = createRuntimeDomAccess({',
    'const runtimeAppKernel = createRuntimeAppKernel({',
    'elements: ALL_ELEMENTS',
    'defaultModelId: MODELS[0].id',
    'const runtimeAppDataStore = runtimeAppKernel.appDataStore',
    'let conversations = runtimeAppDataStore.getConversations()',
    'const liveConversationsBridge = createLiveConversationsBridge({',
    'const activeConversationStore = createActiveConversationStore(null)',
    'const conversationStateAccess = createConversationStateAccess({',
    'const runtimeConfigStore = runtimeAppKernel.configStore',
    'const runtimeConfigAccess = createRuntimeConfigAccess({',
    'const showNotification =',
    'const runtimeDialogCoordinator = createRuntimeDialogCoordinator({',
    'createArchivedMediaAttachmentRenderer({ escapeHTML })',
    'createArchivedMediaPreviewLifecycle({',
    'createArchivedConversationViewRenderer({',
    'const runtimeRenderCoordinator = createRuntimeRenderCoordinator({',
    'const sidebarAstrasLifecycle = createSidebarAstrasLifecycle({'
  ], '00 runtime core composition');

  assert.match(fragment00Source, /getElements:\s*\(\)\s*=>\s*ALL_ELEMENTS/);
  assert.match(fragment00Source, /getConversations:\s*\(\)\s*=>\s*liveConversationsBridge\.getConversations\(\)/);
  assert.match(fragment00Source, /getCurrentConversationId:\s*\(\)\s*=>\s*activeConversationStore\.getActiveConversationId\(\)/);
  assert.doesNotMatch(fragment00Source, /let\s+activeConversationId\s*=/);
  assert.match(fragment00Source, /getConfig:\s*\(\)\s*=>\s*runtimeConfigStore\.getConfig\(\)/);
  assert.match(fragment00Source, /showNotification:\s*\(\.\.\.args\)\s*=>\s*showNotification\(\.\.\.args\)/);
  assert.match(fragment00Source, /renderHistorySidebar:\s*\(\)\s*=>\s*renderHistorySidebar\(\)/);
  assert.match(fragment00Source, /const\s+renderAll\s*=\s*\(\.\.\.args\)\s*=>\s*runtimeRenderCoordinator\.renderAll\(\.\.\.args\);/);
});

test('legacy IndexedDB ownership moves into a narrow storage adapter', () => {
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment02Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const settingsAuthProviderSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const runtimeAppSource = readSource('src/app/runtime-app.js');
  const storageAdapterSource = readSource('src/app/runtime/kernel/storage-adapter.js');
  const configPersistenceSource = readSource('src/app/runtime/kernel/config-persistence.js');
  const appDataPersistenceSource = readSource('src/app/runtime/kernel/app-data-persistence.js');

  assert.equal(
    existsSync(projectFile('src/app/runtime/kernel/storage-adapter.js')),
    true,
    'storage adapter should exist after the extraction slice'
  );
  assert.match(storageAdapterSource, /export\s+function\s+createLegacyRuntimeStorageAdapter/);
  assert.match(storageAdapterSource, /dbName\s*=\s*['"]ChatAppDB['"]/);
  assert.match(storageAdapterSource, /storeName\s*=\s*['"]keyValue['"]/);
  assert.match(storageAdapterSource, /version\s*=\s*1/);
  assert.match(storageAdapterSource, /createObjectStore\(storeName,\s*\{\s*keyPath:\s*['"]key['"]\s*\}\)/);
  assert.match(storageAdapterSource, /return\s*\{\s*openDB,\s*getItem,\s*setItem,\s*removeItem,\s*clear\s*\}/);
  assert.doesNotMatch(storageAdapterSource, /objectStoreNames\.contains/);
  assert.match(fragment00Source, /import\s+\{\s*createLegacyRuntimeStorageAdapter\s*\}/);
  assertMarkersInOrder(fragment00Source, [
    'const runtimeStorageAdapter = createLegacyRuntimeStorageAdapter({',
    'indexedDBFactory: indexedDB',
    "dbName: 'ChatAppDB'",
    "storeName: 'keyValue'",
    'version: 1',
    'const { getItem, setItem, removeItem } = runtimeStorageAdapter'
  ], '00 storage adapter wiring');
  assert.doesNotMatch(fragment00Source, /const\s+(?:DB_NAME|STORE_NAME)\b|async\s+function\s+(?:openDB|getItem|setItem|removeItem)/);
  assert.match(fragment00Source, /const\s+getConfigKey\s*=/);
  assert.match(fragment00Source, /const\s+getAppDataKey\s*=/);
  assert.match(fragment00Source, /const\s+loadConfig\s*=/);
  assert.match(fragment00Source, /const\s+loadAppData\s*=/);
  assert.match(settingsAuthProviderSource, /await\s+runtimeStorageAdapter\.clear\(\)/);
  assert.match(fragment02Source, /runtimeStorageAdapter,/);
  assert.doesNotMatch(fragment02Source, /\bSTORE_NAME\b|\bopenDB\(\)|store\.clear\(\)/);
  assert.doesNotMatch(settingsAuthProviderSource, /\bSTORE_NAME\b|\bopenDB\(\)|store\.clear\(\)/);
  assert.doesNotMatch(runtimeAppSource, /storage-adapter|indexedDB|openDB|getItem|setItem|removeItem/);
  assert.doesNotMatch(configPersistenceSource, /storage-adapter|indexedDB|openDB|getItem|removeItem/);
  assert.doesNotMatch(appDataPersistenceSource, /storage-adapter|indexedDB|openDB|getItem|removeItem/);
});

test('runtime lazy registrations and composition handoffs preserve legacy order', () => {
  const fragment01Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment02Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const submitInputCouncilSource = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const settingsAuthProviderSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const appBootstrapLifecycleSource = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');
  const startupLifecycleSource = readSource('src/app/runtime/features/startup-lifecycle.js');
  const runtimeEntrySource = readSource('src/app/runtime-entry.js');
  const initializeAppBody = getBlockFromMarker(startupLifecycleSource, 'async function initializeApp()');

  assertMarkersInOrder(fragment01Source, [
    'const submitInputCouncilLifecycle = createLegacySubmitInputCouncilLifecycle({',
    "legacyRuntimeContext.registerLazyBinding('submit.updateSubmitButtonState'",
    "legacyRuntimeContext.registerLazyBinding('submit.generateTitleAndSummary'",
    "legacyRuntimeContext.registerLazyBinding('submit.shouldPerformWebSearch'",
    "legacyRuntimeContext.registerLazyBinding('submit.adjustTextareaHeight'",
    "legacyRuntimeContext.registerLazyBinding('submit.renderFilePreviews'"
  ], '01 submit runtime registration');

  assertMarkersInOrder(submitInputCouncilSource, [
    'const submitInputPreparationLifecycle = createSubmitInputPreparationLifecycle({',
    'const handleFormSubmit = async'
  ], 'submit input council lifecycle submit runtime wiring');

  assertMarkersInOrder(settingsAuthProviderSource, [
    'const updateInputState = () =>',
    'const setupSettingsModal = () =>',
    'const saveSettings = async'
  ], 'settings auth provider lifecycle registration bodies');

  assertMarkersInOrder(fragment02Source, [
    'const settingsAuthProviderLifecycle = createLegacySettingsAuthProviderLifecycle({',
    'updateInputState',
    'setupSettingsModal',
    "legacyRuntimeContext.registerLazyBinding('settings.setupSettingsModal'",
    "legacyRuntimeContext.registerLazyBinding('input.updateInputState'",
    'const {',
    'createNewFolder'
  ], '02 settings and input runtime registration');

  assert.match(runtimeEntrySource, /const\s+appBootstrapLifecycle\s*=\s*createLegacyAppBootstrapLifecycle\(/);
  assert.match(runtimeEntrySource, /const\s+startupLifecycle\s*=\s*createLegacyStartupLifecycle\(\{/);
  assertMarkersInOrder(appBootstrapLifecycleSource, [
    'storeNavigationLifecycle.bind()',
    'const p2pLifecycle = createLegacyP2PLifecycle({',
    'const appBootstrapComposition = createAppBootstrapComposition({',
    'appBootstrapComposition.runLateBootstrapBindings()'
  ], 'app bootstrap lifecycle composition tail');

  assertMarkersInOrder(initializeAppBody, [
    'await loadConfig()',
    'await loadAppData()',
    'applyCustomWallpaper()',
    'applyUiTheme()',
    "elements.appContainer.classList.remove('hidden')",
    "elements.appContainer.classList.add('visible')",
    'initChatApp()'
  ], 'startup lifecycle handoff');

  assert.equal(
    existsSync(projectFile('src/app/legacy-runtime/runtime/runtime-app-composition.js')),
    false,
    'runtime-app-composition production boundary should not exist before its implementation slice'
  );
});

test('initChatApp callers use the required runtime handoff without changing legacy order', () => {
  const fragment02Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const settingsAuthProviderSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const appBootstrapLifecycleSource = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');
  const startupLifecycleSource = readSource('src/app/runtime/features/startup-lifecycle.js');
  const runtimeEntrySource = readSource('src/app/runtime-entry.js');
  const authImportSource = readSource('src/app/runtime/features/auth-import-lifecycle.js');
  const batchImportVoiceSource = readSource('src/app/runtime/legacy-core/batch-import-voice-lifecycle.js');
  const handleLoginBody = getConstFunctionBody(settingsAuthProviderSource, 'handleLogin');
  const processAuthImportBody = getFunctionDeclarationBody(authImportSource, 'processAuthImport');
  const initializeAppBody = getBlockFromMarker(startupLifecycleSource, 'async function initializeApp()');
  const requiredHandoff = "legacyRuntimeContext.resolveBinding('app.initChatApp')()";

  const initStart = appBootstrapLifecycleSource.indexOf('async function initChatApp()');
  assert.notEqual(initStart, -1, 'app bootstrap lifecycle should keep the initChatApp declaration');
  const initOpen = appBootstrapLifecycleSource.indexOf('{', initStart);
  const initClose = findMatchingBrace(appBootstrapLifecycleSource, initOpen);
  assert.notEqual(initClose, -1, 'initChatApp should close inside app bootstrap lifecycle');
  assert.match(runtimeEntrySource, /registerBinding\(\s*'app\.initChatApp',\s*appBootstrapLifecycle\.initChatApp/);

  for (const [source, label] of [
    [fragment02Source, '02'],
    [settingsAuthProviderSource, 'settings/auth/provider lifecycle'],
    [fragment03Source, '03']
  ]) {
    assert.doesNotMatch(source, /(^|[^\w.])initChatApp\(\)/, `${label} should not directly call initChatApp`);
    assert.doesNotMatch(
      source,
      /resolveOptionalBinding\('app\.initChatApp'/,
      `${label} should use the required initChatApp handoff`
    );
  }

  assert.equal((handleLoginBody.match(/resolveBinding\('app\.initChatApp'\)\(\)/g) || []).length, 1);
  assert.doesNotMatch(handleLoginBody, /await\s+legacyRuntimeContext\.resolveBinding\('app\.initChatApp'\)/);
  assert.equal((initializeAppBody.match(/\binitChatApp\(\)/g) || []).length, 1);
  assert.doesNotMatch(startupLifecycleSource, /legacyRuntimeContext/);
  assert.equal((fragment03Source.match(/resolveBinding\('app\.initChatApp'\)\(\)/g) || []).length, 0, '03 should inject runtime context without owning the auth import handoff');
  assert.equal((batchImportVoiceSource.match(/resolveBinding\('app\.initChatApp'\)\(\)/g) || []).length, 1, 'batch/import/voice lifecycle should resolve the auth import handoff once');
  assert.equal((processAuthImportBody.match(/\binitChatApp\(\)/g) || []).length, 1, 'auth import lifecycle should invoke the injected handoff once');

  assertMarkersInOrder(handleLoginBody, [
    "await setItem('chat_lastUser', username)",
    "ALL_ELEMENTS.authContainer.classList.add('fade-out')",
    "ALL_ELEMENTS.appContainer.classList.remove('hidden')",
    'requestAnimationFrame(() =>',
    "ALL_ELEMENTS.authContainer.addEventListener('transitionend'",
    requiredHandoff
  ], '02 login initChatApp handoff');

  assertMarkersInOrder(processAuthImportBody, [
    'await saveAppData()',
    'Object.assign(config, rawData.settings)',
    'await saveConfig()',
    'toggleModal(elements.importDataModalAuth, false)',
    "elements.authContainer.addEventListener('transitionend'",
    'scheduleTimeout(hideAuthContainer, 500)',
    'initChatApp()',
    "showNotification(text('importSuccess'"
  ], 'auth import lifecycle initChatApp handoff');

  assertMarkersInOrder(initializeAppBody, [
    'await loadConfig()',
    'await loadAppData()',
    'applyCustomWallpaper()',
    'applyUiTheme()',
    "elements.authContainer.style.display = 'none'",
    "elements.appContainer.classList.remove('hidden')",
    "elements.appContainer.classList.add('visible')",
    'initChatApp()',
    'return'
  ], 'startup lifecycle initChatApp handoff');
});

test('loadChat resolves updateFunctionButtonsState through the required runtime handoff', () => {
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const submitInputCouncilSource = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const dependencySource = readSource('src/app/runtime/runtime-entry-dependencies.js');
  const appBootstrapLifecycleSource = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');
  const loadChatBody = getConstFunctionBody(fragment00Source, 'loadChat');
  const toggleLearningModeBody = getConstFunctionBody(submitInputCouncilSource, 'toggleLearningMode');
  const functionStart = submitInputCouncilSource.indexOf('const updateFunctionButtonsState =');
  const functionOpenBrace = submitInputCouncilSource.indexOf('{', functionStart);
  const functionCloseBrace = findMatchingBrace(submitInputCouncilSource, functionOpenBrace);
  const registrationMarker =
    "legacyRuntimeContext.registerLazyBinding('input.updateFunctionButtonsState', () => updateFunctionButtonsState)";
  const registrationIndex = fragment01Source.indexOf(registrationMarker);

  assert.notEqual(functionStart, -1, 'submit/input/council lifecycle should declare updateFunctionButtonsState');
  assert.ok(registrationIndex > fragment01Source.indexOf('} = submitInputCouncilLifecycle'), '01 should register the handoff after lifecycle aliases are created');
  assert.match(
    loadChatBody,
    /legacyRuntimeContext\.resolveBinding\('input\.updateFunctionButtonsState'\)\(\);/,
    '00 loadChat should use the required runtime handoff'
  );
  assert.doesNotMatch(
    loadChatBody,
    /(^|[^\w.])updateFunctionButtonsState\(\)/,
    '00 loadChat should not directly call the later-fragment function'
  );
  assert.doesNotMatch(
    loadChatBody,
    /resolveOptionalBinding\('input\.updateFunctionButtonsState'\)/,
    '00 loadChat should not silently skip a missing required binding'
  );
  assert.doesNotMatch(
    loadChatBody,
    /await\s+legacyRuntimeContext\.resolveBinding\('input\.updateFunctionButtonsState'\)/,
    '00 loadChat should preserve the synchronous handoff'
  );
  assertMarkersInOrder(
    loadChatBody,
    [
      'renderAll()',
      "ALL_ELEMENTS.messageInput.value = conv ? conv.unsentMessage || '' : ''",
      'setTimeout(adjustTextareaHeightAlias, 0)',
      'resolveFoundationUpdateInputState()',
      'updateApiKeyWarningBadge()',
      "legacyRuntimeContext.resolveBinding('input.updateFunctionButtonsState')()"
    ],
    '00 loadChat function-button handoff'
  );
  assert.match(
    toggleLearningModeBody,
    /updateFunctionButtonsState\(\)/,
    '01 owner-local updateFunctionButtonsState call should remain direct'
  );
  assert.match(
    appBootstrapLifecycleSource,
    /updateFunctionButtonsState\(\)/,
    'app bootstrap lifecycle updateFunctionButtonsState calls should remain direct'
  );
  assert.match(dependencySource, /'updateFunctionButtonsState'/);
});

test('selected toggleSidebar callers use the required runtime handoff without changing sidebar behavior', () => {
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment02Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const searchUploadSidebarSource = readSource('src/app/runtime/legacy-core/search-upload-sidebar-lifecycle.js');
  const sidebarChatAstraRenderSource = readSource('src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js');
  const dependencySource = readSource('src/app/runtime/runtime-entry-dependencies.js');
  const appBootstrapLifecycleSource = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');
  const startNewChatBody = getConstFunctionBody(fragment00Source, 'startNewChat');
  const createConversationElementBody = getConstFunctionBody(sidebarChatAstraRenderSource, 'createConversationElement');
  const toggleStart = searchUploadSidebarSource.indexOf('function toggleSidebar(show)');
  const registrationMarker =
    "legacyRuntimeContext.registerLazyBinding('sidebar.toggleSidebar', () => toggleSidebar)";
  const registrationIndex = fragment03Source.indexOf(registrationMarker);

  assert.notEqual(toggleStart, -1, 'search/upload/sidebar lifecycle should own the toggleSidebar declaration');
  assert.match(fragment03Source, /toggleSidebar\s*\n\s*\}\s*=\s*searchUploadSidebarLifecycle;/);
  assert.notEqual(registrationIndex, -1, 'transition bus should keep the sidebar.toggleSidebar binding');
  assert.match(fragment03Source, /const\s+registerSidebarBindings\s*=\s*\(\)\s*=>\s*\{/);
  assert.match(fragment02Source, /transitionBusLifecycle\.registerSidebarBindings\(\);/);
  assert.match(
    startNewChatBody,
    /legacyRuntimeContext\.resolveBinding\('sidebar\.toggleSidebar'\)\(false\);/,
    '00 startNewChat should use the required sidebar handoff'
  );
  assert.doesNotMatch(
    startNewChatBody,
    /(^|[^\w.])toggleSidebar\(false\)/,
    '00 startNewChat should not directly call the later-fragment function'
  );
  assertMarkersInOrder(
    startNewChatBody,
    [
      'renderAll()',
      "ALL_ELEMENTS.messageInput.value = ''",
      'setTimeout(adjustTextareaHeightAlias, 0)',
      "legacyRuntimeContext.resolveBinding('sidebar.toggleSidebar')(false)",
      'resolveFoundationUpdateInputState()',
      'updateApiKeyWarningBadge()'
    ],
    '00 startNewChat sidebar handoff'
  );
  assert.match(
    fragment00Source,
    /toggleSidebar:\s*\(\.\.\.args\)\s*=>\s*legacyRuntimeContext\.resolveBinding\('sidebar\.toggleSidebar'\)\(\.\.\.args\)/,
    'sidebar Astras lifecycle should resolve toggleSidebar lazily inside its callback'
  );
  assert.match(
    createConversationElementBody,
    /loadChat\(conv\.id\);\s*legacyRuntimeContext\.resolveBinding\('sidebar\.toggleSidebar'\)\(false\);/,
    '01 conversation click should preserve loadChat before the sidebar handoff'
  );
  assert.doesNotMatch(
    createConversationElementBody,
    /(^|[^\w.])toggleSidebar\(false\)/,
    '01 createConversationElement should not directly call the later-fragment function'
  );

  for (const [source, label] of [
    [startNewChatBody, '00 startNewChat'],
    [createConversationElementBody, '01 createConversationElement'],
    [fragment00Source.match(/toggleSidebar:\s*\(\.\.\.args\)[\s\S]*?createAstrasMenu:/)?.[0] || '', '00 sidebar Astras callback']
  ]) {
    assert.doesNotMatch(source, /resolveOptionalBinding\('sidebar\.toggleSidebar'/, `${label} should use the required resolver`);
    assert.doesNotMatch(source, /await\s+legacyRuntimeContext\.resolveBinding\('sidebar\.toggleSidebar'/, `${label} should remain synchronous`);
  }

  assert.match(searchUploadSidebarSource.slice(0, toggleStart), /toggleSidebar\(false\)/, 'search owner-local call should remain direct');
  assert.match(appBootstrapLifecycleSource, /toggleSidebar\(\)/, 'app bootstrap lifecycle toggle call should remain direct');
  assert.match(appBootstrapLifecycleSource, /toggleSidebar\(false\)/, 'app bootstrap lifecycle close calls should remain direct');
  assert.match(dependencySource, /'toggleSidebar'/);
});

test('runtime render coordinator owns renderAll order and selected Astras refresh call sites', () => {
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment02Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const sidebarChatAstraRenderSource = readSource('src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js');
  const folderLifecycleSource = readSource('src/app/runtime/features/folder-lifecycle.js');
  const coordinatorSource = readSource('src/app/legacy-runtime/runtime/runtime-render-coordinator.js');
  const setAstrasBody = getConstFunctionBody(sidebarChatAstraRenderSource, 'setAstrasForConversation');
  const deactivateAstrasBody = getConstFunctionBody(sidebarChatAstraRenderSource, 'deactivateAstras');
  const deleteAstrasBody = getConstFunctionBody(sidebarChatAstraRenderSource, 'deleteAstras');
  const deleteChatBody = getConstFunctionBody(fragment00Source, 'deleteChat');
  const archiveChatBody = getConstFunctionBody(fragment00Source, 'archiveChat');
  const unarchiveChatBody = getConstFunctionBody(fragment00Source, 'unarchiveChat');
  const togglePinChatBody = getConstFunctionBody(fragment00Source, 'togglePinChat');
  const handleRenameBody = getConstFunctionBody(fragment00Source, 'handleRename');
  const moveConversationToFolderBody = getConstFunctionBody(folderLifecycleSource, 'moveConversationToFolder');
  const deleteFolderBody = getConstFunctionBody(folderLifecycleSource, 'deleteFolder');

  assert.match(coordinatorSource, /export\s+function\s+createRuntimeRenderCoordinator/);
  assert.match(fragment00Source, /import\s+\{\s*createRuntimeRenderCoordinator\s*\}/);
  assert.equal((fragment00Source.match(/createRuntimeRenderCoordinator\(\{/g) || []).length, 1);
  assert.match(fragment00Source, /const\s+runtimeRenderCoordinator\s*=\s*createRuntimeRenderCoordinator\(\{/);
  assert.match(fragment00Source, /renderHistorySidebar:\s*\(\)\s*=>\s*renderHistorySidebar\(\)/);
  assert.match(fragment00Source, /renderFolders:\s*\(\)\s*=>\s*renderFolders\(\)/);
  assert.match(fragment00Source, /renderAstras:\s*\(\)\s*=>\s*renderAstras\(\)/);
  assert.match(fragment00Source, /renderChat:\s*\(\)\s*=>\s*renderChat\(\)/);
  assert.match(fragment00Source, /renderArchivedChats:\s*\(\)\s*=>\s*renderArchivedChats\(\)/);
  assert.match(fragment00Source, /renderBatchActionBar:\s*\(\)\s*=>\s*renderBatchActionBar\(\)/);
  assert.match(fragment00Source, /renderFilePreviews:\s*\(\)\s*=>\s*renderFilePreviews\(\)/);
  assert.match(fragment00Source, /applyLanguage:\s*\(\)\s*=>\s*applyLanguage\(runtimeConfigAccess\.getUiLanguage\(\)\)/);
  assert.match(fragment00Source, /const\s+renderAll\s*=\s*\(\.\.\.args\)\s*=>\s*runtimeRenderCoordinator\.renderAll\(\.\.\.args\);/);

  for (const body of [setAstrasBody, deactivateAstrasBody, deleteAstrasBody]) {
    assert.match(body, /runtimeRenderCoordinator\.renderAll\(\)/);
    assert.doesNotMatch(body, /(^|[^\w.])renderAll\(\)/);
  }

  for (const body of [deleteChatBody, archiveChatBody, unarchiveChatBody, togglePinChatBody, handleRenameBody]) {
    assert.match(body, /runtimeRenderCoordinator\.renderAll\(\)/);
    assert.doesNotMatch(body, /(^|[^\w.])renderAll\(\)/);
  }

  assert.match(handleRenameBody, /await\s+saveAppData\(\);\s*runtimeRenderCoordinator\.renderAll\(\);\s*toggleModal\(ALL_ELEMENTS\.renameModal,\s*false\);\s*itemToRename\s*=\s*\{\s*id:\s*null,\s*type:\s*null\s*\};/);

  for (const body of [moveConversationToFolderBody, deleteFolderBody]) {
    assert.match(body, /renderAll\(\)/);
    assert.doesNotMatch(body, /runtimeRenderCoordinator/);
  }

  assert.match(deleteFolderBody, /await\s+saveAppData\(\);\s*renderAll\(\);\s*showNotification\(getTexts\(\)\.folderDeleted,\s*'success'\);/);
  assert.match(fragment02Source, /renderAll,/);
});

test('runtime dialog coordinator owns selected notification call sites without replacing modal helpers', () => {
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const sidebarChatAstraRenderSource = readSource('src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js');
  const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const batchImportVoiceSource = readSource('src/app/runtime/legacy-core/batch-import-voice-lifecycle.js');
  const modelMemoryDashboardSource = readSource('src/app/runtime/legacy-core/model-memory-dashboard-lifecycle.js');
  const coreTailSource = readSource('src/app/runtime/legacy-core/core-tail-lifecycle.js');
  const trashLifecycleSource = readSource('src/app/runtime/features/trash-lifecycle.js');
  const coordinatorSource = readSource('src/app/legacy-runtime/runtime/runtime-dialog-coordinator.js');
  const deleteChatBody = getConstFunctionBody(fragment00Source, 'deleteChat');
  const deactivateAstrasBody = getConstFunctionBody(sidebarChatAstraRenderSource, 'deactivateAstras');
  const deleteAstrasBody = getConstFunctionBody(sidebarChatAstraRenderSource, 'deleteAstras');
  const handleBatchArchiveBody = getConstFunctionBody(batchImportVoiceSource, 'handleBatchArchive');
  const defaultModelUpdateBody = getBlockFromMarker(modelMemoryDashboardSource, 'input[name="default-model-radio"]');
  const moveModelOrderBody = getConstFunctionBody(modelMemoryDashboardSource, 'moveModelOrder');
  const handleRestoreTrashItemBody = getConstFunctionBody(trashLifecycleSource, 'handleRestoreTrashItem');
  const handleBatchRestoreFromTrashBody = getConstFunctionBody(trashLifecycleSource, 'handleBatchRestoreFromTrash');

  assert.match(coordinatorSource, /export\s+function\s+createRuntimeDialogCoordinator/);
  assert.match(fragment00Source, /import\s+\{\s*createRuntimeDialogCoordinator\s*\}/);
  assert.equal((fragment00Source.match(/createRuntimeDialogCoordinator\(\{/g) || []).length, 1);
  assert.match(fragment00Source, /const\s+runtimeDialogCoordinator\s*=\s*createRuntimeDialogCoordinator\(\{/);
  assert.match(fragment00Source, /showNotification:\s*\(\.\.\.args\)\s*=>\s*showNotification\(\.\.\.args\)/);
  assert.match(fragment00Source, /const\s+showNotification\s*=\s*\(message,\s*type\s*=\s*'success'\)\s*=>\s*\{/);
  assert.match(fragment00Source, /const\s+toggleModal\s*=\s*\(modalElement,\s*show\)\s*=>\s*\{/);
  assert.match(fragment00Source, /const\s+showCustomConfirm\s*=\s*\(message,\s*title\s*=\s*[^)]*\)\s*=>\s*showCustomDialog\(/);
  assert.match(fragment00Source, /const\s+showCustomPrompt\s*=\s*\(message,\s*title\s*=\s*[^,]+,\s*inputType\s*=\s*'text'\)\s*=>\s*showCustomDialog\(/);

  for (const body of [
    deleteChatBody,
    deactivateAstrasBody,
    deleteAstrasBody,
    handleBatchArchiveBody,
    defaultModelUpdateBody,
    moveModelOrderBody
  ]) {
    assert.match(body, /runtimeDialogCoordinator\.showNotification\(/);
    assert.doesNotMatch(body, /(^|[^\w.])showNotification\(/);
  }

  assert.match(deleteChatBody, /else\s*\{\s*runtimeRenderCoordinator\.renderAll\(\);\s*\}\s*runtimeDialogCoordinator\.showNotification\(i18n\[runtimeConfigAccess\.getUiLanguage\(\)\]\.chatMovedToTrash\s*\|\|\s*'[^']*',\s*'success'\);/);
  assert.match(deactivateAstrasBody, /runtimeRenderCoordinator\.renderAll\(\);\s*legacyRuntimeContext\.resolveBinding\('input\.updateInputState'\)\(\);\s*runtimeDialogCoordinator\.showNotification\(/);
  assert.match(deleteAstrasBody, /runtimeRenderCoordinator\.renderAll\(\);\s*runtimeDialogCoordinator\.showNotification\(/);
  assert.match(handleBatchArchiveBody, /await\s+saveAppData\(\);\s*toggleSelectionMode\(\);\s*runtimeDialogCoordinator\.showNotification\(/);
  assert.match(coreTailSource, /showCoordinatedNotification:\s*\(\.\.\.args\)\s*=>\s*runtimeDialogCoordinator\.showNotification\(\.\.\.args\)/);
  assert.match(handleRestoreTrashItemBody, /await\s+saveAppData\(\);\s*renderTrash\(\);\s*showCoordinatedNotification\(/);
  assert.match(handleBatchRestoreFromTrashBody, /await\s+saveAppData\(\);\s*toggleTrashSelectionMode\(\);\s*showCoordinatedNotification\(/);
  assert.match(defaultModelUpdateBody, /config\.defaultModel\s*=\s*modelId;\s*await\s+saveConfig\(\);\s*(?:\/\/[^\n]*\s*)?runtimeDialogCoordinator\.showNotification\(/);
  assert.match(moveModelOrderBody, /await\s+saveConfig\(\);\s*renderModelManagementUI\(\);\s*(?:\/\/[^\n]*\s*)?runtimeDialogCoordinator\.showNotification\(/);
  assert.match(fragment03Source, /moveModelOrder,\s*renderPersonalMemoryList,/);
  assert.match(fragment03Source, /handleBatchArchive,/);
});

test('runtime config access owns selected uiLanguage reads through the config store', () => {
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment02Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const sidebarChatAstraRenderSource = readSource('src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js');
  const submitInputCouncilSource = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const settingsAuthProviderSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const coreTailSource = readSource('src/app/runtime/legacy-core/core-tail-lifecycle.js');
  const accessSource = readSource('src/app/legacy-runtime/runtime/runtime-config-access.js');
  const getCouncilTextsBody = getConstFunctionBody(fragment00Source, 'getCouncilTexts');
  const getCouncilRuntimeTextsBody = getConstFunctionBody(fragment00Source, 'getCouncilRuntimeTexts');
  const getModelRetirementLabelBody = getConstFunctionBody(fragment00Source, 'getModelRetirementLabel');
  const getModelPriceLabelBody = getConstFunctionBody(fragment00Source, 'getModelPriceLabel');
  const renderArchivedChatsBody = getConstFunctionBody(sidebarChatAstraRenderSource, 'renderArchivedChats');
  const getCouncilModeLabelBody = getConstFunctionBody(submitInputCouncilSource, 'getCouncilModeLabel');
  const setupTimeAnalysisBody = getConstFunctionBody(coreTailSource, 'setupTimeAnalysis');
  const updateTimeDistributionChartBody = getConstFunctionBody(coreTailSource, 'updateTimeDistributionChart');

  assert.match(accessSource, /export\s+function\s+createRuntimeConfigAccess/);
  assert.match(fragment00Source, /import\s+\{\s*createRuntimeConfigAccess\s*\}/);
  assert.equal((fragment00Source.match(/createRuntimeConfigAccess\(\{/g) || []).length, 1);
  assert.match(fragment00Source, /const\s+runtimeConfigAccess\s*=\s*createRuntimeConfigAccess\(\{/);
  assert.match(fragment00Source, /getConfig:\s*\(\)\s*=>\s*runtimeConfigStore\.getConfig\(\)/);
  assert.match(fragment00Source, /replaceConfig:\s*\(nextConfig\)\s*=>\s*runtimeConfigStore\.replaceConfig\(nextConfig\)/);
  assert.doesNotMatch(fragment00Source, /syncConfig\s*:/);
  assert.doesNotMatch(fragment00Source, /let\s+config\s*=/);
  assert.doesNotMatch(fragment00Source, /getConfig:\s*config\b/);

  for (const body of [
    getCouncilTextsBody,
    getCouncilRuntimeTextsBody,
    getModelRetirementLabelBody,
    getModelPriceLabelBody,
    getCouncilModeLabelBody,
    renderArchivedChatsBody,
    setupTimeAnalysisBody,
    updateTimeDistributionChartBody
  ]) {
    assert.match(body, /runtimeConfigAccess\.getUiLanguage\(\)/);
    assert.doesNotMatch(body, /config\.uiLanguage/);
  }

  assert.match(getCouncilTextsBody, /const\s+uiLanguage\s*=\s*runtimeConfigAccess\.getUiLanguage\(\);\s*return\s+COUNCIL_TEXT\[uiLanguage\]\s*\|\|\s*COUNCIL_TEXT\['zh-TW'\];/);
  assert.match(getCouncilRuntimeTextsBody, /const\s+uiLanguage\s*=\s*runtimeConfigAccess\.getUiLanguage\(\);/);
  assert.match(getCouncilRuntimeTextsBody, /if\s*\(uiLanguage\s*===\s*'en'\)\s*\{\s*return\s*\{/);
  assert.match(getCouncilRuntimeTextsBody, /if\s*\(uiLanguage\s*===\s*'fr'\)\s*\{\s*return\s*\{/);
  assert.ok((getCouncilRuntimeTextsBody.match(/return\s+\{/g) || []).length >= 3);
  assert.match(getModelRetirementLabelBody, /const\s+uiLanguage\s*=\s*runtimeConfigAccess\.getUiLanguage\(\);/);
  assert.match(getModelPriceLabelBody, /const\s+uiLanguage\s*=\s*runtimeConfigAccess\.getUiLanguage\(\);/);
  assert.match(getCouncilModeLabelBody, /const\s+uiLanguage\s*=\s*runtimeConfigAccess\.getUiLanguage\(\);/);
  assert.match(getCouncilModeLabelBody, /if\s*\(uiLanguage\s*===\s*'en'\)\s*return\s+`Council \$\{modeLabel\}`;/);
  assert.match(getCouncilModeLabelBody, /if\s*\(uiLanguage\s*===\s*'fr'\)\s*return\s+`Conseil \$\{modeLabel\}`;/);
  assert.match(getCouncilModeLabelBody, /if\s*\(uiLanguage\s*===\s*'fr'\)\s*return\s+`Conseil \$\{modeLabel\}`;\s*return\s+`[^`]*\$\{modeLabel\}`;/);
  assert.match(renderArchivedChatsBody, /const\s+uiLanguage\s*=\s*runtimeConfigAccess\.getUiLanguage\(\);/);
  for (const key of ['noArchivedChats', 'view', 'restore', 'delete']) {
    assert.match(renderArchivedChatsBody, new RegExp(`i18n\\[uiLanguage\\]\\.${key}\\s*\\|\\|`));
  }
  assert.ok((setupTimeAnalysisBody.match(/runtimeConfigAccess\.getUiLanguage\(\)/g) || []).length >= 3);
  for (const key of ['all', 'wholeYear', 'monthSuffix', 'wholeMonth', 'daySuffix']) {
    assert.match(setupTimeAnalysisBody, new RegExp(`i18n\\[uiLanguage\\]\\.${key}\\s*\\|\\|`));
  }
  assert.match(updateTimeDistributionChartBody, /const\s+lang\s*=\s*runtimeConfigAccess\.getUiLanguage\(\);/);
  assert.match(updateTimeDistributionChartBody, /buildTimeDistributionChartData\(\{\s*messages:\s*allMessages,\s*year,\s*month,\s*day,\s*text:\s*i18n\[lang\]\s*\}\)/);

  assert.match(fragment00Source, /const\s+saveConfig\s*=\s*async\s*\(\)\s*=>\s*\{\s*await\s+runtimeConfigPersistence\.saveConfig\(\);\s*\};/);
  assert.match(fragment00Source, /const\s+loadConfig\s*=\s*async\s*\(\)\s*=>\s*\{/);
  assert.match(settingsAuthProviderSource, /config\.uiLanguage\s*=\s*ALL_ELEMENTS\.uiLanguageSelect\.value;/);
  assert.match(settingsAuthProviderSource, /applyLanguage\(config\.uiLanguage\);/);
});

test('runtime DOM access owns selected element reads through the extracted DOM registry', () => {
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const sidebarChatAstraRenderSource = readSource('src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js');
  const accessSource = readSource('src/app/legacy-runtime/runtime/runtime-dom-access.js');
  const arrangeInputMediaPreviewBody = getConstFunctionBody(fragment00Source, 'arrangeInputMediaPreview');
  const renderArchivedChatsBody = getConstFunctionBody(sidebarChatAstraRenderSource, 'renderArchivedChats');
  const renderFoldersBody = getConstFunctionBody(sidebarChatAstraRenderSource, 'renderFolders');
  const renderHistorySidebarBody = getConstFunctionBody(fragment00Source, 'renderHistorySidebar');
  const renderHistorySidebarContentBody = getBlockFromMarker(fragment00Source, 'function renderHistorySidebarContent()');

  assert.match(accessSource, /export\s+function\s+createRuntimeDomAccess/);
  assert.doesNotMatch(accessSource, /document\.|querySelector|getElementById|addEventListener/);
  assert.match(fragment00Source, /import\s+\{\s*createRuntimeDomAccess\s*\}/);
  assert.equal((fragment00Source.match(/createRuntimeDomAccess\(\{/g) || []).length, 1);
  assert.match(fragment00Source, /const\s+ALL_ELEMENTS\s*=\s*createLegacyRuntimeDomRegistry\(\);/);
  assert.match(fragment00Source, /const\s+runtimeDomAccess\s*=\s*createRuntimeDomAccess\(\{\s*getElements:\s*\(\)\s*=>\s*ALL_ELEMENTS,\s*logger:\s*console\s*\}\);/);
  assert.doesNotMatch(fragment00Source, /getElements:\s*ALL_ELEMENTS\b/);

  assert.match(arrangeInputMediaPreviewBody, /const\s+preview\s*=\s*runtimeDomAccess\.getOptionalElement\('filePreviewContainer'\);/);
  assert.doesNotMatch(arrangeInputMediaPreviewBody, /ALL_ELEMENTS\.filePreviewContainer/);
  assert.match(fragment00Source, /const\s+settingsIcon\s*=\s*runtimeDomAccess\.getOptionalElement\('settingsBtn'\)\?\.querySelector\('svg'\);/);
  assert.doesNotMatch(fragment00Source, /const\s+settingsIcon\s*=\s*ALL_ELEMENTS\.settingsBtn/);

  assert.match(renderArchivedChatsBody, /const\s+archivedChatsContainer\s*=\s*runtimeDomAccess\.getRequiredElement\('archivedChatsContainer'\);/);
  assert.doesNotMatch(renderArchivedChatsBody, /ALL_ELEMENTS\.archivedChatsContainer/);
  assert.match(renderArchivedChatsBody, /archivedChatsContainer\.innerHTML\s*=\s*'';/);
  assert.match(renderArchivedChatsBody, /archivedChatsContainer\.appendChild\(item\);/);
  assert.match(renderArchivedChatsBody, /archivedChatsContainer\.querySelectorAll\('\.view-archived-btn'\)\.forEach\(btn\s*=>\s*btn\.addEventListener/);

  assert.match(renderFoldersBody, /const\s+folderList\s*=\s*runtimeDomAccess\.getRequiredElement\('folderList'\);/);
  assert.doesNotMatch(renderFoldersBody, /ALL_ELEMENTS\.folderList/);
  assert.match(renderFoldersBody, /folderList\.innerHTML\s*=\s*'';/);
  assert.match(renderFoldersBody, /folderList\.appendChild\(folderElement\);/);
  assert.match(renderFoldersBody, /folderOptionsBtn\.addEventListener\('click'/);

  assert.match(renderHistorySidebarBody, /const\s+historyList\s*=\s*runtimeDomAccess\.getRequiredElement\('historyList'\);/);
  assert.doesNotMatch(renderHistorySidebarBody, /ALL_ELEMENTS\.historyList/);
  assert.match(renderHistorySidebarBody, /historyList\.innerHTML\s*=\s*'';/);
  assert.match(renderHistorySidebarBody, /historyList\.appendChild\(thinkingPlaceholder\);/);
  assert.match(renderHistorySidebarBody, /historyList\.appendChild\(createConversationElement\(conv\)\);/);

  assert.match(renderHistorySidebarContentBody, /const\s+historySidebarList\s*=\s*runtimeDomAccess\.getRequiredElement\('historySidebarList'\);/);
  assert.doesNotMatch(renderHistorySidebarContentBody, /const\s+\{\s*historySidebarList\s*\}\s*=\s*ALL_ELEMENTS/);
  assert.match(renderHistorySidebarContentBody, /historySidebarList\.innerHTML\s*=\s*'';/);
  assert.match(renderHistorySidebarContentBody, /historySidebarList\.appendChild\(listItem\);/);
});

test('trash batch selection checkbox click does not bubble into row toggle', () => {
  const trashLifecycleSource = readSource('src/app/runtime/features/trash-lifecycle.js');
  const renderTrashBody = getConstFunctionBody(trashLifecycleSource, 'renderTrash');
  const handleBatchRestoreFromTrashBody = getConstFunctionBody(trashLifecycleSource, 'handleBatchRestoreFromTrash');
  const handleBatchDeleteFromTrashBody = getConstFunctionBody(trashLifecycleSource, 'handleBatchDeleteFromTrash');

  assert.match(renderTrashBody, /item\.addEventListener\('click',\s*event\s*=>\s*\{/);
  assert.match(renderTrashBody, /if\s*\(event\.target\.closest\('button'\)\)\s*return;/);
  assert.match(renderTrashBody, /checkbox\.checked\s*=\s*!checkbox\.checked;\s*checkbox\.dispatchEvent\(createChangeEvent\(\)\);/);
  assert.match(renderTrashBody, /container\.querySelectorAll\('\.trash-select-checkbox'\)\.forEach\(checkbox\s*=>\s*\{\s*checkbox\.addEventListener\('click',\s*event\s*=>\s*event\.stopPropagation\(\)\);/);
  assert.match(renderTrashBody, /checkbox\.addEventListener\('change',\s*event\s*=>\s*\{[\s\S]*selectedTrashIds\.add\(id\);[\s\S]*selectedTrashIds\.delete\(id\);[\s\S]*renderTrashBatchActionBar\(\);[\s\S]*\}\);/);
  assert.match(handleBatchRestoreFromTrashBody, /await\s+saveAppData\(\);\s*toggleTrashSelectionMode\(\);\s*showCoordinatedNotification\(/);
  assert.match(handleBatchDeleteFromTrashBody, /if\s*\(!\(await\s+showCustomConfirm\([\s\S]*?\)\)\)\s*return;\s*replaceConversations\(\s*getConversations\(\)\.filter\(conversation\s*=>\s*!selectedTrashIds\.has\(conversation\.id\)\)\s*\);\s*await\s+saveAppData\(\);\s*toggleTrashSelectionMode\(\);\s*showNotification\(/);
});

test('conversation state access owns selected active conversation lookups without stale snapshots', () => {
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment02Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const sidebarChatAstraRenderSource = readSource('src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js');
  const settingsAuthProviderSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const batchImportVoiceSource = readSource('src/app/runtime/legacy-core/batch-import-voice-lifecycle.js');
  const accessSource = readSource('src/app/legacy-runtime/runtime/conversation-state-access.js');
  const createConversationElementBody = getConstFunctionBody(sidebarChatAstraRenderSource, 'createConversationElement');
  const deleteChatBody = getConstFunctionBody(fragment00Source, 'deleteChat');
  const archiveChatBody = getConstFunctionBody(fragment00Source, 'archiveChat');
  const batchDeleteBody = getConstFunctionBody(batchImportVoiceSource, 'handleBatchDelete');
  const batchArchiveBody = getConstFunctionBody(batchImportVoiceSource, 'handleBatchArchive');

  assert.match(accessSource, /export\s+function\s+createConversationStateAccess/);
  assert.match(fragment00Source, /import\s+\{\s*createConversationStateAccess\s*\}/);
  assert.equal((fragment00Source.match(/createConversationStateAccess\(\{/g) || []).length, 1);
  assert.match(fragment00Source, /getConversations:\s*\(\)\s*=>\s*liveConversationsBridge\.getConversations\(\)/);
  assert.match(fragment00Source, /getCurrentConversationId:\s*\(\)\s*=>\s*activeConversationStore\.getActiveConversationId\(\)/);
  assert.match(fragment00Source, /setCurrentConversationId:\s*\(id\)\s*=>\s*activeConversationStore\.setActiveConversationId\(id\)/);

  assert.match(fragment00Source, /const\s+getActiveConversation\s*=\s*\(\)\s*=>\s*\{\s*const\s+conv\s*=\s*conversationStateAccess\.getCurrentConversation\(\);/);
  assert.match(fragment00Source, /conversationStateAccess\.setCurrentConversationId\(newConv\.id\);/);
  assert.match(fragment00Source, /if\s*\(id\s*!==\s*conversationStateAccess\.getCurrentConversationId\(\)\)/);
  assert.match(fragment00Source, /conversationStateAccess\.setCurrentConversationId\(id\);/);
  assert.match(settingsAuthProviderSource, /conv\.id\s*===\s*conversationStateAccess\.getCurrentConversationId\(\)/);

  assert.match(createConversationElementBody, /const\s+currentConversationId\s*=\s*conversationStateAccess\.getCurrentConversationId\(\);/);
  assert.match(createConversationElementBody, /conv\.id\s*===\s*currentConversationId\s*&&\s*!getIsSelectionMode\(\)\s*\?\s*'active'/);
  assert.doesNotMatch(createConversationElementBody, /conv\.id\s*===\s*activeConversationId/);

  assert.match(deleteChatBody, /conversationStateAccess\.getCurrentConversationId\(\)\s*===\s*id/);
  assert.doesNotMatch(deleteChatBody, /\bactiveConversationId\b/);

  assert.match(archiveChatBody, /conversationStateAccess\.getCurrentConversationId\(\)\s*===\s*id/);
  assert.match(archiveChatBody, /conversationStateAccess\.setCurrentConversationId\(nextConv\s*\?\s*nextConv\.id\s*:\s*null\)/);
  assert.match(archiveChatBody, /loadChat\(conversationStateAccess\.getCurrentConversationId\(\)\)/);
  assert.doesNotMatch(archiveChatBody, /\bactiveConversationId\b/);

  for (const batchBody of [batchDeleteBody, batchArchiveBody]) {
    assert.match(batchBody, /selectedConversationIds\.has\(conversationStateAccess\.getCurrentConversationId\(\)\)/);
    assert.match(batchBody, /conversationStateAccess\.setCurrentConversationId\(nextConv\s*\?\s*nextConv\.id\s*:\s*null\)/);
    assert.doesNotMatch(batchBody, /\bactiveConversationId\b/);
  }

  assert.doesNotMatch(fragment00Source, /const\s+getActiveConversation\s*=\s*\(\)\s*=>\s*\{\s*const\s+conv\s*=\s*conversations\.find\(c\s*=>\s*c\.id\s*===\s*activeConversationId\)/);
  assert.doesNotMatch(fragment02Source, /conv\.id\s*===\s*activeConversationId/);
});

test('app shell imports and preserves critical DOM IDs', async () => {
  const { default: appShell } = await import(projectFile('src/templates/app-shell.js'));

  assert.equal(typeof appShell, 'string');
  assert.ok(appShell.length > 0);

  for (const id of [
    'auth-container',
    'app-container',
    'sidebar',
    'message-list',
    'chat-form',
    'message-input',
    'settings-btn',
    'settings-modal',
    'model-switcher-container',
    'file-options-popover',
    'search-modal',
    'trash-section',
    'p2p-share-modal'
  ]) {
    assert.match(appShell, new RegExp(`id="${id}"`), `app shell should include #${id}`);
  }
});

test('settings sidebar button remains wired to initialize and open the settings modal', () => {
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment02Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const sidebarChatAstraRenderSource = readSource('src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js');
  const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const coreTailSource = readSource('src/app/runtime/legacy-core/core-tail-lifecycle.js');
  const batchImportVoiceSource = readSource('src/app/runtime/legacy-core/batch-import-voice-lifecycle.js');
  const appBootstrapLifecycleSource = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');
  const settingsAuthProviderSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');

  assert.match(settingsAuthProviderSource, /const\s+setupSettingsModal\s*=\s*\(\)\s*=>\s*\{/);
  assert.match(settingsAuthProviderSource, /const\s+updateInputState\s*=\s*\(\)\s*=>\s*\{/);
  assert.match(fragment02Source, /legacyRuntimeContext\.registerLazyBinding\('settings\.setupSettingsModal',\s*\(\)\s*=>\s*setupSettingsModal\);/);
  assert.match(fragment02Source, /legacyRuntimeContext\.registerLazyBinding\('input\.updateInputState',\s*\(\)\s*=>\s*updateInputState\);/);
  assert.match(settingsAuthProviderSource, /const\s+getTavilySearchDepth\s*=\s*\(\)\s*=>\s*config\.tavilySearchDepth\s*===\s*'advanced'\s*\?\s*'advanced'\s*:\s*'basic';/);
  assert.match(settingsAuthProviderSource, /ALL_ELEMENTS\.tavilySearchDepthSelect\.value\s*=\s*getTavilySearchDepth\(\);/);
  assert.doesNotMatch(fragment03Source, /const\s+resolveSearchSetupSettingsModal\b/);
  assert.match(batchImportVoiceSource, /const\s+resolveSearchSetupSettingsModal\s*=\s*\(\.\.\.args\)\s*=>\s*legacyRuntimeContext\.resolveBinding\('settings\.setupSettingsModal'\)\(\.\.\.args\);/);
  assert.match(coreTailSource, /setupSettingsModal:\s*\(\.\.\.args\)\s*=>\s*legacyRuntimeContext\.resolveBinding\('settings\.setupSettingsModal'\)\(\.\.\.args\)/);
  assert.match(appBootstrapLifecycleSource, /const\s+resolveEventsSetupSettingsModal\s*=\s*setupSettingsModal;/);
  for (const [source, fragmentLabel, resolverName] of [
    [fragment00Source, '00', 'resolveFoundationUpdateInputState'],
    [fragment03Source, '03', 'resolveUploadUpdateInputState']
  ]) {
    assert.match(
      source,
      new RegExp(`const\\s+${resolverName}\\s*=\\s*\\(\\.\\.\\.args\\)\\s*=>\\s*legacyRuntimeContext\\.resolveBinding\\('input\\.updateInputState'\\)\\(\\.\\.\\.args\\);`),
      `${fragmentLabel} should resolve updateInputState lazily`
    );
  }
  assert.doesNotMatch(fragment01Source, /const\s+resolveMainUpdateInputState\b/);
  assert.doesNotMatch(coreTailSource, /const\s+resolveTrashUpdateInputState\b/);
  assert.match(sidebarChatAstraRenderSource, /legacyRuntimeContext\.resolveBinding\('input\.updateInputState'\)\(\);/);
  assert.match(coreTailSource, /legacyRuntimeContext\.resolveBinding\('input\.updateInputState'\)\(\);/);
  assert.match(coreTailSource, /updateInputState:\s*\(\.\.\.args\)\s*=>\s*legacyRuntimeContext\.resolveBinding\('input\.updateInputState'\)\(\.\.\.args\)/);
  assert.match(appBootstrapLifecycleSource, /const\s+resolveEventsUpdateInputState\s*=\s*updateInputState;/);
  assert.match(
    appBootstrapLifecycleSource,
    /ALL_ELEMENTS\.settingsBtn\.addEventListener\('click',\s*\(\)\s*=>\s*\{\s*resolveEventsSetupSettingsModal\(\);\s*toggleModal\(ALL_ELEMENTS\.settingsModal,\s*true\);\s*\}\);/
  );
  assert.match(appBootstrapLifecycleSource, /ALL_ELEMENTS\.closeSettingsBtn\.addEventListener\('click',\s*\(\)\s*=>\s*toggleModal\(ALL_ELEMENTS\.settingsModal,\s*false\)\);/);
  assert.match(sidebarChatAstraRenderSource, /updateInputState:\s*\(\)\s*=>\s*legacyRuntimeContext\.resolveBinding\('input\.updateInputState'\)\(\)/);
  const messageListWiring = getBlockFromMarker(sidebarChatAstraRenderSource, 'createMessageListLifecycle({');
  assert.doesNotMatch(messageListWiring, /\n\s*updateInputState,\s*\n/);
});

test('main bootstrap delegates vendor bridge, shell mount, and vendor script loading in order', () => {
  const mainSource = readSource('src/main.js');

  assert.match(mainSource, /import\s+\{\s*installVendorBridge\s*\}\s+from\s+'\.\/app\/bootstrap\/vendor-bridge\.js';/);
  assert.match(mainSource, /import\s+\{\s*loadVendorScript\s*\}\s+from\s+'\.\/app\/bootstrap\/load-vendor-script\.js';/);
  assert.match(mainSource, /import\s+\{\s*mountAppShell\s*\}\s+from\s+'\.\/app\/bootstrap\/mount-shell\.js';/);

  const orderedBootstrapSteps = [
    'installVendorBridge({',
    'mountAppShell(appShell)',
    "await import('./data/i18n.js')",
    "await import('./data/demo-conversations.js')",
    "await import('./data/astras-data.js')",
    "await import('./data/update-logs.js')",
    "await loadVendorScript('/vendor/mhchem.min.js')",
    "await import('./app/legacy-app.js')"
  ];

  let previousIndex = -1;
  for (const step of orderedBootstrapSteps) {
    const currentIndex = mainSource.indexOf(step);
    assert.notEqual(currentIndex, -1, `main bootstrap should include ${step}`);
    assert.ok(currentIndex > previousIndex, `${step} should keep the legacy bootstrap order`);
    previousIndex = currentIndex;
  }
});

test('vendor bridge source preserves all legacy global names', () => {
  const bridgeSource = readSource('src/app/bootstrap/vendor-bridge.js');

  assert.match(bridgeSource, /export\s+function\s+installVendorBridge/);

  for (const globalName of [
    'marked',
    'DOMPurify',
    'Chart',
    'JSZip',
    'Cropper',
    'katex',
    'Peer',
    'QRCode',
    'Html5Qrcode'
  ]) {
    assert.match(bridgeSource, new RegExp(`globalThis\\.${globalName}\\s*=`));
  }
});

test('bootstrap helpers keep narrow responsibilities', () => {
  const loadVendorScriptSource = readSource('src/app/bootstrap/load-vendor-script.js');
  const mountShellSource = readSource('src/app/bootstrap/mount-shell.js');

  assert.match(loadVendorScriptSource, /export\s+function\s+loadVendorScript/);
  assert.match(loadVendorScriptSource, /document\.querySelector\(`script\[src="\$\{src\}"\]`\)/);
  assert.match(loadVendorScriptSource, /script\.dataset\.loaded\s*=\s*'true'/);

  assert.match(mountShellSource, /export\s+function\s+mountAppShell/);
  assert.match(mountShellSource, /document\.querySelector\('#app'\)/);
  assert.match(mountShellSource, /Missing #app mount node\./);
});

test('main css is an ordered split manifest with every imported file under the source size limit', () => {
  const mainCss = readSource('src/styles/main.css');
  const expectedImports = [
    'base.css',
    'sidebar.css',
    'input.css',
    'store.css',
    'layout.css',
    'chat.css',
    'modals.css',
    'personalization.css',
    'input-polish.css',
    'model-council.css',
    'settings.css',
    'regression-overrides.css',
    'mobile.css',
    'typography.css'
  ];

  const imports = [...mainCss.matchAll(/@import\s+['"]\.\/(.+?)['"];/g)].map((match) => match[1]);
  assert.deepEqual(imports, expectedImports);
  assert.equal(mainCss.trimStart().startsWith("@import './base.css';"), true);

  const baseCss = readSource('src/styles/base.css');
  assert.match(baseCss, /@tailwind base;\s*@tailwind components;\s*@tailwind utilities;/);

  for (const importPath of expectedImports) {
    const cssPath = `src/styles/${importPath}`;
    const size = statSync(projectFile(cssPath)).size;
    assert.ok(size > 0, `${cssPath} should not be empty`);
    assert.ok(size < 150 * 1024, `${cssPath} should stay under 150 KB`);
  }

  assert.ok(statSync(projectFile('src/styles/main.css')).size < 150 * 1024);
});

test('legacy provider request formatting helpers are isolated from the 02 runtime fragment', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/model-request-formatting.js');
  const streamApiSource = readSource('src/app/legacy-runtime/features/stream-api-call.js');
  const fragmentSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const settingsAuthProviderSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/model-request-formatting.js'));

  for (const exportName of [
    'appendStepPlanAttachmentContent',
    'buildTavilySearchQuery',
    'formatTavilySearchPacket',
    'getSearchCurrentDate'
  ]) {
    assert.equal(typeof helpers[exportName], 'function', `${exportName} should be exported`);
    assert.match(helperSource, new RegExp(`export\\s+const\\s+${exportName}\\b`));
  }

  assert.match(settingsAuthProviderSource, /import\s*\{[\s\S]*\bgetSearchCurrentDate\b[\s\S]*\}\s*from\s+['"][^'"]*model-request-formatting\.js['"];/);
  assert.doesNotMatch(fragmentSource, /appendStepPlanAttachmentContentBase|getSearchCurrentDate/);
  assert.match(fragmentSource, /createLegacySettingsAuthProviderLifecycle/);
  assert.match(
    streamApiSource,
    /import\s*\{\s*appendStepPlanAttachmentContent\s*\}\s*from\s+'\.\/model-request-formatting\.js';/
  );
  assert.match(streamApiSource, /appendStepPlanAttachmentContent\(\s*content,\s*part\.inlineData,\s*modelInfo,\s*\{\s*modelSupportsVision\s*\}/);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/02-runtime.fragment.js')), false);
});

test('stream API provider request and parser core is isolated from the 02 runtime fragment', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/stream-api-call.js');
  const fragmentSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const settingsAuthProviderSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/stream-api-call.js'));

  assert.equal(typeof helpers.createStreamApiCall, 'function');
  assert.match(helperSource, /export\s+function\s+createStreamApiCall\b/);
  assert.match(
    settingsAuthProviderSource,
    /import\s*\{\s*createStreamApiCall\s*\}\s*from\s+['"][^'"]*stream-api-call\.js['"];/
  );
  assert.match(settingsAuthProviderSource, /const\s+streamApiCall\s*=\s*createStreamApiCall\(\{/);
  assert.match(settingsAuthProviderSource, /\bgetActiveConversation,\s*\n\s*normalizeConversationModel,/);
  assert.match(settingsAuthProviderSource, /getConfig:\s*\(\)\s*=>\s*config/);
  assert.match(settingsAuthProviderSource, /getPersonalMemories:\s*\(\)\s*=>\s*personalMemories/);
  assert.match(fragmentSource, /streamApiCall,/);

  assert.doesNotMatch(fragmentSource, /async\s+function\s+streamApiCall\b/);
  assert.doesNotMatch(fragmentSource, /function\s+cleanGeminiHistory\b/);
  assert.doesNotMatch(fragmentSource, /STEP_PLAN_CHAT_COMPLETIONS_URL/);
  assert.doesNotMatch(fragmentSource, /openrouter\.ai\/api\/v1\/chat\/completions/);
  assert.doesNotMatch(fragmentSource, /:streamGenerateContent\?key=/);
  assert.doesNotMatch(fragmentSource, /\/api\/(?:step-plan|nvidia)-chat/);
  assert.doesNotMatch(fragmentSource, /response\.body\.getReader\(\)/);
  assert.doesNotMatch(fragmentSource, /new\s+TextDecoder\(\)/);
  assert.doesNotMatch(fragmentSource, /line\.startsWith\('data: '\)/);
  assert.doesNotMatch(fragmentSource, /parsed\?\.candidates\?\.\[0\]\?\.content\?\.parts\?\.\[0\]\?\.text/);

  assert.match(settingsAuthProviderSource, /function\s+calculateRelevanceScore\b/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/stream-api-call.js')).size < 150 * 1024);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/02-runtime.fragment.js')), false);
});

test('provider request support helpers are isolated from the 02 runtime fragment', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/provider-request-support.js');
  const fragmentSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const settingsAuthProviderSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/provider-request-support.js'));

  assert.equal(typeof helpers.createProviderRequestSupport, 'function');
  assert.match(helperSource, /export\s+function\s+createProviderRequestSupport\b/);
  assert.match(
    settingsAuthProviderSource,
    /import\s*\{\s*createProviderRequestSupport\s*\}\s*from\s+['"][^'"]*provider-request-support\.js['"];/
  );
  assert.match(settingsAuthProviderSource, /const\s+providerRequestSupport\s*=\s*createProviderRequestSupport\(\{/);
  assert.match(settingsAuthProviderSource, /buildTavilySearchQuery,/);
  assert.match(settingsAuthProviderSource, /formatTavilySearchPacket,/);
  assert.match(settingsAuthProviderSource, /streamApiCall,/);
  assert.match(settingsAuthProviderSource, /councilRetryDelayMs:\s*COUNCIL_RETRY_DELAY_MS/);
  assert.match(settingsAuthProviderSource, /buildSingleModelTranslatedRequestParts,[\s\S]*streamCouncilApiCallWithRetry,[\s\S]*truncateCouncilText[\s\S]*=\s*providerRequestSupport/);

  for (const removedSupportCore of [
    /const\s+waitCouncilRetryDelay\s*=/,
    /const\s+streamCouncilApiCallWithRetry\s*=\s*async/,
    /const\s+getUnsupportedSingleDocumentParts\s*=/,
    /const\s+buildSingleDocumentTranslationPrompt\s*=/,
    /const\s+getTavilyApiKey\s*=/,
    /const\s+fetchTavilySearchPacket\s*=\s*async/,
    /const\s+buildTavilyContextPart\s*=/,
    /const\s+buildSingleSearchTranslationPrompt\s*=/,
    /const\s+buildSingleModelTranslatedRequestParts\s*=\s*async/
  ]) {
    assert.doesNotMatch(fragmentSource, removedSupportCore);
  }

  assert.match(helperSource, /const\s+streamCouncilApiCallWithRetry\s*=\s*async/);
  assert.match(helperSource, /const\s+fetchTavilySearchPacket\s*=\s*async/);
  assert.match(helperSource, /const\s+buildSingleModelTranslatedRequestParts\s*=\s*async/);
  assert.doesNotMatch(helperSource, /document\.|window\.|indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(helperSource, /virtual:legacy-app-runtime|vite\.config|package\.json/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/provider-request-support.js')).size < 150 * 1024);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/02-runtime.fragment.js')), false);
});

test('council response lifecycle core is isolated from the 02 runtime fragment', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/council-response-lifecycle.js');
  const fragmentSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const settingsAuthProviderSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/council-response-lifecycle.js'));

  assert.equal(typeof helpers.createCouncilResponseLifecycle, 'function');
  assert.match(helperSource, /export\s+function\s+createCouncilResponseLifecycle\b/);
  assert.match(
    settingsAuthProviderSource,
    /import\s*\{\s*createCouncilResponseLifecycle\s*\}\s*from\s+['"][^'"]*council-response-lifecycle\.js['"];/
  );
  assert.match(settingsAuthProviderSource, /const\s+councilResponseLifecycle\s*=\s*createCouncilResponseLifecycle\(\{/);
  assert.match(settingsAuthProviderSource, /const\s+runModelCouncil\s*=\s*\(\.\.\.args\)\s*=>\s*councilResponseLifecycle\.runModelCouncil\(\.\.\.args\)/);
  assert.match(fragmentSource, /runModelCouncil,/);

  for (const removedCouncilCore of [
    /async\s+function\s+runModelCouncil\b/,
    /const\s+formatCouncilResponses\s*=/,
    /const\s+buildCouncilSharedSearchPrompt\s*=/,
    /const\s+buildCouncilSecondSearchPrompt\s*=/,
    /const\s+buildCouncilAttachmentTranslationPackets\s*=/,
    /const\s+buildCouncilMemberInstruction\s*=/,
    /const\s+buildCouncilDeliberationPrompt\s*=/,
    /const\s+buildCouncilSynthesisPrompt\s*=/,
    /const\s+buildCouncilAppendix\s*=/
  ]) {
    assert.doesNotMatch(fragmentSource, removedCouncilCore);
  }

  assert.match(settingsAuthProviderSource, /streamCouncilApiCallWithRetry,/);
  assert.match(settingsAuthProviderSource, /buildSingleModelTranslatedRequestParts,/);
  assert.match(settingsAuthProviderSource, /const\s+structuredHelpers\s*=\s*createSettingsProviderStructuredHelpers\(\{/);
  assert.match(helperSource, /const\s+firstRoundSettled\s*=\s*await\s+Promise\.allSettled/);
  assert.match(helperSource, /const\s+secondRoundSettled\s*=\s*await\s+Promise\.allSettled/);
  assert.match(helperSource, /const\s+synthesisPrompt\s*=\s*buildCouncilSynthesisPrompt/);
  assert.doesNotMatch(helperSource, /document\.|window\.|indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(helperSource, /TextDecoder\b|response\.body\.getReader\(\)|virtual:legacy-app-runtime|vite\.config|package\.json/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/council-response-lifecycle.js')).size < 150 * 1024);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/02-runtime.fragment.js')), false);
});

test('settings mobile metadata helpers are isolated from the 02 runtime fragment', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/settings-mobile-metadata.js');
  const fragmentSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const settingsAuthProviderSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const settingsMobileShellHelperSource = readSource('src/app/runtime/legacy-core/settings-mobile-shell-helper.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/settings-mobile-metadata.js'));

  assert.equal(typeof helpers.getSettingsMobileGroups, 'function');
  assert.equal(typeof helpers.SETTINGS_MOBILE_ICON_MAP, 'object');
  assert.match(helperSource, /export\s+const\s+SETTINGS_MOBILE_ICON_MAP\b/);
  assert.match(helperSource, /export\s+const\s+getSettingsMobileGroups\b/);

  assert.match(
    settingsMobileShellHelperSource,
    /import\s*\{[\s\S]*\bSETTINGS_MOBILE_ICON_MAP\b[\s\S]*\bgetSettingsMobileGroups\s+as\s+getSettingsMobileGroupsBase\b[\s\S]*\}\s*from\s+['"][^'"]*settings-mobile-metadata\.js['"];/
  );
  assert.match(settingsAuthProviderSource, /createSettingsMobileShellHelper/);
  assert.match(settingsMobileShellHelperSource, /getSettingsMobileGroupsBase\(\s*getSettingsText\s*\)/);
  assert.doesNotMatch(fragmentSource, /const\s+SETTINGS_MOBILE_ICON_MAP\s*=/);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/02-runtime.fragment.js')), false);
});

test('output mode settings text helper is isolated from the 02 runtime fragment', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/output-mode-settings-text.js');
  const fragmentSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const settingsAuthProviderSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const outputTranslatorControlsSource = readSource('src/app/runtime/legacy-core/settings-output-translator-controls.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/output-mode-settings-text.js'));

  assert.equal(typeof helpers.getOutputModeSettingsText, 'function');
  assert.match(helperSource, /export\s+const\s+getOutputModeSettingsText\b/);
  assert.match(
    outputTranslatorControlsSource,
    /import\s*\{[\s\S]*\bgetOutputModeSettingsText\b[\s\S]*\}\s*from\s+['"][^'"]*output-mode-settings-text\.js['"];/
  );
  assert.match(settingsAuthProviderSource, /createSettingsOutputTranslatorControls/);
  assert.match(outputTranslatorControlsSource, /getOutputModeSettingsText\(\s*config\.uiLanguage\s*\)/);
  assert.doesNotMatch(fragmentSource, /const\s+getOutputModeSettingsText\s*=\s*\(\)\s*=>/);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/02-runtime.fragment.js')), false);
});

test('search text formatting helper is isolated from the transition bus', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/search-text-formatting.js');
  const fragmentSource = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const searchUploadSidebarSource = readSource('src/app/runtime/legacy-core/search-upload-sidebar-lifecycle.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/search-text-formatting.js'));

  assert.equal(typeof helpers.highlightText, 'function');
  assert.match(helperSource, /export\s+const\s+highlightText\b/);
  assert.match(
    searchUploadSidebarSource,
    /import\s*\{[\s\S]*\bhighlightText\b[\s\S]*\}\s*from\s+'..\/..\/legacy-runtime\/features\/search-text-formatting\.js';/
  );
  assert.doesNotMatch(fragmentSource, /\b(?:const|function)\s+highlightText\b/);
  assert.doesNotMatch(fragmentSource, /search-text-formatting\.js/);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/03-runtime.fragment.js')), false);
  assert.ok(statSync(projectFile('src/app/runtime/legacy-core/transition-bus-lifecycle.js')).size < 150 * 1024);
});

test('message type icon helper is isolated from the 00 runtime fragment', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/message-type-icon.js');
  const fragmentSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/message-type-icon.js'));

  assert.equal(typeof helpers.getMessageTypeIcon, 'function');
  assert.match(helperSource, /export\s+function\s+getMessageTypeIcon\b/);
  assert.match(
    fragmentSource,
    /import\s*\{[\s\S]*\bgetMessageTypeIcon\b[\s\S]*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/message-type-icon\.js';/
  );
  assert.doesNotMatch(fragmentSource, /\b(?:const|function)\s+getMessageTypeIcon\b/);
  assert.ok(statSync(projectFile('src/app/runtime/legacy-core/legacy-core.js')).size < 150 * 1024);
});

test('date formatting helper is isolated from the 00 runtime fragment and remains available to timestamp call sites', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/date-formatting.js');
  const postResponseActionsSource = readSource('src/app/legacy-runtime/features/model-message-post-response-actions.js');
  const messageMarkupSource = readSource('src/app/legacy-runtime/features/message-markup-renderer.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const sidebarChatAstraRenderSource = readSource('src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js');
  const trashLifecycleSource = readSource('src/app/runtime/features/trash-lifecycle.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/date-formatting.js'));

  assert.equal(typeof helpers.formatFullTimestamp, 'function');
  assert.match(helperSource, /export\s+const\s+formatFullTimestamp\b/);
  assert.match(
    fragment00Source,
    /import\s*\{[\s\S]*\bformatFullTimestamp\b[\s\S]*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/date-formatting\.js';/
  );
  assert.doesNotMatch(fragment00Source, /\bconst\s+formatFullTimestamp\s*=/);
  assert.match(sidebarChatAstraRenderSource, /formatTimestamp:\s*formatFullTimestamp/);
  assert.match(messageMarkupSource, /formatTimestamp\(message\.createdAt\)/);
  assert.match(postResponseActionsSource, /formatTimestamp\(aiMessageObject\.createdAt\)/);
  assert.match(trashLifecycleSource, /formatFullTimestamp\(conversation\.deletedAt\)/);
  assert.ok(statSync(projectFile('src/app/runtime/legacy-core/legacy-core.js')).size < 150 * 1024);
});

test('time distribution chart data helper is isolated from the 04 runtime fragment', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/time-distribution-chart-data.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const coreTailSource = readSource('src/app/runtime/legacy-core/core-tail-lifecycle.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/time-distribution-chart-data.js'));

  assert.equal(typeof helpers.buildTimeDistributionChartData, 'function');
  assert.match(helperSource, /export\s+function\s+buildTimeDistributionChartData\b/);
  assert.match(
    fragment00Source,
    /import\s*\{[\s\S]*\bbuildTimeDistributionChartData\b[\s\S]*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/time-distribution-chart-data\.js';/
  );
  assert.doesNotMatch(coreTailSource, /import\('\/src\/app\/legacy-runtime\/features\/time-distribution-chart-data\.js'\)/);
  assert.doesNotMatch(coreTailSource, /timeDistributionChartDataModulePromise/);
  assert.doesNotMatch(coreTailSource, /\blet\s+labels,\s*data,\s*chartType,\s*label\b/);
  assert.doesNotMatch(coreTailSource, /data\s*=\s*years\.map\(y\s*=>\s*allMessages\.filter/);
  assert.match(coreTailSource, /const\s+updateTimeDistributionChart\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(coreTailSource, /const\s+updateTimeDistributionChart\s*=\s*async\s*\(\)\s*=>/);
  assert.match(coreTailSource, /buildTimeDistributionChartData\(\{\s*messages:\s*allMessages,\s*year,\s*month,\s*day,\s*text:\s*i18n\[lang\]\s*\}\)/);
  assert.match(coreTailSource, /document\.getElementById\('time-distribution-chart'\)\.getContext\('2d'\)/);
  assert.match(coreTailSource, /state\.timeDistChart\s*=\s*new Chart\(ctx,/);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/04-runtime.fragment.js')), false);
});

test('mobile context menu markup helpers are isolated from the 04 runtime fragment', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/mobile-context-menu-markup.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const coreTailSource = readSource('src/app/runtime/legacy-core/core-tail-lifecycle.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/mobile-context-menu-markup.js'));

  assert.equal(typeof helpers.buildConversationMobileContextMenuMarkup, 'function');
  assert.equal(typeof helpers.buildFolderMobileContextMenuMarkup, 'function');
  assert.equal(typeof helpers.buildAstraMobileContextMenuMarkup, 'function');
  assert.match(helperSource, /export\s+function\s+buildConversationMobileContextMenuMarkup\b/);
  assert.match(helperSource, /export\s+function\s+buildFolderMobileContextMenuMarkup\b/);
  assert.match(helperSource, /export\s+function\s+buildAstraMobileContextMenuMarkup\b/);
  assert.match(
    fragment00Source,
    /import\s*\{[\s\S]*\bbuildConversationMobileContextMenuMarkup\b[\s\S]*\bbuildFolderMobileContextMenuMarkup\b[\s\S]*\bbuildAstraMobileContextMenuMarkup\b[\s\S]*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/mobile-context-menu-markup\.js';/
  );
  assert.match(coreTailSource, /menu\.innerHTML\s*=\s*buildConversationMobileContextMenuMarkup\(\{/);
  assert.match(coreTailSource, /menu\.innerHTML\s*=\s*buildFolderMobileContextMenuMarkup\(\{/);
  assert.match(coreTailSource, /menu\.innerHTML\s*=\s*buildAstraMobileContextMenuMarkup\(\{/);
  assert.doesNotMatch(coreTailSource, /const\s+menuHeader\s*=/);
  assert.doesNotMatch(coreTailSource, /let\s+menuOptions\s*=/);
  assert.doesNotMatch(coreTailSource, /const\s+moveOptionsHTML\s*=/);
  assert.match(coreTailSource, /document\.createElement\('div'\)/);
  assert.match(coreTailSource, /document\.body\.appendChild\(menuWrapper\)/);
  assert.match(coreTailSource, /menu\.addEventListener\('click'/);
  assert.match(coreTailSource, /showRenameModal\(convId,\s*'conversation',\s*e\)/);
  assert.match(coreTailSource, /showFolderSettingsModal\(folderId,\s*e\)/);
  assert.match(coreTailSource, /openAvatarEditor\(astrasId\)/);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/04-runtime.fragment.js')), false);
});

test('streaming council details helpers are isolated from the 01 runtime fragment', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/streaming-council-details.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/streaming-council-details.js'));

  for (const exportName of [
    'getOpenCouncilDetailKeys',
    'restoreOpenCouncilDetails',
    'isCouncilComparisonSummary',
    'normalizeCouncilComparisonDetails',
    'hasUnclosedCouncilDetails'
  ]) {
    assert.equal(typeof helpers[exportName], 'function', `${exportName} should be exported`);
    assert.match(helperSource, new RegExp(`export\\s+const\\s+${exportName}\\b`));
  }

  assert.match(
    fragment00Source,
    /import\s*\{[\s\S]*\bgetOpenCouncilDetailKeys\b[\s\S]*\brestoreOpenCouncilDetails\b[\s\S]*\bisCouncilComparisonSummary\b[\s\S]*\bnormalizeCouncilComparisonDetails\b[\s\S]*\bhasUnclosedCouncilDetails\b[\s\S]*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/streaming-council-details\.js';/
  );
  assert.match(fragment01Source, /getOpenCouncilDetailKeys\(targetElement\)/);
  assert.match(fragment01Source, /restoreOpenCouncilDetails\(targetElement,\s*openKeys\)/);
  assert.match(helperSource, /normalizeCouncilComparisonDetails\b/);
  assert.match(helperSource, /hasUnclosedCouncilDetails\b/);
  assert.doesNotMatch(fragment01Source, /\bconst\s+getOpenCouncilDetailKeys\s*=/);
  assert.doesNotMatch(fragment01Source, /\bconst\s+restoreOpenCouncilDetails\s*=/);
  assert.doesNotMatch(fragment01Source, /\bconst\s+isCouncilComparisonSummary\s*=/);
  assert.doesNotMatch(fragment01Source, /\bconst\s+normalizeCouncilComparisonDetails\s*=/);
  assert.doesNotMatch(fragment01Source, /\bconst\s+hasUnclosedCouncilDetails\s*=/);
  assert.match(fragment01Source, /createStreamingMarkdownFeature\(\{/);
  assert.doesNotMatch(fragment01Source, /const\s+createStreamingMarkdownRenderer\s*=\s*\(/);
  assert.doesNotMatch(fragment01Source, /async\s+function\s+streamMarkdownResponse\b/);
  assert.match(fragment01Source, /targetElement\.innerHTML\s*=/);
  assert.match(fragment01Source, /renderMarkdownWithFormulas\(/);
  assert.match(fragment01Source, /requestAnimationFrame\(/);
  assert.ok(statSync(projectFile('src/app/runtime/legacy-core/legacy-core.js')).size < 150 * 1024);
});

test('streaming markdown render state helper is isolated from the 01 runtime renderer', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/streaming-markdown-render-state.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const rendererSource = readSource('src/app/legacy-runtime/features/streaming-markdown-renderer.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/streaming-markdown-render-state.js'));

  assert.equal(typeof helpers.createStreamingMarkdownRenderState, 'function');
  assert.match(helperSource, /export\s+function\s+createStreamingMarkdownRenderState\b/);
  assert.match(
    rendererSource,
    /import\s*\{\s*createStreamingMarkdownRenderState\s*\}\s*from\s+'\.\/streaming-markdown-render-state\.js';/
  );
  assert.doesNotMatch(fragment00Source, /import\s*\{[^}]*\bcreateStreamingMarkdownRenderState\b/);
  assert.match(rendererSource, /const\s+renderState\s*=\s*createStreamingMarkdownRenderState\(\);/);
  assert.match(rendererSource, /renderState\.appendText\(chunk\)/);
  assert.match(rendererSource, /renderState\.flushPending\(\{\s*force\s*\}\)/);
  assert.match(rendererSource, /renderState\.syncCurrentLine\(\)/);
  assert.match(rendererSource, /renderState\.finalize\(\)/);
  assert.match(rendererSource, /renderState\.getText\(\)/);
  assert.doesNotMatch(
    fragment01Source,
    /let\s+fullText\s*=\s*'';\s*let\s+finalizedText\s*=\s*'';\s*let\s+pendingText\s*=\s*'';\s*let\s+currentLineText\s*=\s*'';\s*let\s+isFinalized\s*=\s*false;/s
  );
  assert.doesNotMatch(fragment01Source, /currentLineNode\.innerHTML\s*=\s*''/);
  assert.doesNotMatch(fragment01Source, /streaming-markdown-root/);
  assert.match(fragment01Source, /renderMarkdownWithFormulas,/);
  assert.match(fragment01Source, /renderMarkdown,/);
  assert.match(fragment01Source, /\bisChatNearBottom,/);
  assert.match(fragment01Source, /\bkeepChatPositionAfterRender,/);
  assert.match(fragment01Source, /requestAnimationFrame\(/);
  assert.match(fragment01Source, /createTypewriterPlaybackController\(\{/);
  assert.ok(statSync(projectFile('src/app/runtime/legacy-core/legacy-core.js')).size < 150 * 1024);
});

test('streaming markdown renderer and response core is isolated from the 01 runtime fragment', async () => {
  const rendererSource = readSource('src/app/legacy-runtime/features/streaming-markdown-renderer.js');
  const lifecycleSource = readSource('src/app/legacy-runtime/features/single-model-response-lifecycle.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/streaming-markdown-renderer.js'));

  assert.equal(typeof helpers.createStreamingMarkdownFeature, 'function');
  assert.match(rendererSource, /export\s+function\s+createStreamingMarkdownFeature\b/);
  assert.match(
    fragment00Source,
    /import\s*\{\s*createStreamingMarkdownFeature\s*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/streaming-markdown-renderer\.js';/
  );
  assert.match(fragment01Source, /}\s*=\s*createStreamingMarkdownFeature\(\{/);
  assert.match(fragment01Source, /\bdocument,/);
  assert.match(fragment01Source, /\brenderMarkdown,/);
  assert.match(fragment01Source, /\brenderMarkdownWithFormulas,/);
  assert.match(fragment01Source, /\bisChatNearBottom,/);
  assert.match(fragment01Source, /\bkeepChatPositionAfterRender,/);
  assert.match(fragment01Source, /scheduleFrame:\s*\(callback\)\s*=>\s*requestAnimationFrame\(callback\)/);
  assert.match(fragment01Source, /waitForFrame:\s*\(\)\s*=>\s*new Promise\(\(?resolve\)?\s*=>\s*(?:setTimeout|scheduleTimeout)\(resolve,\s*16\)\)/);
  assert.match(fragment01Source, /getStreamErrorText:\s*\(error\)\s*=>/);

  assert.doesNotMatch(fragment01Source, /const\s+renderFinalized\s*=/);
  assert.doesNotMatch(fragment01Source, /const\s+appendFadedText\s*=/);
  assert.doesNotMatch(fragment01Source, /const\s+flushPendingLines\s*=/);
  assert.doesNotMatch(fragment01Source, /const\s+ensureRenderer\s*=/);
  assert.doesNotMatch(fragment01Source, /const\s+frameQueue\s*=\s*createStreamingTextFrameQueue\(\{/);
  assert.doesNotMatch(fragment01Source, /targetElement\.dataset\.streamRendered\s*=\s*'true'/);
  assert.doesNotMatch(fragment01Source, /streaming-markdown-finalized/);
  assert.doesNotMatch(fragment01Source, /streaming-current-line/);

  assert.match(fragment01Source, /const\s+playbackStreamingMarkdownResponse\s*=/);
  assert.match(fragment01Source, /createStreamingMarkdownRenderer\(targetElement,\s*\{\s*preserveCouncilDetails\s*\}\)/);
  assert.match(lifecycleSource, /fullResponse\s*=\s*await\s+streamMarkdownResponse\(/);
  assert.match(
    fragment01Source,
    /renderRealtimeCouncilFinal:\s*\(\{\s*targetElement,\s*fullResponse\s*\}\)\s*=>\s*renderIncrementalResponse\(targetElement,\s*fullResponse,/
  );
  assert.match(fragment01Source, /createTypewriterPlaybackController\(\{/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/streaming-markdown-renderer.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/runtime/legacy-core/legacy-core.js')).size < 140 * 1024);
});

test('single-model response lifecycle is isolated from the 01 runtime submit flow', async () => {
  const lifecycleSource = readSource('src/app/legacy-runtime/features/single-model-response-lifecycle.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/single-model-response-lifecycle.js'));

  assert.equal(typeof helpers.createSingleModelResponseLifecycle, 'function');
  assert.match(lifecycleSource, /export\s+function\s+createSingleModelResponseLifecycle\b/);
  assert.match(
    fragment00Source,
    /import\s*\{\s*createSingleModelResponseLifecycle\s*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/single-model-response-lifecycle\.js';/
  );
  assert.match(fragment01Source, /const\s+singleModelResponseLifecycle\s*=\s*createSingleModelResponseLifecycle\(\{/);
  assert.match(fragment01Source, /buildSingleModelTranslatedRequestParts:\s*\(\.\.\.args\)\s*=>\s*buildSingleModelTranslatedRequestParts\(\.\.\.args\)/);
  assert.match(fragment01Source, /streamApiCall:\s*\(\.\.\.args\)\s*=>\s*streamApiCall\(\.\.\.args\)/);
  assert.match(fragment01Source, /const\s+singleResult\s*=\s*await\s+singleModelResponseLifecycle\.run\(\{/);
  assert.match(fragment01Source, /completeSingleModelView:\s*\(options\)\s*=>\s*singleModelResponseLifecycle\.completeView\(options\)/);
  assert.match(fragment01Source, /singleModelResponseLifecycle\.stop\(\)/);
  assert.match(fragment01Source, /singleModelResponseLifecycle\.getLatestProgress\(\)/);

  for (const removedCore of [
    /let\s+latestSingleProgress\s*=/,
    /const\s+renderSingleProgressState\s*=/,
    /const\s+updateSingleStreamingProgress\s*=/,
    /const\s+runSingleApiStream\s*=/,
    /const\s+hasTranslationInputs\s*=/,
    /let\s+requestParts\s*=\s*userParts/,
    /let\s+receivedChars\s*=\s*0/,
    /let\s+lastSingleProgressAt\s*=\s*0/,
    /let\s+singleProgressTimer\s*=\s*null/
  ]) {
    assert.doesNotMatch(fragment01Source, removedCore);
  }

  assert.doesNotMatch(lifecycleSource, /runModelCouncil\b/);
  assert.doesNotMatch(lifecycleSource, /saveAppData\b/);
  assert.doesNotMatch(lifecycleSource, /fetch\s*\(/);
  assert.doesNotMatch(lifecycleSource, /TextDecoder\b/);
  assert.doesNotMatch(lifecycleSource, /indexedDB\b/);

  assert.match(fragment01Source, /const\s+councilResult\s*=\s*await\s+runCouncilResponseRenderLifecycle\(\{/);
  assert.match(fragment01Source, /await\s+finalizeAssistantResponse\(\{/);
  assert.match(fragment01Source, /await\s+persistAssistantResponseError\(\{/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/single-model-response-lifecycle.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/runtime/legacy-core/legacy-core.js')).size < 135 * 1024);
});

test('response progress renderers and submit preparation are isolated from the 01 runtime shell', async () => {
  const runtimeContextSource = readSource('src/app/legacy-runtime/runtime/legacy-runtime-context.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const progressSource = readSource('src/app/legacy-runtime/features/response-progress-renderers.js');
  const submitPrepSource = readSource('src/app/legacy-runtime/features/submit-input-preparation-lifecycle.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const runtimeContextHelpers = await import(projectFile('src/app/legacy-runtime/runtime/legacy-runtime-context.js'));
  const progressHelpers = await import(projectFile('src/app/legacy-runtime/features/response-progress-renderers.js'));
  const submitPrepHelpers = await import(projectFile('src/app/legacy-runtime/features/submit-input-preparation-lifecycle.js'));

  assert.equal(typeof runtimeContextHelpers.createLegacyRuntimeContext, 'function');
  assert.equal(typeof progressHelpers.createResponseProgressRenderers, 'function');
  assert.equal(typeof submitPrepHelpers.createSubmitInputPreparationLifecycle, 'function');
  assert.match(runtimeContextSource, /export\s+function\s+createLegacyRuntimeContext\b/);
  assert.match(
    fragment00Source,
    /import\s*\{\s*createLegacyRuntimeContext\s*\}\s*from\s+'\/src\/app\/legacy-runtime\/runtime\/legacy-runtime-context\.js';/
  );
  assert.match(fragment00Source, /const\s+legacyRuntimeContext\s*=\s*createLegacyRuntimeContext\(\);/);
  assert.match(progressSource, /export\s+function\s+createResponseProgressRenderers\b/);
  assert.match(submitPrepSource, /export\s+function\s+createSubmitInputPreparationLifecycle\b/);
  assert.match(
    fragment01Source,
    /import\s*\{\s*createResponseProgressRenderers\s*\}\s*from\s+['"][^'"]*legacy-runtime\/features\/response-progress-renderers\.js['"];/
  );
  assert.match(
    fragment01Source,
    /import\s*\{\s*createSubmitInputPreparationLifecycle\s*\}\s*from\s+['"][^'"]*legacy-runtime\/features\/submit-input-preparation-lifecycle\.js['"];/
  );
  assert.match(fragment01Source, /\{\s*renderCouncilProgress,\s*renderSingleModelError,\s*renderSingleModelProgress\s*\}\s*=\s*createResponseProgressRenderers\(\{/);
  assert.match(fragment01Source, /submitInputPreparationLifecycle\s*=\s*createSubmitInputPreparationLifecycle\(\{/);
  assert.match(fragment01Source, /const\s+preparedSubmit\s*=\s*await\s+submitInputPreparationLifecycle\.prepareSubmitResponse\(\);/);
  assert.match(fragment01Source, /if\s*\(!preparedSubmit\.shouldContinue\)\s*return;/);
  const submitPreparationWiring = getBlockFromMarker(fragment01Source, 'createSubmitInputPreparationLifecycle({');
  for (const bindingName of [
    'updateSubmitButtonState',
    'generateTitleAndSummary',
    'shouldPerformWebSearch',
    'renderFilePreviews'
  ]) {
    assert.match(
      fragment01Source,
      new RegExp(`${bindingName}:\\s*\\(\\.\\.\\.args\\)\\s*=>\\s*legacyRuntimeContext\\.resolveBinding\\('submit\\.${bindingName}'\\)\\(\\.\\.\\.args\\)`)
    );
    assert.doesNotMatch(
      submitPreparationWiring,
      new RegExp(`\\n\\s*${bindingName},\\s*\\n`)
    );
  }
  assert.match(
    readSource('src/app/runtime/legacy-core/legacy-core.js'),
    /const\s+adjustTextareaHeightAlias\s*=\s*\(\.\.\.args\)\s*=>\s*\{[\s\S]*resolveRuntimeEntryAdjustTextareaHeight\(\)[\s\S]*return\s+undefined;[\s\S]*\};[\s\S]*registerLazyBinding\('submit\.adjustTextareaHeight',\s*\(\)\s*=>\s*\{[\s\S]*return\s+adjustTextareaHeightAlias;[\s\S]*\}\)/
  );
  assert.doesNotMatch(
    readSource('src/app/runtime/legacy-core/legacy-core.js'),
    /return\s+adjustTextareaHeight;/
  );
  assert.match(
    fragment01Source,
    /adjustTextareaHeight:\s*\(\.\.\.args\)\s*=>\s*legacyRuntimeContext\.resolveBinding\('submit\.adjustTextareaHeight'\)\(\.\.\.args\)/
  );
  assert.doesNotMatch(fragment01Source, /\n\s*adjustTextareaHeight,\s*\n/);
  assert.match(fragment01Source, /if\s*\(responseUsesCouncil\)\s*\{[\s\S]*runCouncilResponseRenderLifecycle\(\{/);
  assert.match(fragment01Source, /\}\s*else\s*\{[\s\S]*singleModelResponseLifecycle\.run\(\{/);

  assert.doesNotMatch(fragment01Source, /const\s+renderCouncilProgress\s*=\s*\(progress\)\s*=>/);
  assert.doesNotMatch(fragment01Source, /const\s+renderSingleModelProgress\s*=\s*\(progress\)\s*=>/);
  assert.doesNotMatch(fragment01Source, /const\s+renderSingleModelError\s*=\s*\(progress\s*=\s*\{\},\s*errorMessage\s*=\s*''\)\s*=>/);
  assert.doesNotMatch(fragment01Source, /const\s+userParts\s*=\s*\[\];/);
  assert.doesNotMatch(fragment01Source, /uploadedFiles\.forEach\(file\s*=>\s*\{\s*userParts\.push/s);
  assert.doesNotMatch(fragment01Source, /const\s+councilValidation\s*=\s*getCouncilValidation\(conv,\s*uploadedFiles\);/);
  assert.doesNotMatch(fragment01Source, /ALL_ELEMENTS\.messageInput\.value\s*=\s*'';\s*uploadedFiles\s*=\s*\[\];/s);

  assert.match(fragment01Source, /renderCouncilProgress,/);
  assert.match(fragment01Source, /renderError:\s*renderSingleModelError/);
  assert.match(fragment01Source, /runCouncilResponseRenderLifecycle\(\{/);
  assert.match(fragment01Source, /singleModelResponseLifecycle\.run\(\{/);
  assert.match(fragment01Source, /finalizeAssistantResponse\(\{/);
  assert.match(fragment01Source, /runSubmitFinalCleanupLifecycle\(/);

  assert.doesNotMatch(`${progressSource}\n${submitPrepSource}`, /TextDecoder|response\.body|streamApiCall/);
  assert.doesNotMatch(`${progressSource}\n${submitPrepSource}`, /indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(`${progressSource}\n${submitPrepSource}`, /virtual:legacy-app-runtime|vite\.config|package\.json|REFACTOR_PLAN/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/response-progress-renderers.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/submit-input-preparation-lifecycle.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/runtime/legacy-core/legacy-core.js')).size < 150 * 1024);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/02-runtime.fragment.js')), false);
});

test('model switcher preparation and lifecycle are isolated from the 01 runtime shell', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/model-switcher-lifecycle.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/model-switcher-lifecycle.js'));

  assert.equal(typeof helpers.prepareModelSwitcherModels, 'function');
  assert.equal(typeof helpers.createModelSwitcherLifecycle, 'function');
  assert.match(helperSource, /export\s+function\s+prepareModelSwitcherModels\b/);
  assert.match(helperSource, /export\s+function\s+createModelSwitcherLifecycle\b/);
  assert.match(
    fragment01Source,
    /import\s*\{\s*createModelSwitcherLifecycle\s*\}\s*from\s+['"][^'"]*legacy-runtime\/features\/model-switcher-lifecycle\.js['"];/
  );
  assert.match(fragment01Source, /\{\s*renderModelSwitcher\s*\}\s*=\s*createModelSwitcherLifecycle\(\{/);
  assert.match(helperSource, /\bgetModelSwitcherContainer\b/);
  assert.doesNotMatch(helperSource, /\belements\b/);
  assert.doesNotMatch(helperSource, /\bALL_ELEMENTS\b/);
  assert.match(fragment01Source, /getModelSwitcherContainer:\s*\(\)\s*=>\s*ALL_ELEMENTS\.modelSwitcherContainer/);
  const modelSwitcherWiring = getBlockFromMarker(fragment01Source, 'createModelSwitcherLifecycle({');
  assert.doesNotMatch(modelSwitcherWiring, /elements:\s*ALL_ELEMENTS/);

  assert.doesNotMatch(fragment01Source, /const\s+renderModelSwitcher\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(fragment01Source, /const\s+processedModels\s*=\s*MODELS\.map\(model\s*=>/);
  assert.doesNotMatch(fragment01Source, /const\s+popoverHTML\s*=\s*`/);
  assert.doesNotMatch(fragment01Source, /providerView\.innerHTML\s*=/);
  assert.doesNotMatch(fragment01Source, /modelListView\.addEventListener\('click'/);

  assert.match(helperSource, /const\s+renderModelSwitcher\s*=\s*\(\)\s*=>/);
  assert.match(helperSource, /providerView\.innerHTML\s*=/);
  assert.match(helperSource, /modelListView\.addEventListener\('click'/);
  assert.match(fragment01Source, /renderModelSwitcher,/);
  assert.match(fragment01Source, /renderCouncilControls,/);

  assert.doesNotMatch(helperSource, /TextDecoder|response\.body|streamApiCall/);
  assert.doesNotMatch(helperSource, /indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(helperSource, /virtual:legacy-app-runtime|vite\.config|package\.json|REFACTOR_PLAN/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/model-switcher-lifecycle.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/runtime/legacy-core/legacy-core.js')).size < 150 * 1024);
});

test('council controls lifecycle is isolated from the 01 runtime shell', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/council-controls-lifecycle.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/council-controls-lifecycle.js'));

  assert.equal(typeof helpers.createCouncilControlsLifecycle, 'function');
  assert.match(helperSource, /export\s+function\s+createCouncilControlsLifecycle\b/);
  assert.match(
    fragment01Source,
    /import\s*\{\s*createCouncilControlsLifecycle\s*\}\s*from\s+['"][^'"]*legacy-runtime\/features\/council-controls-lifecycle\.js['"];/
  );
  assert.match(fragment01Source, /\{\s*renderCouncilControls\s*\}\s*=\s*createCouncilControlsLifecycle\(\{/);
  assert.match(helperSource, /\bgetFileInputContainer\b/);
  assert.doesNotMatch(helperSource, /\belements\b/);
  assert.doesNotMatch(helperSource, /elements\.fileInputContainer/);
  assert.match(fragment01Source, /getFileInputContainer\s*=\s*\(\)\s*=>\s*ALL_ELEMENTS\.fileInputContainer/);
  assert.doesNotMatch(fragment01Source, /getFileInputContainer:\s*ALL_ELEMENTS\.fileInputContainer/);
  const councilControlsWiring = getBlockFromMarker(fragment01Source, 'createCouncilControlsLifecycle({');
  assert.doesNotMatch(councilControlsWiring, /elements:\s*ALL_ELEMENTS/);

  assert.doesNotMatch(fragment01Source, /const\s+renderCouncilControls\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(fragment01Source, /id="model-council-enabled"/);
  assert.doesNotMatch(fragment01Source, /data-council-participant=/);
  assert.doesNotMatch(fragment01Source, /const\s+applyCouncilModelSearch\s*=/);
  assert.match(helperSource, /const\s+renderCouncilControls\s*=\s*\(\)\s*=>/);
  assert.match(helperSource, /id="model-council-enabled"/);
  assert.match(helperSource, /data-council-participant=/);
  assert.match(fragment01Source, /persistCouncilConfig,/);
  assert.match(fragment01Source, /seedCouncilParticipants,/);
  assert.match(fragment01Source, /renderCouncilControls,/);

  assert.doesNotMatch(helperSource, /TextDecoder|response\.body|streamApiCall/);
  assert.doesNotMatch(helperSource, /indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(helperSource, /virtual:legacy-app-runtime|vite\.config|package\.json|REFACTOR_PLAN/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/council-controls-lifecycle.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/runtime/legacy-core/legacy-core.js')).size < 150 * 1024);
});

test('assistant response finalization is isolated from the 01 runtime submit flow', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/assistant-response-finalization.js');
  const submitPrepSource = readSource('src/app/legacy-runtime/features/submit-input-preparation-lifecycle.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/assistant-response-finalization.js'));
  const submitFlowSource = fragment01Source.slice(fragment01Source.indexOf('const handleFormSubmit'));

  assert.equal(typeof helpers.finalizeAssistantResponse, 'function');
  assert.equal(typeof helpers.persistAssistantResponseError, 'function');
  assert.match(helperSource, /export\s+async\s+function\s+finalizeAssistantResponse\b/);
  assert.match(helperSource, /export\s+async\s+function\s+persistAssistantResponseError\b/);
  assert.match(
    fragment00Source,
    /import\s*\{\s*finalizeAssistantResponse,\s*persistAssistantResponseError\s*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/assistant-response-finalization\.js';/
  );
  assert.match(fragment01Source, /await\s+finalizeAssistantResponse\(\{/);
  assert.match(fragment01Source, /await\s+persistAssistantResponseError\(\{/);
  assert.match(fragment01Source, /completeSingleModelView:\s*\(options\)\s*=>\s*singleModelResponseLifecycle\.completeView\(options\)/);
  assert.match(fragment01Source, /persistAppData:\s*saveAppData/);
  assert.match(fragment01Source, /renderError:\s*renderSingleModelError/);

  for (const removedFinalizationCore of [
    /if\s*\(!String\(fullResponse\s*\|\|\s*''\)\.trim\(\)\)\s*\{/,
    /sendConversationToMail\(userMessageObject,\s*fullResponse\)/,
    /finalAiMessage\.parts\s*=\s*\[\{\s*text:\s*fullResponse\s*\}\]/,
    /conv\.messages\.push\(finalAiMessage\)/,
    /const\s+errorMessage\s*=/,
    /const\s+currentProgress\s*=/,
    /contentDiv\.innerHTML\s*=\s*renderSingleModelError\(/,
    /const\s+finalAiMessage\s*=\s*\{\s*role:\s*'model',\s*parts:\s*\[\{\s*text:\s*errorMessage\s*\}\]/,
    /await\s+extractPersonalMemory\(userMessage,\s*fullResponse\)/
  ]) {
    assert.doesNotMatch(submitFlowSource, removedFinalizationCore);
  }

  assert.match(helperSource, /sendConversationToMail\(userMessageObject,\s*fullResponse\)/);
  assert.match(helperSource, /conversation\.messages\.push\(finalAiMessage\)/);
  assert.match(helperSource, /await\s+extractPersonalMemory\(userMessageText,\s*fullResponse\)/);
  assert.match(helperSource, /conversation\.messages\.push\(finalAiMessage\)/);
  assert.match(helperSource, /targetElement\.innerHTML\s*=\s*renderError\(currentProgress,\s*errorMessage\)/);
  assert.doesNotMatch(helperSource, /fetch\s*\(/);
  assert.doesNotMatch(helperSource, /TextDecoder\b|response\.body|streamApiCall\b/);
  assert.doesNotMatch(helperSource, /indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(helperSource, /virtual:legacy-app-runtime|vite\.config|package\.json/);
  assert.match(fragment01Source, /legacyRuntimeContext\.resolveBinding\('submit\.updateSubmitButtonState'\)/);
  assert.match(submitPrepSource, /updateSubmitButtonState\(false\)/);
  assert.match(fragment01Source, /renderCouncilControls,/);
  assert.match(fragment01Source, /renderInputIndicators,/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/assistant-response-finalization.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/runtime/legacy-core/legacy-core.js')).size < 130 * 1024);
});

test('submit final cleanup lifecycle is isolated from the 01 runtime submit flow', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/submit-final-cleanup-lifecycle.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/submit-final-cleanup-lifecycle.js'));

  assert.equal(typeof helpers.runSubmitFinalCleanupLifecycle, 'function');
  assert.match(helperSource, /export\s+function\s+runSubmitFinalCleanupLifecycle\b/);
  assert.match(
    fragment00Source,
    /import\s*\{\s*runSubmitFinalCleanupLifecycle\s*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/submit-final-cleanup-lifecycle\.js';/
  );
  assert.match(fragment01Source, /const\s+lastMessageElement\s*=\s*runSubmitFinalCleanupLifecycle\(\s*\(\)\s*=>\s*singleModelResponseLifecycle\.stop\(\),/);
  assert.match(fragment01Source, /\(\)\s*=>\s*\{\s*setIsCouncilRunning\(false\);\s*setAbortController\(null\);\s*\},/);
  assert.match(fragment01Source, /\(\.\.\.args\)\s*=>\s*legacyRuntimeContext\.resolveBinding\('submit\.updateSubmitButtonState'\)\(\.\.\.args\),\s*\(\.\.\.args\)\s*=>\s*legacyRuntimeContext\.resolveBinding\('input\.updateInputState'\)\(\.\.\.args\),\s*renderCouncilControls,\s*renderInputIndicators,/);
  assert.match(fragment01Source, /\(\)\s*=>\s*ALL_ELEMENTS\.messageList\.lastElementChild/);
  assert.doesNotMatch(
    fragment01Source,
    /singleModelResponseLifecycle\.stop\(\);\s*isCouncilRunning\s*=\s*false;\s*abortController\s*=\s*null;\s*updateSubmitButtonState\(false\);\s*updateInputState\(\);\s*renderCouncilControls\(\);\s*renderInputIndicators\(\);/s
  );
  assert.match(helperSource, /stopSingleModelLifecycle\(\);\s*resetSubmitState\(\);\s*updateSubmitButtonState\(false\);\s*updateInputState\(\);\s*renderCouncilControls\(\);\s*renderInputIndicators\(\);/s);
  assert.doesNotMatch(helperSource, /fetch\s*\(/);
  assert.doesNotMatch(helperSource, /TextDecoder\b|response\.body|streamApiCall\b/);
  assert.doesNotMatch(helperSource, /indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(helperSource, /virtual:legacy-app-runtime|vite\.config|package\.json/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/submit-final-cleanup-lifecycle.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/runtime/legacy-core/legacy-core.js')).size < 130 * 1024);
});

test('model message post-response actions remove the 01 to 02 last message lexical continuation', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/model-message-post-response-actions.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const fragment02Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/model-message-post-response-actions.js'));

  assert.equal(typeof helpers.applyModelMessagePostResponseActions, 'function');
  assert.match(helperSource, /export\s+function\s+applyModelMessagePostResponseActions\b/);
  assert.match(
    fragment00Source,
    /import\s*\{\s*applyModelMessagePostResponseActions\s*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/model-message-post-response-actions\.js';/
  );
  assert.match(fragment01Source, /const\s+lastMessageElement\s*=\s*runSubmitFinalCleanupLifecycle\(/);
  assert.match(fragment01Source, /applyModelMessagePostResponseActions\(\{\s*lastMessageElement,/);
  assert.match(fragment01Source, /conversation:\s*conv,/);
  assert.match(fragment01Source, /formatTimestamp:\s*formatFullTimestamp/);
  assert.doesNotMatch(fragment01Source, /\blastMessageDiv\b/);

  assert.doesNotMatch(fragment02Source, /\blastMessageDiv\b/);
  assert.doesNotMatch(fragment02Source, /copy-content-btn[\s\S]*insertAdjacentHTML\('beforeend'/);
  assert.doesNotMatch(fragment02Source, /classList\.contains\('model-message'\)/);

  assert.match(helperSource, /lastMessageElement\.classList\.contains\('model-message'\)/);
  assert.match(helperSource, /bubble\.insertAdjacentHTML\('beforeend',\s*actionButtonsHTML\)/);
  assert.match(helperSource, /content\.classList\.add\('pb-8'\)/);
  assert.doesNotMatch(helperSource, /fetch\s*\(/);
  assert.doesNotMatch(helperSource, /TextDecoder\b|response\.body|streamApiCall\b/);
  assert.doesNotMatch(helperSource, /indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(helperSource, /virtual:legacy-app-runtime|vite\.config|package\.json/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/model-message-post-response-actions.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/runtime/legacy-core/legacy-core.js')).size < 130 * 1024);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/02-runtime.fragment.js')), false);
});

test('general message markup rendering is isolated from the 01 runtime DOM shell', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/message-markup-renderer.js');
  const messageListSource = readSource('src/app/legacy-runtime/features/message-list-lifecycle.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const sidebarChatAstraRenderSource = readSource('src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js');
  const dependencySource = readSource('src/app/runtime/runtime-entry-dependencies.js');
  const appBootstrapLifecycleSource = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');
  const postResponseActionsSource = readSource('src/app/legacy-runtime/features/model-message-post-response-actions.js');
  const streamingRendererSource = readSource('src/app/legacy-runtime/features/streaming-markdown-renderer.js');
  const finalizationSource = readSource('src/app/legacy-runtime/features/assistant-response-finalization.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/message-markup-renderer.js'));
  const messageListHelpers = await import(projectFile('src/app/legacy-runtime/features/message-list-lifecycle.js'));

  assert.equal(typeof helpers.buildMessageRenderView, 'function');
  assert.equal(typeof messageListHelpers.createMessageListLifecycle, 'function');
  assert.match(helperSource, /export\s+function\s+buildMessageRenderView\b/);
  assert.match(messageListSource, /export\s+function\s+createMessageListLifecycle\b/);
  assert.match(
    fragment00Source,
    /import\s*\{\s*buildMessageRenderView\s*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/message-markup-renderer\.js';/
  );
  assert.match(
    sidebarChatAstraRenderSource,
    /import\s*\{\s*createMessageListLifecycle\s*\}\s*from\s+['"][^'"]*legacy-runtime\/features\/message-list-lifecycle\.js['"];/
  );
  assert.match(sidebarChatAstraRenderSource, /\{\s*addMessageToUI,\s*renderChat\s*\}\s*=\s*createMessageListLifecycle\(\{/);
  assert.match(sidebarChatAstraRenderSource, /buildMediaAttachmentView:\s*buildMessageMediaAttachmentView/);
  assert.match(sidebarChatAstraRenderSource, /bindMediaPreviewButtons:\s*bindMessageMediaPreviewButtons/);
  assert.match(messageListSource, /const\s+messageView\s*=\s*buildMessageRenderView\(\{\s*message,/);
  assert.match(messageListSource, /messageElement\.className\s*=\s*messageView\.messageClassName/);
  assert.match(messageListSource, /messageElement\.innerHTML\s*=\s*messageView\.messageHTML/);
  assert.match(messageListSource, /bindMediaPreviewButtons\(messageElement,\s*messageView\.previewMediaParts\)/);

  assert.doesNotMatch(sidebarChatAstraRenderSource, /const\s+isUser\s*=\s*msg\.role\s*===\s*'user'/);
  assert.doesNotMatch(sidebarChatAstraRenderSource, /const\s+isLoadingMessage\s*=\s*!isUser/);
  assert.doesNotMatch(sidebarChatAstraRenderSource, /let\s+textPartsContent\s*=\s*\[\]/);
  assert.doesNotMatch(sidebarChatAstraRenderSource, /const\s+messageBubble\s*=\s*`/);
  assert.doesNotMatch(sidebarChatAstraRenderSource, /copy-content-btn[\s\S]*contentPaddingClass\s*=\s*'pb-8'/);

  assert.doesNotMatch(sidebarChatAstraRenderSource, /const\s+addMessageToUI\s*=\s*\(msg,\s*index,/);
  assert.doesNotMatch(sidebarChatAstraRenderSource, /const\s+renderChat\s*=\s*\(\)\s*=>/);
  assert.match(messageListSource, /conversation\.messages\.push\(message\)/);
  assert.match(messageListSource, /document\.createElement\('div'\)/);
  assert.match(messageListSource, /elements\.messageList\.appendChild\(messageElement\)/);
  assert.match(messageListSource, /elements\.chatContainer\.scrollTo/);
  assert.match(messageListSource, /scheduleFrame\(\(\)\s*=>\s*setupMessageIntersectionObserver\(\)\)/);
  assert.match(dependencySource, /'copyTextToClipboard'/);
  assert.match(appBootstrapLifecycleSource, /e\.target\.closest\('\.copy-content-btn'\)/);

  assert.match(postResponseActionsSource, /export\s+function\s+applyModelMessagePostResponseActions\b/);
  assert.match(streamingRendererSource, /export\s+function\s+createStreamingMarkdownFeature\b/);
  assert.match(finalizationSource, /export\s+async\s+function\s+finalizeAssistantResponse\b/);
  assert.doesNotMatch(helperSource, /document|window|globalThis|addEventListener|fetch\s*\(/);
  assert.doesNotMatch(`${helperSource}\n${messageListSource}`, /indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(`${helperSource}\n${messageListSource}`, /virtual:legacy-app-runtime|vite\.config|package\.json/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/message-markup-renderer.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/message-list-lifecycle.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/runtime/legacy-core/legacy-core.js')).size < 125 * 1024);
});

test('media renderer and preview lifecycle replace fragment-local and hidden lexical media helpers', async () => {
  const rendererSource = readSource('src/app/legacy-runtime/features/media-attachment-renderer.js');
  const previewSource = readSource('src/app/legacy-runtime/features/media-preview-lifecycle.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const sidebarChatAstraRenderSource = readSource('src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js');
  const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const searchUploadSidebarSource = readSource('src/app/runtime/legacy-core/search-upload-sidebar-lifecycle.js');
  const coreTailSource = readSource('src/app/runtime/legacy-core/core-tail-lifecycle.js');
  const trashLifecycleSource = readSource('src/app/runtime/features/trash-lifecycle.js');
  const dependencySource = readSource('src/app/runtime/runtime-entry-dependencies.js');
  const appBootstrapLifecycleSource = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');
  const messageMarkupSource = readSource('src/app/legacy-runtime/features/message-markup-renderer.js');
  const postResponseActionsSource = readSource('src/app/legacy-runtime/features/model-message-post-response-actions.js');
  const conversationViewSource = readSource('src/app/legacy-runtime/features/conversation-view-renderer.js');
  const uploadedPreviewSource = readSource('src/app/legacy-runtime/features/uploaded-file-preview-lifecycle.js');
  const rendererHelpers = await import(projectFile('src/app/legacy-runtime/features/media-attachment-renderer.js'));
  const previewHelpers = await import(projectFile('src/app/legacy-runtime/features/media-preview-lifecycle.js'));
  const conversationViewHelpers = await import(projectFile('src/app/legacy-runtime/features/conversation-view-renderer.js'));
  const uploadedPreviewHelpers = await import(projectFile('src/app/legacy-runtime/features/uploaded-file-preview-lifecycle.js'));

  assert.equal(typeof rendererHelpers.createMediaAttachmentRenderer, 'function');
  assert.equal(typeof previewHelpers.createMediaPreviewLifecycle, 'function');
  assert.equal(typeof conversationViewHelpers.createConversationViewRenderer, 'function');
  assert.equal(typeof uploadedPreviewHelpers.createUploadedFilePreviewLifecycle, 'function');
  assert.match(rendererSource, /export\s+function\s+createMediaAttachmentRenderer\b/);
  assert.match(previewSource, /export\s+function\s+createMediaPreviewLifecycle\b/);
  assert.match(conversationViewSource, /export\s+function\s+createConversationViewRenderer\b/);
  assert.match(uploadedPreviewSource, /export\s+function\s+createUploadedFilePreviewLifecycle\b/);

  assert.match(fragment00Source, /createMediaAttachmentRenderer\s+as\s+createArchivedMediaAttachmentRenderer/);
  assert.match(fragment00Source, /createMediaPreviewLifecycle\s+as\s+createArchivedMediaPreviewLifecycle/);
  assert.match(sidebarChatAstraRenderSource, /createMediaAttachmentRenderer\s+as\s+createMessageMediaAttachmentRenderer/);
  assert.match(sidebarChatAstraRenderSource, /createMediaPreviewLifecycle\s+as\s+createMessageMediaPreviewLifecycle/);
  assert.match(searchUploadSidebarSource, /import\s+\{\s*createMediaAttachmentRenderer\s*\}/);
  assert.match(searchUploadSidebarSource, /import\s+\{\s*createMediaPreviewLifecycle\s*\}/);
  assert.match(trashLifecycleSource, /import\s+\{\s*createMediaAttachmentRenderer\s*\}/);
  assert.match(trashLifecycleSource, /import\s+\{\s*createMediaPreviewLifecycle\s*\}/);

  assert.match(fragment00Source, /createConversationViewRenderer\s+as\s+createArchivedConversationViewRenderer/);
  assert.match(fragment00Source, /archivedConversationViewRenderer\.renderConversationMessages\(\{/);
  assert.match(fragment00Source, /renderMediaAttachmentGrid:\s*renderArchivedMediaAttachmentGrid/);
  assert.match(fragment00Source, /bindMediaPreviewButtons:\s*bindArchivedMediaPreviewButtons/);
  assert.match(sidebarChatAstraRenderSource, /buildMediaAttachmentView:\s*buildMessageMediaAttachmentView/);
  assert.match(sidebarChatAstraRenderSource, /bindMediaPreviewButtons:\s*bindMessageMediaPreviewButtons/);
  assert.match(searchUploadSidebarSource, /import\s+\{\s*createConversationViewRenderer\s*\}/);
  assert.match(searchUploadSidebarSource, /searchConversationViewRenderer\.renderConversationMessages\(\{/);
  assert.match(searchUploadSidebarSource, /renderMediaAttachmentGrid:\s*renderSearchMediaAttachmentGrid/);
  assert.match(searchUploadSidebarSource, /bindMediaPreviewButtons:\s*bindSearchMediaPreviewButtons/);
  assert.match(searchUploadSidebarSource, /createUploadedFilePreviewLifecycle\(\{/);
  assert.match(searchUploadSidebarSource, /openMediaPreview:\s*openSearchMediaPreview/);
  assert.match(trashLifecycleSource, /import\s+\{\s*createConversationViewRenderer\s*\}/);
  assert.match(trashLifecycleSource, /trashConversationViewRenderer\.renderConversationMessages\(\{/);
  assert.match(trashLifecycleSource, /renderMediaAttachmentGrid,\s*bindMediaPreviewButtons/);

  assert.doesNotMatch(sidebarChatAstraRenderSource, /\bconst\s+getInlineMediaSrc\s*=/);
  assert.doesNotMatch(sidebarChatAstraRenderSource, /\bconst\s+renderMediaAttachmentGrid\s*=/);
  assert.doesNotMatch(sidebarChatAstraRenderSource, /\bconst\s+openMediaPreview\s*=/);
  assert.doesNotMatch(sidebarChatAstraRenderSource, /\bconst\s+bindMediaPreviewButtons\s*=/);
  assert.doesNotMatch(fragment03Source, /typeof\s+renderMediaAttachmentGrid/);
  assert.doesNotMatch(fragment03Source, /typeof\s+bindMediaPreviewButtons/);
  assert.doesNotMatch(fragment03Source, /\bopenMediaPreview\(/);
  assert.doesNotMatch(fragment03Source, /createUploadedFilePreviewLifecycle\(\{/);
  assert.doesNotMatch(fragment03Source, /const\s+renderFilePreviews\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(fragment03Source, /const\s+removeFile\s*=\s*\(fileId\)\s*=>/);
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/fragments/04-runtime.fragment.js')), false);
  assert.doesNotMatch(trashLifecycleSource, /typeof\s+renderMediaAttachmentGrid/);
  assert.doesNotMatch(trashLifecycleSource, /typeof\s+bindMediaPreviewButtons/);
  assert.doesNotMatch(fragment00Source, /conv\.messages\.forEach\(msg\s*=>/);
  assert.doesNotMatch(fragment03Source, /conv\.messages\.forEach\(msg\s*=>/);
  assert.doesNotMatch(trashLifecycleSource, /conv\.messages\.forEach\(msg\s*=>/);

  assert.match(messageMarkupSource, /const\s+mediaView\s*=\s*buildMediaAttachmentView\(mediaParts\)/);
  assert.match(messageMarkupSource, /previewMediaParts\s*=\s*mediaView\.previewMediaParts/);
  assert.match(postResponseActionsSource, /export\s+function\s+applyModelMessagePostResponseActions\b/);
  assert.match(dependencySource, /'copyTextToClipboard'/);
  assert.match(appBootstrapLifecycleSource, /e\.target\.closest\('\.copy-content-btn'\)/);
  assert.doesNotMatch(rendererSource, /document|window|globalThis|addEventListener|fetch\s*\(/);
  assert.doesNotMatch(rendererSource, /indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(previewSource, /indexedDB|localStorage|sessionStorage|streamApiCall/);
  assert.doesNotMatch(
    `${rendererSource}\n${previewSource}\n${conversationViewSource}\n${uploadedPreviewSource}`,
    /virtual:legacy-app-runtime|vite\.config|package\.json/
  );
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/media-attachment-renderer.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/media-preview-lifecycle.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/conversation-view-renderer.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/uploaded-file-preview-lifecycle.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/runtime/legacy-core/legacy-core.js')).size < 120 * 1024);
});

test('council response render lifecycle is isolated from the 01 runtime submit flow', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/council-response-render-lifecycle.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/council-response-render-lifecycle.js'));

  assert.equal(typeof helpers.runCouncilResponseRenderLifecycle, 'function');
  assert.match(helperSource, /export\s+async\s+function\s+runCouncilResponseRenderLifecycle\b/);
  assert.match(
    fragment00Source,
    /import\s*\{\s*runCouncilResponseRenderLifecycle\s*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/council-response-render-lifecycle\.js';/
  );
  assert.match(fragment01Source, /const\s+councilResult\s*=\s*await\s+runCouncilResponseRenderLifecycle\(\{/);
  assert.match(fragment01Source, /setCouncilRunning:\s*setIsCouncilRunning/);
  assert.match(fragment01Source, /requestFrame:\s*\(callback\)\s*=>\s*requestAnimationFrame\(callback\)/);

  for (const removedCouncilRenderCore of [
    /let\s+latestCouncilProgress\s*=/,
    /let\s+realtimeCouncilText\s*=/,
    /let\s+realtimeCouncilRenderer\s*=/,
    /const\s+renderCouncilProgressState\s*=/,
    /const\s+renderCouncilSynthesisChunk\s*=/,
    /let\s+councilProgressTimer\s*=/,
    /const\s+remainingCouncilText\s*=/
  ]) {
    assert.doesNotMatch(fragment01Source, removedCouncilRenderCore);
  }

  assert.match(helperSource, /const\s+renderCouncilProgressState\s*=/);
  assert.match(helperSource, /const\s+renderCouncilSynthesisChunk\s*=/);
  assert.match(helperSource, /await\s+runModelCouncil\(/);
  assert.match(helperSource, /await\s+appendRendererTextGradually\(/);
  assert.match(helperSource, /realtimeCouncilRenderer\.finish\(\{\s*renderFormulas:\s*true\s*\}\)/);
  assert.doesNotMatch(helperSource, /fetch\s*\(/);
  assert.doesNotMatch(helperSource, /TextDecoder\b|response\.body|streamApiCall\b/);
  assert.doesNotMatch(helperSource, /saveAppData\b|indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(helperSource, /virtual:legacy-app-runtime|vite\.config|package\.json/);
  assert.match(fragment01Source, /await\s+finalizeAssistantResponse\(\{/);
  assert.match(fragment01Source, /await\s+persistAssistantResponseError\(\{/);
  assert.match(fragment01Source, /persistAppData:\s*saveAppData/);
  assert.match(fragment01Source, /renderError:\s*renderSingleModelError/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/council-response-render-lifecycle.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/runtime/legacy-core/legacy-core.js')).size < 130 * 1024);
});

test('streaming text frame queue helper is isolated from the 01 runtime stream response', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/streaming-text-frame-queue.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const rendererSource = readSource('src/app/legacy-runtime/features/streaming-markdown-renderer.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/streaming-text-frame-queue.js'));

  assert.equal(typeof helpers.createStreamingTextFrameQueue, 'function');
  assert.match(helperSource, /export\s+function\s+createStreamingTextFrameQueue\b/);
  assert.match(
    fragment00Source,
    /import\s*\{[\s\S]*\bcreateStreamingTextFrameQueue\b[\s\S]*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/streaming-text-frame-queue\.js';/
  );
  assert.match(rendererSource, /const\s+frameQueue\s*=\s*createStreamingTextFrameQueue\(\{/);
  assert.match(rendererSource, /drainText:\s*\(chunkToRender\)\s*=>\s*ensureRenderer\(\)\.appendText\(chunkToRender\)/);
  assert.match(rendererSource, /onFirstChunk:\s*\(\)\s*=>\s*options\.onFirstChunk\?\.\(\)/);
  assert.match(rendererSource, /scheduleFrame,/);
  assert.match(rendererSource, /waitForFrame/);
  assert.match(rendererSource, /frameQueue\.enqueue\(chunk\)/);
  assert.match(rendererSource, /await\s+frameQueue\.flushUntilIdle\(\)/);
  assert.doesNotMatch(rendererSource, /\blet\s+textQueue\s*=/);
  assert.doesNotMatch(rendererSource, /\blet\s+isFrameRequested\s*=/);
  assert.doesNotMatch(rendererSource, /\blet\s+hasReceivedFirstChunk\s*=/);
  assert.doesNotMatch(rendererSource, /\bconst\s+renderFrame\s*=/);
  assert.match(rendererSource, /await\s+streamApiCallFn\(\(chunk\)\s*=>\s*\{/);
  assert.match(rendererSource, /targetElement\.innerHTML\s*=\s*options\.placeholderHTML/);
  assert.match(rendererSource, /targetElement\.innerHTML\s*=\s*renderMarkdown\(/);
  assert.match(rendererSource, /renderer\.finish\(\{\s*renderFormulas:\s*true\s*\}\)/);
  assert.doesNotMatch(fragment01Source, /async\s+function\s+streamMarkdownResponse\b/);
  assert.doesNotMatch(fragment01Source, /const\s+createStreamingMarkdownRenderer\s*=\s*\(/);
  assert.ok(statSync(projectFile('src/app/runtime/legacy-core/legacy-core.js')).size < 150 * 1024);
});

test('typewriter stream uses the shared streaming text frame queue boundary', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/streaming-text-frame-queue.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/streaming-text-frame-queue.js'));
  const typewriterStreamSource = fragment01Source.slice(
    fragment01Source.indexOf('async function typewriterStream'),
    fragment01Source.indexOf('const renderIncrementalResponse')
  );

  assert.equal(typeof helpers.createStreamingTextFrameQueue, 'function');
  assert.match(helperSource, /export\s+function\s+createStreamingTextFrameQueue\b/);
  assert.match(
    fragment00Source,
    /import\s*\{[\s\S]*\bcreateStreamingTextFrameQueue\b[\s\S]*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/streaming-text-frame-queue\.js';/
  );
  assert.match(typewriterStreamSource, /const\s+typewriterFrameQueue\s*=\s*createStreamingTextFrameQueue\(\{/);
  assert.match(typewriterStreamSource, /drainText:\s*\(chunkToRender\)\s*=>\s*\{/);
  assert.match(typewriterStreamSource, /typewriterFrameQueue\.enqueue\(chunk\)/);
  assert.match(typewriterStreamSource, /await\s+typewriterFrameQueue\.flushUntilIdle\(\)/);
  assert.doesNotMatch(typewriterStreamSource, /\blet\s+textQueue\s*=/);
  assert.doesNotMatch(typewriterStreamSource, /\blet\s+isFrameRequested\s*=/);
  assert.doesNotMatch(typewriterStreamSource, /\bconst\s+renderFrame\s*=/);
  assert.match(typewriterStreamSource, /requestAnimationFrame\(/);
  assert.match(typewriterStreamSource, /scheduleTimeout\(resolve,\s*16\)/);
  assert.match(typewriterStreamSource, /targetElement\.appendChild\(fragment\)/);
  assert.match(typewriterStreamSource, /targetElement\.innerHTML\s*=\s*renderMarkdownWithFormulas\(fullText\)/);
  assert.match(typewriterStreamSource, /renderMarkdown\(`[^`]*\$\{error\.message\}`\)/);
  assert.ok(statSync(projectFile('src/app/runtime/legacy-core/legacy-core.js')).size < 150 * 1024);
});

test('typewriter playback controller is isolated from the 01 runtime playback loops', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/typewriter-playback-controller.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/typewriter-playback-controller.js'));
  const playbackTypewriterSource = fragment01Source.slice(
    fragment01Source.indexOf('const playbackTypewriterResponse'),
    fragment01Source.indexOf('const isChatNearBottom')
  );
  const playbackStreamingSource = fragment01Source.slice(
    fragment01Source.indexOf('const playbackStreamingMarkdownResponse'),
    fragment01Source.indexOf('const appendRendererTextGradually')
  );

  assert.equal(typeof helpers.createTypewriterPlaybackController, 'function');
  assert.match(helperSource, /export\s+function\s+createTypewriterPlaybackController\b/);
  assert.match(
    fragment00Source,
    /import\s*\{[\s\S]*\bcreateTypewriterPlaybackController\b[\s\S]*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/typewriter-playback-controller\.js';/
  );
  assert.match(playbackTypewriterSource, /const\s+playbackController\s*=\s*createTypewriterPlaybackController\(\{/);
  assert.match(playbackStreamingSource, /const\s+playbackController\s*=\s*createTypewriterPlaybackController\(\{/);
  assert.match(playbackTypewriterSource, /renderIncrementalResponse\(targetElement,\s*currentText,\s*\{\s*cursor:\s*true,\s*preserveCouncilDetails\s*\}\)/);
  assert.match(playbackTypewriterSource, /renderIncrementalResponse\(targetElement,\s*fullResponse,\s*\{\s*final:\s*true,\s*preserveCouncilDetails\s*\}\)/);
  assert.match(playbackStreamingSource, /renderer\.appendText\(chunk\)/);
  assert.match(playbackStreamingSource, /renderer\.finish\(\{\s*renderFormulas:\s*true\s*\}\)/);
  assert.match(playbackTypewriterSource, /schedule:\s*\(callback,\s*delay\)\s*=>\s*scheduleTimeout\(callback,\s*delay\)/);
  assert.match(playbackStreamingSource, /schedule:\s*\(callback,\s*delay\)\s*=>\s*scheduleTimeout\(callback,\s*delay\)/);
  assert.doesNotMatch(playbackTypewriterSource, /\blet\s+currentIndex\s*=/);
  assert.doesNotMatch(playbackTypewriterSource, /\bconst\s+type\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(playbackTypewriterSource, /setTimeout\(type,\s*typingSpeed\)/);
  assert.doesNotMatch(playbackStreamingSource, /\blet\s+currentIndex\s*=/);
  assert.doesNotMatch(playbackStreamingSource, /\bconst\s+type\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(playbackStreamingSource, /setTimeout\(type,\s*typingSpeed\)/);
  assert.match(fragment01Source, /const\s+renderIncrementalResponse\s*=/);
  assert.match(fragment01Source, /createStreamingMarkdownRenderer,\s*\n\s*streamMarkdownResponse/);
  assert.doesNotMatch(fragment01Source, /const\s+createStreamingMarkdownRenderer\s*=\s*\(/);
  assert.match(fragment01Source, /targetElement\.innerHTML\s*=/);
  assert.match(fragment01Source, /renderMarkdownWithFormulas\(/);
  assert.match(fragment01Source, /isCouncilDeferredSectionVisible\(currentText\)/);
  assert.ok(statSync(projectFile('src/app/runtime/legacy-core/legacy-core.js')).size < 150 * 1024);
});

test('renderer gradual append controller is isolated from the 01 runtime RAF append loop', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/renderer-gradual-append-controller.js');
  const councilRenderSource = readSource('src/app/legacy-runtime/features/council-response-render-lifecycle.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/renderer-gradual-append-controller.js'));
  const submitFlowSource = fragment01Source.slice(
    fragment01Source.indexOf('const appendRendererTextGradually'),
    fragment01Source.indexOf('const startProgressTicker')
  );

  assert.equal(typeof helpers.appendRendererTextGradually, 'function');
  assert.match(helperSource, /export\s+async\s+function\s+appendRendererTextGradually\b/);
  assert.match(
    fragment00Source,
    /import\s*\{[\s\S]*\bappendRendererTextGradually\b[\s\S]*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/renderer-gradual-append-controller\.js';/
  );
  assert.match(fragment01Source, /appendRendererTextGradually,/);
  assert.match(councilRenderSource, /appendRendererTextGradually\(\s*realtimeCouncilRenderer,\s*remainingCouncilText,\s*signal,\s*18,\s*requestFrame\s*\)/);
  assert.doesNotMatch(fragment01Source, /const\s+appendRendererTextGradually\s*=\s*async/);
  assert.doesNotMatch(submitFlowSource, /for\s*\(\s*let\s+index\s*=\s*0;\s*index\s*<\s*source\.length[\s\S]*renderer\.appendText\(source\.slice\(index,\s*index\s*\+\s*chunkSize\)\)[\s\S]*requestAnimationFrame\(resolve\)/);
  assert.match(fragment01Source, /createStreamingMarkdownRenderer,\s*\n\s*streamMarkdownResponse/);
  assert.doesNotMatch(fragment01Source, /const\s+createStreamingMarkdownRenderer\s*=\s*\(/);
  assert.match(fragment01Source, /renderer\.appendText\(chunk\)/);
  assert.match(fragment01Source, /renderer\.finish\(\{\s*renderFormulas:\s*true\s*\}\)/);
  assert.match(fragment01Source, /requestAnimationFrame\(/);
  assert.match(fragment01Source, /targetElement\.innerHTML\s*=/);
  assert.match(fragment01Source, /renderMarkdownWithFormulas\(/);
  assert.ok(statSync(projectFile('src/app/runtime/legacy-core/legacy-core.js')).size < 150 * 1024);
});

test('version compare helper is isolated from the 00 runtime fragment and remains available to update logs', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/version-compare.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const coreTailSource = readSource('src/app/runtime/legacy-core/core-tail-lifecycle.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/version-compare.js'));

  assert.equal(typeof helpers.compareVersions, 'function');
  assert.match(helperSource, /export\s+const\s+compareVersions\b/);
  assert.match(
    fragment00Source,
    /import\s*\{[\s\S]*\bcompareVersions\b[\s\S]*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/version-compare\.js';/
  );
  assert.doesNotMatch(fragment00Source, /\b(?:const|function)\s+compareVersions\b/);
  assert.match(coreTailSource, /compareVersions\(log\.version,\s*lastSeenVersion\)/);
  assert.match(coreTailSource, /compareVersions\(b\.version,\s*a\.version\)/);
  assert.match(coreTailSource, /compareVersions\(log\.version,\s*max\)/);
  assert.ok(statSync(projectFile('src/app/runtime/legacy-core/legacy-core.js')).size < 150 * 1024);
});
