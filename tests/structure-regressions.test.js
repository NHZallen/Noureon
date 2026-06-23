import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

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
  assert.match(fragmentSource, /appendStepPlanAttachmentContentBase\(content,\s*inlineData,\s*modelInfo,\s*\{\s*modelSupportsVision\s*\}\)/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/02-runtime.fragment.js')).size < 150 * 1024);
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
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const fragment02Source = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
  const fragment04Source = readSource('src/app/legacy-runtime/fragments/04-runtime.fragment.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/date-formatting.js'));

  assert.equal(typeof helpers.formatFullTimestamp, 'function');
  assert.match(helperSource, /export\s+const\s+formatFullTimestamp\b/);
  assert.match(
    fragment00Source,
    /import\s*\{[\s\S]*\bformatFullTimestamp\b[\s\S]*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/date-formatting\.js';/
  );
  assert.doesNotMatch(fragment00Source, /\bconst\s+formatFullTimestamp\s*=/);
  assert.match(fragment01Source, /formatFullTimestamp\(msg\.createdAt\)/);
  assert.match(fragment02Source, /formatFullTimestamp\(aiMessageObject\.createdAt\)/);
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
  assert.match(fragment01Source, /normalizeCouncilComparisonDetails\(finalizedText\)/);
  assert.match(fragment01Source, /hasUnclosedCouncilDetails\(renderText\)/);
  assert.doesNotMatch(fragment01Source, /\bconst\s+getOpenCouncilDetailKeys\s*=/);
  assert.doesNotMatch(fragment01Source, /\bconst\s+restoreOpenCouncilDetails\s*=/);
  assert.doesNotMatch(fragment01Source, /\bconst\s+isCouncilComparisonSummary\s*=/);
  assert.doesNotMatch(fragment01Source, /\bconst\s+normalizeCouncilComparisonDetails\s*=/);
  assert.doesNotMatch(fragment01Source, /\bconst\s+hasUnclosedCouncilDetails\s*=/);
  assert.match(fragment01Source, /const\s+createStreamingMarkdownRenderer\s*=/);
  assert.match(fragment01Source, /async\s+function\s+streamMarkdownResponse\b/);
  assert.match(fragment01Source, /targetElement\.innerHTML\s*=/);
  assert.match(fragment01Source, /renderMarkdownWithFormulas\(/);
  assert.match(fragment01Source, /requestAnimationFrame\(/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/01-runtime.fragment.js')).size < 150 * 1024);
});

test('streaming markdown render state helper is isolated from the 01 runtime renderer', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/streaming-markdown-render-state.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/streaming-markdown-render-state.js'));

  assert.equal(typeof helpers.createStreamingMarkdownRenderState, 'function');
  assert.match(helperSource, /export\s+function\s+createStreamingMarkdownRenderState\b/);
  assert.match(
    fragment00Source,
    /import\s*\{[\s\S]*\bcreateStreamingMarkdownRenderState\b[\s\S]*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/streaming-markdown-render-state\.js';/
  );
  assert.match(fragment01Source, /const\s+renderState\s*=\s*createStreamingMarkdownRenderState\(\);/);
  assert.match(fragment01Source, /renderState\.appendText\(chunk\)/);
  assert.match(fragment01Source, /renderState\.flushPending\(\{\s*force\s*\}\)/);
  assert.match(fragment01Source, /renderState\.syncCurrentLine\(\)/);
  assert.match(fragment01Source, /renderState\.finalize\(\)/);
  assert.match(fragment01Source, /renderState\.getText\(\)/);
  assert.doesNotMatch(
    fragment01Source,
    /let\s+fullText\s*=\s*'';\s*let\s+finalizedText\s*=\s*'';\s*let\s+pendingText\s*=\s*'';\s*let\s+currentLineText\s*=\s*'';\s*let\s+isFinalized\s*=\s*false;/s
  );
  assert.match(fragment01Source, /document\.createElement\('div'\)/);
  assert.match(fragment01Source, /targetElement\.innerHTML\s*=\s*''/);
  assert.match(fragment01Source, /currentLineNode\.innerHTML\s*=\s*''/);
  assert.match(fragment01Source, /renderMarkdownWithFormulas\(/);
  assert.match(fragment01Source, /renderMarkdown\(/);
  assert.match(fragment01Source, /targetElement\.classList\.add\('is-streaming-response'\)/);
  assert.match(fragment01Source, /isChatNearBottom\(\)/);
  assert.match(fragment01Source, /keepChatPositionAfterRender\(shouldStick,\s*previousTop\)/);
  assert.match(fragment01Source, /requestAnimationFrame\(/);
  assert.match(fragment01Source, /createTypewriterPlaybackController\(\{/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/01-runtime.fragment.js')).size < 150 * 1024);
});

test('streaming text frame queue helper is isolated from the 01 runtime stream response', async () => {
  const helperSource = readSource('src/app/legacy-runtime/features/streaming-text-frame-queue.js');
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment01Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const helpers = await import(projectFile('src/app/legacy-runtime/features/streaming-text-frame-queue.js'));
  const streamResponseSource = fragment01Source.slice(
    fragment01Source.indexOf('async function streamMarkdownResponse'),
    fragment01Source.indexOf('const playbackStreamingMarkdownResponse')
  );

  assert.equal(typeof helpers.createStreamingTextFrameQueue, 'function');
  assert.match(helperSource, /export\s+function\s+createStreamingTextFrameQueue\b/);
  assert.match(
    fragment00Source,
    /import\s*\{[\s\S]*\bcreateStreamingTextFrameQueue\b[\s\S]*\}\s*from\s+'\/src\/app\/legacy-runtime\/features\/streaming-text-frame-queue\.js';/
  );
  assert.match(fragment01Source, /const\s+frameQueue\s*=\s*createStreamingTextFrameQueue\(\{/);
  assert.match(fragment01Source, /drainText:\s*\(chunkToRender\)\s*=>\s*ensureRenderer\(\)\.appendText\(chunkToRender\)/);
  assert.match(fragment01Source, /onFirstChunk:\s*\(\)\s*=>\s*options\.onFirstChunk\?\.\(\)/);
  assert.match(fragment01Source, /scheduleFrame:\s*\(callback\)\s*=>\s*requestAnimationFrame\(callback\)/);
  assert.match(fragment01Source, /waitForFrame:\s*\(\)\s*=>\s*new Promise\(resolve\s*=>\s*setTimeout\(resolve,\s*16\)\)/);
  assert.match(fragment01Source, /frameQueue\.enqueue\(chunk\)/);
  assert.match(fragment01Source, /await\s+frameQueue\.flushUntilIdle\(\)/);
  assert.doesNotMatch(streamResponseSource, /\blet\s+textQueue\s*=/);
  assert.doesNotMatch(streamResponseSource, /\blet\s+isFrameRequested\s*=/);
  assert.doesNotMatch(streamResponseSource, /\blet\s+hasReceivedFirstChunk\s*=/);
  assert.doesNotMatch(streamResponseSource, /\bconst\s+renderFrame\s*=/);
  assert.match(fragment01Source, /await\s+streamApiCallFn\(onChunkReceived\)/);
  assert.match(fragment01Source, /targetElement\.innerHTML\s*=\s*options\.placeholderHTML/);
  assert.match(fragment01Source, /targetElement\.innerHTML\s*=\s*renderMarkdown\(/);
  assert.match(fragment01Source, /renderer\.finish\(\{\s*renderFormulas:\s*true\s*\}\)/);
  assert.match(fragment01Source, /async\s+function\s+streamMarkdownResponse\b/);
  assert.match(fragment01Source, /const\s+createStreamingMarkdownRenderer\s*=/);
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
  assert.match(fragment01Source, /const\s+createStreamingMarkdownRenderer\s*=/);
  assert.match(fragment01Source, /targetElement\.innerHTML\s*=/);
  assert.match(fragment01Source, /renderMarkdownWithFormulas\(/);
  assert.match(fragment01Source, /isCouncilDeferredSectionVisible\(currentText\)/);
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
