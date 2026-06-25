import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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

const assertMarkersInOrder = (source, markers, context) => {
  let cursor = -1;
  for (const marker of markers) {
    const next = source.indexOf(marker, cursor + 1);
    assert.notEqual(next, -1, `${context} should contain ${marker}`);
    assert.ok(next > cursor, `${marker} should remain in legacy order for ${context}`);
    cursor = next;
  }
};

const countLiteral = (source, literal) => source.split(literal).length - 1;

test('loadAppData keeps orchestration, lexical replacements, and corruption fallback in 00', () => {
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const loadAppDataBody = getConstFunctionBody(fragment00Source, 'loadAppData');

  assertMarkersInOrder(loadAppDataBody, [
    'const saved = await getItem(getAppDataKey())',
    'const data = JSON.parse(saved)',
    'const normalizedData = normalizeLoadedLegacyAppData({',
    'const latestAppData = runtimeAppDataStore.replaceAll(normalizedData)',
    'conversations = latestAppData.conversations',
    'folders = latestAppData.folders',
    'astras = latestAppData.astras',
    'personalMemories = latestAppData.personalMemories'
  ], 'loadAppData successful app data replacement');

  assertMarkersInOrder(loadAppDataBody, [
    'catch (e)',
    'console.error',
    'showNotification',
    'const latestAppData = runtimeAppDataStore.replaceAll({',
    'conversations: []',
    'folders: []',
    'astras: []',
    'personalMemories: []',
    'conversations = latestAppData.conversations',
    'folders = latestAppData.folders',
    'astras = latestAppData.astras',
    'personalMemories = latestAppData.personalMemories',
    'await removeItem(getAppDataKey())'
  ], 'loadAppData corruption fallback');

  assert.equal(countLiteral(loadAppDataBody, 'runtimeAppDataStore.replaceAll({'), 2);
  assert.match(loadAppDataBody, /}\s*else\s*{\s*const\s+latestAppData\s*=\s*runtimeAppDataStore\.replaceAll\(\{\s*conversations:\s*\[\],\s*folders:\s*\[\],\s*astras:\s*\[\],\s*personalMemories:\s*\[\]\s*\}\);\s*conversations\s*=\s*latestAppData\.conversations;\s*folders\s*=\s*latestAppData\.folders;\s*astras\s*=\s*latestAppData\.astras;\s*personalMemories\s*=\s*latestAppData\.personalMemories;\s*}/);
});

test('saveAppData and active conversation bridges stay lexical and live', () => {
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');

  assertMarkersInOrder(fragment00Source, [
    'const conversationStateAccess = createConversationStateAccess({',
    'getConversations: () => conversations',
    'getCurrentConversationId: () => activeConversationId',
    'setCurrentConversationId: (id) => { activeConversationId = id; }'
  ], 'conversationStateAccess active conversation bridge');

  assertMarkersInOrder(fragment00Source, [
    'const runtimeAppDataPersistence = createLegacyRuntimeAppDataPersistence({',
    'getCurrentUser: () => currentUser',
    'getAppData: () => ({',
    'conversations',
    'folders',
    'astras',
    'personalMemories',
    'getAppDataKey',
    'setItem'
  ], 'saveAppData live app data getter');

  assert.match(fragment00Source, /const\s+saveAppData\s*=\s*async\s*\(\)\s*=>\s*\{\s*await\s+runtimeAppDataPersistence\.saveAppData\(\);\s*\}/);
  assert.doesNotMatch(fragment00Source, /getAppData:\s*\(\)\s*=>\s*runtimeAppDataStore\.getSnapshot\(\)/);
});

test('00 transient conversation replacements preserve legacy ordering', () => {
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const startNewChatBody = getConstFunctionBody(fragment00Source, 'startNewChat');
  const loadChatBody = getConstFunctionBody(fragment00Source, 'loadChat');

  assertMarkersInOrder(startNewChatBody, [
    'const oldTempChatCount = conversations.length',
    'conversations = runtimeAppDataStore.replaceConversations(',
    'conversations.filter(c => !c.isTemporary || c.messages.length > 0)',
    'await saveAppData()',
    'uploadedFiles = []',
    'conversations.unshift(newConv)',
    'conversationStateAccess.setCurrentConversationId(newConv.id)',
    'renderAll()'
  ], 'startNewChat temporary conversation replacement');

  assertMarkersInOrder(loadChatBody, [
    'const previousConv = getActiveConversation()',
    'conversations = runtimeAppDataStore.replaceConversations(',
    'conversations.filter(c => c.id !== previousConv.id)',
    'conversationStateAccess.setCurrentConversationId(id)',
    'uploadedFiles = []',
    'renderAll()'
  ], 'loadChat previous temporary conversation replacement');

  assert.doesNotMatch(startNewChatBody, /conversations\s*=\s*conversations\.filter\(c\s*=>\s*!c\.isTemporary\s*\|\|\s*c\.messages\.length\s*>\s*0\)/);
  assert.doesNotMatch(loadChatBody, /conversations\s*=\s*conversations\.filter\(c\s*=>\s*c\.id\s*!==\s*previousConv\.id\)/);
});

