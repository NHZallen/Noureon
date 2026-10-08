import assert from 'node:assert/strict';
import test from 'node:test';

import { createSettingsThemeBubbleControls } from '../src/app/runtime/legacy-core/settings-theme-bubble-controls.js';

// The colour of a message bubble is no longer a setting (it follows the accent, see --user-bubble-bg in src/styles/tokens.css): what is left
// of this module is the compatibility that drops the theme of an earlier version from the settings.

function createFixture() {
  const calls = [];
  const config = {};
  const controls = createSettingsThemeBubbleControls({
    config,
    saveConfig: async () => calls.push('saveConfig')
  });
  return { calls, config, controls };
}

test('module exports theme control factory', () => {
  assert.equal(typeof createSettingsThemeBubbleControls, 'function');
});

test('factory validates required dependencies', () => {
  assert.throws(
    () => createSettingsThemeBubbleControls(),
    /missing dependencies:/
  );
});

test('setTheme compatibility clears retired theme config and saves', async () => {
  const { calls, config, controls } = createFixture();
  config.theme = 'dark';

  await controls.setTheme('light');

  assert.equal('theme' in config, false);
  assert.deepEqual(calls, ['saveConfig']);
});

test('there is no bubble colour to set or to choose any more', () => {
  const { controls } = createFixture();
  assert.deepEqual(Object.keys(controls).sort(), ['setTheme', 'updateThemeButtons']);
  assert.equal(typeof controls.updateThemeButtons, 'function');
  assert.doesNotThrow(() => controls.updateThemeButtons());
});

test('import is inert', () => {
  assert.equal(typeof createSettingsThemeBubbleControls, 'function');
});
