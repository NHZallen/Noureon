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

// The workspace data the lifecycles share is the store's, reached by name on the one state object (shell-state.js).
const shellStateSource = readSource('src/app/runtime/legacy-core/shell-state.js');
const assertShellReaches = (name, getter, setter) => {
  assert.match(shellStateSource, new RegExp(`${name}:\\s*\\{\\s*get:\\s*\\(\\)\\s*=>\\s*appDataStore\\.${getter}\\(\\)${setter ? `,\\s*set:\\s*\\(next\\)\\s*=>\\s*appDataStore\\.${setter}\\(next\\)` : ''}`));
};

// loadAppData (the split workspace first, the old single item, the reset of an unreadable one) is tested in tests/workspace-load.test.js.

test('saveAppData reads the store snapshot while active conversation id uses the kernel store', () => {
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');

  assertMarkersInOrder(fragment00Source, [
    'const liveConversationsBridge = createLiveConversationsBridge({',
    'const activeConversationStore = createActiveConversationStore(null)',
    'const conversationStateAccess = createConversationStateAccess({',
    'getConversations: () => liveConversationsBridge.getConversations()',
    'getCurrentConversationId: () => activeConversationStore.getActiveConversationId()',
    'setCurrentConversationId: (id) => activeConversationStore.setActiveConversationId(id)'
  ], 'conversationStateAccess active conversation bridge');
  assert.doesNotMatch(fragment00Source, /let\s+activeConversationId\s*=/);

  assertMarkersInOrder(fragment00Source, [
    'const runtimeAppDataPersistence = createLegacyRuntimeAppDataPersistence({',
    'getCurrentUser: () => shell.currentUser',
    'getAppData: () => runtimeAppDataStore.getSnapshot()',
    'getAppDataKey',
    'setItem'
  ], 'saveAppData store snapshot getter');

  assert.match(fragment00Source, /const\s+saveAppData\s*=\s*async\s*\(options\)\s*=>\s*\{\s*await\s+runtimeAppDataPersistence\.saveAppData\(options\);\s*\}/);
  assert.doesNotMatch(fragment00Source, /getAppData:\s*\(\)\s*=>\s*\(\{\s*conversations,\s*folders,\s*astras,\s*personalMemories\s*\}\)/);
});

