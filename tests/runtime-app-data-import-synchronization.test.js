import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
      } else if (char === '/' && next === '*') {
        state = 'block-comment';
        index += 1;
      } else if (char === '"') {
        state = 'double-quote';
      } else if (char === "'") {
        state = 'single-quote';
      } else if (char === '`') {
        state = 'template';
      } else if (char === '{') {
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
    const next = marker instanceof RegExp
      ? (() => {
          const match = marker.exec(source.slice(cursor + 1));
          return match ? cursor + 1 + match.index : -1;
        })()
      : source.indexOf(marker, cursor + 1);
    assert.notEqual(next, -1, `${context} should contain ${marker}`);
    assert.ok(next > cursor, `${marker} should remain in legacy order for ${context}`);
    cursor = next;
  }
};

const fragment03Source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
const importExportSource = readSource('src/app/runtime/features/import-export-lifecycle.js');
const authImportSource = readSource('src/app/runtime/features/auth-import-lifecycle.js');
const performImportBody = getFunctionDeclarationBody(importExportSource, 'performImport');
const handleImportBody = getFunctionDeclarationBody(importExportSource, 'handleImport');
const processAuthImportBody = getFunctionDeclarationBody(authImportSource, 'processAuthImport');

test('performImport keeps four-group replacement before app and config persistence', () => {
  assertMarkersInOrder(performImportBody, [
    'if (!getCurrentUser())',
    'replaceAllAppData({',
    'conversations: data.conversations || []',
    'folders: data.folders || []',
    'astras: data.astras || []',
    'personalMemories: data.personalMemories || []',
    'await saveAppData()',
    'applySettings(data.settings)',
    'mergeApiKeys(await resolveImportedApiKeys(data))',
    'await saveConfig()'
  ], 'performImport persistence boundary');
});

test('handleImport keeps validation before clear and chunk mutations on active lexical arrays', () => {
  assertMarkersInOrder(handleImportBody, [
    'const backupUsername = getBackupUsername(rawData)',
    'await showCustomConfirm',
    'updateProgress(30',
    'const activeAppData = replaceAllAppData({',
    'conversations: []',
    'folders: []',
    'astras: []',
    'personalMemories: []',
    'await saveConfig()',
    'await processInChunks(astrasToImport',
    'activeAppData.astras.push(astra)',
    'activeAppData.folders = replaceFolders(rawData.folders)',
    'activeAppData.personalMemories = replacePersonalMemories(rawData.personalMemories)',
    'await processInChunks(conversationsToImport',
    'activeAppData.conversations.push(conversation)',
    'updateProgress(90',
    'await saveAppData()',
    'updateProgress(100',
    'toggleModal(elements.importDataModal, false)',
    "showNotification(text('importSuccess'",
    'applyCustomWallpaper()',
    'applyUiTheme()',
    'applyLanguage(getConfig().uiLanguage)',
    'if (firstConversation) loadChat(firstConversation.id)',
    'else startNewChat()'
  ], 'handleImport mutation and UI handoff');
});

