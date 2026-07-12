import assert from 'node:assert/strict';
import test from 'node:test';
import { assertFileExists, readSource } from '../helpers/source-guards.js';

const settingsHelperModules = [
  {
    path: 'src/app/runtime/legacy-core/settings-provider-structured-helpers.js',
    factory: 'createSettingsProviderStructuredHelpers',
    blockedRuntimeGlobals: /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app|document\.|window\./
  },
  {
    path: 'src/app/runtime/legacy-core/settings-title-summary-helpers.js',
    factory: 'createSettingsTitleSummaryHelpers',
    blockedRuntimeGlobals: /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app|document\.|window\./
  },
  {
    path: 'src/app/runtime/legacy-core/settings-history-menu-helper.js',
    factory: 'createSettingsHistoryMenuHelper',
    blockedRuntimeGlobals: /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js/
  },
  {
    path: 'src/app/runtime/legacy-core/settings-api-key-controls.js',
    factory: 'createSettingsApiKeyControls',
    blockedRuntimeGlobals: /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js/
  },
  {
    path: 'src/app/runtime/legacy-core/settings-output-translator-controls.js',
    factory: 'createSettingsOutputTranslatorControls',
    blockedRuntimeGlobals: /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js/
  },
  {
    path: 'src/app/runtime/legacy-core/settings-theme-bubble-controls.js',
    factory: 'createSettingsThemeBubbleControls',
    blockedRuntimeGlobals: /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js/
  },
  {
    path: 'src/app/runtime/legacy-core/settings-mobile-shell-helper.js',
    factory: 'createSettingsMobileShellHelper',
    blockedRuntimeGlobals: /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js/
  },
  {
    path: 'src/app/runtime/legacy-core/settings-desktop-section-helper.js',
    factory: 'createSettingsDesktopSectionHelper',
    blockedRuntimeGlobals: /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js/
  },
  {
    path: 'src/app/runtime/legacy-core/settings-auth-actions-helper.js',
    factory: 'createSettingsAuthActionsHelper',
    blockedRuntimeGlobals: /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js|bootstrap|sidebar/
  },
  {
    path: 'src/app/runtime/legacy-core/settings-update-input-state-helper.js',
    factory: 'createSettingsUpdateInputStateHelper',
    blockedRuntimeGlobals: /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js|bootstrap|sidebar/
  }
];

const settingsCollectorHelpers = [
  {
    path: 'src/app/runtime/legacy-core/settings-save-settings-helper.js',
    exportName: 'collectSettingsSaveFormValues',
    blockedRuntimeGlobals: /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js/
  }
];

test('settings helper modules exist and keep their exported factories', () => {
  for (const helper of settingsHelperModules) {
    const source = readSource(helper.path);
    assertFileExists(assert, helper.path);
    assert.match(source, new RegExp(`export\\s+function\\s+${helper.factory}`));
    assert.doesNotMatch(source, helper.blockedRuntimeGlobals);
  }
});

test('settings collector helper modules exist and avoid runtime side effects', () => {
  for (const helper of settingsCollectorHelpers) {
    const source = readSource(helper.path);
    assertFileExists(assert, helper.path);
    assert.match(source, new RegExp(`export\\s+function\\s+${helper.exportName}`));
    assert.doesNotMatch(source, helper.blockedRuntimeGlobals);
    assert.doesNotMatch(source, /saveConfig|persistApiKeyInputIntents|saveSensitiveConfig|showNotification|toggleModal|applyUiTheme|applyLanguage|render[A-Z]/);
    assert.doesNotMatch(source, /sensitive-config-store|api-key-input-intent/);
  }
});

