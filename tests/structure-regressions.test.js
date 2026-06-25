import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';

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

test('legacy runtime fragments keep the numeric filename ordering contract', () => {
  const fragmentNames = readdirSync(projectFile('src/app/legacy-runtime/fragments'))
    .filter((name) => name.endsWith('.fragment.js'))
    .sort();

  assert.deepEqual(fragmentNames, [
    '00-runtime.fragment.js',
    '01-runtime.fragment.js',
    '02-runtime.fragment.js',
    '03-runtime.fragment.js',
    '04-runtime.fragment.js',
    '05-runtime.fragment.js',
    '06-runtime.fragment.js'
  ]);
});

test('legacy runtime entry still uses the sorted virtual fragment composition', () => {
  const viteSource = readSource('vite.config.js');
  const legacyEntrySource = readSource('src/app/legacy-app.js');

  assert.match(viteSource, /const\s+legacyRuntimeModuleId\s*=\s*'virtual:legacy-app-runtime';/);
  assertMarkersInOrder(viteSource, [
    'readdirSync(fragmentsDir)',
    ".filter((file) => file.endsWith('.fragment.js'))",
    '.sort()',
    '.map((file) => resolve(fragmentsDir, file))',
    ".map((file) => readFileSync(file, 'utf8'))",
    ".join('\\n')"
  ], 'Vite legacy runtime fragment composition');
  assert.match(legacyEntrySource, /import\s+['"]virtual:legacy-app-runtime['"];/);
});

test('runtime DOM registry ownership moves into the non-live runtime kernel', () => {
  const registryPath = 'src/app/runtime/kernel/dom-registry.js';
  const runtimeAppPath = 'src/app/runtime-app.js';
  const registrySource = readSource(registryPath);
  const runtimeAppSource = readSource(runtimeAppPath);
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const mainSource = readSource('src/main.js');
  const legacyEntrySource = readSource('src/app/legacy-app.js');
  const viteSource = readSource('vite.config.js');

  assert.equal(existsSync(projectFile(registryPath)), true, 'runtime DOM registry module should exist');
  assert.equal(existsSync(projectFile(runtimeAppPath)), true, 'non-live runtime app seed should exist');
  assert.match(registrySource, /export\s+function\s+createLegacyRuntimeDomRegistry/);
  assert.match(
    fragment00Source,
    /import\s+\{\s*createLegacyRuntimeDomRegistry\s*\}\s*from\s*['"]\/src\/app\/runtime\/kernel\/dom-registry\.js['"]/
  );
  assert.match(fragment00Source, /const\s+ALL_ELEMENTS\s*=\s*createLegacyRuntimeDomRegistry\(\);/);
  assert.doesNotMatch(fragment00Source, /const\s+ALL_ELEMENTS\s*=\s*\{/);

  assert.match(runtimeAppSource, /export\s+function\s+createRuntimeAppKernel/);
  assert.match(runtimeAppSource, /import\s+\{\s*createLegacyRuntimeDomRegistry\s*\}/);
  assert.doesNotMatch(runtimeAppSource, /virtual:legacy-app-runtime|legacy-runtime\/fragments/);

  assert.match(mainSource, /await\s+import\(['"]\.\/app\/legacy-app\.js['"]\)/);
  assert.match(legacyEntrySource, /import\s+['"]virtual:legacy-app-runtime['"];/);
  assert.match(viteSource, /function\s+legacyRuntimeFragmentsPlugin\(\)/);
  assert.match(viteSource, /plugins:\s*\[legacyRuntimeFragmentsPlugin\(\)\]/);
});

test('runtime config ownership moves into a narrow non-live kernel store', () => {
  const storePath = 'src/app/runtime/kernel/config-store.js';
  const persistencePath = 'src/app/runtime/kernel/config-persistence.js';
  const normalizationPath = 'src/app/runtime/kernel/config-normalization.js';
  const storeSource = readSource(storePath);
  const persistenceSource = readSource(persistencePath);
  const normalizationSource = readSource(normalizationPath);
  const runtimeAppSource = readSource('src/app/runtime-app.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragmentConfigAssignments = fragment00Source.match(/\bconfig\s*=/g) || [];
  const laterFragmentSources = [
    '01-runtime.fragment.js',
    '02-runtime.fragment.js',
    '03-runtime.fragment.js',
    '04-runtime.fragment.js',
    '05-runtime.fragment.js',
    '06-runtime.fragment.js'
  ].map((name) => readSource(`src/app/legacy-runtime/fragments/${name}`));

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

  assert.match(
    fragment00Source,
    /import\s+\{\s*createLegacyRuntimeConfigStore\s*\}\s*from\s*['"]\/src\/app\/runtime\/kernel\/config-store\.js['"]/
  );
  assert.match(
    fragment00Source,
    /import\s+\{\s*createLegacyRuntimeConfigPersistence\s*\}\s*from\s*['"]\/src\/app\/runtime\/kernel\/config-persistence\.js['"]/
  );
  assert.match(
    fragment00Source,
    /from\s*['"]\/src\/app\/runtime\/kernel\/config-normalization\.js['"]/
  );
  assertMarkersInOrder(fragment00Source, [
    'const runtimeConfigStore = createLegacyRuntimeConfigStore({',
    'defaultModelId: MODELS[0].id',
    'let config = runtimeConfigStore.getConfig()',
    'const runtimeConfigAccess = createRuntimeConfigAccess({'
  ], '00 runtime config ownership');
  assert.doesNotMatch(fragment00Source, /let\s+config\s*=\s*\{\s*apiKeys:/);
  assert.match(fragment00Source, /config\s*=\s*runtimeConfigStore\.replaceConfig\(normalizedConfig\)/);
  assert.equal(fragmentConfigAssignments.length, 2);
  for (const source of laterFragmentSources) {
    assert.doesNotMatch(source, /\bconfig\s*=/);
  }
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
    'config = runtimeConfigStore.replaceConfig(normalizedConfig)'
  ], '00 config load orchestration');
  assert.match(fragment00Source, /Object\.assign\(config,\s*normalizedConfig\)/);
  assert.match(fragment00Source, /const\s+getConfigKey\s*=\s*\(\)\s*=>\s*`chatConfig_v_v8\.6_\$\{currentUser\.username\}`/);
  assert.match(fragment00Source, /async\s+function\s+openDB\(\)/);
  assert.match(fragment00Source, /async\s+function\s+getItem\(key\)/);
  assert.match(fragment00Source, /async\s+function\s+setItem\(key,\s*value\)/);
  assert.match(fragment00Source, /async\s+function\s+removeItem\(key\)/);
  assert.equal((laterFragmentSources.join('\n').match(/\bsaveConfig\(\)/g) || []).length, 14);

  assert.match(runtimeAppSource, /import\s+\{\s*createLegacyRuntimeConfigStore\s*\}/);
  assert.match(runtimeAppSource, /const\s+configStore\s*=\s*createLegacyRuntimeConfigStore\(\{\s*defaultModelId\s*\}\)/);
  assert.match(runtimeAppSource, /return\s*\{\s*elements,\s*configStore\s*\}/);
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
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const runtimeAppSource = readSource('src/app/runtime-app.js');
  const laterFragmentSources = [
    '01-runtime.fragment.js',
    '02-runtime.fragment.js',
    '03-runtime.fragment.js',
    '04-runtime.fragment.js',
    '05-runtime.fragment.js',
    '06-runtime.fragment.js'
  ].map((name) => readSource(`src/app/legacy-runtime/fragments/${name}`));
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
    'getAppData: () => ({',
    'conversations',
    'folders',
    'astras',
    'personalMemories',
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
    'lastCouncilConfig: config.lastCouncilConfig',
    'normalizeCouncilConfig',
    'normalizeConversationModel',
    'const latestAppData = runtimeAppDataStore.replaceAll(normalizedData)',
    'conversations = latestAppData.conversations',
    'folders = latestAppData.folders',
    'astras = latestAppData.astras',
    'personalMemories = latestAppData.personalMemories'
  ], '00 app data load orchestration');
  assert.match(catchBody, /console\.error\("Failed to parse app data:",\s*e\)/);
  assert.match(catchBody, /showNotification\(/);
  assert.match(catchBody, /const\s+latestAppData\s*=\s*runtimeAppDataStore\.replaceAll\(\{\s*conversations:\s*\[\],\s*folders:\s*\[\],\s*astras:\s*\[\],\s*personalMemories:\s*\[\]\s*\}\)/);
  assert.match(catchBody, /conversations\s*=\s*latestAppData\.conversations/);
  assert.match(catchBody, /folders\s*=\s*latestAppData\.folders/);
  assert.match(catchBody, /astras\s*=\s*latestAppData\.astras/);
  assert.match(catchBody, /personalMemories\s*=\s*latestAppData\.personalMemories/);
  assert.match(catchBody, /await\s+removeItem\(getAppDataKey\(\)\)/);
  assert.match(loadAppDataBody, /else\s*\{\s*const\s+latestAppData\s*=\s*runtimeAppDataStore\.replaceAll\(\{\s*conversations:\s*\[\],\s*folders:\s*\[\],\s*astras:\s*\[\],\s*personalMemories:\s*\[\]\s*\}\);\s*conversations\s*=\s*latestAppData\.conversations;\s*folders\s*=\s*latestAppData\.folders;\s*astras\s*=\s*latestAppData\.astras;\s*personalMemories\s*=\s*latestAppData\.personalMemories;\s*\}/);
  assert.match(fragment00Source, /async\s+function\s+getItem\(key\)/);
  assert.match(fragment00Source, /async\s+function\s+setItem\(key,\s*value\)/);
  assert.match(fragment00Source, /async\s+function\s+removeItem\(key\)/);

  assert.doesNotMatch(runtimeAppSource, /app-data-normalization|app-data-persistence|loadAppData|saveAppData|indexedDB/);
  assert.equal((laterFragmentSources.join('\n').match(/\bsaveAppData\(\)/g) || []).length, 32);
  for (const source of laterFragmentSources) {
    assert.doesNotMatch(source, /app-data-normalization|app-data-persistence/);
  }
});

test('runtime app data store ownership covers 00 and selected linked replacements', () => {
  const runtimeAppSource = readSource('src/app/runtime-app.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const fragment02Source = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
  const fragment03Source = readSource('src/app/legacy-runtime/fragments/03-runtime.fragment.js');
  const fragment04Source = readSource('src/app/legacy-runtime/fragments/04-runtime.fragment.js');
  const persistenceSource = readSource('src/app/runtime/kernel/app-data-persistence.js');
  const normalizationSource = readSource('src/app/runtime/kernel/app-data-normalization.js');
  const storeSource = readSource('src/app/runtime/kernel/app-data-store.js');
  const unmigratedFragmentSources = [
    '05-runtime.fragment.js',
    '06-runtime.fragment.js'
  ].map((name) => readSource(`src/app/legacy-runtime/fragments/${name}`));
  const loadAppDataBody = getConstFunctionBody(fragment00Source, 'loadAppData');
  const startNewChatBody = getConstFunctionBody(fragment00Source, 'startNewChat');
  const loadChatBody = getConstFunctionBody(fragment00Source, 'loadChat');
  const performImportBody = getConstFunctionBody(fragment03Source, 'performImport');
  const handleImportBody = getConstFunctionBody(fragment03Source, 'handleImport');
  const processAuthImportBody = getConstFunctionBody(fragment03Source, 'processAuthImport');
  const handleSubscriptionBody = getConstFunctionBody(fragment04Source, 'handleSubscription');
  const permanentDeleteBody = getConstFunctionBody(fragment04Source, 'handleDeleteTrashItemPermanently');
  const batchDeleteBody = getConstFunctionBody(fragment04Source, 'handleBatchDeleteFromTrash');
  const emptyTrashBody = getConstFunctionBody(fragment04Source, 'handleEmptyTrash');
  const mainSource = readSource('src/main.js');
  const legacyEntrySource = readSource('src/app/legacy-app.js');
  const viteSource = readSource('vite.config.js');

  assert.equal(existsSync(projectFile('src/app/runtime/kernel/app-data-store.js')), true);
  assert.match(storeSource, /export\s+function\s+createLegacyRuntimeAppDataStore/);
  assert.doesNotMatch(storeSource, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtimeContext/);
  assert.doesNotMatch(storeSource, /getItem|setItem|removeItem|openDB|indexedDB|localStorage|sessionStorage|currentUser/);
  assert.doesNotMatch(storeSource, /showNotification|renderAll|toggleModal|initChatApp|initializeApp/);
  assert.match(
    fragment00Source,
    /import\s+\{\s*createLegacyRuntimeAppDataStore\s*\}\s*from\s*['"]\/src\/app\/runtime\/kernel\/app-data-store\.js['"]/
  );
  assertMarkersInOrder(fragment00Source, [
    'const runtimeAppDataStore = createLegacyRuntimeAppDataStore()',
    'let conversations = runtimeAppDataStore.getConversations()',
    'let folders = runtimeAppDataStore.getFolders()',
    'let astras = runtimeAppDataStore.getAstras()',
    'let personalMemories = runtimeAppDataStore.getPersonalMemories()',
    'let activeConversationId = null'
  ], '00 app data store lexical bridge');
  assertMarkersInOrder(loadAppDataBody, [
    'const normalizedData = normalizeLoadedLegacyAppData({',
    'const latestAppData = runtimeAppDataStore.replaceAll(normalizedData)',
    'conversations = latestAppData.conversations',
    'folders = latestAppData.folders',
    'astras = latestAppData.astras',
    'personalMemories = latestAppData.personalMemories'
  ], '00 loadAppData store-backed successful replacement');
  assert.equal((loadAppDataBody.match(/runtimeAppDataStore\.replaceAll\(\{/g) || []).length, 2);
  assert.match(loadAppDataBody, /await\s+removeItem\(getAppDataKey\(\)\)/);
  assertMarkersInOrder(startNewChatBody, [
    'const oldTempChatCount = conversations.length',
    'conversations = runtimeAppDataStore.replaceConversations(',
    'conversations.filter(c => !c.isTemporary || c.messages.length > 0)',
    'await saveAppData()',
    'uploadedFiles = []',
    'conversations.unshift(newConv)'
  ], '00 startNewChat store-backed temporary conversation replacement');
  assertMarkersInOrder(loadChatBody, [
    'const previousConv = getActiveConversation()',
    'conversations = runtimeAppDataStore.replaceConversations(',
    'conversations.filter(c => c.id !== previousConv.id)',
    'conversationStateAccess.setCurrentConversationId(id)',
    'uploadedFiles = []',
    'renderAll()'
  ], '00 loadChat store-backed previous temporary conversation replacement');
  const deleteAstrasBody = getConstFunctionBody(fragment01Source, 'deleteAstras');
  const deleteFolderBody = getConstFunctionBody(fragment02Source, 'deleteFolder');
  assertMarkersInOrder(deleteAstrasBody, [
    'astras = runtimeAppDataStore.replaceAstras(',
    'astras.filter(a => a.id !== id)',
    'conversations.forEach(c => {',
    'if (c.astrasId === id) c.astrasId = null',
    'await saveAppData()',
    'runtimeRenderCoordinator.renderAll()',
    'runtimeDialogCoordinator.showNotification'
  ], '01 deleteAstras linked store replacement');
  assertMarkersInOrder(deleteFolderBody, [
    'conversations.forEach(c => {',
    'c.folderId = null',
    'folders = runtimeAppDataStore.replaceFolders(',
    'folders.filter(f => f.id !== id)',
    'await saveAppData()',
    'runtimeRenderCoordinator.renderAll()',
    'showNotification'
  ], '02 deleteFolder linked store replacement');
  assertMarkersInOrder(fragment03Source, [
    'personalMemories = runtimeAppDataStore.replacePersonalMemories(',
    'personalMemories.filter(m => m.id !== id)',
    'await saveAppData()',
    'renderPersonalMemoryList()'
  ], '03 personal memory delete store replacement');
  assertMarkersInOrder(performImportBody, [
    'const latestAppData = runtimeAppDataStore.replaceAll({',
    'conversations: data.conversations || []',
    'folders: data.folders || []',
    'astras: data.astras || []',
    'personalMemories: data.personalMemories || []',
    'conversations = latestAppData.conversations',
    'folders = latestAppData.folders',
    'astras = latestAppData.astras',
    'personalMemories = latestAppData.personalMemories',
    'await saveAppData()'
  ], '03 performImport store-backed bulk replacement');
  assertMarkersInOrder(handleImportBody, [
    'const clearedAppData = runtimeAppDataStore.replaceAll({',
    'conversations: []',
    'folders: []',
    'astras: []',
    'personalMemories: []',
    'conversations = clearedAppData.conversations',
    'folders = clearedAppData.folders',
    'astras = clearedAppData.astras',
    'personalMemories = clearedAppData.personalMemories',
    'astras.push(ast)',
    'folders = runtimeAppDataStore.replaceFolders(rawData.folders)',
    'personalMemories = runtimeAppDataStore.replacePersonalMemories(rawData.personalMemories)',
    'conversations.push(conv)',
    'await saveAppData()'
  ], '03 handleImport store-backed replacements and chunked pushes');
  assertMarkersInOrder(processAuthImportBody, [
    'const clearedAppData = runtimeAppDataStore.replaceAll({',
    'conversations: []',
    'folders: []',
    'astras: []',
    'personalMemories: []',
    'conversations = clearedAppData.conversations',
    'folders = clearedAppData.folders',
    'astras = clearedAppData.astras',
    'personalMemories = clearedAppData.personalMemories',
    'astras.push(ast)',
    'folders = runtimeAppDataStore.replaceFolders(rawData.folders)',
    'personalMemories = runtimeAppDataStore.replacePersonalMemories(rawData.personalMemories)',
    'conversations.push(conv)',
    'await saveAppData()',
    'await saveConfig()',
    'toggleModal(ALL_ELEMENTS.importDataModalAuth, false)',
    "legacyRuntimeContext.resolveBinding('app.initChatApp')()",
    'showNotification(i18n[config.uiLanguage].importSuccess'
  ], '03 processAuthImport store-backed replacements and app handoff');
  assertMarkersInOrder(handleSubscriptionBody, [
    'astras = runtimeAppDataStore.replaceAstras(',
    'astras.filter(a => a.officialId !== officialId)',
    "showNotification(i18n[config.uiLanguage].unsubscribed",
    'astras.unshift(newAstra)',
    "showNotification(i18n[config.uiLanguage].subscribed",
    'await saveAppData()',
    'renderStore()',
    'renderAstras()'
  ], '04 store unsubscribe Astra replacement');
  assertMarkersInOrder(permanentDeleteBody, [
    'showCustomConfirm',
    'conversations = runtimeAppDataStore.replaceConversations(',
    'conversations.filter(c => c.id !== convId)',
    'await saveAppData()',
    'renderTrash()',
    'showNotification'
  ], '04 trash permanent delete store replacement');
  assertMarkersInOrder(batchDeleteBody, [
    'const count = selectedTrashIds.size',
    'showCustomConfirm',
    'conversations = runtimeAppDataStore.replaceConversations(',
    'conversations.filter(c => !selectedTrashIds.has(c.id))',
    'await saveAppData()',
    'toggleTrashSelectionMode()',
    'showNotification'
  ], '04 trash batch delete store replacement');
  assertMarkersInOrder(emptyTrashBody, [
    'showCustomConfirm',
    'const count = conversations.filter(c => c.deletedAt).length',
    'conversations = runtimeAppDataStore.replaceConversations(',
    'conversations.filter(c => !c.deletedAt)',
    'await saveAppData()',
    'renderTrash()',
    'showNotification'
  ], '04 empty trash store replacement');
  assert.doesNotMatch(fragment01Source, /from\s+['"][^'"]*app-data-store\.js['"]/);
  assert.doesNotMatch(fragment02Source, /from\s+['"][^'"]*app-data-store\.js['"]/);
  assert.doesNotMatch(fragment03Source, /from\s+['"][^'"]*app-data-store\.js['"]/);
  assert.doesNotMatch(fragment04Source, /from\s+['"][^'"]*app-data-store\.js['"]/);
  assert.equal((performImportBody.match(/runtimeAppDataStore\.replaceAll\(/g) || []).length, 1);
  assert.equal((handleImportBody.match(/runtimeAppDataStore\.replaceAll\(/g) || []).length, 1);
  assert.equal((processAuthImportBody.match(/runtimeAppDataStore\.replaceAll\(/g) || []).length, 1);
  assert.doesNotMatch(fragment03Source, /appendConversations|appendAstras|syncFromLexical/);
  assert.doesNotMatch(storeSource, /appendConversations|appendAstras|syncFromLexical/);
  assert.doesNotMatch(fragment00Source, /getAppData:\s*\(\)\s*=>\s*runtimeAppDataStore\.getSnapshot\(\)/);
  assert.equal((unmigratedFragmentSources.join('\n').match(/runtimeAppDataStore|createLegacyRuntimeAppDataStore|app-data-store/g) || []).length, 0);
  assert.doesNotMatch(runtimeAppSource, /appDataStore|createLegacyRuntimeAppDataStore|app-data-store/);
  assert.doesNotMatch(persistenceSource, /loadAppData|getItem|removeItem|openDB|normalizeLoadedLegacyAppData/);
  assert.doesNotMatch(normalizationSource, /showNotification|renderAll|toggleModal|currentUser|getItem|setItem|removeItem|openDB/);
  assert.match(mainSource, /await\s+import\(['"]\.\/app\/legacy-app\.js['"]\)/);
  assert.match(legacyEntrySource, /import\s+['"]virtual:legacy-app-runtime['"];/);
  assert.match(viteSource, /legacyRuntimeModuleId\s*=\s*'virtual:legacy-app-runtime'/);
});

test('legacy runtime fragments exist and are not empty', () => {
  for (const name of [
    '00-runtime.fragment.js',
    '01-runtime.fragment.js',
    '02-runtime.fragment.js',
    '03-runtime.fragment.js',
    '04-runtime.fragment.js',
    '05-runtime.fragment.js',
    '06-runtime.fragment.js'
  ]) {
    const path = `src/app/legacy-runtime/fragments/${name}`;
    assert.ok(statSync(projectFile(path)).isFile(), `${path} should exist`);
    assert.ok(readSource(path).trim().length > 0, `${path} should not be empty`);
  }
});

test('folder metadata is shared without later-fragment lexical ownership', () => {
  const metadataPath = 'src/app/legacy-runtime/data/folder-metadata.js';
  const metadataSource = readSource(metadataPath);
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const fragment02Source = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
  const fragment06Source = readSource('src/app/legacy-runtime/fragments/06-runtime.fragment.js');
  const renderFoldersBody = getConstFunctionBody(fragment01Source, 'renderFolders');
  const showFolderSettingsModalBody = getConstFunctionBody(fragment02Source, 'showFolderSettingsModal');

  assert.equal(existsSync(projectFile(metadataPath)), true, 'shared folder metadata module should exist');
  assert.match(metadataSource, /export\s+const\s+FOLDER_SVGS\s*=/);
  assert.match(metadataSource, /export\s+const\s+FOLDER_TEXT_COLORS\s*=/);
  assert.match(
    fragment01Source,
    /import\s*\{\s*FOLDER_SVGS,\s*FOLDER_TEXT_COLORS,\s*\}\s*from\s*['"]\/src\/app\/legacy-runtime\/data\/folder-metadata\.js['"]/
  );
  assert.match(
    fragment02Source,
    /import\s*\{\s*FOLDER_SVGS\s+as\s+FOLDER_ICON_OPTIONS,\s*\}\s*from\s*['"]\/src\/app\/legacy-runtime\/data\/folder-metadata\.js['"]/
  );
  assert.match(showFolderSettingsModalBody, /Object\.entries\(FOLDER_ICON_OPTIONS\)/);
  assert.doesNotMatch(fragment06Source, /const\s+FOLDER_SVGS\s*=/);
  assert.doesNotMatch(fragment06Source, /const\s+FOLDER_TEXT_COLORS\s*=/);
  assert.match(
    renderFoldersBody,
    /FOLDER_SVGS\[folder\.icon\]\s*\|\|\s*FOLDER_SVGS(?:\[['"]default['"]\]|\.default)/
  );
  assert.match(
    renderFoldersBody,
    /FOLDER_TEXT_COLORS\[folder\.textColor\]\s*\|\|\s*FOLDER_TEXT_COLORS(?:\[['"]gray['"]\]|\.gray)/
  );
});

test('color contrast helper is shared without later-fragment lexical ownership', () => {
  const helperPath = 'src/utils/color-contrast.js';
  const helperSource = readSource(helperPath);
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment04Source = readSource('src/app/legacy-runtime/fragments/04-runtime.fragment.js');
  const renderHistorySidebarContentBody = getBlockFromMarker(fragment00Source, 'function renderHistorySidebarContent()');
  const applyUiThemeBody = getConstFunctionBody(fragment04Source, 'applyUiTheme');

  assert.equal(existsSync(projectFile(helperPath)), true, 'shared color contrast helper should exist');
  assert.match(helperSource, /export\s+function\s+getTextColorForBackground\s*\(/);
  assert.doesNotMatch(helperSource, /export\s+(?:const|function)\s+hexToRgb|export\s*\{[^}]*hexToRgb/);
  assert.match(
    fragment00Source,
    /import\s*\{\s*getTextColorForBackground\s*\}\s*from\s*['"]\/src\/utils\/color-contrast\.js['"]/
  );
  assert.match(
    fragment04Source,
    /import\s*\{\s*getTextColorForBackground\s+as\s+getThemeTextColorForBackground,\s*\}\s*from\s*['"]\/src\/utils\/color-contrast\.js['"]/
  );
  assert.doesNotMatch(fragment04Source, /const\s+hexToRgb\s*=/);
  assert.doesNotMatch(fragment04Source, /const\s+getTextColorForBackground\s*=/);
  assert.match(
    renderHistorySidebarContentBody,
    /listItem\.style\.color\s*=\s*getTextColorForBackground\(bgColor\);/
  );
  assert.match(
    applyUiThemeBody,
    /const\s+textColor\s*=\s*\(config\.uiTheme\.style\s*===\s*'gradient'\s*&&\s*config\.uiTheme\.mode\s*===\s*'adaptive'\)\s*\?\s*'#ffffff'\s*:\s*getThemeTextColorForBackground\(primaryBg\);/
  );
  assertMarkersInOrder(applyUiThemeBody, [
    "root.style.setProperty('--button-primary-bg', primaryBg)",
    "root.style.setProperty('--button-primary-text', textColor)"
  ], 'applyUiTheme color assignments');
});

test('legacy runtime adjacent fragments do not contain cross-fragment brace continuations', () => {
  const fragments = [
    '00-runtime.fragment.js',
    '01-runtime.fragment.js',
    '02-runtime.fragment.js',
    '03-runtime.fragment.js',
    '04-runtime.fragment.js',
    '05-runtime.fragment.js',
    '06-runtime.fragment.js'
  ].map((name) => ({
    name,
    source: readSource(`src/app/legacy-runtime/fragments/${name}`)
  }));

  const crossFragmentPairs = findCrossFragmentBracePairs(fragments);
  assert.deepEqual(
    crossFragmentPairs,
    [],
    `cross-fragment brace continuations remain: ${crossFragmentPairs.map(({ open, close }) => `${open.name}:${open.line}->${close.name}:${close.line}`).join(', ')}`
  );
});

test('sidebar Astras lifecycle breaks the 00 to 01 renderAstras continuation boundary', () => {
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
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

test('model usage chart lifecycle breaks the 03 to 04 renderModelUsageChart continuation boundary', () => {
  const fragment03Source = readSource('src/app/legacy-runtime/fragments/03-runtime.fragment.js');
  const fragment04Source = readSource('src/app/legacy-runtime/fragments/04-runtime.fragment.js');
  const chartLifecycleSource = readSource('src/app/legacy-runtime/features/model-usage-chart-lifecycle.js');

  assert.match(chartLifecycleSource, /export\s+function\s+createModelUsageChartLifecycle/);
  assert.match(fragment03Source, /createModelUsageChartLifecycle\(\{/);
  assert.match(fragment03Source, /const\s+renderModelUsageChart\s*=\s*\(\.\.\.args\)\s*=>\s*modelUsageChartLifecycle\.renderModelUsageChart\(\.\.\.args\);/);
  assert.doesNotMatch(fragment03Source, /modelPieChart\s*=\s*new Chart\(ctx,/);
  assert.doesNotMatch(fragment04Source, /^\s*const\s+ctx\s*=\s*document\.getElementById\('model-usage-pie-chart'\)\.getContext\('2d'\);/);

  const renderChartStart = fragment03Source.indexOf('const renderModelUsageChart =');
  assert.notEqual(renderChartStart, -1, '03 should still expose a renderModelUsageChart binding');
  const renderChartStatementEnd = fragment03Source.indexOf(';', renderChartStart);
  assert.notEqual(renderChartStatementEnd, -1, 'renderModelUsageChart binding should end inside 03');
  assert.ok(
    renderChartStatementEnd < fragment03Source.length,
    'renderModelUsageChart binding should not need 04 to finish its statement'
  );
  assert.doesNotMatch(
    fragment03Source.slice(renderChartStart, renderChartStatementEnd),
    /=>\s*\{/,
    'renderModelUsageChart should not reopen an inline body in 03'
  );

  const combinedStart = `${fragment03Source}\n`.length;
  const concatenated = `${fragment03Source}\n${fragment04Source}`;
  const nextOpenBrace = concatenated.indexOf('{', renderChartStart);
  const concatenatedClose = findMatchingBrace(concatenated, nextOpenBrace);
  assert.ok(nextOpenBrace === -1 || concatenatedClose < combinedStart || nextOpenBrace > renderChartStatementEnd);
});

test('batch action bar lifecycle breaks the 02 to 03 renderBatchActionBar continuation boundary', () => {
  const fragment02Source = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
  const fragment03Source = readSource('src/app/legacy-runtime/fragments/03-runtime.fragment.js');
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

test('received data lifecycle breaks the 05 to 06 processReceivedData continuation boundary', () => {
  const fragment05Source = readSource('src/app/legacy-runtime/fragments/05-runtime.fragment.js');
  const fragment06Source = readSource('src/app/legacy-runtime/fragments/06-runtime.fragment.js');
  const receivedDataSource = readSource('src/app/legacy-runtime/features/received-data-lifecycle.js');

  assert.match(receivedDataSource, /export\s+function\s+createReceivedDataLifecycle/);
  assert.match(fragment05Source, /createReceivedDataLifecycle\(\{/);
  assert.match(fragment05Source, /const\s+processReceivedData\s*=\s*\(\.\.\.args\)\s*=>\s*receivedDataLifecycle\.processReceivedData\(\.\.\.args\);/);
  assert.doesNotMatch(fragment05Source, /const\s+zip\s*=\s*await\s+JSZip\.loadAsync\(blob\);/);
  assert.doesNotMatch(fragment06Source, /^\s*showNotification\(`成功接收 \$\{count\} 個 Astras！`, 'success'\);/);

  const processStart = fragment05Source.indexOf('const processReceivedData =');
  assert.notEqual(processStart, -1, '05 should still expose a processReceivedData binding');
  const processStatementEnd = fragment05Source.indexOf(';', processStart);
  assert.notEqual(processStatementEnd, -1, 'processReceivedData binding should end inside 05');
  assert.ok(
    processStatementEnd < fragment05Source.length,
    'processReceivedData binding should not need 06 to finish its statement'
  );
  assert.doesNotMatch(
    fragment05Source.slice(processStart, processStatementEnd),
    /=>\s*\{/,
    'processReceivedData should not reopen an inline body in 05'
  );

  const combinedStart = `${fragment05Source}\n`.length;
  const concatenated = `${fragment05Source}\n${fragment06Source}`;
  const nextOpenBrace = concatenated.indexOf('{', processStart);
  const concatenatedClose = findMatchingBrace(concatenated, nextOpenBrace);
  assert.ok(nextOpenBrace === -1 || concatenatedClose < combinedStart || nextOpenBrace > processStatementEnd);
});

test('app bootstrap composition owns late bootstrap event-binding tail', () => {
  const fragment05Source = readSource('src/app/legacy-runtime/fragments/05-runtime.fragment.js');
  const fragment06Source = readSource('src/app/legacy-runtime/fragments/06-runtime.fragment.js');
  const compositionSource = readSource('src/app/legacy-runtime/features/app-bootstrap-composition.js');
  const scannerLifecycleSource = readSource('src/app/legacy-runtime/features/p2p-scanner-lifecycle.js');

  assert.match(compositionSource, /export\s+function\s+createAppBootstrapComposition/);
  assert.match(scannerLifecycleSource, /export\s+function\s+createP2PScannerLifecycle/);
  assert.match(fragment05Source, /createP2PScannerLifecycle\(\{/);
  assert.match(fragment05Source, /createAppBootstrapComposition\(\{/);
  assert.match(fragment05Source, /appBootstrapComposition\.runLateBootstrapBindings\(\);/);

  const initStart = fragment05Source.indexOf('async function initChatApp()');
  assert.notEqual(initStart, -1, '05 should define initChatApp');
  const initOpen = fragment05Source.indexOf('{', initStart);
  const initClose = findMatchingBrace(fragment05Source, initOpen);
  assert.notEqual(initClose, -1, 'initChatApp should close inside 05');
  const initBody = fragment05Source.slice(initStart, initClose);

  assert.match(initBody, /appBootstrapComposition\.runLateBootstrapBindings\(\);/);
  assert.match(initBody, /p2pScannerLifecycle\.updateP2PProgress\(\.\.\.args\)/);
  assert.match(initBody, /p2pScannerLifecycle\.startQRScanner\(\.\.\.args\)/);
  assert.match(initBody, /p2pScannerLifecycle\.stopScannerIfActive\(\)/);
  assert.match(initBody, /startQRScanner:\s*\(\)\s*=>\s*startQRScanner\(\)/);
  assert.doesNotMatch(initBody, /^\s*startQRScanner\s*[,}]/m);
  assert.doesNotMatch(fragment05Source, /\bhtml5QrcodeScanner\b/);
  assert.doesNotMatch(fragment06Source, /\bhtml5QrcodeScanner\b/);
  assert.doesNotMatch(fragment06Source, /function\s+(?:updateP2PProgress|startQRScanner)\b/);
  assert.doesNotMatch(initBody, /setupHistorySidebarInteractions\(\);\s*setupHistorySidebarTriggers\(\);/);
  assert.doesNotMatch(initBody, /document\.getElementById\('p2p-start-scan-btn'\)\.addEventListener\('click'/);
});

test('store navigation lifecycle owns only the selected bootstrap listeners', () => {
  const fragment05Source = readSource('src/app/legacy-runtime/fragments/05-runtime.fragment.js');
  const lifecycleSource = readSource('src/app/legacy-runtime/features/store-navigation-lifecycle.js');
  const initStart = fragment05Source.indexOf('async function initChatApp()');
  assert.notEqual(initStart, -1, '05 should define initChatApp');
  const initOpen = fragment05Source.indexOf('{', initStart);
  const initClose = findMatchingBrace(fragment05Source, initOpen);
  assert.notEqual(initClose, -1, 'initChatApp should close inside 05');
  const initBody = fragment05Source.slice(initStart, initClose);

  assert.match(lifecycleSource, /export\s+function\s+createStoreNavigationLifecycle/);
  assert.match(
    fragment05Source,
    /import\s*\{\s*createStoreNavigationLifecycle\s*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/store-navigation-lifecycle\.js';/
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
  const fragment06Source = readSource('src/app/legacy-runtime/fragments/06-runtime.fragment.js');
  const initializeAppBody = getBlockFromMarker(fragment06Source, '(async function initializeApp()');

  assertMarkersInOrder(fragment06Source, [
    "ALL_ELEMENTS.authForm.addEventListener('submit', handleLogin)",
    "ALL_ELEMENTS.usernameInput.addEventListener('input', toggleAuthImportButton)",
    "ALL_ELEMENTS.passwordInput.addEventListener('input', toggleAuthImportButton)",
    "ALL_ELEMENTS.importBtnAuth.addEventListener('click', handleImportOnAuth)",
    "ALL_ELEMENTS.confirmImportBtnAuth.addEventListener('click', processAuthImport)",
    "ALL_ELEMENTS.cancelImportBtnAuth.addEventListener('click'",
    '(async function initializeApp()'
  ], '06 auth bootstrap');

  assertMarkersInOrder(initializeAppBody, [
    'await loadConfig()',
    'await loadAppData()',
    'applyCustomWallpaper()',
    'applyUiTheme()',
    "ALL_ELEMENTS.authContainer.style.display = 'none'",
    "ALL_ELEMENTS.appContainer.classList.remove('hidden')",
    "ALL_ELEMENTS.appContainer.classList.add('visible')",
    "legacyRuntimeContext.resolveBinding('app.initChatApp')()"
  ], '06 auto-login startup');
});

test('input submit bindings and late P2P composition preserve bootstrap order', () => {
  const fragment05Source = readSource('src/app/legacy-runtime/fragments/05-runtime.fragment.js');
  const initStart = fragment05Source.indexOf('async function initChatApp()');
  assert.notEqual(initStart, -1, '05 should define initChatApp');
  const initOpen = fragment05Source.indexOf('{', initStart);
  const initClose = findMatchingBrace(fragment05Source, initOpen);
  assert.notEqual(initClose, -1, 'initChatApp should close inside 05');
  const initBody = fragment05Source.slice(initStart, initClose);

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
    'const receivedDataLifecycle = createReceivedDataLifecycle({',
    'const p2pScannerLifecycle = createP2PScannerLifecycle({',
    'const appBootstrapComposition = createAppBootstrapComposition({',
    'appBootstrapComposition.runLateBootstrapBindings()'
  ], '05 normal listeners and late P2P composition');
});

test('runtime core dependencies preserve their backing-state creation order', () => {
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');

  assertMarkersInOrder(fragment00Source, [
    'const legacyRuntimeContext = createLegacyRuntimeContext()',
    'const ALL_ELEMENTS = createLegacyRuntimeDomRegistry()',
    'const runtimeDomAccess = createRuntimeDomAccess({',
    'const runtimeAppDataStore = createLegacyRuntimeAppDataStore()',
    'let conversations = runtimeAppDataStore.getConversations()',
    'let folders = runtimeAppDataStore.getFolders()',
    'let astras = runtimeAppDataStore.getAstras()',
    'let personalMemories = runtimeAppDataStore.getPersonalMemories()',
    'let activeConversationId = null',
    'const conversationStateAccess = createConversationStateAccess({',
    'const runtimeConfigStore = createLegacyRuntimeConfigStore({',
    'let config = runtimeConfigStore.getConfig()',
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
  assert.match(fragment00Source, /getConversations:\s*\(\)\s*=>\s*conversations/);
  assert.match(fragment00Source, /getCurrentConversationId:\s*\(\)\s*=>\s*activeConversationId/);
  assert.match(fragment00Source, /getConfig:\s*\(\)\s*=>\s*runtimeConfigStore\.getConfig\(\)/);
  assert.match(fragment00Source, /showNotification:\s*\(\.\.\.args\)\s*=>\s*showNotification\(\.\.\.args\)/);
  assert.match(fragment00Source, /renderHistorySidebar:\s*\(\)\s*=>\s*renderHistorySidebar\(\)/);
  assert.match(fragment00Source, /const\s+renderAll\s*=\s*\(\.\.\.args\)\s*=>\s*runtimeRenderCoordinator\.renderAll\(\.\.\.args\);/);
});

test('runtime lazy registrations and composition handoffs preserve legacy order', () => {
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const fragment02Source = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
  const fragment05Source = readSource('src/app/legacy-runtime/fragments/05-runtime.fragment.js');
  const fragment06Source = readSource('src/app/legacy-runtime/fragments/06-runtime.fragment.js');
  const initializeAppBody = getBlockFromMarker(fragment06Source, '(async function initializeApp()');

  assertMarkersInOrder(fragment01Source, [
    "legacyRuntimeContext.registerLazyBinding('submit.updateSubmitButtonState'",
    "legacyRuntimeContext.registerLazyBinding('submit.generateTitleAndSummary'",
    "legacyRuntimeContext.registerLazyBinding('submit.shouldPerformWebSearch'",
    "legacyRuntimeContext.registerLazyBinding('submit.adjustTextareaHeight'",
    "legacyRuntimeContext.registerLazyBinding('submit.renderFilePreviews'",
    'const submitInputPreparationLifecycle = createSubmitInputPreparationLifecycle({',
    'const handleFormSubmit = async'
  ], '01 submit runtime registration');

  assertMarkersInOrder(fragment02Source, [
    'const updateInputState = () =>',
    'const setupSettingsModal = () =>',
    "legacyRuntimeContext.registerLazyBinding('settings.setupSettingsModal'",
    "legacyRuntimeContext.registerLazyBinding('input.updateInputState'",
    'const saveSettings = async'
  ], '02 settings and input runtime registration');

  assertMarkersInOrder(fragment05Source, [
    'storeNavigationLifecycle.bind()',
    'const receivedDataLifecycle = createReceivedDataLifecycle({',
    'const p2pScannerLifecycle = createP2PScannerLifecycle({',
    'const appBootstrapComposition = createAppBootstrapComposition({',
    'appBootstrapComposition.runLateBootstrapBindings()'
  ], '05 runtime composition tail');

  assertMarkersInOrder(initializeAppBody, [
    'await loadConfig()',
    'await loadAppData()',
    'applyCustomWallpaper()',
    'applyUiTheme()',
    "ALL_ELEMENTS.appContainer.classList.remove('hidden')",
    "ALL_ELEMENTS.appContainer.classList.add('visible')",
    "legacyRuntimeContext.resolveBinding('app.initChatApp')()"
  ], '06 startup handoff');

  assert.equal(
    existsSync(projectFile('src/app/legacy-runtime/runtime/runtime-app-composition.js')),
    false,
    'runtime-app-composition production boundary should not exist before its implementation slice'
  );
});

test('initChatApp callers use the required runtime handoff without changing legacy order', () => {
  const fragment02Source = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
  const fragment03Source = readSource('src/app/legacy-runtime/fragments/03-runtime.fragment.js');
  const fragment05Source = readSource('src/app/legacy-runtime/fragments/05-runtime.fragment.js');
  const fragment06Source = readSource('src/app/legacy-runtime/fragments/06-runtime.fragment.js');
  const handleLoginBody = getConstFunctionBody(fragment02Source, 'handleLogin');
  const processAuthImportBody = getConstFunctionBody(fragment03Source, 'processAuthImport');
  const initializeAppBody = getBlockFromMarker(fragment06Source, '(async function initializeApp()');
  const requiredHandoff = "legacyRuntimeContext.resolveBinding('app.initChatApp')()";

  const initStart = fragment05Source.indexOf('async function initChatApp()');
  assert.notEqual(initStart, -1, '05 should keep the initChatApp declaration');
  const initOpen = fragment05Source.indexOf('{', initStart);
  const initClose = findMatchingBrace(fragment05Source, initOpen);
  assert.notEqual(initClose, -1, 'initChatApp should close inside 05');
  const registrationIndex = fragment05Source.indexOf(
    "legacyRuntimeContext.registerLazyBinding('app.initChatApp', () => initChatApp)"
  );
  assert.ok(registrationIndex > initClose, '05 should register app.initChatApp after the function declaration closes');

  for (const [source, label] of [
    [fragment02Source, '02'],
    [fragment03Source, '03'],
    [fragment06Source, '06']
  ]) {
    assert.doesNotMatch(source, /(^|[^\w.])initChatApp\(\)/, `${label} should not directly call initChatApp`);
    assert.doesNotMatch(
      source,
      /resolveOptionalBinding\('app\.initChatApp'/,
      `${label} should use the required initChatApp handoff`
    );
  }

  for (const [body, label] of [
    [handleLoginBody, '02 handleLogin'],
    [processAuthImportBody, '03 processAuthImport'],
    [initializeAppBody, '06 initializeApp']
  ]) {
    assert.equal((body.match(/resolveBinding\('app\.initChatApp'\)\(\)/g) || []).length, 1, `${label} should resolve the handoff once`);
    assert.doesNotMatch(body, /await\s+legacyRuntimeContext\.resolveBinding\('app\.initChatApp'\)/);
  }

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
    'toggleModal(ALL_ELEMENTS.importDataModalAuth, false)',
    "ALL_ELEMENTS.authContainer.addEventListener('transitionend'",
    'setTimeout(hideAuthContainer, 500)',
    requiredHandoff,
    'showNotification(i18n[config.uiLanguage].importSuccess'
  ], '03 auth import initChatApp handoff');

  assertMarkersInOrder(initializeAppBody, [
    'await loadConfig()',
    'await loadAppData()',
    'applyCustomWallpaper()',
    'applyUiTheme()',
    "ALL_ELEMENTS.authContainer.style.display = 'none'",
    "ALL_ELEMENTS.appContainer.classList.remove('hidden')",
    "ALL_ELEMENTS.appContainer.classList.add('visible')",
    requiredHandoff,
    'return'
  ], '06 startup initChatApp handoff');
});

test('loadChat resolves updateFunctionButtonsState through the required runtime handoff', () => {
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const fragment05Source = readSource('src/app/legacy-runtime/fragments/05-runtime.fragment.js');
  const loadChatBody = getConstFunctionBody(fragment00Source, 'loadChat');
  const toggleLearningModeBody = getConstFunctionBody(fragment01Source, 'toggleLearningMode');
  const functionStart = fragment01Source.indexOf('const updateFunctionButtonsState =');
  const functionOpenBrace = fragment01Source.indexOf('{', functionStart);
  const functionCloseBrace = findMatchingBrace(fragment01Source, functionOpenBrace);
  const registrationMarker =
    "legacyRuntimeContext.registerLazyBinding('input.updateFunctionButtonsState', () => updateFunctionButtonsState)";
  const registrationIndex = fragment01Source.indexOf(registrationMarker);

  assert.notEqual(functionStart, -1, '01 should declare updateFunctionButtonsState');
  assert.ok(registrationIndex > functionCloseBrace, '01 should register the handoff after the function declaration closes');
  assert.ok(
    registrationIndex < fragment01Source.indexOf('const toggleLearningMode', functionCloseBrace),
    '01 should register the handoff before the next owner-local consumer'
  );
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
      'setTimeout(adjustTextareaHeight, 0)',
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
    fragment05Source,
    /updateFunctionButtonsState\(\)/,
    'later-fragment updateFunctionButtonsState calls should remain untouched'
  );
});

test('selected toggleSidebar callers use the required runtime handoff without changing sidebar behavior', () => {
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const fragment03Source = readSource('src/app/legacy-runtime/fragments/03-runtime.fragment.js');
  const fragment05Source = readSource('src/app/legacy-runtime/fragments/05-runtime.fragment.js');
  const startNewChatBody = getConstFunctionBody(fragment00Source, 'startNewChat');
  const createConversationElementBody = getConstFunctionBody(fragment01Source, 'createConversationElement');
  const toggleStart = fragment03Source.indexOf('function toggleSidebar(show)');
  const toggleOpenBrace = fragment03Source.indexOf('{', toggleStart);
  const toggleCloseBrace = findMatchingBrace(fragment03Source, toggleOpenBrace);
  const registrationMarker =
    "legacyRuntimeContext.registerLazyBinding('sidebar.toggleSidebar', () => toggleSidebar)";
  const registrationIndex = fragment03Source.indexOf(registrationMarker);

  assert.notEqual(toggleStart, -1, '03 should keep the toggleSidebar declaration');
  assert.ok(registrationIndex > toggleCloseBrace, '03 should register sidebar.toggleSidebar after the declaration closes');
  assert.ok(
    registrationIndex < fragment03Source.indexOf('function closeAllPopovers()', toggleCloseBrace),
    '03 should register the handoff before the next owner-local function'
  );
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
      'setTimeout(adjustTextareaHeight, 0)',
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

  assert.match(fragment03Source.slice(0, toggleStart), /toggleSidebar\(false\)/, '03 owner-local call should remain direct');
  assert.match(fragment05Source, /toggleSidebar\(\)/, '05 later-fragment toggle call should remain direct');
  assert.match(fragment05Source, /toggleSidebar\(false\)/, '05 later-fragment close calls should remain direct');
});

test('runtime render coordinator owns renderAll order and selected Astras refresh call sites', () => {
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const fragment02Source = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
  const coordinatorSource = readSource('src/app/legacy-runtime/runtime/runtime-render-coordinator.js');
  const setAstrasBody = getConstFunctionBody(fragment01Source, 'setAstrasForConversation');
  const deactivateAstrasBody = getConstFunctionBody(fragment01Source, 'deactivateAstras');
  const deleteAstrasBody = getConstFunctionBody(fragment01Source, 'deleteAstras');
  const deleteChatBody = getConstFunctionBody(fragment00Source, 'deleteChat');
  const archiveChatBody = getConstFunctionBody(fragment00Source, 'archiveChat');
  const unarchiveChatBody = getConstFunctionBody(fragment00Source, 'unarchiveChat');
  const togglePinChatBody = getConstFunctionBody(fragment00Source, 'togglePinChat');
  const handleRenameBody = getConstFunctionBody(fragment00Source, 'handleRename');
  const moveConversationToFolderBody = getConstFunctionBody(fragment02Source, 'moveConversationToFolder');
  const deleteFolderBody = getConstFunctionBody(fragment02Source, 'deleteFolder');

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
  assert.match(fragment00Source, /applyLanguage:\s*\(\)\s*=>\s*applyLanguage\(config\.uiLanguage\)/);
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
    assert.match(body, /runtimeRenderCoordinator\.renderAll\(\)/);
    assert.doesNotMatch(body, /(^|[^\w.])renderAll\(\)/);
  }

  assert.match(deleteFolderBody, /await\s+saveAppData\(\);\s*runtimeRenderCoordinator\.renderAll\(\);\s*showNotification\(i18n\[config\.uiLanguage\]\.folderDeleted,\s*'success'\);/);
});

test('runtime dialog coordinator owns selected notification call sites without replacing modal helpers', () => {
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const fragment03Source = readSource('src/app/legacy-runtime/fragments/03-runtime.fragment.js');
  const fragment04Source = readSource('src/app/legacy-runtime/fragments/04-runtime.fragment.js');
  const coordinatorSource = readSource('src/app/legacy-runtime/runtime/runtime-dialog-coordinator.js');
  const deleteChatBody = getConstFunctionBody(fragment00Source, 'deleteChat');
  const deactivateAstrasBody = getConstFunctionBody(fragment01Source, 'deactivateAstras');
  const deleteAstrasBody = getConstFunctionBody(fragment01Source, 'deleteAstras');
  const handleBatchArchiveBody = getConstFunctionBody(fragment03Source, 'handleBatchArchive');
  const defaultModelUpdateBody = getBlockFromMarker(fragment03Source, 'input[name="default-model-radio"]');
  const moveModelOrderBody = getConstFunctionBody(fragment03Source, 'moveModelOrder');
  const handleRestoreTrashItemBody = getConstFunctionBody(fragment04Source, 'handleRestoreTrashItem');
  const handleBatchRestoreFromTrashBody = getConstFunctionBody(fragment04Source, 'handleBatchRestoreFromTrash');

  assert.match(coordinatorSource, /export\s+function\s+createRuntimeDialogCoordinator/);
  assert.match(fragment00Source, /import\s+\{\s*createRuntimeDialogCoordinator\s*\}/);
  assert.equal((fragment00Source.match(/createRuntimeDialogCoordinator\(\{/g) || []).length, 1);
  assert.match(fragment00Source, /const\s+runtimeDialogCoordinator\s*=\s*createRuntimeDialogCoordinator\(\{/);
  assert.match(fragment00Source, /showNotification:\s*\(\.\.\.args\)\s*=>\s*showNotification\(\.\.\.args\)/);
  assert.match(fragment00Source, /const\s+showNotification\s*=\s*\(message,\s*type\s*=\s*'success'\)\s*=>\s*\{/);
  assert.match(fragment00Source, /const\s+toggleModal\s*=\s*\(modalElement,\s*show\)\s*=>\s*\{/);
  assert.match(fragment00Source, /const\s+showCustomConfirm\s*=\s*\(message,\s*title\s*=\s*'請確認'\)\s*=>\s*showCustomDialog\(/);
  assert.match(fragment00Source, /const\s+showCustomPrompt\s*=\s*\(message,\s*title\s*=\s*'請輸入',\s*inputType\s*=\s*'text'\)\s*=>\s*showCustomDialog\(/);

  for (const body of [
    deleteChatBody,
    deactivateAstrasBody,
    deleteAstrasBody,
    handleBatchArchiveBody,
    handleRestoreTrashItemBody,
    handleBatchRestoreFromTrashBody,
    defaultModelUpdateBody,
    moveModelOrderBody
  ]) {
    assert.match(body, /runtimeDialogCoordinator\.showNotification\(/);
    assert.doesNotMatch(body, /(^|[^\w.])showNotification\(/);
  }

  assert.match(deleteChatBody, /else\s*\{\s*runtimeRenderCoordinator\.renderAll\(\);\s*\}\s*runtimeDialogCoordinator\.showNotification\(i18n\[config\.uiLanguage\]\.chatMovedToTrash\s*\|\|\s*'[^']*',\s*'success'\);/);
  assert.match(deactivateAstrasBody, /runtimeRenderCoordinator\.renderAll\(\);\s*legacyRuntimeContext\.resolveBinding\('input\.updateInputState'\)\(\);\s*runtimeDialogCoordinator\.showNotification\(/);
  assert.match(deleteAstrasBody, /runtimeRenderCoordinator\.renderAll\(\);\s*runtimeDialogCoordinator\.showNotification\(/);
  assert.match(handleBatchArchiveBody, /await\s+saveAppData\(\);\s*toggleSelectionMode\(\);\s*runtimeDialogCoordinator\.showNotification\(/);
  assert.match(handleRestoreTrashItemBody, /await\s+saveAppData\(\);\s*renderTrash\(\);\s*runtimeDialogCoordinator\.showNotification\(/);
  assert.match(handleBatchRestoreFromTrashBody, /await\s+saveAppData\(\);\s*toggleTrashSelectionMode\(\);\s*runtimeDialogCoordinator\.showNotification\(/);
  assert.match(defaultModelUpdateBody, /config\.defaultModel\s*=\s*modelId;\s*await\s+saveConfig\(\);\s*(?:\/\/[^\n]*\s*)?runtimeDialogCoordinator\.showNotification\(/);
  assert.match(moveModelOrderBody, /await\s+saveConfig\(\);\s*renderModelManagementUI\(\);\s*(?:\/\/[^\n]*\s*)?runtimeDialogCoordinator\.showNotification\(/);
});

test('runtime config access owns selected uiLanguage reads through the config store', () => {
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const fragment02Source = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
  const fragment04Source = readSource('src/app/legacy-runtime/fragments/04-runtime.fragment.js');
  const accessSource = readSource('src/app/legacy-runtime/runtime/runtime-config-access.js');
  const getCouncilTextsBody = getConstFunctionBody(fragment00Source, 'getCouncilTexts');
  const getCouncilRuntimeTextsBody = getConstFunctionBody(fragment00Source, 'getCouncilRuntimeTexts');
  const getModelRetirementLabelBody = getConstFunctionBody(fragment00Source, 'getModelRetirementLabel');
  const getModelPriceLabelBody = getConstFunctionBody(fragment00Source, 'getModelPriceLabel');
  const renderArchivedChatsBody = getConstFunctionBody(fragment01Source, 'renderArchivedChats');
  const getCouncilModeLabelBody = getConstFunctionBody(fragment01Source, 'getCouncilModeLabel');
  const setupTimeAnalysisBody = getConstFunctionBody(fragment04Source, 'setupTimeAnalysis');
  const updateTimeDistributionChartBody = getConstFunctionBody(fragment04Source, 'updateTimeDistributionChart');

  assert.match(accessSource, /export\s+function\s+createRuntimeConfigAccess/);
  assert.match(fragment00Source, /import\s+\{\s*createRuntimeConfigAccess\s*\}/);
  assert.equal((fragment00Source.match(/createRuntimeConfigAccess\(\{/g) || []).length, 1);
  assert.match(fragment00Source, /const\s+runtimeConfigAccess\s*=\s*createRuntimeConfigAccess\(\{\s*getConfig:\s*\(\)\s*=>\s*runtimeConfigStore\.getConfig\(\)\s*\}\);/);
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
  assert.match(fragment02Source, /config\.uiLanguage\s*=\s*ALL_ELEMENTS\.uiLanguageSelect\.value;/);
  assert.match(fragment02Source, /applyLanguage\(config\.uiLanguage\);/);
});

test('runtime DOM access owns selected element reads through the extracted DOM registry', () => {
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const accessSource = readSource('src/app/legacy-runtime/runtime/runtime-dom-access.js');
  const arrangeInputMediaPreviewBody = getConstFunctionBody(fragment00Source, 'arrangeInputMediaPreview');
  const renderArchivedChatsBody = getConstFunctionBody(fragment01Source, 'renderArchivedChats');
  const renderFoldersBody = getConstFunctionBody(fragment01Source, 'renderFolders');
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
  const fragment04Source = readSource('src/app/legacy-runtime/fragments/04-runtime.fragment.js');
  const renderTrashBody = getConstFunctionBody(fragment04Source, 'renderTrash');
  const handleBatchRestoreFromTrashBody = getConstFunctionBody(fragment04Source, 'handleBatchRestoreFromTrash');
  const handleBatchDeleteFromTrashBody = getConstFunctionBody(fragment04Source, 'handleBatchDeleteFromTrash');

  assert.match(renderTrashBody, /item\.addEventListener\('click',\s*\(e\)\s*=>\s*\{/);
  assert.match(renderTrashBody, /if\s*\(e\.target\.closest\('button'\)\)\s*return;/);
  assert.match(renderTrashBody, /checkbox\.checked\s*=\s*!checkbox\.checked;\s*checkbox\.dispatchEvent\(new Event\('change'\)\);/);
  assert.match(renderTrashBody, /container\.querySelectorAll\('\.trash-select-checkbox'\)\.forEach\(checkbox\s*=>\s*\{\s*checkbox\.addEventListener\('click',\s*\(e\)\s*=>\s*e\.stopPropagation\(\)\);/);
  assert.match(renderTrashBody, /checkbox\.addEventListener\('change',\s*\(e\)\s*=>\s*\{[\s\S]*selectedTrashIds\.add\(id\);[\s\S]*selectedTrashIds\.delete\(id\);[\s\S]*renderTrashBatchActionBar\(\);[\s\S]*\}\);/);
  assert.match(handleBatchRestoreFromTrashBody, /await\s+saveAppData\(\);\s*toggleTrashSelectionMode\(\);\s*runtimeDialogCoordinator\.showNotification\(/);
  assert.match(handleBatchDeleteFromTrashBody, /if\s*\(!\(await\s+showCustomConfirm\([\s\S]*?\)\)\)\s*return;\s*conversations\s*=\s*runtimeAppDataStore\.replaceConversations\(\s*conversations\.filter\(c\s*=>\s*!selectedTrashIds\.has\(c\.id\)\)\s*\);\s*await\s+saveAppData\(\);\s*toggleTrashSelectionMode\(\);\s*showNotification\(/);
});

test('conversation state access owns selected active conversation lookups without stale snapshots', () => {
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const fragment02Source = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
  const fragment03Source = readSource('src/app/legacy-runtime/fragments/03-runtime.fragment.js');
  const accessSource = readSource('src/app/legacy-runtime/runtime/conversation-state-access.js');
  const createConversationElementBody = getConstFunctionBody(fragment01Source, 'createConversationElement');
  const deleteChatBody = getConstFunctionBody(fragment00Source, 'deleteChat');
  const archiveChatBody = getConstFunctionBody(fragment00Source, 'archiveChat');
  const batchDeleteBody = getConstFunctionBody(fragment03Source, 'handleBatchDelete');
  const batchArchiveBody = getConstFunctionBody(fragment03Source, 'handleBatchArchive');

  assert.match(accessSource, /export\s+function\s+createConversationStateAccess/);
  assert.match(fragment00Source, /import\s+\{\s*createConversationStateAccess\s*\}/);
  assert.equal((fragment00Source.match(/createConversationStateAccess\(\{/g) || []).length, 1);
  assert.match(fragment00Source, /getConversations:\s*\(\)\s*=>\s*conversations/);
  assert.match(fragment00Source, /getCurrentConversationId:\s*\(\)\s*=>\s*activeConversationId/);
  assert.match(fragment00Source, /setCurrentConversationId:\s*\(id\)\s*=>\s*\{\s*activeConversationId\s*=\s*id;\s*\}/);

  assert.match(fragment00Source, /const\s+getActiveConversation\s*=\s*\(\)\s*=>\s*\{\s*const\s+conv\s*=\s*conversationStateAccess\.getCurrentConversation\(\);/);
  assert.match(fragment00Source, /conversationStateAccess\.setCurrentConversationId\(newConv\.id\);/);
  assert.match(fragment00Source, /if\s*\(id\s*!==\s*conversationStateAccess\.getCurrentConversationId\(\)\)/);
  assert.match(fragment00Source, /conversationStateAccess\.setCurrentConversationId\(id\);/);
  assert.match(fragment02Source, /conv\.id\s*===\s*conversationStateAccess\.getCurrentConversationId\(\)/);

  assert.match(createConversationElementBody, /const\s+currentConversationId\s*=\s*conversationStateAccess\.getCurrentConversationId\(\);/);
  assert.match(createConversationElementBody, /conv\.id\s*===\s*currentConversationId\s*&&\s*!isSelectionMode\s*\?\s*'active'/);
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
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const fragment02Source = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
  const fragment03Source = readSource('src/app/legacy-runtime/fragments/03-runtime.fragment.js');
  const fragment04Source = readSource('src/app/legacy-runtime/fragments/04-runtime.fragment.js');
  const fragment05Source = readSource('src/app/legacy-runtime/fragments/05-runtime.fragment.js');

  assert.match(fragment02Source, /const\s+setupSettingsModal\s*=\s*\(\)\s*=>\s*\{/);
  assert.match(fragment02Source, /const\s+updateInputState\s*=\s*\(\)\s*=>\s*\{/);
  assert.match(fragment02Source, /legacyRuntimeContext\.registerLazyBinding\('settings\.setupSettingsModal',\s*\(\)\s*=>\s*setupSettingsModal\);/);
  assert.match(fragment02Source, /legacyRuntimeContext\.registerLazyBinding\('input\.updateInputState',\s*\(\)\s*=>\s*updateInputState\);/);
  assert.match(fragment02Source, /const\s+getTavilySearchDepth\s*=\s*\(\)\s*=>\s*config\.tavilySearchDepth\s*===\s*'advanced'\s*\?\s*'advanced'\s*:\s*'basic';/);
  assert.match(fragment02Source, /ALL_ELEMENTS\.tavilySearchDepthSelect\.value\s*=\s*getTavilySearchDepth\(\);/);
  assert.match(fragment03Source, /const\s+resolveSearchSetupSettingsModal\s*=\s*\(\.\.\.args\)\s*=>\s*legacyRuntimeContext\.resolveBinding\('settings\.setupSettingsModal'\)\(\.\.\.args\);/);
  assert.match(fragment05Source, /const\s+resolveEventsSetupSettingsModal\s*=\s*\(\.\.\.args\)\s*=>\s*legacyRuntimeContext\.resolveBinding\('settings\.setupSettingsModal'\)\(\.\.\.args\);/);
  for (const [source, fragmentLabel, resolverName] of [
    [fragment00Source, '00', 'resolveFoundationUpdateInputState'],
    [fragment03Source, '03', 'resolveUploadUpdateInputState'],
    [fragment05Source, '05', 'resolveEventsUpdateInputState']
  ]) {
    assert.match(
      source,
      new RegExp(`const\\s+${resolverName}\\s*=\\s*\\(\\.\\.\\.args\\)\\s*=>\\s*legacyRuntimeContext\\.resolveBinding\\('input\\.updateInputState'\\)\\(\\.\\.\\.args\\);`),
      `${fragmentLabel} should resolve updateInputState lazily`
    );
  }
  assert.doesNotMatch(fragment01Source, /const\s+resolveMainUpdateInputState\b/);
  assert.doesNotMatch(fragment04Source, /const\s+resolveTrashUpdateInputState\b/);
  assert.match(fragment01Source, /legacyRuntimeContext\.resolveBinding\('input\.updateInputState'\)\(\);/);
  assert.match(fragment04Source, /legacyRuntimeContext\.resolveBinding\('input\.updateInputState'\)\(\);/);
  assert.match(
    fragment05Source,
    /ALL_ELEMENTS\.settingsBtn\.addEventListener\('click',\s*\(\)\s*=>\s*\{\s*resolveEventsSetupSettingsModal\(\);\s*toggleModal\(ALL_ELEMENTS\.settingsModal,\s*true\);\s*\}\);/
  );
  assert.match(fragment05Source, /ALL_ELEMENTS\.closeSettingsBtn\.addEventListener\('click',\s*\(\)\s*=>\s*toggleModal\(ALL_ELEMENTS\.settingsModal,\s*false\)\);/);
  assert.match(fragment01Source, /updateInputState:\s*\(\)\s*=>\s*legacyRuntimeContext\.resolveBinding\('input\.updateInputState'\)\(\)/);
  assert.doesNotMatch(fragment01Source, /createMessageListLifecycle\(\{[\s\S]*\n\s*updateInputState,\s*\n[\s\S]*\}\);/);
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
  const fragmentSource = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
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

  assert.match(fragmentSource, /import\s*\{[\s\S]*\bgetSearchCurrentDate\b[\s\S]*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/model-request-formatting\.js';/);
  assert.doesNotMatch(fragmentSource, /appendStepPlanAttachmentContentBase/);
  assert.match(
    streamApiSource,
    /import\s*\{\s*appendStepPlanAttachmentContent\s*\}\s*from\s+'\.\/model-request-formatting\.js';/
  );
  assert.match(streamApiSource, /appendStepPlanAttachmentContent\(\s*content,\s*part\.inlineData,\s*modelInfo,\s*\{\s*modelSupportsVision\s*\}/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/02-runtime.fragment.js')).size < 150 * 1024);
});

test('stream API provider request and parser core is isolated from the 02 runtime fragment', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/stream-api-call.js');
  const fragmentSource = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/stream-api-call.js'));

  assert.equal(typeof helpers.createStreamApiCall, 'function');
  assert.match(helperSource, /export\s+function\s+createStreamApiCall\b/);
  assert.match(
    fragmentSource,
    /import\s*\{\s*createStreamApiCall\s*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/stream-api-call\.js';/
  );
  assert.match(fragmentSource, /const\s+streamApiCall\s*=\s*createStreamApiCall\(\{/);
  assert.match(fragmentSource, /\bgetActiveConversation,\s*\n\s*normalizeConversationModel,/);
  assert.match(fragmentSource, /getConfig:\s*\(\)\s*=>\s*config/);
  assert.match(fragmentSource, /getPersonalMemories:\s*\(\)\s*=>\s*personalMemories/);

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

  assert.match(fragmentSource, /function\s+calculateRelevanceScore\b/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/stream-api-call.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/02-runtime.fragment.js')).size < 130 * 1024);
});

test('provider request support helpers are isolated from the 02 runtime fragment', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/provider-request-support.js');
  const fragmentSource = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/provider-request-support.js'));

  assert.equal(typeof helpers.createProviderRequestSupport, 'function');
  assert.match(helperSource, /export\s+function\s+createProviderRequestSupport\b/);
  assert.match(
    fragmentSource,
    /import\s*\{\s*createProviderRequestSupport\s*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/provider-request-support\.js';/
  );
  assert.match(fragmentSource, /const\s+providerRequestSupport\s*=\s*createProviderRequestSupport\(\{/);
  assert.match(fragmentSource, /buildTavilySearchQuery,/);
  assert.match(fragmentSource, /formatTavilySearchPacket,/);
  assert.match(fragmentSource, /streamApiCall,/);
  assert.match(fragmentSource, /councilRetryDelayMs:\s*COUNCIL_RETRY_DELAY_MS/);
  assert.match(fragmentSource, /buildSingleModelTranslatedRequestParts,[\s\S]*streamCouncilApiCallWithRetry,[\s\S]*truncateCouncilText[\s\S]*=\s*providerRequestSupport/);

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
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/02-runtime.fragment.js')).size < 80 * 1024);
});

test('council response lifecycle core is isolated from the 02 runtime fragment', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/council-response-lifecycle.js');
  const fragmentSource = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/council-response-lifecycle.js'));

  assert.equal(typeof helpers.createCouncilResponseLifecycle, 'function');
  assert.match(helperSource, /export\s+function\s+createCouncilResponseLifecycle\b/);
  assert.match(
    fragmentSource,
    /import\s*\{\s*createCouncilResponseLifecycle\s*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/council-response-lifecycle\.js';/
  );
  assert.match(fragmentSource, /const\s+councilResponseLifecycle\s*=\s*createCouncilResponseLifecycle\(\{/);
  assert.match(fragmentSource, /const\s+runModelCouncil\s*=\s*\(\.\.\.args\)\s*=>\s*councilResponseLifecycle\.runModelCouncil\(\.\.\.args\)/);

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

  assert.match(fragmentSource, /streamCouncilApiCallWithRetry,/);
  assert.match(fragmentSource, /buildSingleModelTranslatedRequestParts,/);
  assert.match(fragmentSource, /async\s+function\s+callApiWithSchema\b/);
  assert.match(helperSource, /const\s+firstRoundSettled\s*=\s*await\s+Promise\.allSettled/);
  assert.match(helperSource, /const\s+secondRoundSettled\s*=\s*await\s+Promise\.allSettled/);
  assert.match(helperSource, /const\s+synthesisPrompt\s*=\s*buildCouncilSynthesisPrompt/);
  assert.doesNotMatch(helperSource, /document\.|window\.|indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(helperSource, /TextDecoder\b|response\.body\.getReader\(\)|virtual:legacy-app-runtime|vite\.config|package\.json/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/council-response-lifecycle.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/02-runtime.fragment.js')).size < 80 * 1024);
});

test('settings mobile metadata helpers are isolated from the 02 runtime fragment', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/settings-mobile-metadata.js');
  const fragmentSource = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/settings-mobile-metadata.js'));

  assert.equal(typeof helpers.getSettingsMobileGroups, 'function');
  assert.equal(typeof helpers.SETTINGS_MOBILE_ICON_MAP, 'object');
  assert.match(helperSource, /export\s+const\s+SETTINGS_MOBILE_ICON_MAP\b/);
  assert.match(helperSource, /export\s+const\s+getSettingsMobileGroups\b/);

  assert.match(
    fragmentSource,
    /import\s*\{[\s\S]*\bSETTINGS_MOBILE_ICON_MAP\b[\s\S]*\bgetSettingsMobileGroups\s+as\s+getSettingsMobileGroupsBase\b[\s\S]*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/settings-mobile-metadata\.js';/
  );
  assert.match(fragmentSource, /getSettingsMobileGroupsBase\(\s*getSettingsText\s*\)/);
  assert.doesNotMatch(fragmentSource, /const\s+SETTINGS_MOBILE_ICON_MAP\s*=/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/02-runtime.fragment.js')).size < 150 * 1024);
});

test('output mode settings text helper is isolated from the 02 runtime fragment', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/output-mode-settings-text.js');
  const fragmentSource = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/output-mode-settings-text.js'));

  assert.equal(typeof helpers.getOutputModeSettingsText, 'function');
  assert.match(helperSource, /export\s+const\s+getOutputModeSettingsText\b/);
  assert.match(
    fragmentSource,
    /import\s*\{[\s\S]*\bgetOutputModeSettingsText\b[\s\S]*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/output-mode-settings-text\.js';/
  );
  assert.match(fragmentSource, /getOutputModeSettingsText\(\s*config\.uiLanguage\s*\)/);
  assert.doesNotMatch(fragmentSource, /const\s+getOutputModeSettingsText\s*=\s*\(\)\s*=>/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/02-runtime.fragment.js')).size < 150 * 1024);
});

test('search text formatting helper is isolated from the 03 runtime fragment', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/search-text-formatting.js');
  const fragmentSource = readSource('src/app/legacy-runtime/fragments/03-runtime.fragment.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/search-text-formatting.js'));

  assert.equal(typeof helpers.highlightText, 'function');
  assert.match(helperSource, /export\s+const\s+highlightText\b/);
  assert.match(
    fragmentSource,
    /import\s*\{[\s\S]*\bhighlightText\b[\s\S]*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/search-text-formatting\.js';/
  );
  assert.doesNotMatch(fragmentSource, /\b(?:const|function)\s+highlightText\b/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/03-runtime.fragment.js')).size < 150 * 1024);
});

test('message type icon helper is isolated from the 00 runtime fragment', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/message-type-icon.js');
  const fragmentSource = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/message-type-icon.js'));

  assert.equal(typeof helpers.getMessageTypeIcon, 'function');
  assert.match(helperSource, /export\s+function\s+getMessageTypeIcon\b/);
  assert.match(
    fragmentSource,
    /import\s*\{[\s\S]*\bgetMessageTypeIcon\b[\s\S]*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/message-type-icon\.js';/
  );
  assert.doesNotMatch(fragmentSource, /\b(?:const|function)\s+getMessageTypeIcon\b/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/00-runtime.fragment.js')).size < 150 * 1024);
});

test('date formatting helper is isolated from the 00 runtime fragment and remains available to timestamp call sites', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/date-formatting.js');
  const postResponseActionsSource = readSource('src/app/legacy-runtime/features/model-message-post-response-actions.js');
  const messageMarkupSource = readSource('src/app/legacy-runtime/features/message-markup-renderer.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const fragment04Source = readSource('src/app/legacy-runtime/fragments/04-runtime.fragment.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/date-formatting.js'));

  assert.equal(typeof helpers.formatFullTimestamp, 'function');
  assert.match(helperSource, /export\s+const\s+formatFullTimestamp\b/);
  assert.match(
    fragment00Source,
    /import\s*\{[\s\S]*\bformatFullTimestamp\b[\s\S]*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/date-formatting\.js';/
  );
  assert.doesNotMatch(fragment00Source, /\bconst\s+formatFullTimestamp\s*=/);
  assert.match(fragment01Source, /formatTimestamp:\s*formatFullTimestamp/);
  assert.match(messageMarkupSource, /formatTimestamp\(message\.createdAt\)/);
  assert.match(postResponseActionsSource, /formatTimestamp\(aiMessageObject\.createdAt\)/);
  assert.match(fragment04Source, /formatFullTimestamp\(conv\.deletedAt\)/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/00-runtime.fragment.js')).size < 150 * 1024);
});

test('time distribution chart data helper is isolated from the 04 runtime fragment', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/time-distribution-chart-data.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment04Source = readSource('src/app/legacy-runtime/fragments/04-runtime.fragment.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/time-distribution-chart-data.js'));

  assert.equal(typeof helpers.buildTimeDistributionChartData, 'function');
  assert.match(helperSource, /export\s+function\s+buildTimeDistributionChartData\b/);
  assert.match(
    fragment00Source,
    /import\s*\{[\s\S]*\bbuildTimeDistributionChartData\b[\s\S]*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/time-distribution-chart-data\.js';/
  );
  assert.doesNotMatch(fragment04Source, /import\('\/src\/app\/legacy-runtime\/features\/time-distribution-chart-data\.js'\)/);
  assert.doesNotMatch(fragment04Source, /timeDistributionChartDataModulePromise/);
  assert.doesNotMatch(fragment04Source, /\blet\s+labels,\s*data,\s*chartType,\s*label\b/);
  assert.doesNotMatch(fragment04Source, /data\s*=\s*years\.map\(y\s*=>\s*allMessages\.filter/);
  assert.match(fragment04Source, /const\s+updateTimeDistributionChart\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(fragment04Source, /const\s+updateTimeDistributionChart\s*=\s*async\s*\(\)\s*=>/);
  assert.match(fragment04Source, /buildTimeDistributionChartData\(\{\s*messages:\s*allMessages,\s*year,\s*month,\s*day,\s*text:\s*i18n\[lang\]\s*\}\)/);
  assert.match(fragment04Source, /document\.getElementById\('time-distribution-chart'\)\.getContext\('2d'\)/);
  assert.match(fragment04Source, /timeDistChart\s*=\s*new Chart\(ctx,/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/04-runtime.fragment.js')).size < 150 * 1024);
});

test('mobile context menu markup helpers are isolated from the 04 runtime fragment', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/mobile-context-menu-markup.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment04Source = readSource('src/app/legacy-runtime/fragments/04-runtime.fragment.js');
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
  assert.match(fragment04Source, /menu\.innerHTML\s*=\s*buildConversationMobileContextMenuMarkup\(\{/);
  assert.match(fragment04Source, /menu\.innerHTML\s*=\s*buildFolderMobileContextMenuMarkup\(\{/);
  assert.match(fragment04Source, /menu\.innerHTML\s*=\s*buildAstraMobileContextMenuMarkup\(\{/);
  assert.doesNotMatch(fragment04Source, /const\s+menuHeader\s*=/);
  assert.doesNotMatch(fragment04Source, /let\s+menuOptions\s*=/);
  assert.doesNotMatch(fragment04Source, /const\s+moveOptionsHTML\s*=/);
  assert.match(fragment04Source, /document\.createElement\('div'\)/);
  assert.match(fragment04Source, /document\.body\.appendChild\(menuWrapper\)/);
  assert.match(fragment04Source, /menu\.addEventListener\('click'/);
  assert.match(fragment04Source, /showRenameModal\(convId,\s*'conversation',\s*e\)/);
  assert.match(fragment04Source, /showFolderSettingsModal\(folderId,\s*e\)/);
  assert.match(fragment04Source, /openAvatarEditor\(astrasId\)/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/04-runtime.fragment.js')).size < 150 * 1024);
});

test('streaming council details helpers are isolated from the 01 runtime fragment', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/streaming-council-details.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
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
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/01-runtime.fragment.js')).size < 150 * 1024);
});

test('streaming markdown render state helper is isolated from the 01 runtime renderer', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/streaming-markdown-render-state.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
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
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/01-runtime.fragment.js')).size < 150 * 1024);
});

test('streaming markdown renderer and response core is isolated from the 01 runtime fragment', async () => {
  const rendererSource = readSource('src/app/legacy-runtime/features/streaming-markdown-renderer.js');
  const lifecycleSource = readSource('src/app/legacy-runtime/features/single-model-response-lifecycle.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
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
  assert.match(fragment01Source, /waitForFrame:\s*\(\)\s*=>\s*new Promise\(resolve\s*=>\s*setTimeout\(resolve,\s*16\)\)/);
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
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/01-runtime.fragment.js')).size < 140 * 1024);
});

test('single-model response lifecycle is isolated from the 01 runtime submit flow', async () => {
  const lifecycleSource = readSource('src/app/legacy-runtime/features/single-model-response-lifecycle.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
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
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/01-runtime.fragment.js')).size < 135 * 1024);
});

test('response progress renderers and submit preparation are isolated from the 01 runtime shell', async () => {
  const runtimeContextSource = readSource('src/app/legacy-runtime/runtime/legacy-runtime-context.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const progressSource = readSource('src/app/legacy-runtime/features/response-progress-renderers.js');
  const submitPrepSource = readSource('src/app/legacy-runtime/features/submit-input-preparation-lifecycle.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
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
    /import\s*\{\s*createResponseProgressRenderers\s*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/response-progress-renderers\.js';/
  );
  assert.match(
    fragment01Source,
    /import\s*\{\s*createSubmitInputPreparationLifecycle\s*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/submit-input-preparation-lifecycle\.js';/
  );
  assert.match(fragment01Source, /\{\s*renderCouncilProgress,\s*renderSingleModelError,\s*renderSingleModelProgress\s*\}\s*=\s*createResponseProgressRenderers\(\{/);
  assert.match(fragment01Source, /submitInputPreparationLifecycle\s*=\s*createSubmitInputPreparationLifecycle\(\{/);
  assert.match(fragment01Source, /const\s+preparedSubmit\s*=\s*await\s+submitInputPreparationLifecycle\.prepareSubmitResponse\(\);/);
  assert.match(fragment01Source, /if\s*\(!preparedSubmit\.shouldContinue\)\s*return;/);
  for (const bindingName of [
    'updateSubmitButtonState',
    'generateTitleAndSummary',
    'shouldPerformWebSearch',
    'adjustTextareaHeight',
    'renderFilePreviews'
  ]) {
    assert.match(
      fragment01Source,
      new RegExp(`registerLazyBinding\\('submit\\.${bindingName}',\\s*\\(\\)\\s*=>\\s*${bindingName}\\)`)
    );
    assert.match(
      fragment01Source,
      new RegExp(`${bindingName}:\\s*\\(\\.\\.\\.args\\)\\s*=>\\s*legacyRuntimeContext\\.resolveBinding\\('submit\\.${bindingName}'\\)\\(\\.\\.\\.args\\)`)
    );
    assert.doesNotMatch(
      fragment01Source,
      new RegExp(`\\n\\s*${bindingName},\\s*\\n`)
    );
  }
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
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/01-runtime.fragment.js')).size < 80 * 1024);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/02-runtime.fragment.js')).size < 80 * 1024);
});

test('model switcher preparation and lifecycle are isolated from the 01 runtime shell', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/model-switcher-lifecycle.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/model-switcher-lifecycle.js'));

  assert.equal(typeof helpers.prepareModelSwitcherModels, 'function');
  assert.equal(typeof helpers.createModelSwitcherLifecycle, 'function');
  assert.match(helperSource, /export\s+function\s+prepareModelSwitcherModels\b/);
  assert.match(helperSource, /export\s+function\s+createModelSwitcherLifecycle\b/);
  assert.match(
    fragment01Source,
    /import\s*\{\s*createModelSwitcherLifecycle\s*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/model-switcher-lifecycle\.js';/
  );
  assert.match(fragment01Source, /\{\s*renderModelSwitcher\s*\}\s*=\s*createModelSwitcherLifecycle\(\{/);
  assert.match(helperSource, /\bgetModelSwitcherContainer\b/);
  assert.doesNotMatch(helperSource, /\belements\b/);
  assert.doesNotMatch(helperSource, /\bALL_ELEMENTS\b/);
  assert.match(fragment01Source, /getModelSwitcherContainer:\s*\(\)\s*=>\s*ALL_ELEMENTS\.modelSwitcherContainer/);
  assert.doesNotMatch(
    fragment01Source,
    /createModelSwitcherLifecycle\(\{[\s\S]*?elements:\s*ALL_ELEMENTS[\s\S]*?\}\);/
  );

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
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/01-runtime.fragment.js')).size < 100 * 1024);
});

test('council controls lifecycle is isolated from the 01 runtime shell', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/council-controls-lifecycle.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/council-controls-lifecycle.js'));

  assert.equal(typeof helpers.createCouncilControlsLifecycle, 'function');
  assert.match(helperSource, /export\s+function\s+createCouncilControlsLifecycle\b/);
  assert.match(
    fragment01Source,
    /import\s*\{\s*createCouncilControlsLifecycle\s*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/council-controls-lifecycle\.js';/
  );
  assert.match(fragment01Source, /\{\s*renderCouncilControls\s*\}\s*=\s*createCouncilControlsLifecycle\(\{/);
  assert.match(helperSource, /\bgetFileInputContainer\b/);
  assert.doesNotMatch(helperSource, /\belements\b/);
  assert.doesNotMatch(helperSource, /elements\.fileInputContainer/);
  assert.match(fragment01Source, /getFileInputContainer:\s*\(\)\s*=>\s*ALL_ELEMENTS\.fileInputContainer/);
  assert.doesNotMatch(fragment01Source, /getFileInputContainer:\s*ALL_ELEMENTS\.fileInputContainer/);
  assert.doesNotMatch(
    fragment01Source,
    /createCouncilControlsLifecycle\(\{[\s\S]*?elements:\s*ALL_ELEMENTS[\s\S]*?\}\);/
  );

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
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/01-runtime.fragment.js')).size < 80 * 1024);
});

test('assistant response finalization is isolated from the 01 runtime submit flow', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/assistant-response-finalization.js');
  const submitPrepSource = readSource('src/app/legacy-runtime/features/submit-input-preparation-lifecycle.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
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
  assert.match(fragment01Source, /updateSubmitButtonState,/);
  assert.match(submitPrepSource, /updateSubmitButtonState\(false\)/);
  assert.match(fragment01Source, /renderCouncilControls\(\)/);
  assert.match(fragment01Source, /renderInputIndicators\(\)/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/assistant-response-finalization.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/01-runtime.fragment.js')).size < 130 * 1024);
});

test('submit final cleanup lifecycle is isolated from the 01 runtime submit flow', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/submit-final-cleanup-lifecycle.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/submit-final-cleanup-lifecycle.js'));

  assert.equal(typeof helpers.runSubmitFinalCleanupLifecycle, 'function');
  assert.match(helperSource, /export\s+function\s+runSubmitFinalCleanupLifecycle\b/);
  assert.match(
    fragment00Source,
    /import\s*\{\s*runSubmitFinalCleanupLifecycle\s*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/submit-final-cleanup-lifecycle\.js';/
  );
  assert.match(fragment01Source, /const\s+lastMessageElement\s*=\s*runSubmitFinalCleanupLifecycle\(\s*\(\)\s*=>\s*singleModelResponseLifecycle\.stop\(\),/);
  assert.match(fragment01Source, /\(\)\s*=>\s*\{\s*isCouncilRunning\s*=\s*false;\s*abortController\s*=\s*null;\s*\},/);
  assert.match(fragment01Source, /updateSubmitButtonState,\s*\(\.\.\.args\)\s*=>\s*legacyRuntimeContext\.resolveBinding\('input\.updateInputState'\)\(\.\.\.args\),\s*renderCouncilControls,\s*renderInputIndicators,/);
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
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/01-runtime.fragment.js')).size < 130 * 1024);
});

test('model message post-response actions remove the 01 to 02 last message lexical continuation', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/model-message-post-response-actions.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const fragment02Source = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
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
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/01-runtime.fragment.js')).size < 130 * 1024);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/02-runtime.fragment.js')).size < 80 * 1024);
});

test('general message markup rendering is isolated from the 01 runtime DOM shell', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/message-markup-renderer.js');
  const messageListSource = readSource('src/app/legacy-runtime/features/message-list-lifecycle.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const fragment05Source = readSource('src/app/legacy-runtime/fragments/05-runtime.fragment.js');
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
    fragment01Source,
    /import\s*\{\s*createMessageListLifecycle\s*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/message-list-lifecycle\.js';/
  );
  assert.match(fragment01Source, /\{\s*addMessageToUI,\s*renderChat\s*\}\s*=\s*createMessageListLifecycle\(\{/);
  assert.match(fragment01Source, /buildMediaAttachmentView:\s*buildMessageMediaAttachmentView/);
  assert.match(fragment01Source, /bindMediaPreviewButtons:\s*bindMessageMediaPreviewButtons/);
  assert.match(messageListSource, /const\s+messageView\s*=\s*buildMessageRenderView\(\{\s*message,/);
  assert.match(messageListSource, /messageElement\.className\s*=\s*messageView\.messageClassName/);
  assert.match(messageListSource, /messageElement\.innerHTML\s*=\s*messageView\.messageHTML/);
  assert.match(messageListSource, /bindMediaPreviewButtons\(messageElement,\s*messageView\.previewMediaParts\)/);

  assert.doesNotMatch(fragment01Source, /const\s+isUser\s*=\s*msg\.role\s*===\s*'user'/);
  assert.doesNotMatch(fragment01Source, /const\s+isLoadingMessage\s*=\s*!isUser/);
  assert.doesNotMatch(fragment01Source, /let\s+textPartsContent\s*=\s*\[\]/);
  assert.doesNotMatch(fragment01Source, /const\s+messageBubble\s*=\s*`/);
  assert.doesNotMatch(fragment01Source, /copy-content-btn[\s\S]*contentPaddingClass\s*=\s*'pb-8'/);

  assert.doesNotMatch(fragment01Source, /const\s+addMessageToUI\s*=\s*\(msg,\s*index,/);
  assert.doesNotMatch(fragment01Source, /const\s+renderChat\s*=\s*\(\)\s*=>/);
  assert.match(messageListSource, /conversation\.messages\.push\(message\)/);
  assert.match(messageListSource, /document\.createElement\('div'\)/);
  assert.match(messageListSource, /elements\.messageList\.appendChild\(messageElement\)/);
  assert.match(messageListSource, /elements\.chatContainer\.scrollTo/);
  assert.match(messageListSource, /scheduleFrame\(\(\)\s*=>\s*setupMessageIntersectionObserver\(\)\)/);
  assert.match(fragment05Source, /e\.target\.closest\('\.copy-content-btn'\)/);

  assert.match(postResponseActionsSource, /export\s+function\s+applyModelMessagePostResponseActions\b/);
  assert.match(streamingRendererSource, /export\s+function\s+createStreamingMarkdownFeature\b/);
  assert.match(finalizationSource, /export\s+async\s+function\s+finalizeAssistantResponse\b/);
  assert.doesNotMatch(helperSource, /document|window|globalThis|addEventListener|fetch\s*\(/);
  assert.doesNotMatch(`${helperSource}\n${messageListSource}`, /indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(`${helperSource}\n${messageListSource}`, /virtual:legacy-app-runtime|vite\.config|package\.json/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/message-markup-renderer.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/message-list-lifecycle.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/01-runtime.fragment.js')).size < 125 * 1024);
});

test('media renderer and preview lifecycle replace fragment-local and hidden lexical media helpers', async () => {
  const rendererSource = readSource('src/app/legacy-runtime/features/media-attachment-renderer.js');
  const previewSource = readSource('src/app/legacy-runtime/features/media-preview-lifecycle.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const fragment03Source = readSource('src/app/legacy-runtime/fragments/03-runtime.fragment.js');
  const fragment04Source = readSource('src/app/legacy-runtime/fragments/04-runtime.fragment.js');
  const fragment05Source = readSource('src/app/legacy-runtime/fragments/05-runtime.fragment.js');
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
  assert.match(fragment01Source, /createMediaAttachmentRenderer\s+as\s+createMessageMediaAttachmentRenderer/);
  assert.match(fragment01Source, /createMediaPreviewLifecycle\s+as\s+createMessageMediaPreviewLifecycle/);
  assert.match(fragment03Source, /createMediaAttachmentRenderer\s+as\s+createSearchMediaAttachmentRenderer/);
  assert.match(fragment03Source, /createMediaPreviewLifecycle\s+as\s+createSearchMediaPreviewLifecycle/);
  assert.match(fragment04Source, /createMediaAttachmentRenderer\s+as\s+createTrashMediaAttachmentRenderer/);
  assert.match(fragment04Source, /createMediaPreviewLifecycle\s+as\s+createTrashMediaPreviewLifecycle/);

  assert.match(fragment00Source, /createConversationViewRenderer\s+as\s+createArchivedConversationViewRenderer/);
  assert.match(fragment00Source, /archivedConversationViewRenderer\.renderConversationMessages\(\{/);
  assert.match(fragment00Source, /renderMediaAttachmentGrid:\s*renderArchivedMediaAttachmentGrid/);
  assert.match(fragment00Source, /bindMediaPreviewButtons:\s*bindArchivedMediaPreviewButtons/);
  assert.match(fragment01Source, /buildMediaAttachmentView:\s*buildMessageMediaAttachmentView/);
  assert.match(fragment01Source, /bindMediaPreviewButtons:\s*bindMessageMediaPreviewButtons/);
  assert.match(fragment03Source, /createConversationViewRenderer\s+as\s+createSearchConversationViewRenderer/);
  assert.match(fragment03Source, /searchConversationViewRenderer\.renderConversationMessages\(\{/);
  assert.match(fragment03Source, /renderMediaAttachmentGrid:\s*renderSearchMediaAttachmentGrid/);
  assert.match(fragment03Source, /bindMediaPreviewButtons:\s*bindSearchMediaPreviewButtons/);
  assert.match(fragment03Source, /createUploadedFilePreviewLifecycle\(\{/);
  assert.match(fragment03Source, /openMediaPreview:\s*openSearchMediaPreview/);
  assert.match(fragment04Source, /createConversationViewRenderer\s+as\s+createTrashConversationViewRenderer/);
  assert.match(fragment04Source, /trashConversationViewRenderer\.renderConversationMessages\(\{/);
  assert.match(fragment04Source, /renderMediaAttachmentGrid:\s*renderTrashMediaAttachmentGrid/);
  assert.match(fragment04Source, /bindMediaPreviewButtons:\s*bindTrashMediaPreviewButtons/);

  assert.doesNotMatch(fragment01Source, /\bconst\s+getInlineMediaSrc\s*=/);
  assert.doesNotMatch(fragment01Source, /\bconst\s+renderMediaAttachmentGrid\s*=/);
  assert.doesNotMatch(fragment01Source, /\bconst\s+openMediaPreview\s*=/);
  assert.doesNotMatch(fragment01Source, /\bconst\s+bindMediaPreviewButtons\s*=/);
  assert.doesNotMatch(fragment03Source, /typeof\s+renderMediaAttachmentGrid/);
  assert.doesNotMatch(fragment03Source, /typeof\s+bindMediaPreviewButtons/);
  assert.doesNotMatch(fragment03Source, /\bopenMediaPreview\(/);
  assert.doesNotMatch(fragment03Source, /const\s+renderFilePreviews\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(fragment03Source, /const\s+removeFile\s*=\s*\(fileId\)\s*=>/);
  assert.doesNotMatch(fragment04Source, /typeof\s+renderMediaAttachmentGrid/);
  assert.doesNotMatch(fragment04Source, /typeof\s+bindMediaPreviewButtons/);
  assert.doesNotMatch(fragment00Source, /conv\.messages\.forEach\(msg\s*=>/);
  assert.doesNotMatch(fragment03Source, /conv\.messages\.forEach\(msg\s*=>/);
  assert.doesNotMatch(fragment04Source, /conv\.messages\.forEach\(msg\s*=>/);

  assert.match(messageMarkupSource, /const\s+mediaView\s*=\s*buildMediaAttachmentView\(mediaParts\)/);
  assert.match(messageMarkupSource, /previewMediaParts\s*=\s*mediaView\.previewMediaParts/);
  assert.match(postResponseActionsSource, /export\s+function\s+applyModelMessagePostResponseActions\b/);
  assert.match(fragment05Source, /e\.target\.closest\('\.copy-content-btn'\)/);
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
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/01-runtime.fragment.js')).size < 120 * 1024);
});

test('council response render lifecycle is isolated from the 01 runtime submit flow', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/council-response-render-lifecycle.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/council-response-render-lifecycle.js'));

  assert.equal(typeof helpers.runCouncilResponseRenderLifecycle, 'function');
  assert.match(helperSource, /export\s+async\s+function\s+runCouncilResponseRenderLifecycle\b/);
  assert.match(
    fragment00Source,
    /import\s*\{\s*runCouncilResponseRenderLifecycle\s*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/council-response-render-lifecycle\.js';/
  );
  assert.match(fragment01Source, /const\s+councilResult\s*=\s*await\s+runCouncilResponseRenderLifecycle\(\{/);
  assert.match(fragment01Source, /setCouncilRunning:\s*\(value\)\s*=>\s*\{\s*isCouncilRunning\s*=\s*value;\s*\}/);
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
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/01-runtime.fragment.js')).size < 130 * 1024);
});

test('streaming text frame queue helper is isolated from the 01 runtime stream response', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/streaming-text-frame-queue.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
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
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/01-runtime.fragment.js')).size < 150 * 1024);
});

test('typewriter stream uses the shared streaming text frame queue boundary', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/streaming-text-frame-queue.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
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
  assert.match(typewriterStreamSource, /setTimeout\(resolve,\s*16\)/);
  assert.match(typewriterStreamSource, /targetElement\.appendChild\(fragment\)/);
  assert.match(typewriterStreamSource, /targetElement\.innerHTML\s*=\s*renderMarkdownWithFormulas\(fullText\)/);
  assert.match(typewriterStreamSource, /renderMarkdown\(`[^`]*\$\{error\.message\}`\)/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/01-runtime.fragment.js')).size < 150 * 1024);
});

test('typewriter playback controller is isolated from the 01 runtime playback loops', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/typewriter-playback-controller.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
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
  assert.match(playbackTypewriterSource, /schedule:\s*\(callback,\s*delay\)\s*=>\s*setTimeout\(callback,\s*delay\)/);
  assert.match(playbackStreamingSource, /schedule:\s*\(callback,\s*delay\)\s*=>\s*setTimeout\(callback,\s*delay\)/);
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
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/01-runtime.fragment.js')).size < 150 * 1024);
});

test('renderer gradual append controller is isolated from the 01 runtime RAF append loop', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/renderer-gradual-append-controller.js');
  const councilRenderSource = readSource('src/app/legacy-runtime/features/council-response-render-lifecycle.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
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
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/01-runtime.fragment.js')).size < 150 * 1024);
});

test('version compare helper is isolated from the 00 runtime fragment and remains available to update logs', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/version-compare.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment04Source = readSource('src/app/legacy-runtime/fragments/04-runtime.fragment.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/version-compare.js'));

  assert.equal(typeof helpers.compareVersions, 'function');
  assert.match(helperSource, /export\s+const\s+compareVersions\b/);
  assert.match(
    fragment00Source,
    /import\s*\{[\s\S]*\bcompareVersions\b[\s\S]*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/version-compare\.js';/
  );
  assert.doesNotMatch(fragment00Source, /\b(?:const|function)\s+compareVersions\b/);
  assert.match(fragment04Source, /compareVersions\(log\.version,\s*lastSeenVersion\)/);
  assert.match(fragment04Source, /compareVersions\(b\.version,\s*a\.version\)/);
  assert.match(fragment04Source, /compareVersions\(log\.version,\s*max\)/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/00-runtime.fragment.js')).size < 150 * 1024);
});
