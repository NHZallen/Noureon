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
  assert.match(fragment01Source, /renderIncrementalResponse\(contentDiv,\s*fullResponse,/);
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
  assert.match(fragment01Source, /await\s+singleModelResponseLifecycle\.completeView\(\{/);
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
  assert.match(fragment01Source, /conv\.messages\.push\(finalAiMessage\)/);
  assert.match(fragment01Source, /await\s+saveAppData\(\)/);
  assert.match(fragment01Source, /sendConversationToMail\(userMessageObject,\s*fullResponse\)/);
  assert.match(fragment01Source, /contentDiv\.innerHTML\s*=\s*renderSingleModelError\(/);
  assert.match(fragment01Source, /await\s+extractPersonalMemory\(userMessage,\s*fullResponse\)/);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/features/single-model-response-lifecycle.js')).size < 150 * 1024);
  assert.ok(statSync(projectFile('src/app/legacy-runtime/fragments/01-runtime.fragment.js')).size < 135 * 1024);
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
  assert.match(fragment01Source, /conv\.messages\.push\(finalAiMessage\)/);
  assert.match(fragment01Source, /await\s+saveAppData\(\)/);
  assert.match(fragment01Source, /contentDiv\.innerHTML\s*=\s*renderSingleModelError\(/);
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