test('settings auth provider lifecycle composes every extracted settings helper', () => {
  const lifecycleSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');

  assert.match(lifecycleSource, /export\s+function\s+createLegacySettingsAuthProviderLifecycle/);
  assert.doesNotMatch(lifecycleSource, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/);

  for (const helper of settingsHelperModules) {
    const moduleName = helper.path.replace('src/app/runtime/legacy-core/', './');
    const localName = helper.factory
      .replace(/^createSettings/, '')
      .replace(/^ProviderStructuredHelpers$/, 'structuredHelpers')
      .replace(/^TitleSummaryHelpers$/, 'titleSummaryHelpers')
      .replace(/^HistoryMenuHelper$/, 'historyMenuHelper')
      .replace(/^ApiKeyControls$/, 'apiKeyControls')
      .replace(/^OutputTranslatorControls$/, 'outputTranslatorControls')
      .replace(/^ThemeBubbleControls$/, 'themeBubbleControls')
      .replace(/^MobileShellHelper$/, 'mobileShellHelper')
      .replace(/^DesktopSectionHelper$/, 'desktopSectionHelper')
      .replace(/^AuthActionsHelper$/, 'authActionsHelper')
      .replace(/^UpdateInputStateHelper$/, 'updateInputStateHelper');

    assert.match(
      lifecycleSource,
      new RegExp(`import\\s+\\{\\s*${helper.factory}\\s*\\}\\s+from\\s+['"]${moduleName.replace('.', '\\.')}['"]`)
    );
    assert.match(
      lifecycleSource,
      new RegExp(`const\\s+${localName}\\s*=\\s*${helper.factory}\\(\\{`)
    );
  }

  assert.match(
    lifecycleSource,
    /import\s+\{\s*collectSettingsSaveFormValues\s*\}\s+from\s+['"]\.\/settings-save-settings-helper\.js['"]/
  );
  assert.match(lifecycleSource, /const\s+collectedSettings\s*=\s*collectSettingsSaveFormValues\(\{/);
});

test('settings structured provider and title summary helpers remain delegated from the lifecycle', () => {
  const lifecycleSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');

  assert.match(lifecycleSource, /getApiKeyForProvider,/);
  assert.match(lifecycleSource, /readErrorBody,/);
  assert.match(lifecycleSource, /cheapModelId:\s*CHEAP_MODEL_ID/);
  assert.match(lifecycleSource, /callApiWithSchema\s*\n?\s*\}\);/);
  assert.match(lifecycleSource, /const\s+structuredHelpers\s*=\s*createSettingsProviderStructuredHelpers\(\{/);
  assert.match(lifecycleSource, /const\s+titleSummaryHelpers\s*=\s*createSettingsTitleSummaryHelpers\(\{/);
});

test('settings history and API key controls remain delegated without weakening security boundaries', () => {
  const lifecycleSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const apiKeyControlsSource = readSource('src/app/runtime/legacy-core/settings-api-key-controls.js');

  assert.match(lifecycleSource, /const\s+historyMenuHelper\s*=\s*createSettingsHistoryMenuHelper\(\{/);
  assert.match(lifecycleSource, /getConversations:\s*\(\)\s*=>\s*conversations/);
  assert.match(lifecycleSource, /getFolders:\s*\(\)\s*=>\s*folders/);
  assert.match(lifecycleSource, /const\s+apiKeyControls\s*=\s*createSettingsApiKeyControls\(\{/);
  assert.match(lifecycleSource, /elements:\s*ALL_ELEMENTS/);
  assert.match(lifecycleSource, /setApiKeyForProvider,/);
  assert.match(lifecycleSource, /clearSensitiveApiKeys,/);
  assert.doesNotMatch(lifecycleSource, /ALL_ELEMENTS\.geminiApiKeyInput\.value\s*=\s*getApiKeyForProvider/);
  assert.doesNotMatch(apiKeyControlsSource, /dataset\.[A-Za-z0-9_$]*\s*=\s*rawValue/);
});

test('settings output, translator, theme, mobile, and desktop controls remain delegated', () => {
  const lifecycleSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const themeBubbleControlsSource = readSource('src/app/runtime/legacy-core/settings-theme-bubble-controls.js');
  const mobileShellHelperSource = readSource('src/app/runtime/legacy-core/settings-mobile-shell-helper.js');
  const desktopSectionHelperSource = readSource('src/app/runtime/legacy-core/settings-desktop-section-helper.js');

  assert.match(lifecycleSource, /const\s+outputTranslatorControls\s*=\s*createSettingsOutputTranslatorControls\(\{/);
  assert.match(lifecycleSource, /getCouncilTranslatorCandidates,/);
  assert.match(lifecycleSource, /getSingleTranslatorCandidates,/);
  assert.match(lifecycleSource, /syncOutputModeSettingsControls/);
  assert.match(lifecycleSource, /const\s+themeBubbleControls\s*=\s*createSettingsThemeBubbleControls\(\{/);
  assert.match(lifecycleSource, /aiBubbleColors:\s*AI_BUBBLE_COLORS/);
  assert.match(lifecycleSource, /userBubbleColors:\s*USER_BUBBLE_COLORS/);
  assert.match(lifecycleSource, /setAiBubbleColor,\s*\n\s*setUserBubbleColor,\s*\n\s*renderAiBubbleColorDropdown,\s*\n\s*renderUserBubbleColorDropdown,/);
  assert.match(themeBubbleControlsSource, /const\s+renderBubbleColorDropdown\s*=/);
  assert.match(themeBubbleControlsSource, /const\s+setTheme\s*=\s*async/);
  assert.match(themeBubbleControlsSource, /const\s+updateThemeButtons\s*=/);

  assert.match(lifecycleSource, /const\s+mobileShellHelper\s*=\s*createSettingsMobileShellHelper\(\{/);
  assert.match(lifecycleSource, /handleLogout:\s*\(\.\.\.args\)\s*=>\s*handleLogout\(\.\.\.args\)/);
  assert.match(lifecycleSource, /ensureSettingsMobileShell,\s*\n\s*renderSettingsMobileList,\s*\n\s*clearSettingsMobileViewTransition,/);
  assert.match(mobileShellHelperSource, /const\s+renderSettingsMobileList\s*=/);
  assert.match(mobileShellHelperSource, /const\s+ensureSettingsMobileShell\s*=/);
  assert.match(mobileShellHelperSource, /const\s+showSettingsMobileList\s*=/);
  assert.match(mobileShellHelperSource, /const\s+openSettingsMobileSection\s*=/);
  assert.match(mobileShellHelperSource, /settingsMobileBackBtn\.addEventListener\('click',\s*\(\)\s*=>\s*showSettingsMobileList\(\)\)/);

  assert.match(lifecycleSource, /const\s+desktopSectionHelper\s*=\s*createSettingsDesktopSectionHelper\(\{/);
  assert.match(lifecycleSource, /const\s+navItems\s*=\s*bindDesktopSettingsSections\(\);/);
  assert.match(lifecycleSource, /syncSettingsSectionForViewport\(navItems\);/);
  assert.match(desktopSectionHelperSource, /const\s+bindDesktopSettingsSections\s*=/);
  assert.match(desktopSectionHelperSource, /const\s+syncSettingsSectionForViewport\s*=/);
  assert.match(desktopSectionHelperSource, /settingsDesktopBound/);
});

test('settings auth provider lifecycle no longer owns extracted inline helper bodies', () => {
  const lifecycleSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const structuredHelperSource = readSource('src/app/runtime/legacy-core/settings-provider-structured-helpers.js');
  const titleSummaryHelperSource = readSource('src/app/runtime/legacy-core/settings-title-summary-helpers.js');
  const historyMenuHelperSource = readSource('src/app/runtime/legacy-core/settings-history-menu-helper.js');
  const apiKeyControlsSource = readSource('src/app/runtime/legacy-core/settings-api-key-controls.js');
  const outputTranslatorControlsSource = readSource('src/app/runtime/legacy-core/settings-output-translator-controls.js');
  const authActionsHelperSource = readSource('src/app/runtime/legacy-core/settings-auth-actions-helper.js');
  const updateInputStateHelperSource = readSource('src/app/runtime/legacy-core/settings-update-input-state-helper.js');

  assert.doesNotMatch(lifecycleSource, /const\s+renderAiBubbleColorDropdown\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(lifecycleSource, /const\s+renderUserBubbleColorDropdown\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(lifecycleSource, /const\s+setTheme\s*=\s*async/);
  assert.doesNotMatch(lifecycleSource, /const\s+updateThemeButtons\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(lifecycleSource, /const\s+renderSettingsMobileList\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(lifecycleSource, /const\s+ensureSettingsMobileShell\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(lifecycleSource, /const\s+showSettingsMobileList\s*=\s*\(\{\s*animate\s*=\s*true\s*\}\s*=\s*\{\}\)\s*=>/);
  assert.doesNotMatch(lifecycleSource, /const\s+openSettingsMobileSection\s*=\s*\(sectionName\)\s*=>/);
  assert.doesNotMatch(lifecycleSource, /item\.dataset\.settingsDesktopBound\s*=\s*'true'/);
  assert.doesNotMatch(lifecycleSource, /item\.addEventListener\('click',\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(lifecycleSource, /const\s+activeNavItem\s*=\s*ALL_ELEMENTS\.settingsNav\.querySelector/);
  assert.doesNotMatch(lifecycleSource, /const\s+createHistoryMenu\s*=\s*\(convId,\s*targetButton\)\s*=>\s*\{/);
  assert.match(lifecycleSource, /createHistoryMenu\s*\n?\s*\}\s*=\s*historyMenuHelper/);
  assert.doesNotMatch(lifecycleSource, /const\s+getApiKeyInputDescriptors\s*=/);
  assert.doesNotMatch(lifecycleSource, /const\s+createApiKeyClearButton\s*=/);
  assert.doesNotMatch(lifecycleSource, /const\s+ensureApiKeyInputSecurityControls\s*=/);
  assert.doesNotMatch(lifecycleSource, /const\s+prepareApiKeyInputsForSettings\s*=\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(lifecycleSource, /const\s+persistApiKeyInputIntents\s*=\s*async\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(lifecycleSource, /const\s+ensureCouncilTranslatorSettingsControls\s*=\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(lifecycleSource, /const\s+renderTranslatorModelPicker\s*=/);
  assert.doesNotMatch(lifecycleSource, /const\s+renderTranslatorModelPickers\s*=/);
  assert.doesNotMatch(lifecycleSource, /const\s+ensureOutputModeSettingsControls\s*=\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(lifecycleSource, /config\.uiLanguage\s*=\s*ALL_ELEMENTS\.uiLanguageSelect\.value/);
  assert.doesNotMatch(lifecycleSource, /const\s+selectedThemeMode\s*=\s*document\.querySelector\('input\[name="color-theme"\]:checked'\)/);
  assert.doesNotMatch(lifecycleSource, /const\s+selectedGradientSwatch\s*=\s*ALL_ELEMENTS\.gradientSwatches\.querySelector/);
  assert.match(lifecycleSource, /prepareApiKeyInputsForSettings\(\);/);
  assert.match(lifecycleSource, /await\s+persistApiKeyInputIntents\(\);/);
  assert.match(lifecycleSource, /collectSettingsSaveFormValues\(\{/);
  assert.match(lifecycleSource, /Object\.assign\(config\.uiTheme,\s*collectedSettings\.uiTheme\);/);
  assert.match(lifecycleSource, /ensureCouncilTranslatorSettingsControls\(\);/);
  assert.match(lifecycleSource, /ensureOutputModeSettingsControls\(\);/);
  assert.match(lifecycleSource, /renderTranslatorModelPickers\(\);/);
  assert.doesNotMatch(lifecycleSource, /async\s+function\s+callApiWithSchema\b/);
  assert.doesNotMatch(lifecycleSource, /async\s+function\s+shouldPerformWebSearch\b/);
  assert.doesNotMatch(lifecycleSource, /const\s+conversationHistory\s*=\s*conv\.messages/);
  assert.doesNotMatch(lifecycleSource, /const\s+responseSchema\s*=\s*\{/);
  assert.match(lifecycleSource, /const\s+generateTitleAndSummary\s*=\s*async\s*\(conv\)\s*=>\s*\{/);
  assert.match(lifecycleSource, /const\s+data\s*=\s*await\s+requestTitleSummary\(conv,\s*undefined,\s*\{\s*language:\s*config\.aiDefaultLanguage\s*\|\|\s*config\.uiLanguage\s*\}\);/);
  assert.match(lifecycleSource, /conv\.title\s*=\s*data\.title/);
  assert.match(lifecycleSource, /delete\s+conv\.summary/);
  assert.match(lifecycleSource, /await\s+saveAppData\(\);/);
  assert.match(lifecycleSource, /renderHistorySidebar\(\);/);
  assert.match(structuredHelperSource, /async\s+function\s+callApiWithSchema\b/);
  assert.match(structuredHelperSource, /async\s+function\s+shouldPerformWebSearch\b/);
  assert.match(titleSummaryHelperSource, /function\s+buildTitleSummaryPrompt\b/);
  assert.match(titleSummaryHelperSource, /TITLE_SUMMARY_RESPONSE_SCHEMA/);
  assert.match(titleSummaryHelperSource, /async\s+function\s+requestTitleSummary\b/);
  assert.match(historyMenuHelperSource, /function\s+createHistoryMenu\(convId,\s*targetButton\)\s*\{/);
  assert.match(historyMenuHelperSource, /moveConversationToFolder\(convId,\s*button\.dataset\.folderId\)/);
  assert.match(historyMenuHelperSource, /showRenameModal\(convId,\s*'conversation',\s*event\)/);
  assert.match(apiKeyControlsSource, /const\s+getApiKeyInputDescriptors\s*=/);
  assert.match(apiKeyControlsSource, /const\s+createApiKeyClearButton\s*=/);
  assert.match(apiKeyControlsSource, /const\s+ensureApiKeyInputSecurityControls\s*=/);
  assert.match(apiKeyControlsSource, /const\s+prepareApiKeyInputsForSettings\s*=/);
  assert.match(apiKeyControlsSource, /const\s+persistApiKeyInputIntents\s*=/);
  assert.match(apiKeyControlsSource, /readApiKeyInputIntent/);
  assert.match(apiKeyControlsSource, /markApiKeyInputCleared/);
  assert.match(outputTranslatorControlsSource, /const\s+ensureCouncilTranslatorSettingsControls\s*=/);
  assert.match(outputTranslatorControlsSource, /const\s+renderTranslatorModelPicker\s*=/);
  assert.match(outputTranslatorControlsSource, /const\s+renderTranslatorModelPickers\s*=/);
  assert.match(outputTranslatorControlsSource, /const\s+ensureOutputModeSettingsControls\s*=/);
  assert.match(outputTranslatorControlsSource, /getOutputModeSettingsText/);
  assert.doesNotMatch(lifecycleSource, /const\s+handleLogin\s*=\s*async\s*\(e\)\s*=>\s*\{/);
  assert.doesNotMatch(lifecycleSource, /const\s+handleLogout\s*=\s*async\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(lifecycleSource, /const\s+handleDeleteAllData\s*=\s*async\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(lifecycleSource, /const\s+updateInputState\s*=\s*\(\)\s*=>\s*\{/);
  assert.match(authActionsHelperSource, /const\s+handleLogin\s*=\s*async\s*\(e\)\s*=>\s*\{/);
  assert.match(authActionsHelperSource, /const\s+handleLogout\s*=\s*async\s*\(\)\s*=>\s*\{/);
  assert.match(authActionsHelperSource, /const\s+handleDeleteAllData\s*=\s*async\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(authActionsHelperSource, /settings-save-settings-helper|settings-api-key-controls|sensitive-config-store|api-key-input-intent/);
  assert.match(updateInputStateHelperSource, /const\s+updateInputState\s*=\s*\(\)\s*=>\s*\{/);
  assert.match(updateInputStateHelperSource, /const\s+conv\s*=\s*getActiveConversation\(\);/);
  assert.doesNotMatch(updateInputStateHelperSource, /settings-save-settings-helper|settings-api-key-controls|sensitive-config-store|api-key-input-intent|saveConfig|showNotification|toggleModal/);
});

test('settings modal orchestration and legacy core wiring remain in place', () => {
  const lifecycleSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const authActionsHelperSource = readSource('src/app/runtime/legacy-core/settings-auth-actions-helper.js');
  const updateInputStateHelperSource = readSource('src/app/runtime/legacy-core/settings-update-input-state-helper.js');

  assert.match(lifecycleSource, /const\s+setupSettingsModal\s*=\s*\(\)\s*=>\s*\{/);
  assert.match(lifecycleSource, /const\s+saveSettings\s*=\s*async\s*\(\{\s*close\s*=\s*true,\s*notify\s*=\s*true\s*\}\s*=\s*\{\}\)\s*=>\s*\{/);
  assert.match(lifecycleSource, /const\s+authActionsHelper\s*=\s*createSettingsAuthActionsHelper\(\{/);
  assert.match(lifecycleSource, /const\s+updateInputStateHelper\s*=\s*createSettingsUpdateInputStateHelper\(\{/);
  assert.match(lifecycleSource, /handleLogin,\s*\n\s*handleLogout,\s*\n\s*handleDeleteAllData\s*\n?\}\s*=\s*authActionsHelper/);
  assert.match(lifecycleSource, /updateInputState\s*\n?\}\s*=\s*updateInputStateHelper/);
  assert.match(authActionsHelperSource, /const\s+handleLogin\s*=\s*async\s*\(e\)\s*=>\s*\{/);
  assert.match(authActionsHelperSource, /const\s+handleLogout\s*=\s*async\s*\(\)\s*=>\s*\{/);
  assert.match(authActionsHelperSource, /const\s+handleDeleteAllData\s*=\s*async\s*\(\)\s*=>\s*\{/);
  assert.match(updateInputStateHelperSource, /const\s+updateInputState\s*=\s*\(\)\s*=>\s*\{/);
  assert.match(
    legacyCoreSource,
    /import\s+\{\s*createLegacySettingsAuthProviderLifecycle\s*\}\s+from\s+['"]\/src\/app\/runtime\/legacy-core\/settings-auth-provider-lifecycle\.js['"]/
  );
  assert.match(legacyCoreSource, /const\s+settingsAuthProviderLifecycle\s*=\s*createLegacySettingsAuthProviderLifecycle\(\{/);
  assert.match(legacyCoreSource, /getOutputMode,\s*\n\s*renderHistorySidebar,/);
  assert.match(lifecycleSource, /getOutputMode\s*=\s*\(\)\s*=>\s*'typewriter'/);
  assert.match(legacyCoreSource, /const\s+\{[\s\S]*runModelCouncil,[\s\S]*callApiWithSchema,[\s\S]*updateSubmitButtonState,[\s\S]*updateInputState,[\s\S]*setupSettingsModal,[\s\S]*saveSettings,[\s\S]*handleLogin,[\s\S]*handleLogout,[\s\S]*handleDeleteAllData[\s\S]*\}\s*=\s*settingsAuthProviderLifecycle;/);
  assert.match(legacyCoreSource, /legacyRuntimeContext\.registerLazyBinding\('settings\.setupSettingsModal',\s*\(\)\s*=>\s*setupSettingsModal\);/);
  assert.match(legacyCoreSource, /legacyRuntimeContext\.registerLazyBinding\('input\.updateInputState',\s*\(\)\s*=>\s*updateInputState\);/);
  assert.match(legacyCoreSource, /const\s+transitionBusLifecycle\s*=\s*createLegacyTransitionBusLifecycle\(\{/);
  assert.match(legacyCoreSource, /transitionBusLifecycle\.registerCoreTailDependencies\(\);/);
  for (const removedInlineBody of [
    /const\s+setupSettingsModal\s*=\s*\(\)\s*=>\s*\{/,
    /const\s+saveSettings\s*=\s*async\s*\(\{/,
    /const\s+handleLogin\s*=\s*async\s*\(e\)\s*=>\s*\{/,
    /const\s+handleLogout\s*=\s*async\s*\(\)\s*=>\s*\{/,
    /const\s+handleDeleteAllData\s*=\s*async\s*\(\)\s*=>\s*\{/,
    /const\s+createHistoryMenu\s*=/,
    /async\s+function\s+callApiWithSchema\b/,
    /async\s+function\s+shouldPerformWebSearch\b/,
    /const\s+updateInputState\s*=\s*\(\)\s*=>\s*\{/
  ]) {
    assert.doesNotMatch(legacyCoreSource, removedInlineBody);
  }
});
