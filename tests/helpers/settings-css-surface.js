// The CSS surface helpers of the settings style tests (tests/ui/settings-regressions.test.js, tests/ui/settings-theme-surface.test.js).
import { readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { collectCssSelectorHits, readUiSource } from './source-guards.js';

export const settingsSurfaceCssFiles = [
  'src/styles/settings.css',
  'src/styles/settings-mobile.css',
  'src/styles/settings-api-keys.css',
  'src/styles/settings-output-translator.css',
  'src/styles/settings-theme-bubble.css',
  'src/styles/settings-desktop.css',
  'src/styles/settings-danger.css',
  'src/styles/mobile.css',
  'src/styles/typography.css',
  'src/styles/regression-overrides.css',
  'src/styles/modals.css',
  'src/styles/personalization.css'
];

// The dark theme is owned by two files (src/styles/tokens.css: the names of the colours, and dark-bridge.css: the Tailwind classes);
// no other style may select on the theme.
export function assertThemeSelectorsOnlyInThemeFiles() {
  for (const file of readdirSync(new URL('../../src/styles/', import.meta.url))) {
    if (!file.endsWith('.css') || file === 'tokens.css' || file === 'dark-bridge.css' || file === 'main.css') continue;
    assert.doesNotMatch(readUiSource(`src/styles/${file}`), /\[data-theme/, `${file}: the dark theme is written with the names of src/styles/tokens.css, not with theme selectors`);
  }
}

export function assertSelectorHits(selector, expectedFiles, message) {
  const hits = collectCssSelectorHits(selector, settingsSurfaceCssFiles);
  for (const expectedFile of expectedFiles) {
    assert.ok(
      hits.includes(expectedFile),
      message || `${selector} should be mapped in ${expectedFile}; hits: ${hits.join(', ')}`
    );
  }
  return hits;
}

