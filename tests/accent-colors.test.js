import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { UI_THEME_COLORS } from '../src/app/runtime/legacy-core/runtime-ui-colors.js';
import { accentForDarkTheme } from '../src/utils/color-contrast.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the accent has one blue (the default) and the other colours of the menu, in order', () => {
  assert.deepEqual(Object.keys(UI_THEME_COLORS), ['default', 'cyan', 'green', 'lime', 'yellow', 'orange', 'pink', 'magenta', 'purple', 'black']);
  assert.equal(UI_THEME_COLORS.default, '#3b82f6');
  assert.equal(new Set(Object.values(UI_THEME_COLORS)).size, Object.keys(UI_THEME_COLORS).length, 'no two choices share a colour');
});

test('the dark theme lightens an accent that cannot be seen on the dark page', () => {
  assert.equal(accentForDarkTheme('#111111'), '#ececec');
  assert.equal(accentForDarkTheme('#50affa'), '#50affa');
  const lightened = accentForDarkTheme('#1a2a6c');
  assert.notEqual(lightened, '#1a2a6c');
  assert.match(lightened, /^#[0-9a-f]{6}$/);
  assert.equal(accentForDarkTheme('not a colour'), 'not a colour');
});

test('a message bubble follows the accent, there is one accent colour and no setting for the bubble', () => {
  const tokens = read('src/styles/tokens.css');
  assert.match(tokens, /--user-bubble-bg:\s*color-mix\(in srgb, var\(--button-primary-bg\) \d+%, var\(--chat-bg\)\)/);
  assert.doesNotMatch(tokens, /user-bubble-choice|--brand-blue/);
  assert.match(tokens, /--button-primary-bg:\s*#3b82f6/);
  assert.match(tokens, /--button-primary-hover-bg:\s*color-mix\(in srgb, var\(--button-primary-bg\)/);
  assert.doesNotMatch(read('src/templates/fragments/02-shell.fragment.js'), /user-bubble-color-dropdown/);
});

test('every language names the accent and its colours, and no longer has the old names', async () => {
  globalThis.window = {};
  const { default: i18n } = await import('../src/data/i18n.js');
  for (const [locale, texts] of Object.entries(i18n)) {
    for (const key of ['accentColor', 'colorBlue', 'colorCyan', 'colorGreen', 'colorLime', 'colorYellow', 'colorOrange', 'colorPink', 'colorMagenta', 'colorPurple', 'colorBlack', 'colorWhite', 'colorCustom']) {
      assert.equal(typeof texts[key], 'string', `${locale}.${key}`);
    }
    for (const key of ['primaryButtonColor', 'userBubbleColor', 'colorDefault']) assert.equal(key in texts, false, `${locale}.${key} is gone`);
  }
  assert.equal(i18n['zh-TW'].accentColor, '強調色');
});
