import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertFileWithinBudget,
  collectCssSelectorHits,
  readUiSource
} from '../helpers/source-guards.js';

const settingsSurfaceCssFiles = [
  'src/styles/settings.css',
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
    ['#settings-modal', ['src/styles/settings.css', 'src/styles/mobile.css', 'src/styles/typography.css']],
    ['#settings-modal > div', ['src/styles/settings.css', 'src/styles/mobile.css', 'src/styles/typography.css']],
    ['#settings-modal nav', ['src/styles/settings.css', 'src/styles/mobile.css']],
    ['#settings-nav', ['src/styles/settings.css']],
    ['.settings-sidebar', ['src/styles/regression-overrides.css']],
    ['.settings-section', ['src/styles/settings.css', 'src/styles/mobile.css', 'src/styles/typography.css']],
    ['.settings-section.active', ['src/styles/settings.css', 'src/styles/mobile.css', 'src/styles/typography.css']],
    ['.settings-nav-item', ['src/styles/settings.css', 'src/styles/mobile.css', 'src/styles/typography.css']]
  ];

  for (const [selector, expectedFiles] of settingsOnlySelectors) {
    assertSelectorHits(selector, expectedFiles);
  }
});

test('mobile settings CSS surface is explicitly mapped before extraction', () => {
  const mobileSelectors = [
    ['#settings-mobile-header', ['src/styles/mobile.css']],
    ['#settings-mobile-list', ['src/styles/mobile.css', 'src/styles/typography.css']],
    ['#settings-mobile-title', ['src/styles/mobile.css', 'src/styles/typography.css']],
    ['#settings-mobile-back-btn', ['src/styles/mobile.css', 'src/styles/typography.css']],
    ['.settings-mobile-group', ['src/styles/mobile.css', 'src/styles/typography.css']],
    ['.settings-mobile-card', ['src/styles/mobile.css']],
    ['.settings-mobile-list-item', ['src/styles/mobile.css', 'src/styles/typography.css']],
    ['.settings-mobile-row-icon', ['src/styles/mobile.css', 'src/styles/typography.css']],
    ['.settings-mobile-row-label', ['src/styles/mobile.css']]
  ];

  for (const [selector, expectedFiles] of mobileSelectors) {
    assertSelectorHits(selector, expectedFiles);
  }
});

test('settings control selectors stay visible and scoped by surface', () => {
  const controlSelectors = [
    ['.api-key-input-group', ['src/styles/settings.css']],
    ['.api-key-clear-btn', ['src/styles/settings.css']],
    ['.api-key-clear-all-btn', ['src/styles/settings.css']],
    ['.translator-picker-menu', ['src/styles/settings.css']],
    ['.translator-picker-button', ['src/styles/settings.css']],
    ['.translator-picker-option', ['src/styles/settings.css']],
    ['.custom-output-mode-select', ['src/styles/settings.css']],
    ['.custom-output-mode-option', ['src/styles/settings.css', 'src/styles/regression-overrides.css']],
    ['#settings-modal #delete-all-data-btn', ['src/styles/settings.css']],
    ['#settings-modal .model-management-item .model-row-action', ['src/styles/settings.css']]
  ];

  for (const [selector, expectedFiles] of controlSelectors) {
    assertSelectorHits(selector, expectedFiles);
  }

  const css = readUiSource('src/styles/main.css');
  assert.match(css, /\.api-key-clear-btn,\s*\.api-key-clear-all-btn\s*\{/);
  assert.match(css, /\.translator-picker-button[^{]*\{/);
  assert.match(css, /\.custom-output-mode-option[^{]*\{/);
});

test('shared settings-adjacent selectors are classified as shared, not settings-only', () => {
  const sharedSelectors = [
    ['.theme-btn', ['src/styles/settings.css', 'src/styles/modals.css', 'src/styles/regression-overrides.css']],
    ['.modal input', ['src/styles/settings.css', 'src/styles/personalization.css']],
    ['.modal select', ['src/styles/settings.css', 'src/styles/personalization.css']],
    ['.modal textarea', ['src/styles/settings.css', 'src/styles/personalization.css']],
    ['#archived-chats-modal', ['src/styles/settings.css', 'src/styles/regression-overrides.css']]
  ];

  for (const [selector, expectedFiles] of sharedSelectors) {
    const hits = assertSelectorHits(selector, expectedFiles);
    assert.ok(hits.length >= 2, `${selector} should remain documented as shared; hits: ${hits.join(', ')}`);
  }
});

test('dark mode, root variables, typography, and regression overrides remain classified as shared surfaces', () => {
  assertSelectorHits('.dark #settings-modal', [
    'src/styles/settings.css',
    'src/styles/mobile.css',
    'src/styles/personalization.css'
  ]);
  assertSelectorHits(':root', ['src/styles/settings.css', 'src/styles/typography.css']);
  assertSelectorHits('#settings-modal .settings-mobile-group-title', ['src/styles/typography.css']);
  assertSelectorHits('#settings-modal .settings-sidebar', ['src/styles/regression-overrides.css']);
  assertSelectorHits('#settings-modal .theme-btn.active', [
    'src/styles/settings.css',
    'src/styles/regression-overrides.css'
  ]);

  const fullCss = readUiSource('src/styles/main.css');
  assert.doesNotMatch(
    fullCss,
    /\[data-theme/,
    '[data-theme] selectors are not currently a settings-only surface; future additions should be owned as global theme CSS'
  );
});

test('settings CSS surface stays within a generous Phase 8 pre-extraction budget', () => {
  const stats = assertFileWithinBudget(
    assert,
    ['src', 'styles', 'settings.css'],
    { maxBytes: 42000, maxLines: 1400 }
  );

  const settingsModalHits = collectCssSelectorHits(/#settings-modal/, ['src/styles/settings.css']);
  const mobileSurfaceHits = collectCssSelectorHits(/settings-mobile/, ['src/styles/mobile.css', 'src/styles/typography.css']);

  assert.ok(stats.lines > 1000, 'settings.css should still be tracked as the large pre-extraction settings surface');
  assert.equal(settingsModalHits.length, 1);
  assert.equal(mobileSurfaceHits.length, 2);
});
