import assert from 'node:assert/strict';
import test from 'node:test';
import { collectCssSelectorHits, readUiSource } from '../helpers/source-guards.js';
import { settingsSurfaceCssFiles, assertThemeSelectorsOnlyInThemeFiles, assertSelectorHits } from '../helpers/settings-css-surface.js';

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
  const themeButtonHits = collectCssSelectorHits(/\.theme-btn(?:[.#:,\s{]|:not|\[)/, settingsSurfaceCssFiles);
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
  assert.doesNotMatch(settingsOutputTranslatorCss, /custom-output-mode/);
  assert.doesNotMatch(regressionOverridesCss, /\.theme-btn:not\(\.active\),\s*\.custom-output-mode-option:not\(\.active\),/);
});

test('theme bubble extraction keeps global and shared selectors out of the new surface', () => {
  const settingsThemeBubbleCss = readUiSource('src/styles/settings-theme-bubble.css');

  assert.doesNotMatch(settingsThemeBubbleCss, /:root/);
  assert.doesNotMatch(settingsThemeBubbleCss, /\.dark\b/);
  assert.doesNotMatch(settingsThemeBubbleCss, /\[data-theme/);
  assert.doesNotMatch(settingsThemeBubbleCss, /\.modal\s+(?:input|select|textarea)/);
  assertSelectorHits(':root', ['src/styles/typography.css']);
  assertSelectorHits('.modal input', ['src/styles/settings.css', 'src/styles/personalization.css']);
  assertSelectorHits('.modal select', ['src/styles/settings.css', 'src/styles/personalization.css']);
  assertSelectorHits('.modal textarea', ['src/styles/settings.css', 'src/styles/personalization.css']);

  const fullCss = readUiSource('src/styles/main.css');
  assert.doesNotMatch(fullCss, /\.dark\b|dark\\:|dark:/);
  assertThemeSelectorsOnlyInThemeFiles();
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

test('root variables, typography, and regression overrides remain classified as shared surfaces', () => {
  assertSelectorHits(':root', ['src/styles/typography.css']);
  assertSelectorHits('#settings-modal .settings-mobile-group-title', ['src/styles/typography.css']);
  assertSelectorHits('#settings-modal .settings-sidebar', ['src/styles/regression-overrides.css']);
  assertSelectorHits('#settings-modal .theme-btn.active', [
    'src/styles/settings-theme-bubble.css'
  ]);

  const fullCss = readUiSource('src/styles/main.css');
  assert.doesNotMatch(fullCss, /\.dark\b|dark\\:|dark:/);
  assertThemeSelectorsOnlyInThemeFiles();
});
