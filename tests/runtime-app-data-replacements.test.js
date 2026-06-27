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

const getFunctionDeclarationBody = (source, name) => {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`).exec(source);
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
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
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

test('saveAppData reads the store snapshot while active conversation id uses the kernel store', () => {
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');

  assertMarkersInOrder(fragment00Source, [
    'const activeConversationStore = createActiveConversationStore(null)',
    'const conversationStateAccess = createConversationStateAccess({',
    'getConversations: () => conversations',
    'getCurrentConversationId: () => activeConversationStore.getActiveConversationId()',
    'setCurrentConversationId: (id) => activeConversationStore.setActiveConversationId(id)'
  ], 'conversationStateAccess active conversation bridge');
  assert.doesNotMatch(fragment00Source, /let\s+activeConversationId\s*=/);

  assertMarkersInOrder(fragment00Source, [
    'const runtimeAppDataPersistence = createLegacyRuntimeAppDataPersistence({',
    'getCurrentUser: () => currentUser',
    'getAppData: () => runtimeAppDataStore.getSnapshot()',
    'getAppDataKey',
    'setItem'
  ], 'saveAppData store snapshot getter');

  assert.match(fragment00Source, /const\s+saveAppData\s*=\s*async\s*\(\)\s*=>\s*\{\s*await\s+runtimeAppDataPersistence\.saveAppData\(\);\s*\}/);
  assert.doesNotMatch(fragment00Source, /getAppData:\s*\(\)\s*=>\s*\(\{\s*conversations,\s*folders,\s*astras,\s*personalMemories\s*\}\)/);
});

test('local mirrors remain temporary compatibility state before decomposition', () => {
  const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const transitionBusSource = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');

  assertMarkersInOrder(legacyCoreSource, [
    'const runtimeAppDataStore = runtimeAppKernel.appDataStore',
    'let conversations = runtimeAppDataStore.getConversations()',
    'let folders = runtimeAppDataStore.getFolders()',
    'let astras = runtimeAppDataStore.getAstras()',
    'let personalMemories = runtimeAppDataStore.getPersonalMemories()',
    'const activeConversationStore = createActiveConversationStore(null)'
  ], 'temporary app data mirror ownership');
  assertMarkersInOrder(legacyCoreSource, [
    'const runtimeConfigStore = runtimeAppKernel.configStore',
    'let config = runtimeConfigStore.getConfig()',
    'const runtimeConfigAccess = createRuntimeConfigAccess({',
    'getConfig: () => runtimeConfigStore.getConfig()'
  ], 'temporary config mirror ownership');
  assert.doesNotMatch(legacyCoreSource, /let\s+activeConversationId\s*=/);
  assert.match(legacyCoreSource, /const\s+activeConversationStore\s*=\s*createActiveConversationStore\(null\)/);

  assert.match(legacyCoreSource, /getConversations:\s*\(\)\s*=>\s*conversations/);
  assert.match(legacyCoreSource, /get folders\(\)\s*\{\s*return folders;\s*\}/);
  assert.match(legacyCoreSource, /get astras\(\)\s*\{\s*return astras;\s*\}/);
  assert.match(legacyCoreSource, /get personalMemories\(\)\s*\{\s*return personalMemories;\s*\}/);
  assert.match(legacyCoreSource, /get config\(\)\s*\{\s*return config;\s*\}/);

  assert.match(legacyCoreSource, /personalMemories\s*=\s*latestAppData\.personalMemories/);
  assert.match(
    transitionBusSource,
    /replacePersonalMemories:\s*\(nextPersonalMemories\)\s*=>\s*\{\s*state\.personalMemories\s*=\s*runtimeAppDataStore\.replacePersonalMemories\(nextPersonalMemories\)/
  );
  assert.match(legacyCoreSource, /config\s*=\s*runtimeConfigStore\.replaceConfig\(normalizedConfig\)/);
  assert.match(legacyCoreSource, /conversations\s*=\s*runtimeAppDataStore\.replaceConversations\(/);
  assert.match(legacyCoreSource, /folders\s*=\s*runtimeAppDataStore\.replaceFolders\(nextFolders\)/);
  assert.match(legacyCoreSource, /astras\s*=\s*runtimeAppDataStore\.replaceAstras\(nextAstras\)/);
});

test('mirror decomposition order is locked before the first extraction slice', () => {
  const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const modelMemoryDashboardSource = readSource('src/app/runtime/legacy-core/model-memory-dashboard-lifecycle.js');
  const transitionBusSource = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const folderLifecycleSource = readSource('src/app/runtime/features/folder-lifecycle.js');
  const sidebarChatAstraRenderSource = readSource('src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js');

  assert.match(modelMemoryDashboardSource, /replacePersonalMemories/);
  assert.match(transitionBusSource, /replacePersonalMemories:\s*\(nextPersonalMemories\)/);
  assert.match(legacyCoreSource, /get personalMemories\(\)\s*\{\s*return personalMemories;\s*\}/);

  assert.match(legacyCoreSource, /let\s+config\s*=\s*runtimeConfigStore\.getConfig\(\)/);
  assert.match(legacyCoreSource, /config\s*=\s*runtimeConfigStore\.replaceConfig\(normalizedConfig\)/);

  assert.match(sidebarChatAstraRenderSource, /replaceAstras/);
  assert.match(folderLifecycleSource, /replaceFolders/);
  assert.match(legacyCoreSource, /let\s+astras\s*=\s*runtimeAppDataStore\.getAstras\(\)/);
  assert.match(legacyCoreSource, /let\s+folders\s*=\s*runtimeAppDataStore\.getFolders\(\)/);

  assert.match(legacyCoreSource, /let\s+conversations\s*=\s*runtimeAppDataStore\.getConversations\(\)/);
  assert.match(legacyCoreSource, /conversations\.unshift\(newConv\)/);
  assert.match(legacyCoreSource, /conv\.deletedAt\s*=\s*new Date\(\)\.toISOString\(\)/);
  assert.match(legacyCoreSource, /if\(conv\)\s*conv\.archived\s*=\s*true/);
  assert.match(legacyCoreSource, /if\(conv\)\s*conv\.archived\s*=\s*false/);

  // Future mirror removal order: personalMemories first, config second,
  // astras/folders after their linked cleanup paths, conversations last.
  assert.doesNotMatch(legacyCoreSource, /createConversationStore|createConversationsStore/);
});

test('00 transient conversation replacements preserve legacy ordering', () => {
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
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
  const fragment01Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment02Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const sidebarChatAstraRenderSource = readSource('src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js');
  const folderLifecycleSource = readSource('src/app/runtime/features/folder-lifecycle.js');
  const deleteAstrasBody = getConstFunctionBody(sidebarChatAstraRenderSource, 'deleteAstras');
  const deleteFolderBody = getConstFunctionBody(folderLifecycleSource, 'deleteFolder');

  assertMarkersInOrder(deleteAstrasBody, [
    'showCustomConfirm',
    'setAstras(replaceAstras(',
    'getAstras().filter(a => a.id !== id)',
    'getConversations().forEach(c => {',
    'if (c.astrasId === id) c.astrasId = null',
    'await saveAppData()',
    'runtimeRenderCoordinator.renderAll()',
    'runtimeDialogCoordinator.showNotification'
  ], 'deleteAstras replacement and cleanup');

  assertMarkersInOrder(deleteFolderBody, [
    'showCustomConfirm',
    'getConversations().forEach(conversation => {',
    'conversation.folderId = null',
    'replaceFolders(folders.filter(item => item.id !== id))',
    'await saveAppData()',
    'renderAll()',
    'showNotification'
  ], 'deleteFolder replacement and cleanup');

  assert.doesNotMatch(deleteAstrasBody, /astras\s*=\s*astras\.filter\(/);
  assert.match(
    fragment01Source,
    /replaceAstras:\s*\(nextAstras\)\s*=>\s*\{\s*astras\s*=\s*runtimeAppDataStore\.replaceAstras\(nextAstras\);\s*return\s+astras;\s*\}/
  );
  assert.match(
    fragment02Source,
    /replaceFolders:\s*\(nextFolders\)\s*=>\s*\{\s*folders\s*=\s*runtimeAppDataStore\.replaceFolders\(nextFolders\);\s*return\s+folders;\s*\}/
  );
  assert.doesNotMatch(fragment02Source, /const\s+deleteFolder\s*=\s*async/);
});

test('03 import and auth import paths keep bulk replacements, chunked pushes, and persistence order', () => {
  const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const modelMemoryDashboardSource = readSource('src/app/runtime/legacy-core/model-memory-dashboard-lifecycle.js');
  const importExportSource = readSource('src/app/runtime/features/import-export-lifecycle.js');
  const authImportSource = readSource('src/app/runtime/features/auth-import-lifecycle.js');
  const performImportBody = getFunctionDeclarationBody(importExportSource, 'performImport');
  const handleImportBody = getFunctionDeclarationBody(importExportSource, 'handleImport');
  const processAuthImportBody = getFunctionDeclarationBody(authImportSource, 'processAuthImport');

  assertMarkersInOrder(performImportBody, [
    'replaceAllAppData({',
    'conversations: data.conversations || []',
    'folders: data.folders || []',
    'astras: data.astras || []',
    'personalMemories: data.personalMemories || []',
    'await saveAppData()',
    'applySettings(data.settings)',
    'await saveConfig()'
  ], 'performImport bulk app data replacement');

  assertMarkersInOrder(handleImportBody, [
    'const activeAppData = replaceAllAppData({',
    'conversations: []',
    'folders: []',
    'astras: []',
    'personalMemories: []',
    'await saveConfig()',
    'activeAppData.astras.push(astra)',
    'activeAppData.folders = replaceFolders(rawData.folders)',
    'activeAppData.personalMemories = replacePersonalMemories(rawData.personalMemories)',
    'activeAppData.conversations.push(conversation)',
    'await saveAppData()',
    'toggleModal(elements.importDataModal, false)',
    'showNotification',
    'applyCustomWallpaper()',
    'applyUiTheme()',
    'applyLanguage(getConfig().uiLanguage)',
    'const firstConversation = getConversations().find((conversation) => !conversation.archived && !conversation.deletedAt)',
    'if (firstConversation) loadChat(firstConversation.id)',
    'else startNewChat()'
  ], 'handleImport replacement, chunk import, and UI order');

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
    'initChatApp()'
  ], 'processAuthImport replacement, chunk import, and app handoff order');

  assertMarkersInOrder(modelMemoryDashboardSource, [
    'personalMemories = replacePersonalMemories(',
    'personalMemories.filter(m => m.id !== id)',
    'await saveAppData()',
    'renderPersonalMemoryList()'
  ], 'personal memory delete replacement order');
  assert.match(
    fragment03Source,
    /replacePersonalMemories:\s*\(nextPersonalMemories\)\s*=>\s*\{\s*state\.personalMemories\s*=\s*runtimeAppDataStore\.replacePersonalMemories\(nextPersonalMemories\);\s*return\s+state\.personalMemories;\s*\}/
  );
  assert.doesNotMatch(modelMemoryDashboardSource, /personalMemories\s*=\s*personalMemories\.filter\(m\s*=>\s*m\.id\s*!==\s*id\)/);
});

test('04 store and trash destructive flows keep replacement, save, render, and notification order', () => {
  const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const coreTailSource = readSource('src/app/runtime/legacy-core/core-tail-lifecycle.js');
  const trashLifecycleSource = readSource('src/app/runtime/features/trash-lifecycle.js');
  const handleSubscriptionBody = getConstFunctionBody(coreTailSource, 'handleSubscription');
  const permanentDeleteBody = getConstFunctionBody(trashLifecycleSource, 'handleDeleteTrashItemPermanently');
  const batchDeleteBody = getConstFunctionBody(trashLifecycleSource, 'handleBatchDeleteFromTrash');
  const emptyTrashBody = getConstFunctionBody(trashLifecycleSource, 'handleEmptyTrash');

  assertMarkersInOrder(handleSubscriptionBody, [
    'state.astras = runtimeAppDataStore.replaceAstras(',
    'state.astras.filter(a => a.officialId !== officialId)',
    "showNotification(i18n[state.config.uiLanguage].unsubscribed",
    'state.astras.unshift(newAstra)',
    "showNotification(i18n[state.config.uiLanguage].subscribed",
    'await saveAppData()',
    'renderStore()',
    'renderAstras()'
  ], 'store subscription Astra replacement and render order');
  assert.doesNotMatch(handleSubscriptionBody, /state\.astras\s*=\s*state\.astras\.filter\(a\s*=>\s*a\.officialId\s*!==\s*officialId\)/);

  assertMarkersInOrder(permanentDeleteBody, [
    'showCustomConfirm',
    'replaceConversations(',
    'getConversations().filter(conversation => conversation.id !== conversationId)',
    'await saveAppData()',
    'renderTrash()',
    'showNotification'
  ], 'trash permanent delete replacement order');

  assertMarkersInOrder(batchDeleteBody, [
    'const count = selectedTrashIds.size',
    'showCustomConfirm',
    'replaceConversations(',
    'getConversations().filter(conversation => !selectedTrashIds.has(conversation.id))',
    'await saveAppData()',
    'toggleTrashSelectionMode()',
    'showNotification'
  ], 'trash batch delete replacement order');

  assertMarkersInOrder(emptyTrashBody, [
    'showCustomConfirm',
    'const conversations = getConversations()',
    'const count = conversations.filter(conversation => conversation.deletedAt).length',
    'replaceConversations(',
    'conversations.filter(conversation => !conversation.deletedAt)',
    'await saveAppData()',
    'renderTrash()',
    'showNotification'
  ], 'empty trash replacement order');

  assert.match(
    coreTailSource,
    /replaceConversations:\s*\(nextConversations\)\s*=>\s*\{\s*state\.conversations\s*=\s*runtimeAppDataStore\.replaceConversations\(nextConversations\);\s*return\s+state\.conversations;\s*\}/
  );
  assert.match(fragment03Source, /set\s+conversations\(next\)\s*\{\s*state\.conversations\s*=\s*next;\s*\}/);
});

test('app data store remains wired while production boot moves through runtime entry', () => {
  const runtimeAppSource = readSource('src/app/runtime-app.js');
  const appDataPersistenceSource = readSource('src/app/runtime/kernel/app-data-persistence.js');
  const appDataNormalizationSource = readSource('src/app/runtime/kernel/app-data-normalization.js');
  const appDataStoreSource = readSource('src/app/runtime/kernel/app-data-store.js');
  const folderLifecycleSource = readSource('src/app/runtime/features/folder-lifecycle.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment01Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment02Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const sidebarChatAstraRenderSource = readSource('src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js');
  const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const modelMemoryDashboardSource = readSource('src/app/runtime/legacy-core/model-memory-dashboard-lifecycle.js');
  const coreTailSource = readSource('src/app/runtime/legacy-core/core-tail-lifecycle.js');
  const runtimeEntrySource = readSource('src/app/runtime-entry.js');
  const mainSource = readSource('src/main.js');
  const legacyEntrySource = readSource('src/app/legacy-app.js');
  const viteSource = readSource('vite.config.js');

  assert.equal(existsSync(projectFile('src/app/runtime/kernel/app-data-store.js')), true);
  assert.match(appDataStoreSource, /export\s+function\s+createLegacyRuntimeAppDataStore/);
  assert.doesNotMatch(appDataStoreSource, /legacy-runtime\/fragments|virtual:legacy-app-runtime|currentUser|getItem|setItem|removeItem|openDB|showNotification|renderAll|toggleModal/);
  assert.match(fragment00Source, /import\s+\{\s*createRuntimeAppKernel\s*\}\s*from\s*['"]\/src\/app\/runtime-app\.js['"]/);
  assert.match(fragment00Source, /const\s+runtimeAppDataStore\s*=\s*runtimeAppKernel\.appDataStore/);
  assert.match(fragment00Source, /let\s+conversations\s*=\s*runtimeAppDataStore\.getConversations\(\)/);
  assert.match(fragment00Source, /let\s+folders\s*=\s*runtimeAppDataStore\.getFolders\(\)/);
  assert.match(fragment00Source, /let\s+astras\s*=\s*runtimeAppDataStore\.getAstras\(\)/);
  assert.match(fragment00Source, /let\s+personalMemories\s*=\s*runtimeAppDataStore\.getPersonalMemories\(\)/);
  assert.match(sidebarChatAstraRenderSource, /setAstras\(replaceAstras\(\s*getAstras\(\)\.filter\(a\s*=>\s*a\.id\s*!==\s*id\)\s*\)\)/);
  assert.match(
    fragment01Source,
    /replaceAstras:\s*\(nextAstras\)\s*=>\s*\{\s*astras\s*=\s*runtimeAppDataStore\.replaceAstras\(nextAstras\);\s*return\s+astras;\s*\}/
  );
  assert.match(folderLifecycleSource, /replaceFolders\(folders\.filter\(item\s*=>\s*item\.id\s*!==\s*id\)\)/);
  assert.match(
    fragment02Source,
    /folders\s*=\s*runtimeAppDataStore\.replaceFolders\(nextFolders\)/
  );
  assert.match(
    fragment03Source,
    /replacePersonalMemories:\s*\(nextPersonalMemories\)\s*=>\s*\{\s*state\.personalMemories\s*=\s*runtimeAppDataStore\.replacePersonalMemories\(nextPersonalMemories\);\s*return\s+state\.personalMemories;\s*\}/
  );
  assert.match(modelMemoryDashboardSource, /personalMemories\s*=\s*replacePersonalMemories\(\s*personalMemories\.filter\(m\s*=>\s*m\.id\s*!==\s*id\)\s*\)/);
  assert.match(coreTailSource, /state\.astras\s*=\s*runtimeAppDataStore\.replaceAstras\(\s*state\.astras\.filter\(a\s*=>\s*a\.officialId\s*!==\s*officialId\)\s*\)/);
  assert.match(fragment03Source, /set\s+astras\(next\)\s*\{\s*state\.astras\s*=\s*next;\s*\}/);
  assert.doesNotMatch(fragment01Source, /from\s+['"][^'"]*app-data-store\.js['"]/);
  assert.doesNotMatch(fragment02Source, /from\s+['"][^'"]*app-data-store\.js['"]/);
  assert.doesNotMatch(fragment03Source, /from\s+['"][^'"]*app-data-store\.js['"]/);
  assert.doesNotMatch(coreTailSource, /from\s+['"][^'"]*app-data-store\.js['"]/);
  assert.doesNotMatch(runtimeEntrySource, /runtimeAppDataStore|createLegacyRuntimeAppDataStore|app-data-store/);
  assert.match(runtimeAppSource, /import\s+\{\s*createLegacyRuntimeAppDataStore\s*\}/);
  assert.match(runtimeAppSource, /const\s+appDataStore\s*=\s*createLegacyRuntimeAppDataStore\(\)/);
  assert.doesNotMatch(appDataPersistenceSource, /loadAppData|getItem|removeItem|openDB|normalizeLoadedLegacyAppData/);
  assert.doesNotMatch(appDataNormalizationSource, /showNotification|renderAll|toggleModal|currentUser|getItem|setItem|removeItem|openDB/);
  assert.match(mainSource, /await\s+import\(['"]\.\/app\/legacy-app\.js['"]\)/);
  assert.match(
    legacyEntrySource,
    /import\s+\{\s*startRuntimeEntry\s*\}\s+from\s+['"]\.\/runtime-entry\.js['"]/
  );
  assert.doesNotMatch(legacyEntrySource, /virtual:legacy-app-runtime/);
  assert.doesNotMatch(viteSource, /legacyRuntimeModuleId|virtual:legacy-app-runtime|legacyRuntimeFragmentsPlugin/);
});