test('Astra and folder delete flows keep linked conversation cleanup and save/render order', () => {
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const fragment02Source = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
  const deleteAstrasBody = getConstFunctionBody(fragment01Source, 'deleteAstras');
  const deleteFolderBody = getConstFunctionBody(fragment02Source, 'deleteFolder');

  assertMarkersInOrder(deleteAstrasBody, [
    'showCustomConfirm',
    'astras = astras.filter(a => a.id !== id)',
    'conversations.forEach(c => {',
    'if (c.astrasId === id) c.astrasId = null',
    'await saveAppData()',
    'runtimeRenderCoordinator.renderAll()',
    'runtimeDialogCoordinator.showNotification'
  ], 'deleteAstras replacement and cleanup');

  assertMarkersInOrder(deleteFolderBody, [
    'showCustomConfirm',
    'conversations.forEach(c => {',
    'c.folderId = null',
    'folders = folders.filter(f => f.id !== id)',
    'await saveAppData()',
    'runtimeRenderCoordinator.renderAll()',
    'showNotification'
  ], 'deleteFolder replacement and cleanup');
});

test('03 import and auth import paths keep bulk replacements, chunked pushes, and persistence order', () => {
  const fragment03Source = readSource('src/app/legacy-runtime/fragments/03-runtime.fragment.js');
  const performImportBody = getConstFunctionBody(fragment03Source, 'performImport');
  const handleImportBody = getConstFunctionBody(fragment03Source, 'handleImport');
  const processAuthImportBody = getConstFunctionBody(fragment03Source, 'processAuthImport');

  assertMarkersInOrder(performImportBody, [
    'conversations = data.conversations || []',
    'folders = data.folders || []',
    'astras = data.astras || []',
    'personalMemories = data.personalMemories || []',
    'await saveAppData()',
    'Object.assign(config, data.settings)',
    'await saveConfig()'
  ], 'performImport bulk app data replacement');

  assertMarkersInOrder(handleImportBody, [
    'conversations = []',
    'folders = []',
    'astras = []',
    'personalMemories = []',
    'await saveConfig()',
    'astras.push(ast)',
    'folders = rawData.folders',
    'personalMemories = rawData.personalMemories',
    'conversations.push(conv)',
    'await saveAppData()',
    'toggleModal(ALL_ELEMENTS.importDataModal, false)',
    'showNotification',
    'applyCustomWallpaper()',
    'applyUiTheme()',
    'applyLanguage(config.uiLanguage)',
    'const firstConv = conversations.find(c => !c.archived && !c.deletedAt)',
    'if (firstConv) loadChat(firstConv.id)',
    'else startNewChat()'
  ], 'handleImport replacement, chunk import, and UI order');

  assertMarkersInOrder(processAuthImportBody, [
    'conversations = []',
    'folders = []',
    'astras = []',
    'personalMemories = []',
    'astras.push(ast)',
    'if (rawData.folders) folders = rawData.folders',
    'if (rawData.personalMemories) personalMemories = rawData.personalMemories',
    'conversations.push(conv)',
    'await saveAppData()',
    'await saveConfig()',
    'toggleModal(ALL_ELEMENTS.importDataModalAuth, false)',
    "legacyRuntimeContext.resolveBinding('app.initChatApp')()"
  ], 'processAuthImport replacement, chunk import, and app handoff order');

  assertMarkersInOrder(fragment03Source, [
    'personalMemories = personalMemories.filter(m => m.id !== id)',
    'await saveAppData()',
    'renderPersonalMemoryList()'
  ], 'personal memory delete replacement order');
});

