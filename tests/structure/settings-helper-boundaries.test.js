import assert from 'node:assert/strict';
import test from 'node:test';
import { readSource } from '../helpers/source-guards.js';

// The settings dialog is put together by settings-auth-provider-lifecycle.js from small helpers. What each helper does is tested by
// behaviour (tests/runtime-settings-*.test.js); this file keeps only the rules about what the helpers may depend on.

const helperDir = 'src/app/runtime/legacy-core/';

const settingsHelperModules = [
  ['settings-provider-structured-helpers.js', 'createSettingsProviderStructuredHelpers'],
  ['settings-title-summary-helpers.js', 'createSettingsTitleSummaryHelpers'],
  ['settings-history-menu-helper.js', 'createSettingsHistoryMenuHelper'],
  ['settings-api-key-controls.js', 'createSettingsApiKeyControls'],
  ['settings-output-translator-controls.js', 'createSettingsOutputTranslatorControls'],
  ['settings-theme-bubble-controls.js', 'createSettingsThemeBubbleControls'],
  ['settings-mobile-shell-helper.js', 'createSettingsMobileShellHelper'],
  ['settings-desktop-section-helper.js', 'createSettingsDesktopSectionHelper'],
  ['settings-auth-actions-helper.js', 'createSettingsAuthActionsHelper'],
  ['settings-update-input-state-helper.js', 'createSettingsUpdateInputStateHelper'],
  ['settings-save-settings-helper.js', 'collectSettingsSaveFormValues'],
  ['settings-auth-provider-lifecycle.js', 'createLegacySettingsAuthProviderLifecycle']
];

// The modules a file imports, static or loaded on demand.
const importsOf = (source) => [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g)].map((match) => match[1]);

test('every settings helper loads without side effects and exports its factory', async () => {
  for (const [file, exportName] of settingsHelperModules) {
    const module = await import(`../../${helperDir}${file}`);
    assert.equal(typeof module[exportName], 'function', `${file} exports ${exportName}`);
  }
});

test('settings helpers depend on nothing above them: not the app entry, the legacy core, nor retired runtime modules', () => {
  for (const [file] of settingsHelperModules) {
    for (const specifier of importsOf(readSource(`${helperDir}${file}`))) {
      assert.doesNotMatch(specifier, /runtime-entry|runtime-app|legacy-app|\/main\.js|legacy-core\.js|legacy-runtime\/fragments|^virtual:/, `${file} imports ${specifier}`);
    }
  }
});

test('the sign-in and input state helpers do not reach into the start of the app or the sidebar', () => {
  for (const file of ['settings-auth-actions-helper.js', 'settings-update-input-state-helper.js']) {
    for (const specifier of importsOf(readSource(`${helperDir}${file}`))) {
      assert.doesNotMatch(specifier, /bootstrap|sidebar/, `${file} imports ${specifier}`);
    }
  }
});

// API keys are kept only by the API key controls and the sensitive store; the helpers that collect or act on ordinary settings never
// load them, so a key cannot end up in the normal config.
test('only the API key controls handle API keys among the settings helpers', () => {
  for (const file of ['settings-save-settings-helper.js', 'settings-auth-actions-helper.js', 'settings-update-input-state-helper.js']) {
    for (const specifier of importsOf(readSource(`${helperDir}${file}`))) {
      assert.doesNotMatch(specifier, /sensitive-config-store|api-key-input-intent|settings-api-key-controls|settings-save-settings-helper/, `${file} imports ${specifier}`);
    }
  }
});

// These two build requests and prompts only: they can run without a page.
test('the structured request and title helpers do not touch the page', () => {
  for (const file of ['settings-provider-structured-helpers.js', 'settings-title-summary-helpers.js']) {
    assert.doesNotMatch(readSource(`${helperDir}${file}`), /\bdocument\.|\bwindow\./, `${file} must not use the page`);
  }
});