test('app data state is store-backed without legacy local mirrors', () => {
  const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const transitionBusSource = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');

  assertMarkersInOrder(legacyCoreSource, [
    'const runtimeAppDataStore = runtimeAppKernel.appDataStore',
    'const liveConversationsBridge = createLiveConversationsBridge({',
    'const activeConversationStore = createActiveConversationStore(null)'
  ], 'store-backed app data ownership');
  assertMarkersInOrder(legacyCoreSource, [
    'const runtimeConfigStore = runtimeAppKernel.configStore',
    'const runtimeConfigAccess = createRuntimeConfigAccess({',
    'getConfig: () => runtimeConfigStore.getConfig()'
  ], 'live config store ownership');
  assert.doesNotMatch(legacyCoreSource, /let\s+config\s*=/);
  assert.doesNotMatch(legacyCoreSource, /syncConfig\s*:/);
  assert.doesNotMatch(legacyCoreSource, /let\s+activeConversationId\s*=/);
  assert.match(legacyCoreSource, /const\s+activeConversationStore\s*=\s*createActiveConversationStore\(null\)/);

  assert.match(legacyCoreSource, /getConversations:\s*\(\)\s*=>\s*liveConversationsBridge\.getConversations\(\)/);
  assert.doesNotMatch(legacyCoreSource, /let\s+conversations\s*=/);
  assert.doesNotMatch(legacyCoreSource, /\bconversations\s*=\s*runtimeAppDataStore\.getConversations\(\)/);
  assert.doesNotMatch(legacyCoreSource, /syncLegacyMirror/);
  assert.match(shellStateSource, /conversations:\s*\{\s*get:\s*\(\)\s*=>\s*conversations\.getConversations\(\),\s*set:\s*\(next\)\s*=>\s*conversations\.replaceConversations\(next\)/);
  assert.match(legacyCoreSource, /createShellState\(\{[^}]*conversations:\s*liveConversationsBridge,\s*appDataStore:\s*runtimeAppDataStore/);
  assert.doesNotMatch(legacyCoreSource, /let\s+folders\s*=/);
  assert.doesNotMatch(legacyCoreSource, /folders\s*=\s*latestAppData\.folders/);
  assertShellReaches('folders', 'getFolders', 'replaceFolders');
  assert.doesNotMatch(legacyCoreSource, /let\s+astras\s*=/);
  assert.doesNotMatch(legacyCoreSource, /astras\s*=\s*latestAppData\.astras/);
  assertShellReaches('astras', 'getAstras', 'replaceAstras');
  assertShellReaches('personalMemories', 'getPersonalMemories', 'replacePersonalMemories');

  assert.doesNotMatch(legacyCoreSource, /let\s+personalMemories\s*=/);
  assert.doesNotMatch(legacyCoreSource, /personalMemories\s*=\s*latestAppData\.personalMemories/);
  assert.match(
    transitionBusSource,
    /replacePersonalMemories:\s*\(nextPersonalMemories\)\s*=>\s*\{\s*state\.personalMemories\s*=\s*runtimeAppDataStore\.replacePersonalMemories\(nextPersonalMemories\)/
  );
  assert.match(legacyCoreSource, /getFolders:\s*\(\)\s*=>\s*runtimeAppDataStore\.getFolders\(\)/);
  assert.match(legacyCoreSource, /replaceFolders:\s*\(nextFolders\)\s*=>\s*runtimeAppDataStore\.replaceFolders\(nextFolders\)/);
  assert.match(legacyCoreSource, /replaceAstras:\s*\(nextAstras\)\s*=>\s*runtimeAppDataStore\.replaceAstras\(nextAstras\)/);
});

test('all legacy-core app data mirrors remain retired', () => {
  const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const modelMemoryDashboardSource = readSource('src/app/runtime/legacy-core/model-memory-dashboard-lifecycle.js');
  const transitionBusSource = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  const folderLifecycleSource = readSource('src/app/runtime/features/folder-lifecycle.js');
  const sidebarChatAstraRenderSource = readSource('src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js');

  assert.match(modelMemoryDashboardSource, /replacePersonalMemories/);
  assert.match(transitionBusSource, /replacePersonalMemories:\s*\(nextPersonalMemories\)/);
  assertShellReaches('personalMemories', 'getPersonalMemories', 'replacePersonalMemories');
  assert.doesNotMatch(legacyCoreSource, /let\s+personalMemories\s*=/);

  assert.doesNotMatch(legacyCoreSource, /let\s+config\s*=/);
  assert.match(legacyCoreSource, /getConfig:\s*\(\)\s*=>\s*runtimeConfigStore\.getConfig\(\)/);

  assert.match(sidebarChatAstraRenderSource, /replaceAstras/);
  assert.match(folderLifecycleSource, /replaceFolders/);
  assert.doesNotMatch(legacyCoreSource, /let\s+astras\s*=/);
  assertShellReaches('astras', 'getAstras', 'replaceAstras');
  assert.doesNotMatch(legacyCoreSource, /let\s+folders\s*=/);
  assertShellReaches('folders', 'getFolders', 'replaceFolders');

  assert.doesNotMatch(legacyCoreSource, /let\s+conversations\s*=/);
  // New, deleted and archived conversations: tests/conversation-actions.test.js.

  // All legacy-core app data mirrors are retired; runtimeAppDataStore and its
  // live access facades own the active pointers.
  assert.doesNotMatch(legacyCoreSource, /createConversationStore|createConversationsStore/);
});

// startNewChat and loadChat (dropping empty and ephemeral conversations through the live bridge) are tested in
// tests/conversation-actions.test.js.

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
    'runtimeRenderCoordinator.renderSidebar()',
    'runtimeDialogCoordinator.showNotification'
  ], 'deleteAstras replacement and cleanup');

  assertMarkersInOrder(deleteFolderBody, [
    'showCustomConfirm',
    'getConversations().forEach(conversation => {',
    'conversation.folderId = null',
    'replaceFolders(folders.filter(item => item.id !== id))',
    'await saveAppData()',
    'renderSidebar()',
    'showNotification'
  ], 'deleteFolder replacement and cleanup');

  assert.doesNotMatch(deleteAstrasBody, /astras\s*=\s*astras\.filter\(/);
  assert.match(
    fragment01Source,
    /replaceAstras:\s*\(nextAstras\)\s*=>\s*runtimeAppDataStore\.replaceAstras\(nextAstras\)/
  );
  assert.match(
    fragment02Source,
    /replaceFolders:\s*\(nextFolders\)\s*=>\s*runtimeAppDataStore\.replaceFolders\(nextFolders\)/
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
  const handleSubscriptionBody = getConstFunctionBody(readSource('src/app/runtime/features/astra-store-lifecycle.js'), 'handleSubscription');
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
    'const conversation = getConversations().find(item => item.id === conversationId)',
    'confirmCloudDeletion([conversationId], conversation ? [conversation] : [])',
    'replaceConversations(',
    'getConversations().filter(conversation => conversation.id !== conversationId)',
    'await saveAppData()',
    'renderSidebar()',
    'renderTrash()',
    'showNotification'
  ], 'trash permanent delete replacement order');

  assertMarkersInOrder(batchDeleteBody, [
    'const count = selectedTrashIds.size',
    'showCustomConfirm',
    'const selectedSnapshots = getConversations().filter(conversation => selectedTrashIds.has(conversation?.id))',
    'confirmCloudDeletion(ids, selectedSnapshots)',
    'replaceConversations(',
    'getConversations().filter(conversation => !selectedTrashIds.has(conversation.id))',
    'await saveAppData()',
    'renderSidebar()',
    'toggleTrashSelectionMode()',
    'showNotification'
  ], 'trash batch delete replacement order');

  assertMarkersInOrder(emptyTrashBody, [
    'showCustomConfirm',
    'const conversations = getConversations()',
    'const count = conversations.filter(conversation => conversation.deletedAt).length',
    'const trashSnapshots = conversations.filter(conversation => conversation.deletedAt)',
    'confirmCloudDeletion(ids, trashSnapshots)',
    'replaceConversations(',
    'conversations.filter(conversation => !conversation.deletedAt)',
    'await saveAppData()',
    'renderSidebar()',
    'renderTrash()',
    'showNotification'
  ], 'empty trash replacement order');

  assert.match(
    coreTailSource,
    /replaceConversations:\s*\(nextConversations\)\s*=>\s*\{\s*state\.conversations\s*=\s*nextConversations;\s*return\s+state\.conversations;\s*\}/
  );
  assert.doesNotMatch(coreTailSource, /runtimeAppDataStore\.replaceConversations\(/);
  assert.match(fragment03Source, /set\s+conversations\(next\)\s*\{\s*state\.conversations\s*=\s*next;\s*\}/);
});