test('04 store and trash destructive flows keep replacement, save, render, and notification order', () => {
  const fragment04Source = readSource('src/app/legacy-runtime/fragments/04-runtime.fragment.js');
  const handleSubscriptionBody = getConstFunctionBody(fragment04Source, 'handleSubscription');
  const permanentDeleteBody = getConstFunctionBody(fragment04Source, 'handleDeleteTrashItemPermanently');
  const batchDeleteBody = getConstFunctionBody(fragment04Source, 'handleBatchDeleteFromTrash');
  const emptyTrashBody = getConstFunctionBody(fragment04Source, 'handleEmptyTrash');

  assertMarkersInOrder(handleSubscriptionBody, [
    'astras = astras.filter(a => a.officialId !== officialId)',
    'astras.unshift(newAstra)',
    'await saveAppData()',
    'renderStore()',
    'renderAstras()'
  ], 'store subscription Astra replacement and render order');

  assertMarkersInOrder(permanentDeleteBody, [
    'showCustomConfirm',
    'conversations = conversations.filter(c => c.id !== convId)',
    'await saveAppData()',
    'renderTrash()',
    'showNotification'
  ], 'trash permanent delete replacement order');

  assertMarkersInOrder(batchDeleteBody, [
    'showCustomConfirm',
    'conversations = conversations.filter(c => !selectedTrashIds.has(c.id))',
    'await saveAppData()',
    'toggleTrashSelectionMode()',
    'showNotification'
  ], 'trash batch delete replacement order');

  assertMarkersInOrder(emptyTrashBody, [
    'showCustomConfirm',
    'const count = conversations.filter(c => c.deletedAt).length',
    'conversations = conversations.filter(c => !c.deletedAt)',
    'await saveAppData()',
    'renderTrash()',
    'showNotification'
  ], 'empty trash replacement order');
});

test('app data store is only wired to 00 local replacements and runtime entry remains legacy', () => {
  const runtimeAppSource = readSource('src/app/runtime-app.js');
  const appDataPersistenceSource = readSource('src/app/runtime/kernel/app-data-persistence.js');
  const appDataNormalizationSource = readSource('src/app/runtime/kernel/app-data-normalization.js');
  const appDataStoreSource = readSource('src/app/runtime/kernel/app-data-store.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const laterFragmentSources = [
    '01-runtime.fragment.js',
    '02-runtime.fragment.js',
    '03-runtime.fragment.js',
    '04-runtime.fragment.js',
    '05-runtime.fragment.js',
    '06-runtime.fragment.js'
  ].map((name) => readSource(`src/app/legacy-runtime/fragments/${name}`));
  const mainSource = readSource('src/main.js');
  const legacyEntrySource = readSource('src/app/legacy-app.js');
  const viteSource = readSource('vite.config.js');

  assert.equal(existsSync(projectFile('src/app/runtime/kernel/app-data-store.js')), true);
  assert.match(appDataStoreSource, /export\s+function\s+createLegacyRuntimeAppDataStore/);
  assert.doesNotMatch(appDataStoreSource, /legacy-runtime\/fragments|virtual:legacy-app-runtime|currentUser|getItem|setItem|removeItem|openDB|showNotification|renderAll|toggleModal/);
  assert.match(fragment00Source, /import\s+\{\s*createLegacyRuntimeAppDataStore\s*\}\s*from\s*['"]\/src\/app\/runtime\/kernel\/app-data-store\.js['"]/);
  assert.match(fragment00Source, /const\s+runtimeAppDataStore\s*=\s*createLegacyRuntimeAppDataStore\(\)/);
  assert.match(fragment00Source, /let\s+conversations\s*=\s*runtimeAppDataStore\.getConversations\(\)/);
  assert.match(fragment00Source, /let\s+folders\s*=\s*runtimeAppDataStore\.getFolders\(\)/);
  assert.match(fragment00Source, /let\s+astras\s*=\s*runtimeAppDataStore\.getAstras\(\)/);
  assert.match(fragment00Source, /let\s+personalMemories\s*=\s*runtimeAppDataStore\.getPersonalMemories\(\)/);
  assert.equal((laterFragmentSources.join('\n').match(/runtimeAppDataStore|createLegacyRuntimeAppDataStore|app-data-store/g) || []).length, 0);
  assert.doesNotMatch(runtimeAppSource, /appDataStore|createLegacyRuntimeAppDataStore|app-data-store/);
  assert.doesNotMatch(appDataPersistenceSource, /loadAppData|getItem|removeItem|openDB|normalizeLoadedLegacyAppData/);
  assert.doesNotMatch(appDataNormalizationSource, /showNotification|renderAll|toggleModal|currentUser|getItem|setItem|removeItem|openDB/);
  assert.match(mainSource, /await\s+import\(['"]\.\/app\/legacy-app\.js['"]\)/);
  assert.match(legacyEntrySource, /import\s+['"]virtual:legacy-app-runtime['"];/);
  assert.match(viteSource, /legacyRuntimeModuleId\s*=\s*'virtual:legacy-app-runtime'/);
});
