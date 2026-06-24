import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
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
  const openIndex = source.indexOf('{', match.index);
  const closeIndex = findMatchingBrace(source, openIndex);
  assert.notEqual(closeIndex, -1, `Expected to close ${name}`);
  return source.slice(match.index, closeIndex + 1);
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
  const handleRestoreTrashItemBody = getConstFunctionBody(fragment04Source, 'handleRestoreTrashItem');

  assert.match(coordinatorSource, /export\s+function\s+createRuntimeDialogCoordinator/);
  assert.match(fragment00Source, /import\s+\{\s*createRuntimeDialogCoordinator\s*\}/);
  assert.equal((fragment00Source.match(/createRuntimeDialogCoordinator\(\{/g) || []).length, 1);
  assert.match(fragment00Source, /const\s+runtimeDialogCoordinator\s*=\s*createRuntimeDialogCoordinator\(\{/);
  assert.match(fragment00Source, /showNotification:\s*\(\.\.\.args\)\s*=>\s*showNotification\(\.\.\.args\)/);
  assert.match(fragment00Source, /const\s+showNotification\s*=\s*\(message,\s*type\s*=\s*'success'\)\s*=>\s*\{/);
  assert.match(fragment00Source, /const\s+toggleModal\s*=\s*\(modalElement,\s*show\)\s*=>\s*\{/);
  assert.match(fragment00Source, /const\s+showCustomConfirm\s*=\s*\(message,\s*title\s*=\s*'請確認'\)\s*=>\s*showCustomDialog\(/);
  assert.match(fragment00Source, /const\s+showCustomPrompt\s*=\s*\(message,\s*title\s*=\s*'請輸入',\s*inputType\s*=\s*'text'\)\s*=>\s*showCustomDialog\(/);

  for (const body of [deleteChatBody, deactivateAstrasBody, deleteAstrasBody, handleBatchArchiveBody, handleRestoreTrashItemBody]) {
    assert.match(body, /runtimeDialogCoordinator\.showNotification\(/);
    assert.doesNotMatch(body, /(^|[^\w.])showNotification\(/);
  }

  assert.match(deleteChatBody, /else\s*\{\s*runtimeRenderCoordinator\.renderAll\(\);\s*\}\s*runtimeDialogCoordinator\.showNotification\(i18n\[config\.uiLanguage\]\.chatMovedToTrash\s*\|\|\s*'[^']*',\s*'success'\);/);
  assert.match(deactivateAstrasBody, /runtimeRenderCoordinator\.renderAll\(\);\s*legacyRuntimeContext\.resolveBinding\('input\.updateInputState'\)\(\);\s*runtimeDialogCoordinator\.showNotification\(/);
  assert.match(deleteAstrasBody, /runtimeRenderCoordinator\.renderAll\(\);\s*runtimeDialogCoordinator\.showNotification\(/);
  assert.match(handleBatchArchiveBody, /await\s+saveAppData\(\);\s*toggleSelectionMode\(\);\s*runtimeDialogCoordinator\.showNotification\(/);
  assert.match(handleRestoreTrashItemBody, /await\s+saveAppData\(\);\s*renderTrash\(\);\s*runtimeDialogCoordinator\.showNotification\(/);
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
