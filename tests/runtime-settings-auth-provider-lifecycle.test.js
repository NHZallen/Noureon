import assert from 'node:assert/strict';
import test from 'node:test';

import { createLegacySettingsAuthProviderLifecycle } from '../src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js';
import { readSource, getConstFunctionBody, assertMarkersInOrder, createDependencies } from './helpers/settings-lifecycle-harness.js';
import { readUiSource } from './helpers/source-guards.js';

test('factory exports createLegacySettingsAuthProviderLifecycle', () => {
  assert.equal(typeof createLegacySettingsAuthProviderLifecycle, 'function');
});

test('import is inert and module avoids fragments and virtual runtime', () => {
  const source = readUiSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');

  assert.match(source, /export\s+function\s+createLegacySettingsAuthProviderLifecycle/);
  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/);
});

test('structured provider helpers are composed through injected key access', () => {
  const source = readUiSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');

  assert.match(source, /import\s+\{\s*createSettingsProviderStructuredHelpers\s*\}\s+from\s+['"]\.\/settings-provider-structured-helpers\.js['"]/);
  assert.match(source, /const\s+structuredHelpers\s*=\s*createSettingsProviderStructuredHelpers\(\{/);
  assert.match(source, /getApiKeyForProvider,/);
  assert.match(source, /readErrorBody,/);
  assert.match(source, /cheapModelId:\s*CHEAP_MODEL_ID/);
  assert.match(source, /const\s*\{\s*\n\s*callApiWithSchema\s*\n\s*\}\s*=\s*structuredHelpers/);
});

test('history menu helper is composed while preserving lifecycle alias', () => {
  const source = readUiSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');

  // It loads the first time a menu is opened.
  assert.doesNotMatch(source, /import\s+\{\s*createSettingsHistoryMenuHelper\s*\}\s+from/);
  assert.match(source, /const\s+historyMenuHelper\s*=\s*createLazyFunctions\(\(\)\s*=>\s*import\('\.\/settings-history-menu-helper\.js'\)\.then\(\(\{\s*createSettingsHistoryMenuHelper\s*\}\)\s*=>\s*createSettingsHistoryMenuHelper\(\{/);
  assert.match(source, /getConversations:\s*\(\)\s*=>\s*conversations/);
  assert.match(source, /getFolders:\s*\(\)\s*=>\s*folders/);
  assert.match(source, /showRenameModal,/);
  assert.match(source, /moveConversationToFolder,/);
  assert.match(source, /createHistoryMenu\s*\n?\s*\}\s*=\s*historyMenuHelper/);
  assert.doesNotMatch(source, /const\s+createHistoryMenu\s*=\s*\(convId,\s*targetButton\)\s*=>\s*\{/);
});

test('API key controls are composed through the extracted helper', () => {
  const source = readUiSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');

  assert.match(source, /import\s+\{\s*createSettingsApiKeyControls\s*\}\s+from\s+['"]\.\/settings-api-key-controls\.js['"]/);
  assert.match(source, /const\s+apiKeyControls\s*=\s*createSettingsApiKeyControls\(\{/);
  assert.match(source, /elements:\s*ALL_ELEMENTS/);
  assert.match(source, /getApiKeyForProvider,/);
  assert.match(source, /setApiKeyForProvider,/);
  assert.match(source, /clearSensitiveApiKeys,/);
  assert.match(source, /prepareApiKeyInputsForSettings,\s*\n\s*persistApiKeyInputIntents/);
  assert.doesNotMatch(source, /const\s+getApiKeyInputDescriptors\s*=/);
  assert.doesNotMatch(source, /const\s+createApiKeyClearButton\s*=/);
});

test('output and translator controls are composed through the extracted helper', () => {
  const source = readUiSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const controlsSource = readSource('src/app/runtime/legacy-core/settings-output-translator-controls.js');

  assert.match(
    source,
    /import\s+\{\s*createSettingsOutputTranslatorControls\s*\}\s+from\s+['"]\.\/settings-output-translator-controls\.js['"]/
  );
  assert.match(source, /const\s+outputTranslatorControls\s*=\s*createSettingsOutputTranslatorControls\(\{/);
  assert.match(source, /elements:\s*ALL_ELEMENTS/);
  assert.match(source, /getCouncilTranslatorCandidates,/);
  assert.match(source, /getSingleTranslatorCandidates,/);
  assert.match(source, /ensureCouncilTranslatorSettingsControls\(\);/);
  assert.match(source, /renderTranslatorModelPickers\(\);/);
  assert.doesNotMatch(source, /const\s+renderTranslatorModelPicker\s*=/);
  assert.doesNotMatch(source, /const\s+renderTranslatorModelPickers\s*=/);
  // There is no output mode to choose: replies are always shown as they are written.
  assert.doesNotMatch(source, /OutputModeSettingsControls/);
  assert.doesNotMatch(controlsSource, /OutputModeSettingsControls/);
  assert.doesNotMatch(source, /const\s+ensureCouncilTranslatorSettingsControls\s*=/);
  assert.match(controlsSource, /export\s+function\s+createSettingsOutputTranslatorControls/);
  assert.match(controlsSource, /const\s+renderTranslatorModelPicker\s*=/);
  assert.match(controlsSource, /const\s+renderTranslatorModelPickers\s*=/);
  assert.match(controlsSource, /const\s+ensureCouncilTranslatorSettingsControls\s*=/);
});

test('theme and bubble controls are composed through the extracted helper', () => {
  const source = readUiSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const controlsSource = readSource('src/app/runtime/legacy-core/settings-theme-bubble-controls.js');

  assert.match(
    source,
    /import\s+\{\s*createSettingsThemeBubbleControls\s*\}\s+from\s+['"]\.\/settings-theme-bubble-controls\.js['"]/
  );
  assert.match(source, /const\s+themeBubbleControls\s*=\s*createSettingsThemeBubbleControls\(\{/);
  assert.doesNotMatch(source, /USER_BUBBLE_COLORS|setUserBubbleColor|renderUserBubbleColorDropdown/, 'the colour of a bubble is no longer a setting');
  assert.doesNotMatch(source, /const\s+setTheme\s*=\s*async/);
  assert.doesNotMatch(source, /const\s+updateThemeButtons\s*=\s*\(\)\s*=>/);
  assert.match(controlsSource, /export\s+function\s+createSettingsThemeBubbleControls/);
  assert.match(controlsSource, /const\s+setTheme\s*=\s*async/);
  assert.match(controlsSource, /const\s+updateThemeButtons\s*=/);
});

test('mobile settings shell is composed through the extracted helper', () => {
  const source = readUiSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const helperSource = readSource('src/app/runtime/legacy-core/settings-mobile-shell-helper.js');

  assert.match(
    source,
    /import\s+\{\s*createSettingsMobileShellHelper\s*\}\s+from\s+['"]\.\/settings-mobile-shell-helper\.js['"]/
  );
  assert.match(source, /const\s+mobileShellHelper\s*=\s*createSettingsMobileShellHelper\(\{/);
  assert.match(source, /elements:\s*ALL_ELEMENTS/);
  assert.match(source, /handleLogout:\s*\(\.\.\.args\)\s*=>\s*handleLogout\(\.\.\.args\)/);
  assert.match(source, /ensureSettingsMobileShell,\s*\n\s*renderSettingsMobileList,\s*\n\s*clearSettingsMobileViewTransition,/);
  assert.match(source, /showSettingsMobileList,\s*\n\s*openSettingsMobileSection,\s*\n\s*isMobileSettingsViewport/);
  assert.doesNotMatch(source, /const\s+renderSettingsMobileList\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(source, /const\s+ensureSettingsMobileShell\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(source, /const\s+showSettingsMobileList\s*=\s*\(\{\s*animate\s*=\s*true\s*\}\s*=\s*\{\}\)\s*=>/);
  assert.doesNotMatch(source, /const\s+openSettingsMobileSection\s*=\s*\(sectionName\)\s*=>/);
  assert.match(helperSource, /export\s+function\s+createSettingsMobileShellHelper/);
  assert.match(helperSource, /const\s+renderSettingsMobileList\s*=/);
  assert.match(helperSource, /const\s+ensureSettingsMobileShell\s*=/);
  assert.match(helperSource, /const\s+showSettingsMobileList\s*=/);
  assert.match(helperSource, /const\s+openSettingsMobileSection\s*=/);
});

test('desktop settings section navigation is composed through the extracted helper', () => {
  const source = readUiSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const helperSource = readSource('src/app/runtime/legacy-core/settings-desktop-section-helper.js');

  assert.match(
    source,
    /import\s+\{\s*createSettingsDesktopSectionHelper\s*\}\s+from\s+['"]\.\/settings-desktop-section-helper\.js['"]/
  );
  assert.match(source, /const\s+desktopSectionHelper\s*=\s*createSettingsDesktopSectionHelper\(\{/);
  assert.match(source, /isMobileSettingsViewport,/);
  assert.match(source, /showSettingsMobileList,/);
  assert.match(source, /clearSettingsMobileViewTransition/);
  assert.match(source, /const\s+navItems\s*=\s*bindDesktopSettingsSections\(\);/);
  assert.match(source, /activateDefaultDesktopSettingsSection\(navItems\);\s*syncSettingsSectionForViewport\(navItems\);/);
  assert.match(source, /syncSettingsSectionForViewport\(navItems\);/);
  assert.match(source, /const\s+ensureUserSettingsNavigationShell\s*=\s*\(\)\s*=>/);
  assert.match(source, /ensureSettingsMobileShell\(\);\s*ensureUserSettingsNavigationShell\(\);\s*ensureAutoWebSearchSettingsControl\(\);/);
  assert.doesNotMatch(source, /item\.dataset\.settingsDesktopBound\s*=\s*'true'/);
  assert.doesNotMatch(source, /item\.addEventListener\('click',\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(source, /const\s+activeNavItem\s*=\s*ALL_ELEMENTS\.settingsNav\.querySelector/);
  assert.match(helperSource, /export\s+function\s+createSettingsDesktopSectionHelper/);
  assert.match(helperSource, /const\s+bindDesktopSettingsSections\s*=/);
  assert.match(helperSource, /const\s+syncSettingsSectionForViewport\s*=/);
  assert.match(helperSource, /settingsDesktopBound/);
});

test('factory validates required dependencies', () => {
  assert.throws(
    () => createLegacySettingsAuthProviderLifecycle(),
    /missing dependencies:/
  );
});

test('factory exposes settings auth provider lifecycle API', () => {
  const { dependencies } = createDependencies();
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  for (const name of [
    'streamApiCall',
    'runModelCouncil',
    'callApiWithSchema',
    'generateTitleAndSummary',
    'updateSubmitButtonState',
    'updateInputState',
    'setupSettingsModal',
    'saveSettings',
    'handleLogin',
    'handleLogout',
    'handleDeleteAllData',
    'setTheme',
    'updateThemeButtons',
    'createHistoryMenu'
  ]) {
    assert.equal(typeof lifecycle[name], 'function', `${name} should be exposed`);
  }
  // How a model is asked is loaded on demand (model-request-engine.js): the lifecycle hands on async functions only.
  for (const name of ['streamApiCall', 'runMemoryModel', 'buildSingleModelTranslatedRequestParts', 'fetchTavilySearchPacket',
    'streamCouncilApiCallWithRetry', 'runModelCouncil', 'callApiWithSchema', 'generateTitleAndSummary', 'prepareModelRequests']) {
    assert.equal(typeof lifecycle[name], 'function', `${name} should be exposed`);
  }
  assert.equal(lifecycle.providerRequestSupport, undefined);
  assert.equal(lifecycle.councilResponseLifecycle, undefined);
});

test('callApiWithSchema sends Gemini key through header instead of URL query', async () => {
  const requests = [];
  const { dependencies } = createDependencies({
    getApiKeyForProvider: (provider) => provider === 'gemini' ? 'gemini-secret-key' : '',
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          candidates: [
            { content: { parts: [{ text: '{"ok":true}' }] } }
          ]
        })
      };
  }
});

  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  const result = await lifecycle.callApiWithSchema('Return JSON', {
    type: 'OBJECT',
    properties: { ok: { type: 'BOOLEAN' } }
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/cheap:generateContent$/);
  assert.equal(requests[0].url.includes('?key='), false);
  assert.equal(requests[0].url.includes('gemini-secret-key'), false);
  assert.deepEqual(requests[0].options.headers, {
    'Content-Type': 'application/json',
    'x-goog-api-key': 'gemini-secret-key'
  });
});

test('settings config proxy reads and mutates the latest state config pointer', async () => {
  const { dependencies, calls, state } = createDependencies({
    document: {
      body: { classList: { contains: () => false } },
      documentElement: {
        classList: { toggle() {} },
        style: { setProperty() {} }
      },
      createElement: () => ({ value: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, contains() { return false; } } }),
      getElementById: () => ({ value: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, contains() { return false; } } }),
      querySelector: () => null,
      querySelectorAll: () => []
    }
  });
  dependencies.elements.settingsModal.classList.contains = (name) => name === 'hidden';
  const staleConfig = state.config;
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);
  const replacement = {
    ...staleConfig,
    tavilySearchDepth: 'advanced',
    theme: 'dark'
  };

  state.config = replacement;

  assert.equal(lifecycle.getTavilySearchDepth(), 'advanced');
  await lifecycle.setTheme('light');
  assert.equal('theme' in replacement, false);
  assert.equal(staleConfig.theme, 'dark');
  assert.equal(calls.includes('saveConfig'), true);
});

test('settings lifecycle leaves auto-search classification out of the Gemini helper boundary', () => {
  const { dependencies } = createDependencies();
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  assert.equal('shouldPerformWebSearch' in lifecycle, false);
});

test('generateTitleAndSummary keeps conversation side effects in lifecycle', async () => {
  const requests = [];
  const conversation = {
    id: 'conv-1',
    title: 'Old title',
    isNaming: true,
    messages: [
      { role: 'user', parts: [{ text: 'What is the capital of France?' }] },
      { role: 'model', parts: [{ text: 'Paris.' }] }
    ]
  };
  const { dependencies, calls } = createDependencies({
    getApiKeyForProvider: (provider) => provider === 'gemini' ? 'gemini-secret-key' : '',
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          candidates: [
            { content: { parts: [{ text: '{"title":"France"}' }] } }
          ]
        })
      };
    },
    conversationStateAccess: { getCurrentConversationId: () => 'conv-1' }
  });
  dependencies.elements.headerTitle.textContent = '';
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  await lifecycle.generateTitleAndSummary(conversation);

  assert.equal(conversation.title, 'France');
  assert.equal('summary' in conversation, false);
  assert.equal(conversation.isNaming, false);
  assert.equal(dependencies.elements.headerTitle.textContent, 'France');
  assert.deepEqual(calls.filter((call) => call === 'saveAppData' || call === 'renderHistorySidebar'), [
    'saveAppData',
    'renderHistorySidebar'
  ]);
  assert.equal(requests[0].url.includes('?key='), false);
  assert.equal(requests[0].options.headers['x-goog-api-key'], 'gemini-secret-key');
});

test('source keeps settings save ownership and composes auth actions helper', () => {
  const source = readUiSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const authActionsHelperSource = readSource('src/app/runtime/legacy-core/settings-auth-actions-helper.js');
  const apiKeyControlsSource = readSource('src/app/runtime/legacy-core/settings-api-key-controls.js');
  const saveSettingsHelperSource = readSource('src/app/runtime/legacy-core/settings-save-settings-helper.js');
  const handleLoginBody = getConstFunctionBody(authActionsHelperSource, 'handleLogin');
  const handleLogoutBody = getConstFunctionBody(authActionsHelperSource, 'handleLogout');
  const handleDeleteAllDataBody = getConstFunctionBody(authActionsHelperSource, 'handleDeleteAllData');

  assert.match(source, /const\s+saveSettings\s*=\s*async\s*\(\{\s*close\s*=\s*true,\s*notify\s*=\s*true\s*\}\s*=\s*\{\}\)\s*=>\s*\{/);
  assert.match(source, /import\s+\{\s*createSettingsAuthActionsHelper\s*\}\s+from\s+['"]\.\/settings-auth-actions-helper\.js['"]/);
  assert.match(source, /const\s+authActionsHelper\s*=\s*createSettingsAuthActionsHelper\(\{/);
  assert.match(source, /loadConfig,/);
  assert.match(source, /loadAppData,/);
  assert.match(source, /handleLogin,\s*\n\s*handleLogout,\s*\n\s*handleDeleteAllData\s*\n?\}\s*=\s*authActionsHelper/);
  assert.doesNotMatch(source, /const\s+handleLogin\s*=\s*async\s*\(e\)\s*=>\s*\{/);
  assert.doesNotMatch(source, /const\s+handleLogout\s*=\s*async\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(source, /const\s+handleDeleteAllData\s*=\s*async\s*\(\)\s*=>\s*\{/);
  assert.match(authActionsHelperSource, /await\s+runtimeStorageAdapter\.clear\(\)/);
  assert.match(source, /collectSettingsSaveFormValues\(\{/);
  assert.doesNotMatch(source, /config\.uiLanguage\s*=\s*ALL_ELEMENTS\.uiLanguageSelect\.value/);
  assert.match(source, /await\s+persistApiKeyInputIntents\(\)/);
  assert.match(apiKeyControlsSource, /await\s+saveSensitiveConfig\(\)/);
  assert.doesNotMatch(saveSettingsHelperSource, /saveConfig|persistApiKeyInputIntents|saveSensitiveConfig|showNotification|toggleModal/);
  assert.doesNotMatch(saveSettingsHelperSource, /sensitive-config-store|api-key-input-intent/);
  assert.doesNotMatch(saveSettingsHelperSource, /handleLogin|handleLogout|handleDeleteAllData|authContainer|appContainer|chat_lastUser|runtimeStorageAdapter\.clear|window\.location\.reload|initChatApp/);
  assert.doesNotMatch(source, /config\.apiKeys\.gemini\s*=/);
  assert.match(authActionsHelperSource, /\binitChatApp\(\);/);
  assertMarkersInOrder(handleLoginBody, [
    'await setItem(\'chat_lastUser\', username);',
    'await loadConfig();',
    'await loadAppData();',
    'applyUiTheme();',
    'elements.authContainer.classList.remove(\'visible\');',
    'elements.authContainer.classList.add(\'fade-out\');',
    'elements.appContainer.classList.remove(\'hidden\');',
    'requestAnimationFrame(() =>',
    'elements.authContainer.addEventListener(\'transitionend\'',
    'initChatApp();'
  ], 'handleLogin success transition and init handoff');
  assertMarkersInOrder(handleLogoutBody, [
    'await showCustomConfirm',
    'await removeItem(\'chat_lastUser\');',
    'window.location.reload();'
  ], 'handleLogout confirm clear reload path');
  assertMarkersInOrder(handleDeleteAllDataBody, [
    'const confirmation = await showCustomDialog',
    'if (confirmation === \'DELETE\')',
    'await runtimeStorageAdapter.clear();',
    'showNotification',
    'setTimeout(() =>',
    'window.location.reload();'
  ], 'handleDeleteAllData clear notify reload path');
});

test('source composes updateInputState through the extracted helper', () => {
  const source = readUiSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');

  assert.match(source, /import\s+\{\s*createSettingsUpdateInputStateHelper\s*\}\s+from\s+['"]\.\/settings-update-input-state-helper\.js['"]/);
  assert.match(source, /const\s+updateInputStateHelper\s*=\s*createSettingsUpdateInputStateHelper\(\{/);
  assert.match(source, /updateInputState\s*\n?\}\s*=\s*updateInputStateHelper/);
  assert.doesNotMatch(source, /const\s+updateInputState\s*=\s*\(\)\s*=>\s*\{/);
  assertMarkersInOrder(source, [
    'createSettingsUpdateInputStateHelper({',
    'elements: ALL_ELEMENTS',
    'getConfig: () => config',
    'getUploadedFiles: () => uploadedFiles',
    'getActiveConversation',
    'normalizeConversationModel',
    'getApiKeyForProvider',
    'conversationNeedsTavilySearch',
    'getCouncilValidation',
    'isCouncilEnabled',
    'const updateSubmitButtonState = (isGenerating) =>'
  ], 'updateInputState helper composition');
});