test('cloud permanent delete uses the active shadow sync instead of username prefixes', () => {
  const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const cloudDeleteSource = readSource('src/app/runtime/legacy-core/cloud-delete-lifecycle.js');

  assert.match(legacyCoreSource, /import\(['"]\/src\/app\/runtime\/legacy-core\/cloud-delete-lifecycle\.js['"]\)/);
  assert.match(legacyCoreSource, /createCloudDeletionLifecycle\(/);
  assert.match(legacyCoreSource, /getCurrentUser:\s*\(\)\s*=>\s*shell\.currentUser/);
  assert.match(legacyCoreSource, /getConversations:\s*\(\)\s*=>\s*runtimeAppDataStore\.getConversations\(\)/);
  assert.match(legacyCoreSource, /getService\(SERVICES\.cloudSync\)/);
  assert.match(cloudDeleteSource, /getCurrentUser\?\.\(\)\?\.authProvider\s*===\s*['"]supabase['"]/);
  assert.match(cloudDeleteSource, /Cloud conversation sync is not ready yet/);
  assert.match(cloudDeleteSource, /Cloud conversation sync is disabled/);
  assert.match(cloudDeleteSource, /sync\.getStatus\?\.\(\)/);
  assert.match(cloudDeleteSource, /options\.requireSnapshots/);
  assert.match(cloudDeleteSource, /syncMethod:\s*['"]permanentlyDeleteConversations['"]/);
  assert.match(cloudDeleteSource, /payload\.requireSnapshots\s*=\s*Boolean\(options\.requireSnapshots\)/);
  assert.match(cloudDeleteSource, /await\s+sync\[syncMethod\]\(ids,\s*payload\)/);
  assert.doesNotMatch(cloudDeleteSource, /currentUser\?\.username/);
  assert.doesNotMatch(cloudDeleteSource, /startsWith\(['"]supabase:/);
});

test('local conversation saves preserve the shadow debounce boundary', () => {
  const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const observerSource = readSource('src/app/runtime/kernel/cloud-conversation-save-observer.js');

  assert.match(legacyCoreSource, /cloud-conversation-save-observer\.js/);
  assert.match(legacyCoreSource, /onSaved:\s*notifyCloudConversationSave/);
  assert.match(observerSource, /sync\?\.captureWorkspace\?\.\(snapshot,\s*metadata\s*\|\|\s*undefined\)/);
  assert.match(observerSource, /metadata\?\.immediate\s*!==\s*true/);
  assert.match(observerSource, /Promise\.resolve\(sync\.flush\(\)\)\.catch/);
  assert.match(observerSource, /return captured/);
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
  assert.doesNotMatch(fragment00Source, /let\s+conversations\s*=/);
  assert.doesNotMatch(fragment00Source, /let\s+folders\s*=/);
  assertShellReaches('folders', 'getFolders', 'replaceFolders');
  assert.doesNotMatch(fragment00Source, /let\s+astras\s*=/);
  assertShellReaches('astras', 'getAstras', 'replaceAstras');
  assert.doesNotMatch(fragment00Source, /let\s+personalMemories\s*=/);
  assertShellReaches('personalMemories', 'getPersonalMemories', 'replacePersonalMemories');
  assert.match(sidebarChatAstraRenderSource, /setAstras\(replaceAstras\(\s*getAstras\(\)\.filter\(a\s*=>\s*a\.id\s*!==\s*id\)\s*\)\)/);
  assert.match(
    fragment01Source,
    /replaceAstras:\s*\(nextAstras\)\s*=>\s*runtimeAppDataStore\.replaceAstras\(nextAstras\)/
  );
  assert.match(folderLifecycleSource, /replaceFolders\(folders\.filter\(item\s*=>\s*item\.id\s*!==\s*id\)\)/);
  assert.match(
    fragment02Source,
    /replaceFolders:\s*\(nextFolders\)\s*=>\s*runtimeAppDataStore\.replaceFolders\(nextFolders\)/
  );
  assert.match(
    fragment03Source,
    /replacePersonalMemories:\s*\(nextPersonalMemories\)\s*=>\s*\{\s*state\.personalMemories\s*=\s*runtimeAppDataStore\.replacePersonalMemories\(nextPersonalMemories\);\s*return\s+state\.personalMemories;\s*\}/
  );
  assert.match(modelMemoryDashboardSource, /personalMemories\s*=\s*replacePersonalMemories\(\s*personalMemories\.filter\(m\s*=>\s*m\.id\s*!==\s*id\)\s*\)/);
  assert.match(readSource('src/app/runtime/features/astra-store-lifecycle.js'), /state\.astras\s*=\s*runtimeAppDataStore\.replaceAstras\(\s*state\.astras\.filter\(a\s*=>\s*a\.officialId\s*!==\s*officialId\)\s*\)/);
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