test('handleImport preserves partial-state behavior without rollback', () => {
  assertMarkersInOrder(handleImportBody, [
    /catch \(error\) \{\r?\n\s+logger\.warn\('Noura/,
    'activeAppData.astras.push(astra)',
    /catch \(error\) \{\r?\n\s+logger\.warn\('/,
    'activeAppData.conversations.push(conversation)'
  ], 'handleImport recoverable transform failures');

  const outerCatch = handleImportBody.slice(handleImportBody.lastIndexOf('catch (error)'));
  assert.doesNotMatch(outerCatch, /(?:conversations|folders|astras|personalMemories)\s*=\s*\[\]/);
  assert.doesNotMatch(outerCatch, /runtimeAppDataStore\.(?:replaceAll|replaceConversations|replaceFolders|replaceAstras|replacePersonalMemories)/);
  assertMarkersInOrder(outerCatch, [
    'catch (error)',
    'showNotification',
    'updateProgress(0',
    'finally',
    'confirmImportBtn.disabled = false'
  ], 'handleImport failure and UI reset');
});

test('processAuthImport keeps user persistence before app data mutation and persistence', () => {
  assertMarkersInOrder(processAuthImportBody, [
    'const backupUsername = getBackupUsername(rawData)',
    'const userKey = getUserKey(username)',
    'const nextUser = await createPasswordRecord(username, password)',
    'const persistedUser = setCurrentUser(nextUser)',
    'await setItem(userKey, JSON.stringify(persistedUser))',
    "await setItem('chat_lastUser', username)",
    'updateProgress(30',
    'const activeAppData = replaceAllAppData({',
    'conversations: []',
    'folders: []',
    'astras: []',
    'personalMemories: []',
    'await processInChunks(astrasToImport',
    'activeAppData.astras.push(astra)',
    'activeAppData.folders = replaceFolders(rawData.folders)',
    'activeAppData.personalMemories = replacePersonalMemories(rawData.personalMemories)',
    'await processInChunks(conversationsToImport',
    'activeAppData.conversations.push(conversation)',
    'await saveAppData()',
    'Object.assign(config, rawData.settings)',
    'await saveConfig()',
    'toggleModal(elements.importDataModalAuth, false)',
    "elements.authContainer.addEventListener('transitionend'",
    'scheduleTimeout(hideAuthContainer, 500)',
    'initChatApp()',
    "showNotification(text('importSuccess'"
  ], 'processAuthImport auth, mutation, persistence, and app handoff');
});

test('processAuthImport preserves partial-state behavior without rollback', () => {
  assertMarkersInOrder(processAuthImportBody, [
    /catch \(error\) \{\r?\n\s+logger\.warn\('Noura/,
    'activeAppData.astras.push(astra)',
    /catch \(error\) \{\r?\n\s+logger\.warn\('Attachment/,
    'activeAppData.conversations.push(conversation)'
  ], 'processAuthImport recoverable transform failures');

  const outerCatch = processAuthImportBody.slice(processAuthImportBody.lastIndexOf('catch (error)'));
  assert.doesNotMatch(outerCatch, /(?:conversations|folders|astras|personalMemories)\s*=\s*\[\]/);
  assert.doesNotMatch(outerCatch, /(?:replaceAllAppData|replaceFolders|replacePersonalMemories)\(/);
  assertMarkersInOrder(outerCatch, [
    'catch (error)',
    'logger.error(error)',
    'showNotification',
    'updateProgress(0',
    'finally',
    'confirmImportBtnAuth.disabled = false'
  ], 'processAuthImport failure and UI reset');
});

test('selected import flows use pointer replacement without adding store append or synchronization API', () => {
  const storeSource = readSource('src/app/runtime/kernel/app-data-store.js');
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const runtimeAppSource = readSource('src/app/runtime-app.js');

  assert.match(performImportBody, /replaceAllAppData\(/);
  assert.match(handleImportBody, /replaceAllAppData\(/);
  assert.match(processAuthImportBody, /replaceAllAppData\(/);
  for (const body of [performImportBody, handleImportBody, processAuthImportBody]) {
    assert.doesNotMatch(body, /appendConversations|appendAstras|syncFromLexical/);
  }
  assert.doesNotMatch(storeSource, /appendConversations|appendAstras|syncFromLexical/);
  assert.match(fragment00Source, /getAppData:\s*\(\)\s*=>\s*runtimeAppDataStore\.getSnapshot\(\)/);
  assert.match(runtimeAppSource, /createLegacyRuntimeAppDataStore/);
  assert.match(runtimeAppSource, /const\s+appDataStore\s*=\s*createLegacyRuntimeAppDataStore\(\)/);
  assert.doesNotMatch(
    runtimeAppSource,
    /createLegacyRuntime(?:AppData|Config)Persistence|getItem|setItem|removeItem|openDB|currentUser|addEventListener|bootstrap|initializeApp|initChatApp/
  );
});
