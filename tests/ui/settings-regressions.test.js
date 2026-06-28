import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertFileWithinBudget,
  collectCssSelectorHits,
  readSource,
  readUiSource
} from '../helpers/source-guards.js';

const settingsSurfaceCssFiles = [
  'src/styles/settings.css',
  'src/styles/settings-mobile.css',
  'src/styles/settings-api-keys.css',
  'src/styles/settings-output-translator.css',
  'src/styles/settings-theme-bubble.css',
  'src/styles/settings-provider-management.css',
  'src/styles/settings-desktop.css',
  'src/styles/settings-danger.css',
  'src/styles/mobile.css',
  'src/styles/typography.css',
  'src/styles/regression-overrides.css',
  'src/styles/modals.css',
  'src/styles/personalization.css'
];

function assertSelectorHits(selector, expectedFiles, message) {
  const hits = collectCssSelectorHits(selector, settingsSurfaceCssFiles);
  for (const expectedFile of expectedFiles) {
    assert.ok(
      hits.includes(expectedFile),
      message || `${selector} should be mapped in ${expectedFile}; hits: ${hits.join(', ')}`
    );
  }
  return hits;
}

test('settings API key controls use masked intent helpers and scoped clear button styles', () => {
  const settingsAuthProviderLifecycle = readUiSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const settingsApiKeyControls = readUiSource('src/app/runtime/legacy-core/settings-api-key-controls.js');
  const css = readUiSource('src/styles/main.css');

  assert.match(settingsAuthProviderLifecycle, /createSettingsApiKeyControls/);
  assert.match(settingsApiKeyControls, /prepareApiKeyInput\(input,\s*\{/);
  assert.match(settingsApiKeyControls, /readApiKeyInputIntent\(input\)/);
  assert.match(settingsApiKeyControls, /markApiKeyInputCleared\(input\)/);
  assert.match(settingsApiKeyControls, /id\s*=\s*'clear-all-api-keys-btn'/);
  assert.doesNotMatch(settingsAuthProviderLifecycle, /ALL_ELEMENTS\.geminiApiKeyInput\.value\s*=\s*getApiKeyForProvider/);
  assert.doesNotMatch(settingsApiKeyControls, /dataset\.[A-Za-z0-9_$]*\s*=\s*rawValue/);

  assert.match(css, /\.api-key-input-group\s*\{/);
  assert.match(css, /\.api-key-clear-btn,\s*\.api-key-clear-all-btn\s*\{/);
  assert.match(css, /\.api-key-clear-all-btn\s*\{[^}]*width:\s*100%;/s);

  const settingsCss = readUiSource('src/styles/settings.css');
  const settingsApiKeysCss = readUiSource('src/styles/settings-api-keys.css');
  assert.doesNotMatch(settingsCss, /\.api-key-input-group\s*\{/);
  assert.match(settingsApiKeysCss, /\.api-key-input-group\s*\{/);
  assert.match(settingsApiKeysCss, /\.api-key-clear-btn,\s*\.api-key-clear-all-btn\s*\{/);
});

test('settings navigation starts below the modal header divider on desktop', () => {
  const css = readUiSource('src/styles/main.css');

  assert.match(css, /#settings-modal\s+\.settings-sidebar\s*\{[^}]*margin-top:\s*4\.5rem(?:\s*!important)?;/s);
  assert.match(css, /#settings-modal\s+\.settings-sidebar\s*\{[^}]*height:\s*calc\(100%\s*-\s*4\.5rem\)(?:\s*!important)?;/s);
});

test('mobile settings open to a GPT-style category list before drilling into details', () => {
  const css = readUiSource('src/styles/main.css');

  assert.match(css, /@media\s*\(max-width:\s*768px\)[^{]*\{[\s\S]*#settings-modal\s+#settings-mobile-header[^{]*\{[^}]*display:\s*flex\s*!important;/s);
  assert.match(css, /@media\s*\(max-width:\s*768px\)[^{]*\{[\s\S]*#settings-modal\.visible[^{]*\{[^}]*align-items:\s*flex-end\s*!important;[^}]*padding:\s*0\s*!important;/s);
  assert.match(css, /@media\s*\(max-width:\s*768px\)[^{]*\{[\s\S]*#settings-modal\s*>\s*div[^{]*\{[^}]*width:\s*100vw\s*!important;[^}]*margin:\s*0\s*!important;[^}]*border-radius:\s*2rem\s+2rem\s+0\s+0\s*!important;/s);
  assert.match(css, /@media\s*\(max-width:\s*768px\)[^{]*\{[\s\S]*#settings-modal\s+#settings-mobile-list[^{]*\{[^}]*display:\s*block\s*!important;/s);
  assert.match(css, /#settings-modal\.settings-mobile-detail-open\s+#settings-mobile-list[^{]*\{[^}]*transform:\s*translateX\(-100%\)\s*!important;/s);
  assert.match(css, /#settings-modal\s+\.flex-1\.p-6\.overflow-y-auto[^{]*\{[^}]*transform:\s*translateX\(100%\)\s*!important;/s);
  assert.match(css, /#settings-modal\.settings-mobile-detail-open\s+\.flex-1\.p-6\.overflow-y-auto[^{]*\{[^}]*transform:\s*translateX\(0\)\s*!important;/s);
  assert.match(css, /#settings-modal\.settings-mobile-returning\s+\.flex-1\.p-6\.overflow-y-auto[^{]*\{[^}]*transform:\s*translateX\(100%\)\s*!important;/s);
  assert.match(css, /#settings-modal\s*>\s*div\s*>\s*\.p-4\.bg-\\\[var\\\(--sidebar-bg\\\)\\\]\.border-t[^{]*\{[^}]*transition:[^}]*opacity\s+0\.34s\s+ease-in-out[^}]*transform\s+0\.34s\s+ease-in-out/s);
  assert.match(css, /#settings-modal\.settings-mobile-detail-open\s*>\s*div\s*>\s*\.p-4\.bg-\\\[var\\\(--sidebar-bg\\\)\\\]\.border-t[^{]*\{[^}]*opacity:\s*0;[^}]*transform:\s*translateY\(-0\.35rem\)\s+scale\(0\.96\);/s);
  assert.match(css, /#settings-modal\.settings-mobile-returning\s*>\s*div\s*>\s*\.p-4\.bg-\\\[var\\\(--sidebar-bg\\\)\\\]\.border-t[^{]*\{(?:(?!opacity:|transform:)[^}])*animation:\s*settingsCloseReturnIn\s+0\.34s\s+ease-in-out/s);
  assert.match(css, /#settings-mobile-back-btn[^{]*\{[^}]*transform:\s*translateX\(-0\.35rem\)\s+scale\(0\.96\);[^}]*transition:[^}]*opacity\s+0\.34s\s+ease-in-out[^}]*transform\s+0\.34s\s+ease-in-out/s);
  assert.match(css, /#settings-modal\.settings-mobile-returning\s+#settings-mobile-back-btn[^{]*\{(?:(?!opacity:|transform:)[^}])*animation:\s*settingsBackReturnOut\s+0\.34s\s+ease-in-out/s);
  assert.match(css, /@keyframes\s+settingsCloseReturnIn\s*\{[\s\S]*from\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*translateY\(-0\.35rem\)\s+scale\(0\.96\);[^}]*\}[\s\S]*to\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*translateY\(0\)\s+scale\(1\);/s);
  assert.match(css, /@keyframes\s+settingsBackReturnOut\s*\{[\s\S]*from\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*translateX\(0\)\s+scale\(1\);[^}]*\}[\s\S]*to\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*translateX\(-0\.35rem\)\s+scale\(0\.96\);/s);
  assert.match(css, /#settings-modal\.settings-mobile-detail-open\s+\.settings-section\.active[^{]*\{[^}]*display:\s*block\s*!important;/s);
  assert.match(css, /#settings-modal\.settings-mobile-detail-open\s+\.settings-section\.active\s*>\s*h3[^{]*\{[^}]*margin-left:\s*0\s*!important;[^}]*width:\s*100%\s*!important;[^}]*text-align:\s*left\s*!important;/s);
});

test('mobile settings use readable dark surfaces in dark mode', () => {
  const css = readUiSource('src/styles/main.css');

  assert.match(css, /\.dark\s+#settings-modal\s*>\s*div,[\s\S]*\.dark\s+#settings-modal\s+#settings-mobile-list,[\s\S]*\.dark\s+#settings-modal\s+\.flex-1\.p-6\.overflow-y-auto[^{]*\{[^}]*background:\s*var\(--modal-bg\)\s*!important;/s);
  assert.match(css, /\.dark\s+#settings-modal\s+\.settings-mobile-card,[\s\S]*\.dark\s+#settings-modal\s+\.settings-mobile-list-item\.settings-nav-item[^{]*\{[^}]*background:\s*var\(--input-field-bg\)\s*!important;[^}]*color:\s*var\(--text-primary\)\s*!important;/s);
  assert.match(css, /\.dark\s+#settings-modal\s+\.settings-mobile-row-label[^{]*\{[^}]*color:\s*var\(--text-primary\)\s*!important;/s);
  assert.match(css, /\.dark\s+#settings-modal\s+\.settings-mobile-group-title[^{]*\{[^}]*color:\s*var\(--text-secondary\)\s*!important;/s);
  assert.match(css, /\.dark\s+#settings-modal\s+#close-settings-btn[^{]*\{[^}]*background:\s*var\(--input-field-bg\)\s*!important;/s);
});

test('app typography uses restrained GPT-like system weights and mobile settings sheet motion', () => {
  const css = readUiSource('src/styles/main.css');

  assert.match(css, /--astra-ui-font:\s*ui-sans-serif,\s*-apple-system,\s*BlinkMacSystemFont,\s*"Segoe UI",\s*system-ui,\s*sans-serif;/);
  assert.match(css, /html,\s*body,\s*button,\s*input,\s*textarea,\s*select[^{]*\{[^}]*font-family:\s*var\(--astra-ui-font\)\s*!important;/s);
  assert.match(css, /\.font-bold,\s*\.font-semibold,\s*strong,\s*b[^{]*\{[^}]*font-weight:\s*var\(--astra-font-semibold\)\s*!important;/s);
  assert.match(css, /#settings-modal\s+\.settings-mobile-group-title[^{]*\{[^}]*font-weight:\s*var\(--astra-font-medium\)\s*!important;/s);
  assert.match(css, /#settings-mobile-list\s+\.settings-mobile-group:first-child\s+\.settings-mobile-group-title[^{]*\{[^}]*font-weight:\s*var\(--astra-font-regular\)\s*!important;/s);
  assert.match(css, /#settings-modal\s+\.settings-mobile-list-item,\s*#settings-modal\s+\.settings-mobile-list-item\.settings-nav-item[^{]*\{[^}]*font-weight:\s*var\(--astra-font-regular\)\s*!important;/s);
  assert.match(css, /#settings-modal\s+#settings-mobile-list\s+\.settings-mobile-group-title[^{]*\{[^}]*font-size:\s*0\.95rem\s!important;/s);
  assert.match(css, /#settings-modal\s+#settings-mobile-list\s+\.settings-mobile-list-item,\s*#settings-modal\s+#settings-mobile-list\s+\.settings-mobile-list-item\.settings-nav-item[^{]*\{[^}]*font-size:\s*1\.06rem\s*!important;[^}]*min-height:\s*3\.85rem\s*!important;/s);
  assert.match(css, /#settings-modal\s+#settings-mobile-list\s+\.settings-mobile-row-icon[^{]*\{[^}]*width:\s*2\.05rem\s*!important;[^}]*height:\s*2\.05rem\s*!important;/s);
  assert.match(css, /#settings-modal\s+#settings-mobile-list\s+\.settings-mobile-row-icon\s+svg,\s*#settings-modal\s+#settings-mobile-list\s+\.settings-mobile-row-icon\s+svg\s+\*[^{]*\{[^}]*width:\s*1\.42rem\s!important;[^}]*height:\s*1\.42rem\s!important;/s);
  assert.match(css, /#settings-mobile-title[^{]*\{[^}]*font-weight:\s*var\(--astra-font-semibold\)\s*!important;/s);
  assert.match(css, /\.settings-mobile-row-icon\s+svg,\s*\.settings-mobile-row-icon\s+svg\s+\*[^{]*\{[^}]*stroke-width:\s*1\.65\s*!important;/s);
  assert.match(css, /#settings-mobile-back-btn\s+svg,\s*#settings-mobile-back-btn\s+svg\s+\*[^{]*\{[^}]*stroke-width:\s*2\s!important;/s);
  assert.match(css, /#settings-modal\s*>\s*div[^{]*\{[^}]*transition:\s*transform\s+0\.32s\s+cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/s);
  assert.match(css, /#settings-modal:not\(\.visible\)\s*>\s*div[^{]*\{[^}]*transform:\s*translateY\(100%\)\s*!important;/s);
  assert.match(css, /#settings-modal\.visible\s*>\s*div[^{]*\{[^}]*transform:\s*translateY\(0\)\s*!important;/s);
});

test('settings modal CSS surface selectors are mapped before extraction', () => {
  const settingsOnlySelectors = [
    ['#settings-modal', ['src/styles/settings.css', 'src/styles/settings-mobile.css', 'src/styles/typography.css']],
    ['#settings-modal > div', ['src/styles/settings.css', 'src/styles/settings-mobile.css', 'src/styles/typography.css']],
    ['#settings-modal nav', ['src/styles/settings-desktop.css', 'src/styles/settings-mobile.css']],
    ['#settings-nav', ['src/styles/settings-desktop.css']],
    ['.settings-sidebar', ['src/styles/regression-overrides.css']],
    ['.settings-section', ['src/styles/settings-desktop.css', 'src/styles/settings-mobile.css', 'src/styles/typography.css']],
    ['.settings-section.active', ['src/styles/settings-desktop.css', 'src/styles/settings-mobile.css', 'src/styles/typography.css']],
    ['.settings-nav-item', ['src/styles/settings-desktop.css', 'src/styles/settings-mobile.css', 'src/styles/typography.css']]
  ];

  for (const [selector, expectedFiles] of settingsOnlySelectors) {
    assertSelectorHits(selector, expectedFiles);
  }
});

test('desktop settings nav and section selectors are scoped to the desktop settings surface', () => {
  const desktopSelectors = [
    ['#settings-modal nav', ['src/styles/settings-desktop.css', 'src/styles/settings-mobile.css']],
    ['#settings-modal #settings-nav', ['src/styles/settings-desktop.css']],
    ['#settings-nav', ['src/styles/settings-desktop.css']],
    ['.settings-sidebar', ['src/styles/regression-overrides.css']],
    ['.settings-nav-item', ['src/styles/settings-desktop.css', 'src/styles/settings-mobile.css', 'src/styles/typography.css']],
    ['.settings-nav-item.active', ['src/styles/settings-desktop.css']],
    ['#settings-modal .settings-section', ['src/styles/settings-desktop.css', 'src/styles/settings-mobile.css', 'src/styles/typography.css']],
    ['#settings-modal .settings-section.active', ['src/styles/settings-desktop.css', 'src/styles/settings-mobile.css']],
    ['#settings-modal .settings-section.active::before', ['src/styles/settings-desktop.css', 'src/styles/settings-mobile.css']],
    ['#settings-modal .flex-1.p-6.overflow-y-auto', ['src/styles/settings-desktop.css', 'src/styles/settings-mobile.css', 'src/styles/typography.css']]
  ];

  for (const [selector, expectedFiles] of desktopSelectors) {
    assertSelectorHits(selector, expectedFiles);
  }

  const settingsCss = readUiSource('src/styles/settings.css');
  const settingsDesktopCss = readUiSource('src/styles/settings-desktop.css');
  const regressionOverridesCss = readUiSource('src/styles/regression-overrides.css');
  assert.doesNotMatch(settingsCss, /#settings-modal\s+nav\s*\{/);
  assert.doesNotMatch(settingsCss, /#settings-modal\s+#settings-nav\s*\{/);
  assert.doesNotMatch(settingsCss, /#settings-modal\s+\.settings-section\.active::before\s*\{/);
  assert.match(settingsDesktopCss, /@media\s*\(min-width:\s*769px\)/);
  assert.match(settingsDesktopCss, /#settings-modal\s+#settings-nav\s*\{/);
  assert.match(settingsDesktopCss, /#settings-modal\s+\.settings-section\.active::before\s*\{/);
  assert.match(
    regressionOverridesCss,
    /#settings-modal\s+\.settings-sidebar\s*\{[^}]*margin-top:\s*4\.5rem\s*!important;[^}]*height:\s*calc\(100%\s*-\s*4\.5rem\)\s*!important;/s
  );
});

test('mobile settings CSS surface is explicitly mapped before extraction', () => {
  const mobileSelectors = [
    ['#settings-modal.visible', ['src/styles/settings-mobile.css', 'src/styles/typography.css']],
    ['#settings-modal .flex-1.p-6.overflow-y-auto', ['src/styles/settings-desktop.css', 'src/styles/settings-mobile.css', 'src/styles/typography.css']],
    ['#settings-mobile-header', ['src/styles/settings-mobile.css']],
    ['#settings-mobile-list', ['src/styles/settings-mobile.css', 'src/styles/typography.css']],
    ['#settings-mobile-title', ['src/styles/settings-mobile.css', 'src/styles/typography.css']],
    ['#settings-mobile-back-btn', ['src/styles/settings-mobile.css', 'src/styles/typography.css']],
    ['.settings-mobile-group', ['src/styles/settings-mobile.css', 'src/styles/typography.css']],
    ['.settings-mobile-card', ['src/styles/settings-mobile.css']],
    ['.settings-mobile-list-item', ['src/styles/settings-mobile.css', 'src/styles/typography.css']],
    ['.settings-mobile-row-icon', ['src/styles/settings-mobile.css', 'src/styles/typography.css']],
    ['.settings-mobile-row-label', ['src/styles/settings-mobile.css']]
  ];

  for (const [selector, expectedFiles] of mobileSelectors) {
    assertSelectorHits(selector, expectedFiles);
  }

  const settingsCss = readUiSource('src/styles/settings.css');
  const settingsMobileCss = readUiSource('src/styles/settings-mobile.css');
  const mobileCss = readUiSource('src/styles/mobile.css');
  assert.doesNotMatch(settingsCss, /#settings-modal\.visible[^{]*\{[^}]*padding:\s*0\.75rem\s*!important;/s);
  assert.match(settingsMobileCss, /#settings-modal\.visible[^{]*\{[^}]*padding:\s*0\s*!important;/s);
  assert.match(settingsMobileCss, /#settings-modal\s+nav[^{]*\{[^}]*display:\s*none\s*!important;/s);
  assert.match(settingsMobileCss, /#settings-modal\s+\.flex-1\.p-6\.overflow-y-auto[^{]*\{[^}]*padding:\s*0\.25rem\s+1\.15rem\s+1\.4rem\s*!important;/s);
  assert.doesNotMatch(mobileCss, /#settings-mobile-|\.settings-mobile-/);
  assert.doesNotMatch(mobileCss, /settings-mobile-detail-open|settings-mobile-returning/);
  assert.match(settingsMobileCss, /\.dark\s+#settings-modal\s+#settings-mobile-list/);
  assert.match(settingsMobileCss, /\.dark\s+#settings-modal\s+\.settings-mobile-card/);
});

test('provider and model management selectors are scoped to the provider management surface', () => {
  const providerManagementSelectors = [
    ['#model-management-list', ['src/styles/settings-provider-management.css']],
    ['#model-management-list .collapsible-section', ['src/styles/settings-provider-management.css']],
    ['#model-management-list .collapsible-summary', ['src/styles/settings-provider-management.css']],
    ['#model-management-list .collapsible-content', ['src/styles/settings-provider-management.css']],
    ['.model-management-item', ['src/styles/settings-provider-management.css']],
    ['.model-management-name', ['src/styles/settings-provider-management.css', 'src/styles/typography.css']],
    ['.model-row-action', ['src/styles/settings.css', 'src/styles/settings-provider-management.css']],
    ['.model-order-controls', ['src/styles/settings-provider-management.css']],
    ['.model-default-radio', ['src/styles/settings-provider-management.css']]
  ];

  for (const [selector, expectedFiles] of providerManagementSelectors) {
    assertSelectorHits(selector, expectedFiles);
  }

  const settingsCss = readUiSource('src/styles/settings.css');
  const settingsProviderManagementCss = readUiSource('src/styles/settings-provider-management.css');
  assert.doesNotMatch(settingsCss, /#model-management-list/);
  assert.doesNotMatch(settingsCss, /\.model-management-item/);
  assert.doesNotMatch(settingsCss, /\.model-management-name/);
  assert.doesNotMatch(settingsCss, /\.model-order-controls/);
  assert.doesNotMatch(settingsCss, /\.model-default-radio/);
  assert.match(settingsProviderManagementCss, /#model-management-list\s+\.collapsible-summary\s*\{/);
  assert.match(settingsProviderManagementCss, /\.model-management-item\s*\{/);
  assert.match(settingsProviderManagementCss, /\.model-management-item\s+\.model-row-action,\s*#settings-modal\s+\.model-management-item\s+\.model-row-action\s*\{/);
});

test('settings control selectors stay visible and scoped by surface', () => {
  const controlSelectors = [
    ['.api-key-input-group', ['src/styles/settings-api-keys.css']],
    ['.api-key-clear-btn', ['src/styles/settings-api-keys.css']],
    ['.api-key-clear-all-btn', ['src/styles/settings-api-keys.css']],
    ['.translator-picker-menu', ['src/styles/settings-output-translator.css']],
    ['.translator-picker-button', ['src/styles/settings-output-translator.css']],
    ['.translator-picker-option', ['src/styles/settings-output-translator.css']],
    ['.custom-output-mode-select', ['src/styles/settings-output-translator.css']],
    ['.custom-output-mode-option', ['src/styles/settings-output-translator.css']],
    ['#settings-modal #delete-all-data-btn', ['src/styles/settings-danger.css']],
    ['#settings-modal .model-management-item .model-row-action', ['src/styles/settings-provider-management.css']]
  ];

  for (const [selector, expectedFiles] of controlSelectors) {
    assertSelectorHits(selector, expectedFiles);
  }

  const css = readUiSource('src/styles/main.css');
  assert.match(css, /\.api-key-clear-btn,\s*\.api-key-clear-all-btn\s*\{/);
  assert.match(css, /\.translator-picker-button[^{]*\{/);
  assert.match(css, /\.custom-output-mode-option[^{]*\{/);

  const settingsCss = readUiSource('src/styles/settings.css');
  assert.doesNotMatch(settingsCss, /\.api-key-clear-btn/);
  assert.doesNotMatch(settingsCss, /\.api-key-clear-all-btn/);
  assert.doesNotMatch(settingsCss, /\.translator-picker-/);
  assert.doesNotMatch(settingsCss, /\.custom-output-mode-/);
});

test('provider controls and desktop sections remain classified separately after provider and desktop extraction', () => {
  const settingsCss = readUiSource('src/styles/settings.css');
  const settingsDesktopCss = readUiSource('src/styles/settings-desktop.css');
  const settingsProviderManagementCss = readUiSource('src/styles/settings-provider-management.css');
  const desktopSectionIndex = settingsDesktopCss.indexOf('#settings-modal .settings-section');
  const modelManagementIndex = settingsProviderManagementCss.indexOf('#model-management-list');
  const modelItemIndex = settingsProviderManagementCss.indexOf('.model-management-item');

  assert.doesNotMatch(settingsCss, /#settings-modal\s+\.settings-section\s*\{/);
  assert.match(settingsDesktopCss, /#settings-modal\s+\.settings-section\s*\{/);
  assert.match(settingsCss, /\.model-row-action\s*\{/);
  assert.match(settingsProviderManagementCss, /#model-management-list\s*\{/);
  assert.match(settingsProviderManagementCss, /\.model-management-item\s*\{/);
  assert.match(settingsProviderManagementCss, /\.model-management-item\s+\.model-row-action/);
  assert.ok(desktopSectionIndex >= 0, 'desktop section rules should stay visible as an extraction candidate');
  assert.ok(modelManagementIndex >= 0, 'provider/model management list rules should stay visible in the provider management surface');
  assert.ok(modelItemIndex >= 0, 'provider/model item rules should stay visible in the provider management surface');
  assert.notEqual(modelManagementIndex, modelItemIndex, 'provider/model list and item rules should be distinct candidates');
});

test('provider-adjacent and desktop-adjacent risky selectors remain classified as shared or deferred', () => {
  const settingsCss = readUiSource('src/styles/settings.css');
  const settingsProviderManagementCss = readUiSource('src/styles/settings-provider-management.css');
  const settingsDesktopCss = readUiSource('src/styles/settings-desktop.css');
  const settingsDangerCss = readUiSource('src/styles/settings-danger.css');

  assertSelectorHits('#settings-modal', ['src/styles/settings.css', 'src/styles/settings-mobile.css', 'src/styles/typography.css']);
  assertSelectorHits('#settings-modal > div', ['src/styles/settings.css', 'src/styles/settings-mobile.css', 'src/styles/typography.css']);
  assertSelectorHits('#settings-modal.visible', ['src/styles/settings.css', 'src/styles/settings-mobile.css', 'src/styles/typography.css']);
  assertSelectorHits('.modal input', ['src/styles/settings.css', 'src/styles/personalization.css']);
  assertSelectorHits('.modal select', ['src/styles/settings.css', 'src/styles/personalization.css']);
  assertSelectorHits('#settings-modal input[type="radio"]', ['src/styles/settings.css']);
  assertSelectorHits('#settings-modal input[type="checkbox"]', ['src/styles/settings.css']);
  assertSelectorHits('.model-row-action', ['src/styles/settings.css']);
  assertSelectorHits('#settings-modal #delete-all-data-btn', ['src/styles/settings-danger.css']);

  assert.match(settingsCss, /#settings-modal\s+input\[type="radio"\],\s*#settings-modal\s+input\[type="checkbox"\]\s*\{/);
  assert.match(settingsCss, /\.store-category-btn,[\s\S]*?\.model-row-action\s*\{/);
  assert.doesNotMatch(settingsCss, /#delete-all-data-btn/);
  assert.doesNotMatch(settingsCss, /#settings-modal\s+#settings-nav/);
  assert.match(settingsDesktopCss, /#settings-modal\s+#settings-nav/);
  assert.match(settingsDangerCss, /#settings-modal\s+#delete-all-data-btn/);
  assert.doesNotMatch(settingsDangerCss, /#export-data-btn/);
  assert.doesNotMatch(settingsDangerCss, /#import-data-btn/);
  assert.doesNotMatch(settingsDangerCss, /#trash-batch/);
  assert.match(settingsProviderManagementCss, /\.model-management-item\s+\.model-row-action/);
  assert.doesNotMatch(settingsProviderManagementCss, /\.store-category-btn/);
  assert.doesNotMatch(settingsProviderManagementCss, /#settings-modal\s+input\[type="radio"\]/);
  assert.doesNotMatch(settingsProviderManagementCss, /#settings-modal\s+input\[type="checkbox"\]/);
  assert.doesNotMatch(settingsCss, /\[data-theme/);
});

test('settings theme and bubble color selectors are scoped to the theme bubble surface', () => {
  const themeBubbleSelectors = [
    ['.theme-button-group', ['src/styles/settings-theme-bubble.css', 'src/styles/modals.css']],
    ['.theme-btn', ['src/styles/settings-theme-bubble.css', 'src/styles/modals.css']],
    ['.theme-btn.active', ['src/styles/settings-theme-bubble.css', 'src/styles/modals.css']],
    ['#settings-modal .theme-btn.active', ['src/styles/settings-theme-bubble.css']],
    ['.theme-btn:not(.active)', ['src/styles/settings-theme-bubble.css']],
    ['.theme-btn:not(.active):hover', ['src/styles/settings-theme-bubble.css']],
    ['.theme-btn:not(.active):active', ['src/styles/settings-theme-bubble.css']],
    ['.color-dropdown-menu', ['src/styles/settings-theme-bubble.css']],
    ['.color-dropdown-btn', ['src/styles/settings-theme-bubble.css']],
    ['.color-dropdown-btn:hover', ['src/styles/settings-theme-bubble.css']],
    ['.color-option', ['src/styles/settings-theme-bubble.css']],
    ['.color-option:hover', ['src/styles/settings-theme-bubble.css']],
    ['.color-option.selected', ['src/styles/settings-theme-bubble.css']]
  ];

  for (const [selector, expectedFiles] of themeBubbleSelectors) {
    assertSelectorHits(selector, expectedFiles);
  }

  const settingsCss = readUiSource('src/styles/settings.css');
  const settingsThemeBubbleCss = readUiSource('src/styles/settings-theme-bubble.css');
  assert.doesNotMatch(settingsCss, /color-dropdown|color-option/);
  assert.doesNotMatch(settingsCss, /\.theme-btn/);
  assert.match(settingsThemeBubbleCss, /\.color-dropdown-btn\s*\{/);
  assert.match(settingsThemeBubbleCss, /\.color-option\.selected\s*\{/);
});

test('theme button selectors are shared-adjacent and not a pure settings-only surface', () => {
  const themeButtonHits = collectCssSelectorHits(/\.theme-btn(?:[\.#:,\s{]|:not|\[)/, settingsSurfaceCssFiles);
  assert.deepEqual(
    themeButtonHits.sort(),
    [
      'src/styles/modals.css',
      'src/styles/settings-theme-bubble.css'
    ].sort(),
    `.theme-btn should stay documented as shared-adjacent; hits: ${themeButtonHits.join(', ')}`
  );

  const settingsThemeBubbleCss = readUiSource('src/styles/settings-theme-bubble.css');
  const settingsCss = readUiSource('src/styles/settings.css');
  assert.match(settingsThemeBubbleCss, /\.theme-btn\s*\{/);
  assert.match(settingsThemeBubbleCss, /#settings-modal\s+\.theme-btn\.active\s*\{/);
  assert.doesNotMatch(settingsCss, /\.theme-btn/);
});

test('theme and output button overrides live in their owner surfaces instead of the final override layer', () => {
  const regressionOverridesCss = readUiSource('src/styles/regression-overrides.css');
  const settingsThemeBubbleCss = readUiSource('src/styles/settings-theme-bubble.css');
  const settingsOutputTranslatorCss = readUiSource('src/styles/settings-output-translator.css');

  assert.match(settingsThemeBubbleCss, /\.theme-btn:not\(\.active\)\s*\{/);
  assert.match(settingsThemeBubbleCss, /\.theme-btn:not\(\.active\):hover\s*\{/);
  assert.match(settingsThemeBubbleCss, /\.theme-btn:not\(\.active\):active\s*\{/);
  assert.match(settingsThemeBubbleCss, /\.theme-btn\.active,\s*#settings-modal\s+\.theme-btn\.active\s*\{/);
  assert.match(settingsOutputTranslatorCss, /\.custom-output-mode-option:not\(\.active\)\s*\{/);
  assert.match(settingsOutputTranslatorCss, /\.custom-output-mode-option:not\(\.active\):hover\s*\{/);
  assert.match(settingsOutputTranslatorCss, /\.custom-output-mode-option:not\(\.active\):active\s*\{/);
  assert.match(settingsOutputTranslatorCss, /\.custom-output-mode-option\.active,\s*#settings-modal\s+\.custom-output-mode-option\.active\s*\{/);
  assert.doesNotMatch(regressionOverridesCss, /\.theme-btn:not\(\.active\),\s*\.custom-output-mode-option:not\(\.active\),/);
});

test('theme bubble extraction keeps global and shared selectors out of the new surface', () => {
  const settingsThemeBubbleCss = readUiSource('src/styles/settings-theme-bubble.css');

  assert.doesNotMatch(settingsThemeBubbleCss, /:root/);
  assert.doesNotMatch(settingsThemeBubbleCss, /\.dark\b/);
  assert.doesNotMatch(settingsThemeBubbleCss, /\[data-theme/);
  assert.doesNotMatch(settingsThemeBubbleCss, /\.modal\s+(?:input|select|textarea)/);
  assertSelectorHits(':root', ['src/styles/settings.css', 'src/styles/typography.css']);
  assertSelectorHits('.dark #settings-modal', [
    'src/styles/settings.css',
    'src/styles/settings-mobile.css',
    'src/styles/personalization.css'
  ]);
  assertSelectorHits('.modal input', ['src/styles/settings.css', 'src/styles/personalization.css']);
  assertSelectorHits('.modal select', ['src/styles/settings.css', 'src/styles/personalization.css']);
  assertSelectorHits('.modal textarea', ['src/styles/settings.css', 'src/styles/personalization.css']);

  const fullCss = readUiSource('src/styles/main.css');
  assert.doesNotMatch(fullCss, /\[data-theme/);
});

test('shared settings-adjacent selectors are classified as shared, not settings-only', () => {
  const sharedSelectors = [
    ['.theme-btn', ['src/styles/settings-theme-bubble.css', 'src/styles/modals.css']],
    ['.modal input', ['src/styles/settings.css', 'src/styles/personalization.css']],
    ['.modal select', ['src/styles/settings.css', 'src/styles/personalization.css']],
    ['.modal textarea', ['src/styles/settings.css', 'src/styles/personalization.css']]
  ];

  for (const [selector, expectedFiles] of sharedSelectors) {
    const hits = assertSelectorHits(selector, expectedFiles);
    assert.ok(hits.length >= 2, `${selector} should remain documented as shared; hits: ${hits.join(', ')}`);
  }
});

test('dark mode, root variables, typography, and regression overrides remain classified as shared surfaces', () => {
  assertSelectorHits('.dark #settings-modal', [
    'src/styles/settings.css',
    'src/styles/settings-mobile.css',
    'src/styles/personalization.css'
  ]);
  assertSelectorHits(':root', ['src/styles/settings.css', 'src/styles/typography.css']);
  assertSelectorHits('#settings-modal .settings-mobile-group-title', ['src/styles/typography.css']);
  assertSelectorHits('#settings-modal .settings-sidebar', ['src/styles/regression-overrides.css']);
  assertSelectorHits('#settings-modal .theme-btn.active', [
    'src/styles/settings-theme-bubble.css'
  ]);

  const fullCss = readUiSource('src/styles/main.css');
  assert.doesNotMatch(
    fullCss,
    /\[data-theme/,
    '[data-theme] selectors are not currently a settings-only surface; future additions should be owned as global theme CSS'
  );
});

test('settings CSS surface stays within its post-mobile-extraction budget', () => {
  const stats = assertFileWithinBudget(
    assert,
    ['src', 'styles', 'settings.css'],
    { maxBytes: 40000, maxLines: 1400 }
  );
  const settingsMobileStats = assertFileWithinBudget(
    assert,
    ['src', 'styles', 'settings-mobile.css'],
    { maxBytes: 14000, maxLines: 450 }
  );
  const mobileStats = assertFileWithinBudget(
    assert,
    ['src', 'styles', 'mobile.css'],
    { maxBytes: 8000, maxLines: 220 }
  );
  const apiKeyStats = assertFileWithinBudget(
    assert,
    ['src', 'styles', 'settings-api-keys.css'],
    { maxBytes: 3000, maxLines: 100 }
  );
  const outputTranslatorStats = assertFileWithinBudget(
    assert,
    ['src', 'styles', 'settings-output-translator.css'],
    { maxBytes: 7000, maxLines: 240 }
  );
  const themeBubbleStats = assertFileWithinBudget(
    assert,
    ['src', 'styles', 'settings-theme-bubble.css'],
    { maxBytes: 7000, maxLines: 240 }
  );
  const providerManagementStats = assertFileWithinBudget(
    assert,
    ['src', 'styles', 'settings-provider-management.css'],
    { maxBytes: 7000, maxLines: 240 }
  );
  const desktopStats = assertFileWithinBudget(
    assert,
    ['src', 'styles', 'settings-desktop.css'],
    { maxBytes: 9000, maxLines: 260 }
  );
  const dangerStats = assertFileWithinBudget(
    assert,
    ['src', 'styles', 'settings-danger.css'],
    { maxBytes: 5000, maxLines: 160 }
  );

  const settingsModalHits = collectCssSelectorHits(/#settings-modal/, ['src/styles/settings.css']);
  const settingsMobileShellHits = collectCssSelectorHits(/#settings-modal/, ['src/styles/settings-mobile.css']);
  const settingsCssApiKeyHits = collectCssSelectorHits(/\.api-key-/, ['src/styles/settings.css']);
  const apiKeySurfaceHits = collectCssSelectorHits(/\.api-key-/, ['src/styles/settings-api-keys.css']);
  const settingsCssOutputTranslatorHits = collectCssSelectorHits(/(?:translator-picker|custom-output-mode)/, ['src/styles/settings.css']);
  const outputTranslatorSurfaceHits = collectCssSelectorHits(/(?:translator-picker|custom-output-mode)/, ['src/styles/settings-output-translator.css']);
  const settingsCssThemeBubbleHits = collectCssSelectorHits(/(?:theme-btn|theme-button-group|color-dropdown|color-option)/, ['src/styles/settings.css']);
  const themeBubbleSurfaceHits = collectCssSelectorHits(/(?:theme-btn|theme-button-group|color-dropdown|color-option)/, ['src/styles/settings-theme-bubble.css']);
  const settingsCssProviderManagementHits = collectCssSelectorHits(/(?:#model-management-list|\.model-management-item|\.model-management-name|\.model-order-controls|\.model-default-radio)/, ['src/styles/settings.css']);
  const providerManagementSurfaceHits = collectCssSelectorHits(/(?:#model-management-list|\.model-management-item|\.model-management-name|\.model-order-controls|\.model-default-radio)/, ['src/styles/settings-provider-management.css']);
  const settingsCssDesktopHits = collectCssSelectorHits(/(?:#settings-modal\s+nav|#settings-modal\s+#settings-nav|\.settings-nav-item|#settings-modal\s+\.settings-section|#settings-nav)/, ['src/styles/settings.css']);
  const desktopSurfaceHits = collectCssSelectorHits(/(?:#settings-modal\s+nav|#settings-modal\s+#settings-nav|\.settings-nav-item|#settings-modal\s+\.settings-section|#settings-nav)/, ['src/styles/settings-desktop.css']);
  const settingsCssDangerHits = collectCssSelectorHits(/#delete-all-data-btn/, ['src/styles/settings.css']);
  const dangerSurfaceHits = collectCssSelectorHits(/#delete-all-data-btn/, ['src/styles/settings-danger.css']);
  const mobileCssSettingsHits = collectCssSelectorHits(/settings-mobile/, ['src/styles/mobile.css']);
  const typographySurfaceHits = collectCssSelectorHits(/settings-mobile/, ['src/styles/typography.css']);

  assert.ok(stats.lines > 800, 'settings.css should still be tracked as the base settings surface after extraction');
  assert.ok(settingsMobileStats.lines > 300, 'settings-mobile.css should own the mobile settings shell surface');
  assert.ok(mobileStats.lines > 100, 'mobile.css should keep generic mobile app rules');
  assert.ok(apiKeyStats.lines > 0, 'settings-api-keys.css should own API key control styles');
  assert.ok(outputTranslatorStats.lines > 0, 'settings-output-translator.css should own output/translator control styles');
  assert.ok(themeBubbleStats.lines > 0, 'settings-theme-bubble.css should own theme and bubble control styles');
  assert.ok(providerManagementStats.lines > 0, 'settings-provider-management.css should own provider/model management styles');
  assert.ok(desktopStats.lines > 0, 'settings-desktop.css should own desktop settings nav and section styles');
  assert.ok(dangerStats.lines > 0, 'settings-danger.css should own delete-all danger styles');
  assert.equal(settingsModalHits.length, 1);
  assert.equal(settingsMobileShellHits.length, 1);
  assert.equal(settingsCssApiKeyHits.length, 0);
  assert.equal(apiKeySurfaceHits.length, 1);
  assert.equal(settingsCssOutputTranslatorHits.length, 0);
  assert.equal(outputTranslatorSurfaceHits.length, 1);
  assert.equal(settingsCssThemeBubbleHits.length, 0);
  assert.equal(themeBubbleSurfaceHits.length, 1);
  assert.equal(settingsCssProviderManagementHits.length, 0);
  assert.equal(providerManagementSurfaceHits.length, 1);
  assert.equal(settingsCssDesktopHits.length, 0);
  assert.equal(desktopSurfaceHits.length, 1);
  assert.equal(settingsCssDangerHits.length, 0);
  assert.equal(dangerSurfaceHits.length, 1);
  assert.equal(mobileCssSettingsHits.length, 0);
  assert.equal(typographySurfaceHits.length, 1);
});

test('main css imports settings surface styles before broad overrides', () => {
  const mainCss = readSource('src/styles/main.css');
  const settingsIndex = mainCss.indexOf("@import './settings.css';");
  const settingsMobileIndex = mainCss.indexOf("@import './settings-mobile.css';");
  const settingsApiKeysIndex = mainCss.indexOf("@import './settings-api-keys.css';");
  const settingsOutputTranslatorIndex = mainCss.indexOf("@import './settings-output-translator.css';");
  const settingsThemeBubbleIndex = mainCss.indexOf("@import './settings-theme-bubble.css';");
  const settingsProviderManagementIndex = mainCss.indexOf("@import './settings-provider-management.css';");
  const settingsDesktopIndex = mainCss.indexOf("@import './settings-desktop.css';");
  const settingsDangerIndex = mainCss.indexOf("@import './settings-danger.css';");
  const regressionIndex = mainCss.indexOf("@import './regression-overrides.css';");

  assert.ok(settingsIndex >= 0, 'main.css should import settings.css');
  assert.ok(settingsMobileIndex > settingsIndex, 'settings-mobile.css should refine settings.css');
  assert.ok(settingsApiKeysIndex > settingsMobileIndex, 'settings-api-keys.css should refine settings controls after settings-mobile.css');
  assert.ok(settingsOutputTranslatorIndex > settingsApiKeysIndex, 'settings-output-translator.css should refine output and translator controls after API key styles');
  assert.ok(settingsThemeBubbleIndex > settingsOutputTranslatorIndex, 'settings-theme-bubble.css should refine theme and bubble controls after output/translator styles');
  assert.ok(settingsProviderManagementIndex > settingsThemeBubbleIndex, 'settings-provider-management.css should load after extracted settings control CSS files');
  assert.ok(settingsProviderManagementIndex < regressionIndex, 'settings-provider-management.css should load before final regression overrides');
  assert.ok(settingsDesktopIndex > settingsProviderManagementIndex, 'settings-desktop.css should load after provider management styles');
  assert.ok(settingsDesktopIndex < regressionIndex, 'settings-desktop.css should load before final regression overrides');
  assert.ok(settingsDangerIndex > settingsDesktopIndex, 'settings-danger.css should load after desktop settings styles');
  assert.ok(settingsDangerIndex < regressionIndex, 'settings-danger.css should load before final regression overrides');
  assert.ok(regressionIndex > settingsDangerIndex, 'regression overrides should remain later in the cascade after settings danger styles');
});
